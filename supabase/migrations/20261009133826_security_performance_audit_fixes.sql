-- Tighten stock return client grants. RLS policies already target authenticated
-- users only, so anon should not retain direct table privileges.
revoke all on table public.stock_returns from anon;
revoke all on table public.stock_return_items from anon;

-- Remove excessive default privileges such as TRUNCATE/TRIGGER/REFERENCES, then
-- grant back only the operations used by the PRDS client under RLS.
revoke all on table public.stock_returns from authenticated;
revoke all on table public.stock_return_items from authenticated;

grant select, insert, update, delete on table public.stock_returns to authenticated;
grant select, insert, update, delete on table public.stock_return_items to authenticated;

-- Add indexes on foreign-key columns missing child-side indexes.
create index if not exists dispensing_idempotency_keys_patient_id_idx
  on public.dispensing_idempotency_keys (patient_id);

create index if not exists dispensing_idempotency_keys_user_id_idx
  on public.dispensing_idempotency_keys (user_id);

create index if not exists inventory_disposed_by_idx
  on public.inventory (disposed_by);

create index if not exists medicine_dispensing_referred_facility_id_idx
  on public.medicine_dispensing (referred_facility_id);

create index if not exists medicine_requests_encoded_by_idx
  on public.medicine_requests (encoded_by);

create index if not exists patients_archived_by_idx
  on public.patients (archived_by);

create index if not exists stock_return_items_target_inventory_id_idx
  on public.stock_return_items (target_inventory_id);
