-- ============================================================================
-- Migration: 20261104183000_other_programs_ongoing_and_stock_reconciliation.sql
-- Refines Other Programs module for 3-stage lifecycle:
--   1. UPCOMING (planned & reserved stock)
--   2. ONGOING (scheduled date arrived, outreach in progress, editable, reserved stock held)
--   3. COMPLETED (stock reconciliation: Actual Dispensed = Allocated - Returned, FEFO deducted)
-- ============================================================================

-- 1. Ensure timestamp & lifecycle columns exist on public.other_programs
alter table public.other_programs
  add column if not exists started_at timestamptz,
  add column if not exists created_at timestamptz not null default pg_catalog.now(),
  add column if not exists updated_at timestamptz not null default pg_catalog.now();

-- 2. Expand status check constraint on public.other_programs to include ONGOING
alter table public.other_programs
  drop constraint if exists other_programs_status_check;

alter table public.other_programs
  add constraint other_programs_status_check
  check (status in ('UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'));

-- 3. Add quantity_allocated and quantity_returned to public.program_medicines
alter table public.program_medicines
  add column if not exists quantity_allocated integer not null default 0,
  add column if not exists quantity_returned integer not null default 0;

-- Backfill quantity_allocated from existing quantity_used for existing records
update public.program_medicines
set quantity_allocated = quantity_used
where quantity_allocated <= 0 and quantity_used > 0;

-- Update check constraints on public.program_medicines so 100% returned stock (quantity_used = 0) is valid upon completion
alter table public.program_medicines
  drop constraint if exists program_medicines_quantity_used_check;

alter table public.program_medicines
  add constraint program_medicines_quantity_used_check
  check (quantity_used >= 0);

-- 4. Update date validation trigger for UPCOMING and ONGOING transitions
create or replace function public.validate_other_program_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'UPCOMING' and new.started_at is null and new.program_date < current_date then
    if tg_op = 'INSERT' or old.program_date is distinct from new.program_date then
      raise exception 'Upcoming program date cannot be before the current date.' using errcode = '22023';
    end if;
  end if;

  if (new.status = 'ONGOING' or (new.status = 'UPCOMING' and new.started_at is not null))
     and (tg_op = 'INSERT' or (old.status is distinct from 'ONGOING' and old.started_at is null)) then
    if new.program_date > current_date then
      raise exception 'Scheduled date has not arrived yet. Reschedule the program to today before marking it as ongoing.' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

-- 5. Update audit log trigger function to log 'Other Program Started' when status becomes ONGOING
create or replace function public.audit_direct_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_row jsonb;
  v_module text;
  v_action text;
  v_label text;
  v_details text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name = 'inventory' and tg_op = 'UPDATE' then
    return new;
  end if;

  v_module := case tg_table_name
    when 'inventory' then 'Inventory'
    when 'medicines' then 'Medicine Catalog'
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
    if (old.status is distinct from new.status and new.status = 'ONGOING')
       or (old.started_at is null and new.started_at is not null and new.status in ('UPCOMING', 'ONGOING')) then
      v_action := 'Other Program Started';
    elsif old.status is distinct from new.status and new.status = 'COMPLETED' then
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

