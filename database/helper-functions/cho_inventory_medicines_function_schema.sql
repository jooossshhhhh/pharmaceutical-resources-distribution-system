/*
=====================================================
CHO Inventory Medicines and BHW Request Submission

Purpose:
Exposes CHO medicine availability to active BHW users
and creates BHW requests atomically.

Availability:
physical CHO stock - pending request items, plus legacy
approved request items that do not have fulfillment rows yet.
=====================================================
*/

drop function if exists public.get_cho_inventory_medicines();

create function public.get_cho_inventory_medicines()
returns table (
  id uuid,
  generic_name text,
  brand_name text,
  dosage text,
  unit_of_measure text,
  physical_quantity bigint,
  reserved_quantity bigint,
  available_quantity bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.role = 'BHW'
       and p.status = 'ACTIVE'
  ) then
    raise exception 'Only active BHW accounts can view CHO request availability.'
      using errcode = '42501';
  end if;

  return query
  with physical_stock as (
    select
      i.medicine_id,
      sum(i.quantity)::bigint as quantity
    from public.inventory i
    join public.facilities f on f.id = i.facility_id
    where f.facility_type = 'CHO'
      and f.status = 'ACTIVE'
      and i.quantity > 0
      and i.expiration_date > current_date
    group by i.medicine_id
    having sum(i.quantity) > 0
  ),
  reserved_stock as (
    select
      ri.medicine_id,
      sum(ri.quantity)::bigint as quantity
    from public.medicine_request_items ri
    join public.medicine_requests r on r.id = ri.request_id
    where r.status = 'PENDING'
       or (
         r.status = 'APPROVED'
         and not exists (
           select 1
             from public.medicine_request_fulfillments mf
            where mf.request_item_id = ri.id
         )
       )
    group by ri.medicine_id
  )
  select
    m.id,
    m.generic_name,
    m.brand_name,
    m.dosage,
    m.unit_of_measure,
    ps.quantity as physical_quantity,
    coalesce(rs.quantity, 0)::bigint as reserved_quantity,
    greatest(ps.quantity - coalesce(rs.quantity, 0), 0)::bigint as available_quantity
  from physical_stock ps
  join public.medicines m on m.id = ps.medicine_id
  left join reserved_stock rs on rs.medicine_id = ps.medicine_id
  order by m.generic_name, m.brand_name, m.dosage;
end;
$$;

revoke all on function public.get_cho_inventory_medicines() from public;
revoke all on function public.get_cho_inventory_medicines() from anon;
grant execute on function public.get_cho_inventory_medicines() to authenticated;

create or replace function public.submit_bhw_medicine_request(
  p_items jsonb,
  p_remarks text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_available_quantity bigint;
  v_facility_id uuid;
  v_item record;
  v_physical_quantity bigint;
  v_profile_id uuid;
  v_request_id uuid;
  v_reserved_quantity bigint;
begin
  select p.id, p.facility_id
    into v_profile_id, v_facility_id
    from public.profiles p
    join public.facilities f on f.id = p.facility_id
   where p.id = auth.uid()
     and p.role = 'BHW'
     and p.status = 'ACTIVE'
     and f.facility_type = 'HEALTH_CENTER'
     and f.status = 'ACTIVE';

  if v_profile_id is null or v_facility_id is null then
    raise exception 'An active BHW account assigned to an active health center is required.'
      using errcode = '42501';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one medicine to the request.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
     where item.medicine_id is null or item.quantity is null or item.quantity <= 0
  ) then
    raise exception 'Every request item requires a medicine and a positive whole-number quantity.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
     group by item.medicine_id
    having count(*) > 1
  ) then
    raise exception 'Each medicine can appear only once per request.'
      using errcode = '23505';
  end if;

  perform i.id
    from public.inventory i
    join public.facilities f on f.id = i.facility_id
   where f.facility_type = 'CHO'
     and f.status = 'ACTIVE'
     and i.medicine_id in (
       select item.medicine_id
         from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
     )
   order by i.id
   for update of i;

  for v_item in
    select item.medicine_id, item.quantity
      from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
  loop
    select coalesce(sum(i.quantity), 0)::bigint
      into v_physical_quantity
      from public.inventory i
      join public.facilities f on f.id = i.facility_id
     where f.facility_type = 'CHO'
       and f.status = 'ACTIVE'
       and i.expiration_date > current_date
       and i.medicine_id = v_item.medicine_id;

    select coalesce(sum(ri.quantity), 0)::bigint
      into v_reserved_quantity
      from public.medicine_request_items ri
      join public.medicine_requests r on r.id = ri.request_id
     where ri.medicine_id = v_item.medicine_id
       and (
         r.status = 'PENDING'
         or (
           r.status = 'APPROVED'
           and not exists (
             select 1
               from public.medicine_request_fulfillments mf
              where mf.request_item_id = ri.id
           )
         )
       );

    v_available_quantity := greatest(v_physical_quantity - v_reserved_quantity, 0);

    if v_physical_quantity <= 0 then
      raise exception 'The selected medicine is not currently stocked at CHO.'
        using errcode = 'P0001';
    end if;

    if v_item.quantity > v_available_quantity then
      raise exception 'Requested quantity exceeds the % units currently available at CHO.',
        v_available_quantity
        using errcode = 'P0001';
    end if;
  end loop;

  insert into public.medicine_requests (requested_by, facility_id, remarks)
  values (v_profile_id, v_facility_id, nullif(btrim(p_remarks), ''))
  returning id into v_request_id;

  insert into public.medicine_request_items (request_id, medicine_id, quantity)
  select v_request_id, item.medicine_id, item.quantity
    from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer);

  insert into public.activity_logs (user_id, action, module, details)
  values (
    v_profile_id,
    'Medicine Request Submitted',
    'Medicine Request',
    'Submitted medicine request ' || v_request_id
  );

  return v_request_id;
end;
$$;

revoke all on function public.submit_bhw_medicine_request(jsonb, text) from public;
revoke all on function public.submit_bhw_medicine_request(jsonb, text) from anon;
grant execute on function public.submit_bhw_medicine_request(jsonb, text) to authenticated;
