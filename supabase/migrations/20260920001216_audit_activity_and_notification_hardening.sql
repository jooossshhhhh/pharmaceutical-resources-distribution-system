-- Centralize audit coverage for direct desktop CRUD operations while keeping
-- workflow-specific RPC logs as the authoritative semantic events.

create or replace function public.record_activity_log(
  p_action text,
  p_module text,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_log_id uuid;
begin
  if v_user_id is null then
    raise exception 'An authenticated user is required to record an activity.' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.profiles
     where id = v_user_id
       and status = 'ACTIVE'
  ) then
    raise exception 'An active profile is required to record an activity.' using errcode = '42501';
  end if;

  if not (
    (p_module = 'Inventory' and p_action in ('Stock Added', 'Stock Removed', 'Stock Imported'))
    or (p_module = 'Authentication' and p_action in ('User Signed In', 'User Signed Out'))
  ) then
    raise exception 'This activity action must be recorded by its owning database operation.' using errcode = '42501';
  end if;

  insert into public.activity_logs (user_id, action, module, details)
  values (
    v_user_id,
    nullif(pg_catalog.btrim(p_action), ''),
    nullif(pg_catalog.btrim(p_module), ''),
    nullif(pg_catalog.btrim(p_details), '')
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke all on function public.record_activity_log(text, text, text) from public, anon;
grant execute on function public.record_activity_log(text, text, text) to authenticated;

create or replace function public.reject_medicine_request(
  p_request_id uuid,
  p_remarks text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.medicine_requests%rowtype;
begin
  if auth.uid() is null or not (public.is_pharma_i() or public.is_pharma_ii()) then
    raise exception 'Only CHO pharmacists can reject medicine requests.' using errcode = '42501';
  end if;

  select * into v_request
    from public.medicine_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'Medicine request was not found.' using errcode = 'P0002';
  end if;

  if v_request.status not in ('PENDING', 'APPROVED') then
    raise exception 'Only active medicine requests can be rejected.' using errcode = '22023';
  end if;

  update public.medicine_requests
     set approved_by = auth.uid(),
         approved_at = now(),
         remarks = nullif(pg_catalog.btrim(p_remarks), ''),
         status = 'REJECTED'
   where id = p_request_id;

  insert into public.activity_logs (user_id, action, module, details)
  values (
    auth.uid(),
    'Request Rejected',
    'Medicine Request',
    'Request Rejected for ' || coalesce((select facility_name from public.facilities where id = v_request.facility_id), 'facility') || ' (' || upper(left(v_request.id::text, 8)) || ').'
  );

  if v_request.requested_by is not null then
    insert into public.notifications (user_id, title, message)
    values (
      v_request.requested_by,
      'Request Rejected',
      'Your medicine request ' || upper(left(v_request.id::text, 8)) || ' has been rejected by CHO.'
    );
  end if;

  return p_request_id;
end;
$$;

revoke all on function public.reject_medicine_request(uuid, text) from public, anon;
grant execute on function public.reject_medicine_request(uuid, text) to authenticated;

create or replace function public.audit_direct_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_action text;
  v_module text;
  v_label text;
  v_details text;
  v_row jsonb;
begin
  if v_user_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  v_module := case tg_table_name
    when 'inventory' then 'Inventory'
    when 'medicines' then 'Medicine'
    when 'facilities' then 'Facility'
    when 'suppliers' then 'Supplier'
    when 'patients' then 'Patient'
    when 'profiles' then 'User Account'
    when 'other_programs' then 'Other Program'
    else initcap(replace(tg_table_name, '_', ' '))
  end;

  v_action := case
    when tg_table_name = 'inventory' and tg_op = 'INSERT' then 'Stock Added'
    when tg_table_name = 'inventory' and tg_op = 'DELETE' then 'Stock Removed'
    when tg_op = 'INSERT' then v_module || ' Created'
    when tg_op = 'UPDATE' then v_module || ' Updated'
    when tg_op = 'DELETE' then v_module || ' Deleted'
  end;

  if tg_table_name = 'other_programs' and tg_op = 'UPDATE' then
    if old.status is distinct from new.status and new.status = 'COMPLETED' then
      v_action := 'Other Program Completed';
    elsif old.status is distinct from new.status and new.status = 'CANCELLED' then
      v_action := 'Other Program Cancelled';
    end if;
  end if;

  v_label := coalesce(
    case tg_table_name
      when 'medicines' then v_row ->> 'generic_name'
      when 'facilities' then v_row ->> 'facility_name'
      when 'suppliers' then v_row ->> 'supplier_name'
      when 'patients' then concat_ws(' ', v_row ->> 'first_name', v_row ->> 'last_name')
      when 'profiles' then concat_ws(' ', v_row ->> 'first_name', v_row ->> 'last_name')
      when 'other_programs' then v_row ->> 'program_name'
      when 'inventory' then coalesce(v_row ->> 'batch_number', v_row ->> 'id')
      else null
    end,
    tg_table_name
  );

  v_details := case when tg_table_name = 'inventory'
    then v_action || ': ' || v_label || ' (' || coalesce(v_row ->> 'quantity', '0') || ' units).'
    else v_action || ': ' || v_label || '.'
  end;

  insert into public.activity_logs (user_id, action, module, details)
  values (v_user_id, v_action, v_module, v_details);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_direct_row_change() from public, anon, authenticated;

drop trigger if exists audit_medicines_change on public.medicines;
create trigger audit_medicines_change
after insert or update or delete on public.medicines
for each row execute function public.audit_direct_row_change();

drop trigger if exists audit_facilities_change on public.facilities;
create trigger audit_facilities_change
after insert or update or delete on public.facilities
for each row execute function public.audit_direct_row_change();

drop trigger if exists audit_suppliers_change on public.suppliers;
create trigger audit_suppliers_change
after insert or update or delete on public.suppliers
for each row execute function public.audit_direct_row_change();

drop trigger if exists audit_patients_change on public.patients;
create trigger audit_patients_change
after insert or update or delete on public.patients
for each row execute function public.audit_direct_row_change();

drop trigger if exists audit_profiles_change on public.profiles;
create trigger audit_profiles_change
after update on public.profiles
for each row execute function public.audit_direct_row_change();

drop trigger if exists audit_other_programs_change on public.other_programs;
create trigger audit_other_programs_change
after insert or update on public.other_programs
for each row execute function public.audit_direct_row_change();

drop trigger if exists audit_inventory_add_remove on public.inventory;
create trigger audit_inventory_add_remove
after insert or delete on public.inventory
for each row execute function public.audit_direct_row_change();

notify pgrst, 'reload schema';
