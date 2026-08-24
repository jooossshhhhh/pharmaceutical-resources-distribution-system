# Backend Audit

**Datestamp:** 2026-08-22  
**Scope:** Live Supabase project, local backend SQL, Supabase setup scripts, RPCs, RLS policy files, and backend-facing frontend service calls.

## Summary

This re-audit checked the actual linked Supabase project for PRDS using Supabase CLI advisors, schema lint, direct catalog queries, and local source review. The live project now has RLS enabled on all public tables and the public views are using `security_invoker=true`.

## Fixed In This Pass

### Anonymous RPC and Policy Exposure

Live advisors previously flagged several `SECURITY DEFINER` helper and trigger functions as executable by `anon`. Anonymous execution was removed from helper, profile, notification, trigger, and auth-sync functions. Authenticated-only RLS policies that were declared as `TO public` were changed to `TO authenticated`.

Affected files:

- `supabase/migrations/20260822035958_backend_audit_hardening_20260822.sql`
- `database/migrations/2026-backend-audit-hardening.sql`
- `database/helper-functions/helper_functions_schema.sql`
- `database/DATABASE_SETUP_ORDER.md`

### Mutable Function Search Path

`public.is_same_facility(uuid)` had no fixed `search_path` in live Supabase. It now uses `search_path = public`.

### Profile Email and Phone Update Bypass

`update_own_profile_contact(...)` could write `profiles.email` and `profiles.phone_number` directly. It now only syncs email/phone when the requested value matches the verified Supabase Auth email or phone for the current `auth.uid()`.

### Direct BHW Insert Scope

Direct insert policies for `medicine_requests` and `stock_transfers` now require the caller to be the requester and require the facility fields to match the caller's assigned facility.

Affected files:

- `database/rls/medicine_reqeuests_rls_schema.sql`
- `database/rls/stock_transfers_rls_schema.sql`

### Patient Monthly Claim Privacy

`get_patient_monthly_claim_status(uuid)` now validates the caller role and enforces BHW same-facility access before returning monthly claim status.

Affected file:

- `database/migrations/2026-dispensing-walk-in-rpcs.sql`

### Request Receipt Concurrency

`confirm_request_received(uuid)` now locks the request row with `FOR UPDATE` and updates only rows still in `APPROVED` status, preventing double-confirm race behavior.

Affected file:

- `database/migrations/2026-request-receipt-confirmation.sql`

### Dead Transfer Compatibility RPC

The obsolete `approve_and_release_stock_transfer(uuid, jsonb, text)` RPC was dropped from live Supabase. It ignored its allocation parameter and conflicted with the newer source-controlled transfer workflow.

## Remaining Warnings

### Supabase Auth Leaked Password Protection

Supabase still reports leaked password protection as disabled. This is a dashboard/Auth configuration item, not a SQL migration fix.

Recommended action: enable leaked password protection in Supabase Auth password security settings.

### Authenticated SECURITY DEFINER RPC Warnings

Supabase still warns that authenticated users can execute several `SECURITY DEFINER` RPCs. These are currently intentional because PRDS uses RPCs for role-gated writes and stock movements. Keep reviewing every new RPC for:

- fixed `search_path`
- `auth.uid()` check
- active profile check
- role check
- facility scope check where applicable
- explicit `revoke all from public, anon`

### Performance Advisor Follow-Up

Earlier advisors flagged some RLS performance opportunities such as wrapping `auth.uid()` as `(select auth.uid())` in policies. The highest-risk security issues were fixed first; remaining performance cleanup can be handled in a separate pass.

## Verification

- `npx.cmd supabase db lint --linked --schema public --level warning --fail-on none --output json`
  - Result: no schema errors found.
- `npx.cmd supabase db advisors --linked --type security --output json`
  - Result: anonymous function warnings and mutable search-path warning resolved.
  - Remaining: intentional authenticated SECURITY DEFINER RPC warnings and Auth leaked password protection setting.
- Direct live catalog checks:
  - No remaining public policies with `roles = {public}`.
  - `approve_and_release_stock_transfer` count: `0`.
  - Hardened BHW insert policies verified.
  - Patient claim RPC privacy check verified.
  - Receipt confirmation row lock verified.
- `npm test`
  - Result: 122/122 tests passed.
- `npm run build`
  - Result: build passed.
  - Note: Vite still reports the existing large chunk-size warning.