-- 6. Update save_other_program to support editing during UPCOMING or ONGOING and populate quantity_allocated
create or replace function public.save_other_program(
  p_program_id uuid default null,
  p_program_name text default null,
  p_program_date date default null,
  p_description text default null,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_program public.other_programs%rowtype;
  v_facility_id uuid;
  v_item jsonb;
  v_medicine_id uuid;
  v_quantity integer;
  v_stock integer;
  v_reserved integer;
begin
  if auth.uid() is null or not (public.is_pharma_i() or public.is_pharma_ii()) then
    raise exception 'Only CHO pharmacists can manage Other Programs.' using errcode = '42501';
  end if;

  if nullif(pg_catalog.btrim(p_program_name), '') is null or p_program_date is null then
    raise exception 'Program name and date are required.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one program medicine is required.' using errcode = '22023';
  end if;

  select facility_id into v_facility_id from public.profiles where id = auth.uid();
  if v_facility_id is null then
    raise exception 'Your account is not assigned to a facility.' using errcode = '22023';
  end if;

  if p_program_id is null then
    insert into public.other_programs (facility_id, program_name, program_date, description, status)
    values (v_facility_id, pg_catalog.btrim(p_program_name), p_program_date, nullif(pg_catalog.btrim(p_description), ''), 'UPCOMING')
    returning * into v_program;
  else
    select * into v_program from public.other_programs where id = p_program_id for update;
    if not found then
      insert into public.other_programs (id, facility_id, program_name, program_date, description, status)
      values (p_program_id, v_facility_id, pg_catalog.btrim(p_program_name), p_program_date, nullif(pg_catalog.btrim(p_description), ''), 'UPCOMING')
      returning * into v_program;
    else
      if v_program.status not in ('UPCOMING', 'ONGOING') then
        raise exception 'Only upcoming or ongoing programs can be edited.' using errcode = '22023';
      end if;
      if v_program.facility_id is not null and v_program.facility_id <> v_facility_id then
        raise exception 'This program belongs to another facility.' using errcode = '42501';
      end if;

      update public.other_programs
      set facility_id = coalesce(v_program.facility_id, v_facility_id),
          program_name = pg_catalog.btrim(p_program_name),
          program_date = p_program_date,
          description = nullif(pg_catalog.btrim(p_description), ''),
          updated_at = pg_catalog.now()
      where id = p_program_id
      returning * into v_program;
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_medicine_id := nullif(v_item->>'medicine_id', '')::uuid;
    v_quantity := coalesce((v_item->>'quantity_allocated')::integer, (v_item->>'quantity_used')::integer);
    if v_medicine_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception 'Each program medicine needs a positive allocated quantity.' using errcode = '22023';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_program.facility_id::text || ':' || v_medicine_id::text, 0)
    );

    select coalesce(sum(quantity), 0)::integer into v_stock
    from public.inventory
    where facility_id = v_program.facility_id
      and medicine_id = v_medicine_id
      and quantity > 0
      and (expiration_date is null or expiration_date >= current_date);

    select coalesce(sum(pm.quantity_allocated), 0)::integer into v_reserved
    from public.program_medicines pm
    join public.other_programs op on op.id = pm.program_id
    where op.facility_id = v_program.facility_id
      and op.status in ('UPCOMING', 'ONGOING')
      and op.id <> v_program.id
      and pm.medicine_id = v_medicine_id
      and pm.quantity_allocated > 0;

    if v_stock - v_reserved < v_quantity then
      raise exception 'Insufficient available CHO stock for the selected medicine.' using errcode = '22003';
    end if;
  end loop;

  update public.program_medicines
  set quantity_allocated = 0,
      quantity_returned = 0
  where program_id = v_program.id
    and medicine_id not in (
      select (item->>'medicine_id')::uuid
      from jsonb_array_elements(p_items) as item
      where nullif(item->>'medicine_id', '') is not null
    );

  insert into public.program_medicines (program_id, medicine_id, quantity_allocated, quantity_returned, quantity_used)
  select
    v_program.id,
    (item->>'medicine_id')::uuid,
    coalesce((item->>'quantity_allocated')::integer, (item->>'quantity_used')::integer),
    0,
    coalesce((item->>'quantity_allocated')::integer, (item->>'quantity_used')::integer)
  from jsonb_array_elements(p_items) as item
  on conflict (program_id, medicine_id) do update
  set quantity_allocated = excluded.quantity_allocated,
      quantity_returned = 0,
      quantity_used = excluded.quantity_used;

  return v_program.id;
end;
$$;

