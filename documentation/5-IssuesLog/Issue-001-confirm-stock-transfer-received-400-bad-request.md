# Issue 001 - `confirm_stock_transfer_received` RPC returns 400 Bad Request

| Field | Value |
| --- | --- |
| **Status** | Resolved |
| **Date Reported** | 2026-08-12 |
| **Date Resolved** | 2026-08-18 |
| **Module** | Stock Transfer (BHW / My Requests) |
| **Environment** | Supabase PostgreSQL, prds-web (Vite + React) |
| **Related Files** | `database/migrations/2026-stock-transfer-source-controlled-workflow.sql`, `2026-fix-confirm-stock-transfer-received-ambiguous-returning.sql`, `2026-fix-confirm-stock-transfer-received-ambiguous-id-where.sql` |

---

## Summary

`confirm_stock_transfer_received` returned HTTP 400 Bad Request every time a BHW user clicked **Confirm Receipt** on a `READY_FOR_PICKUP` stock transfer. The transfer stayed `READY_FOR_PICKUP`, destination inventory was never created, and the transfer was never marked `COMPLETED`.

## Symptoms

- Clicking **Confirm Receipt** in the transfer tracking modal fails immediately.
- The browser console shows repeated failures:

  ```
  confirm_stock_transfer_received:1 Failed to load resource: the server responded with a status of 400 ()
  POST https://pcktrkqqwykcmgswkjlj.supabase.co/rest/v1/rpc/confirm_stock_transfer_received 400 (Bad Request)
  ```

- The transfer stays `READY_FOR_PICKUP`; destination inventory is never created; the transfer is never marked `COMPLETED`.
- The error is reproducible on every attempt (not intermittent), so it is a deterministic backend failure rather than a one-off data problem.

## Expected Behavior

When a BHW confirms receipt of a `READY_FOR_PICKUP` transfer:

1. Each source allocation is inserted into the destination facility's `inventory` (or merged into an existing matching batch via the `on conflict` upsert).
2. The fulfillment rows are updated with `destination_inventory_id`, `received_by`, and `received_at`.
3. The transfer status becomes `COMPLETED` with `received_by` and `received_at` set.
4. An `activity_logs` entry and `notifications` are created.

## Investigation Findings

The function signature is `RETURNS TABLE(id uuid, status transfer_status, received_by uuid, received_at timestamptz)`. In PL/pgSQL, `RETURNS TABLE(...)` output parameter names become PL/pgSQL variables in the function body. Because the output parameter is named `id`, any unqualified `id` reference inside the function is ambiguous: it can be interpreted as either the PL/pgSQL variable or a table column.

Reproducing the RPC call in a rolled-back transaction (with `request.jwt.claims` set to an active destination-facility BHW user) surfaced the exact error:

```
ERROR: 42702: column reference "id" is ambiguous
DETAIL: It could refer to either a PL/pgSQL variable or a table column.
QUERY: insert into public.inventory (...) ... returning id
CONTEXT: PL/pgSQL function public.confirm_stock_transfer_received(uuid) line 79 at SQL statement
```

After qualifying the `returning id` reference, the next unqualified `id` surfaced at:

```
ERROR: 42702: column reference "id" is ambiguous
QUERY: update public.stock_transfer_fulfillments
         set destination_inventory_id = ...
       where id = v_fulfillment.fulfillment_id
```

Both ambiguities live in the `READY_FOR_PICKUP` branch, which is why the failure only occurs on the first confirm-receipt of a picked-up transfer and never on the older `APPROVED` path.

The previously suspected root cause (a `FOR UPDATE` clause inside a PL/pgSQL `FOR` loop) was **disproven**: the verification snippet ran without error in this PostgreSQL version, so `FOR UPDATE` in a `FOR` loop over a query is legal here. The `for update of sf` clause was removed from the live function and is removed from the migration file to keep the repository in sync, but it was not the cause of the 400.

## Root Cause

`RETURNS TABLE(id uuid, ...)` makes `id` a PL/pgSQL output-parameter variable. The `READY_FOR_PICKUP` branch uses two unqualified `id` references:

1. `insert into public.inventory (...) ... returning id into v_destination_inventory_id;` — ambiguous between the output variable `id` and `inventory.id`.
2. `update public.stock_transfer_fulfillments ... where id = v_fulfillment.fulfillment_id;` — ambiguous between the output variable `id` and `stock_transfer_fulfillments.id`.

PL/pgSQL rejects both with `42702`, which PostgREST surfaces as HTTP 400.

## Fix Applied

`create or replace function public.confirm_stock_transfer_received(uuid)` with both `id` references fully qualified (safe under `set search_path to ''`):

1. `returning id into v_destination_inventory_id;` → `returning public.inventory.id into v_destination_inventory_id;`
2. `where id = v_fulfillment.fulfillment_id;` → `where public.stock_transfer_fulfillments.id = v_fulfillment.fulfillment_id;`

### Files Changed

- `database/migrations/2026-fix-confirm-stock-transfer-received-ambiguous-returning.sql` — new migration (qualifies `returning id`; this first increment alone still fails on the `where id` line).
- `database/migrations/2026-fix-confirm-stock-transfer-received-ambiguous-id-where.sql` — new migration (qualifies the `where id` reference; completes the fix).
- `database/migrations/2026-stock-transfer-source-controlled-workflow.sql` — corrected `confirm_stock_transfer_received` so the repository matches the database, including removal of the non-causal `for update of sf` clause (already absent from the live function).
- `database/DATABASE_SETUP_ORDER.md` — registered the two new fix migrations.

## Verification

1. Reproduce the RPC in a rolled-back transaction (no data changes persist):

   ```sql
   begin;
   select set_config('request.jwt.claims', '{"sub":"<active-bhw-user-id>","role":"authenticated"}', true);
   select public.confirm_stock_transfer_received('<transfer-id>');
   rollback;
   ```

2. Expected result before the fix: `ERROR: 42702: column reference "id" is ambiguous`. After the fix: the function returns the transfer row with `status = COMPLETED`, `received_by`, and `received_at` (verified on `a61c01dc-fd6c-4bd4-984e-77f3dfc44c96`).
3. Live test: log in as the destination-facility BHW and click **Confirm Receipt** on transfer `a61c01dc-fd6c-4bd4-984e-77f3dfc44c96` (still `READY_FOR_PICKUP`). Expected: destination inventory row created, transfer becomes `COMPLETED`.

## Log

- 2026-08-12: Issue discovered while testing the BHW confirm-receipt flow; 400 observed repeatedly in the browser console.
- 2026-08-12: Database state, transfer state, batch validity, constraints, and RLS all verified as healthy; root cause suspected to be the `FOR UPDATE` clause inside the PL/pgSQL `FOR` loop.
- 2026-08-18: `FOR UPDATE` hypothesis disproven (read-only snippet runs without error). Rolled-back reproduction identified the true root cause: `42702` ambiguous `id` caused by the `RETURNS TABLE(id uuid, ...)` output parameter conflicting with unqualified `id` references in the `READY_FOR_PICKUP` branch (`returning id` and `where id`). Corrected function qualified both references and was applied to the database; migration files and setup order updated to match; rolled-back reproduction now returns `COMPLETED`. **Resolved.**
