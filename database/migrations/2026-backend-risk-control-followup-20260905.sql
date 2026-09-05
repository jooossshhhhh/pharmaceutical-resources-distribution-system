/*
=====================================================
Backend Risk Control Follow-up - 2026-09-05

Purpose:
- Reduce stale privileged RPC exposure.
- Harden CHO inventory batch edits.
- Remove write grants from reporting views.
- Limit avatar uploads.
- Clean direct auth.uid() RLS performance warnings.
=====================================================
*/

-- Stale compatibility transfer endpoints were already absent from live Supabase.

-- Reporting views are read-only API surfaces.
revoke insert, update, delete on public.expiring_medicines_view
from public, anon, authenticated;

revoke insert, update, delete on public.inventory_overview
from public, anon, authenticated;

revoke insert, update, delete on public.low_stock_view
from public, anon, authenticated;

revoke insert, update, delete on public.monthly_dispensing_summary
from public, anon, authenticated;

grant select on public.expiring_medicines_view to authenticated;
grant select on public.inventory_overview to authenticated;
grant select on public.low_stock_view to authenticated;
grant select on public.monthly_dispensing_summary to authenticated;


-- Keep avatars public for profile display, but restrict upload size and file types.
update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
 where id = 'avatars';


-- Inventory batch edits must come from active CHO pharmacy staff.
create or replace function public.update_inventory_batch(
  p_inventory_id uuid,
  p_supplier_id uuid,
  p_quantity integer,
  p_threshold integer,
  p_batch_number text,
  p_date_received date,
  p_expiration_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_existing public.inventory%rowtype;
begin
  select p.id
    into v_caller_id
    from public.profiles p
    join public.facilities f on f.id = p.facility_id
   where p.id = auth.uid()
     and p.role in ('PHARMA_I', 'PHARMA_II')
     and p.status = 'ACTIVE'
     and f.status = 'ACTIVE'
     and f.facility_type = 'CHO';

  if v_caller_id is null then
    raise exception 'Only active CHO pharmacy staff can update inventory batches.'
      using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity < 0 then
    raise exception 'Quantity must be zero or higher.'
      using errcode = '22023';
  end if;

  if p_threshold is null or p_threshold < 0 then
    raise exception 'Threshold must be zero or higher.'
      using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_batch_number, '')), '') is null then
    raise exception 'Batch number is required.'
      using errcode = '22023';
  end if;

  if p_date_received is null or p_expiration_date is null then
    raise exception 'Date received and expiration date are required.'
      using errcode = '22023';
  end if;

  if p_expiration_date <= p_date_received then
    raise exception 'Expiration date must be later than date received.'
      using errcode = '22023';
  end if;

  select *
    into v_existing
    from public.inventory i
   where i.id = p_inventory_id
   for update;

  if v_existing.id is null then
    raise exception 'Inventory batch not found.'
      using errcode = 'P0001';
  end if;

  update public.inventory
     set supplier_id = p_supplier_id,
         quantity = p_quantity,
         threshold = p_threshold,
         batch_number = upper(btrim(p_batch_number)),
         date_received = p_date_received,
         expiration_date = p_expiration_date,
         updated_at = now()
   where id = p_inventory_id;

  insert into public.activity_logs (user_id, action, module, details)
  values (
    v_caller_id,
    'Stock Updated',
    'Inventory',
    'Updated inventory batch ' || upper(btrim(p_batch_number))
      || ': ' || p_quantity || ' units, threshold ' || p_threshold || '.'
  );

  return p_inventory_id;
end;
$$;

revoke execute on function public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date)
from public, anon;

grant execute on function public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date)
to authenticated;


-- Advisor cleanup: cache auth.uid() once per statement where safe.
drop policy if exists "users_can_insert_own_profile" on public.profiles;

create policy "users_can_insert_own_profile"
on public.profiles
for insert
to authenticated
with check (
    id = (select auth.uid())
    and status = 'PENDING'
    and role in ('BHW', 'PHARMA_I')
    and approved_by is null
    and approved_at is null
);


drop policy if exists "create_request_items" on public.medicine_request_items;

create policy "create_request_items"
on public.medicine_request_items
for insert
to authenticated
with check (
    exists (
        select 1
        from public.medicine_requests mr
        where mr.id = medicine_request_items.request_id
          and (
              mr.requested_by = (select auth.uid())
              or (select public.is_pharma_i())
              or (select public.is_pharma_ii())
          )
    )
);


drop policy if exists "create_transfer_items" on public.stock_transfer_items;

create policy "create_transfer_items"
on public.stock_transfer_items
for insert
to authenticated
with check (
    exists (
        select 1
        from public.stock_transfers st
        where st.id = stock_transfer_items.transfer_id
          and (
              st.requested_by = (select auth.uid())
              or (select public.is_pharma_i())
              or (select public.is_pharma_ii())
          )
    )
);


drop policy if exists "view_programs" on public.other_programs;

create policy "view_programs"
on public.other_programs
for select
to authenticated
using ((select auth.uid()) is not null);


drop policy if exists "view_program_medicines" on public.program_medicines;

create policy "view_program_medicines"
on public.program_medicines
for select
to authenticated
using ((select auth.uid()) is not null);


drop policy if exists "users_can_view_own_facility_change_requests"
on public.profile_facility_change_requests;

create policy "users_can_view_own_facility_change_requests"
on public.profile_facility_change_requests
for select
to authenticated
using (profile_id = (select auth.uid()));


drop policy if exists "users_can_insert_own_facility_change_requests"
on public.profile_facility_change_requests;

create policy "users_can_insert_own_facility_change_requests"
on public.profile_facility_change_requests
for insert
to authenticated
with check (
    profile_id = (select auth.uid())
    and status = 'PENDING'
    and reviewed_by is null
    and reviewed_at is null
);