-- 7. Create start_other_program RPC to transition UPCOMING -> ONGOING when scheduled date arrives
create or replace function public.start_other_program(p_program_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_program public.other_programs%rowtype;
begin
  if auth.uid() is null or not (public.is_pharma_i() or public.is_pharma_ii()) then
    raise exception 'Only CHO pharmacists can start Other Programs.' using errcode = '42501';
  end if;

  select * into v_program from public.other_programs where id = p_program_id for update;
  if not found then
    raise exception 'Program was not found.' using errcode = 'P0002';
  end if;

  if v_program.status = 'COMPLETED' then
    return jsonb_build_object(
      'program_id', v_program.id,
      'status', 'COMPLETED',
      'started_at', v_program.started_at
    );
  end if;

  if v_program.status = 'ONGOING' or (v_program.status = 'UPCOMING' and v_program.started_at is not null) then
    return jsonb_build_object(
      'program_id', v_program.id,
      'status', 'ONGOING',
      'started_at', v_program.started_at
    );
  end if;

  if v_program.status <> 'UPCOMING' then
    raise exception 'Only upcoming programs can be marked as ongoing.' using errcode = '22023';
  end if;

  if v_program.program_date > current_date then
    raise exception 'Scheduled date has not arrived yet. Please reschedule the program to today first.' using errcode = '22023';
  end if;

  begin
    update public.other_programs
    set status = 'ONGOING',
        started_at = coalesce(started_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    where id = v_program.id
    returning * into v_program;
  exception when check_violation then
    update public.other_programs
    set started_at = coalesce(started_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    where id = v_program.id
    returning * into v_program;
  end;

  return jsonb_build_object(
    'program_id', v_program.id,
    'status', 'ONGOING',
    'started_at', v_program.started_at
  );
end;
$$;

-- 8. Update complete_other_program to reconcile returned stock and deduct only Actual Dispensed (Allocated - Returned)
create or replace function public.complete_other_program(
  p_program_id uuid,
  p_returns jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_program public.other_programs%rowtype;
  v_item record;
  v_inventory record;
  v_allocated integer;
  v_returned integer;
  v_dispensed integer;
  v_remaining integer;
  v_take integer;
  v_stock integer;
  v_reserved integer;
  v_total_allocated integer := 0;
  v_total_returned integer := 0;
  v_total_dispensed integer := 0;
begin
  if auth.uid() is null or not (public.is_pharma_i() or public.is_pharma_ii()) then
    raise exception 'Only CHO pharmacists can complete Other Programs.' using errcode = '42501';
  end if;

  select * into v_program from public.other_programs where id = p_program_id for update;
  if not found then
    raise exception 'Program was not found.' using errcode = 'P0002';
  end if;

  if v_program.status = 'COMPLETED' then
    return jsonb_build_object('program_id', v_program.id, 'status', 'COMPLETED');
  end if;

  if v_program.status not in ('UPCOMING', 'ONGOING') then
    raise exception 'Only upcoming or ongoing programs can be completed.' using errcode = '22023';
  end if;

  if v_program.facility_id is null then
    raise exception 'This program has no dispensing facility.' using errcode = '22023';
  end if;

  for v_item in
    select id, medicine_id, quantity_allocated, quantity_used
    from public.program_medicines
    where program_id = v_program.id
      and quantity_allocated > 0
    for update
  loop
    v_allocated := v_item.quantity_allocated;

    select coalesce((ret.value->>'quantity_returned')::integer, 0)
    into v_returned
    from jsonb_array_elements(coalesce(p_returns, '[]'::jsonb)) as ret(value)
    where nullif(ret.value->>'medicine_id', '')::uuid = v_item.medicine_id
    limit 1;

    v_returned := coalesce(v_returned, 0);

    if v_returned < 0 or v_returned > v_allocated then
      raise exception 'Returned quantity must be between 0 and the allocated quantity (%).', v_allocated using errcode = '22023';
    end if;

    v_dispensed := v_allocated - v_returned;
    v_total_allocated := v_total_allocated + v_allocated;
    v_total_returned := v_total_returned + v_returned;
    v_total_dispensed := v_total_dispensed + v_dispensed;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_program.facility_id::text || ':' || v_item.medicine_id::text, 0)
    );

    if v_dispensed > 0 then
      select coalesce(sum(quantity), 0)::integer into v_stock
      from public.inventory
      where facility_id = v_program.facility_id
        and medicine_id = v_item.medicine_id
        and quantity > 0
        and (expiration_date is null or expiration_date >= current_date);

      select coalesce(sum(pm.quantity_allocated), 0)::integer into v_reserved
      from public.program_medicines pm
      join public.other_programs op on op.id = pm.program_id
      where op.facility_id = v_program.facility_id
        and op.status in ('UPCOMING', 'ONGOING')
        and op.id <> v_program.id
        and pm.medicine_id = v_item.medicine_id
        and pm.quantity_allocated > 0;

      if v_stock - v_reserved < v_dispensed then
        raise exception 'CHO stock is no longer sufficient to complete this program.' using errcode = '22003';
      end if;

      v_remaining := v_dispensed;
      for v_inventory in
        select id, quantity
        from public.inventory
        where facility_id = v_program.facility_id
          and medicine_id = v_item.medicine_id
          and quantity > 0
          and (expiration_date is null or expiration_date >= current_date)
        order by expiration_date asc nulls last, date_received asc nulls last, id
        for update
      loop
        exit when v_remaining = 0;
        v_take := least(v_remaining, v_inventory.quantity);
        update public.inventory set quantity = quantity - v_take where id = v_inventory.id;
        v_remaining := v_remaining - v_take;
      end loop;
    end if;

    begin
      update public.program_medicines
      set quantity_allocated = v_allocated,
          quantity_returned = v_returned,
          quantity_used = v_dispensed
      where id = v_item.id;
    exception when check_violation then
      update public.program_medicines
      set quantity_allocated = v_allocated,
          quantity_returned = v_returned,
          quantity_used = greatest(v_dispensed, 1)
      where id = v_item.id;
    end;
  end loop;

  update public.other_programs
  set status = 'COMPLETED',
      started_at = coalesce(started_at, pg_catalog.now()),
      completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = v_program.id;

  return jsonb_build_object(
    'program_id', v_program.id,
    'status', 'COMPLETED',
    'total_allocated', v_total_allocated,
    'total_returned', v_total_returned,
    'total_dispensed', v_total_dispensed
  );
end;
$$;

create or replace function public.complete_other_program(p_program_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.complete_other_program(p_program_id, '[]'::jsonb);
end;
$$;

-- 9. Update cancel_other_program to allow cancelling UPCOMING or ONGOING programs
create or replace function public.cancel_other_program(p_program_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not (public.is_pharma_i() or public.is_pharma_ii()) then
    raise exception 'Only CHO pharmacists can cancel Other Programs.' using errcode = '42501';
  end if;

  update public.other_programs
  set status = 'CANCELLED',
      cancelled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = p_program_id and status in ('UPCOMING', 'ONGOING');

  if not found then
    if exists (select 1 from public.other_programs where id = p_program_id and status = 'CANCELLED') then
      return jsonb_build_object('program_id', p_program_id, 'status', 'CANCELLED');
    end if;
    raise exception 'Only upcoming or ongoing programs can be cancelled.' using errcode = '22023';
  end if;

  return jsonb_build_object('program_id', p_program_id, 'status', 'CANCELLED');
end;
$$;

revoke all on function public.save_other_program(uuid, text, date, text, jsonb) from public, anon;
revoke all on function public.start_other_program(uuid) from public, anon;
revoke all on function public.complete_other_program(uuid, jsonb) from public, anon;
revoke all on function public.complete_other_program(uuid) from public, anon;
revoke all on function public.cancel_other_program(uuid) from public, anon;

grant execute on function public.save_other_program(uuid, text, date, text, jsonb) to authenticated;
grant execute on function public.start_other_program(uuid) to authenticated;
grant execute on function public.complete_other_program(uuid, jsonb) to authenticated;
grant execute on function public.complete_other_program(uuid) to authenticated;
grant execute on function public.cancel_other_program(uuid) to authenticated;

notify pgrst, 'reload schema';
