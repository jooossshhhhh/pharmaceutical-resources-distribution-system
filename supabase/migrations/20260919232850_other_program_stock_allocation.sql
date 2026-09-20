alter table public.other_programs
  add column if not exists facility_id uuid references public.facilities(id) on delete restrict,
  add column if not exists status text not null default 'UPCOMING',
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz;

alter table public.other_programs
  drop constraint if exists other_programs_status_check;

alter table public.other_programs
  add constraint other_programs_status_check
  check (status in ('UPCOMING', 'COMPLETED', 'CANCELLED'));

create index if not exists other_programs_facility_status_idx
  on public.other_programs (facility_id, status, program_date);

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
      raise exception 'Program was not found.' using errcode = 'P0002';
    end if;
    if v_program.status <> 'UPCOMING' then
      raise exception 'Only upcoming programs can be edited.' using errcode = '22023';
    end if;
    if v_program.facility_id is not null and v_program.facility_id <> v_facility_id then
      raise exception 'This program belongs to another facility.' using errcode = '42501';
    end if;

    update public.other_programs
    set facility_id = coalesce(v_program.facility_id, v_facility_id),
        program_name = pg_catalog.btrim(p_program_name),
        program_date = p_program_date,
        description = nullif(pg_catalog.btrim(p_description), '')
    where id = p_program_id
    returning * into v_program;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_medicine_id := nullif(v_item->>'medicine_id', '')::uuid;
    v_quantity := (v_item->>'quantity_used')::integer;
    if v_medicine_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception 'Each program medicine needs a positive quantity.' using errcode = '22023';
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

    select coalesce(sum(pm.quantity_used), 0)::integer into v_reserved
    from public.program_medicines pm
    join public.other_programs op on op.id = pm.program_id
    where op.facility_id = v_program.facility_id
      and op.status = 'UPCOMING'
      and op.id <> v_program.id
      and pm.medicine_id = v_medicine_id;

    if v_stock - v_reserved < v_quantity then
      raise exception 'Insufficient available CHO stock for the selected medicine.' using errcode = '22003';
    end if;
  end loop;

  delete from public.program_medicines where program_id = v_program.id;
  insert into public.program_medicines (program_id, medicine_id, quantity_used)
  select v_program.id, (item->>'medicine_id')::uuid, (item->>'quantity_used')::integer
  from jsonb_array_elements(p_items) as item;

  return v_program.id;
end;
$$;

create or replace function public.complete_other_program(p_program_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program public.other_programs%rowtype;
  v_item record;
  v_inventory record;
  v_remaining integer;
  v_take integer;
  v_stock integer;
  v_reserved integer;
begin
  if auth.uid() is null or not (public.is_pharma_i() or public.is_pharma_ii()) then
    raise exception 'Only CHO pharmacists can complete Other Programs.' using errcode = '42501';
  end if;

  select * into v_program from public.other_programs where id = p_program_id for update;
  if not found then
    raise exception 'Program was not found.' using errcode = 'P0002';
  end if;
  if v_program.status <> 'UPCOMING' then
    raise exception 'Only upcoming programs can be completed.' using errcode = '22023';
  end if;
  if v_program.facility_id is null then
    raise exception 'This program has no dispensing facility.' using errcode = '22023';
  end if;

  for v_item in select medicine_id, quantity_used from public.program_medicines where program_id = v_program.id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_program.facility_id::text || ':' || v_item.medicine_id::text, 0)
    );

    select coalesce(sum(quantity), 0)::integer into v_stock
    from public.inventory
    where facility_id = v_program.facility_id
      and medicine_id = v_item.medicine_id
      and quantity > 0
      and (expiration_date is null or expiration_date >= current_date);

    select coalesce(sum(pm.quantity_used), 0)::integer into v_reserved
    from public.program_medicines pm
    join public.other_programs op on op.id = pm.program_id
    where op.facility_id = v_program.facility_id
      and op.status = 'UPCOMING'
      and op.id <> v_program.id
      and pm.medicine_id = v_item.medicine_id;

    if v_stock - v_reserved < v_item.quantity_used then
      raise exception 'CHO stock is no longer sufficient to complete this program.' using errcode = '22003';
    end if;

    v_remaining := v_item.quantity_used;
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
  end loop;

  update public.other_programs
  set status = 'COMPLETED', completed_at = pg_catalog.now()
  where id = v_program.id;

  return jsonb_build_object('program_id', v_program.id, 'status', 'COMPLETED');
end;
$$;

create or replace function public.cancel_other_program(p_program_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (public.is_pharma_i() or public.is_pharma_ii()) then
    raise exception 'Only CHO pharmacists can cancel Other Programs.' using errcode = '42501';
  end if;

  update public.other_programs
  set status = 'CANCELLED', cancelled_at = pg_catalog.now()
  where id = p_program_id and status = 'UPCOMING';

  if not found then
    raise exception 'Only upcoming programs can be cancelled.' using errcode = '22023';
  end if;

  return jsonb_build_object('program_id', p_program_id, 'status', 'CANCELLED');
end;
$$;

revoke all on function public.save_other_program(uuid, text, date, text, jsonb) from public, anon;
revoke all on function public.complete_other_program(uuid) from public, anon;
revoke all on function public.cancel_other_program(uuid) from public, anon;
grant execute on function public.save_other_program(uuid, text, date, text, jsonb) to authenticated;
grant execute on function public.complete_other_program(uuid) to authenticated;
grant execute on function public.cancel_other_program(uuid) to authenticated;

notify pgrst, 'reload schema';
