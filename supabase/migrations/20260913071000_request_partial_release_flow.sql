/*
=====================================================
Request partial release flow

CHO release now completes the request transaction.
Requested quantity stays on medicine_request_items;
released quantity is recorded in medicine_request_fulfillments.
=====================================================
*/

create or replace function public.approve_and_release_medicine_request(
  p_request_id uuid,
  p_allocations jsonb,
  p_remarks text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allocation record;
  v_caller_id uuid;
  v_destination_inventory_id uuid;
  v_destination_threshold integer;
  v_request public.medicine_requests%rowtype;
begin
  select p.id
    into v_caller_id
    from public.profiles p
   where p.id = auth.uid()
     and p.role in ('PHARMA_I', 'PHARMA_II')
     and p.status = 'ACTIVE';

  if v_caller_id is null then
    raise exception 'Only active CHO pharmacy staff can release medicine requests.'
      using errcode = '42501';
  end if;

  select *
    into v_request
    from public.medicine_requests r
   where r.id = p_request_id
   for update;

  if v_request.id is null then
    raise exception 'Medicine request not found.'
      using errcode = 'P0001';
  end if;

  if v_request.status <> 'PENDING' then
    raise exception 'Only pending requests can be released.'
      using errcode = 'P0001';
  end if;

  if p_allocations is null
     or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Allocate at least one requested medicine before release.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_allocations) as a(
        request_item_id uuid,
        source_inventory_id uuid,
        quantity integer
      )
     where a.request_item_id is null
        or a.source_inventory_id is null
        or a.quantity is null
        or a.quantity <= 0
  ) then
    raise exception 'Every lot allocation requires a request item, CHO lot, and positive quantity.'
      using errcode = '22023';
  end if;

  perform i.id
    from public.inventory i
   where i.id in (
     select a.source_inventory_id
       from jsonb_to_recordset(p_allocations) as a(
         request_item_id uuid,
         source_inventory_id uuid,
         quantity integer
       )
   )
   order by i.id
   for update;

  if exists (
    select 1
      from jsonb_to_recordset(p_allocations) as a(
        request_item_id uuid,
        source_inventory_id uuid,
        quantity integer
      )
      left join public.medicine_request_items ri
        on ri.id = a.request_item_id
       and ri.request_id = p_request_id
      left join public.inventory i
        on i.id = a.source_inventory_id
      left join public.facilities f
        on f.id = i.facility_id
     where ri.id is null
        or i.id is null
        or f.facility_type <> 'CHO'
        or f.status <> 'ACTIVE'
        or i.medicine_id <> ri.medicine_id
        or i.expiration_date <= current_date
  ) then
    raise exception 'One or more selected lots cannot fulfill this request item.'
      using errcode = 'P0001';
  end if;

  if exists (
    with allocation_totals as (
      select a.request_item_id, sum(a.quantity)::integer as quantity
        from jsonb_to_recordset(p_allocations) as a(
          request_item_id uuid,
          source_inventory_id uuid,
          quantity integer
        )
       group by a.request_item_id
    )
    select 1
      from allocation_totals at
      join public.medicine_request_items ri on ri.id = at.request_item_id
     where ri.request_id = p_request_id
       and at.quantity > ri.quantity
  ) then
    raise exception 'Release quantity cannot exceed requested quantity.'
      using errcode = '22023';
  end if;

  if exists (
    with batch_totals as (
      select a.source_inventory_id, sum(a.quantity)::integer as quantity
        from jsonb_to_recordset(p_allocations) as a(
          request_item_id uuid,
          source_inventory_id uuid,
          quantity integer
        )
       group by a.source_inventory_id
    )
    select 1
      from batch_totals bt
      join public.inventory i on i.id = bt.source_inventory_id
     where bt.quantity > i.quantity
  ) then
    raise exception 'Lot allocation exceeds current CHO stock. Refresh and try again.'
      using errcode = 'P0001';
  end if;

  for v_allocation in
    with allocation_rows as (
      select
        a.request_item_id,
        a.source_inventory_id,
        sum(a.quantity)::integer as quantity
      from jsonb_to_recordset(p_allocations) as a(
        request_item_id uuid,
        source_inventory_id uuid,
        quantity integer
      )
      group by a.request_item_id, a.source_inventory_id
    )
    select
      ar.request_item_id,
      ar.source_inventory_id,
      ar.quantity,
      i.medicine_id,
      i.supplier_id,
      i.batch_number,
      i.expiration_date
    from allocation_rows ar
    join public.inventory i on i.id = ar.source_inventory_id
    order by i.expiration_date, i.date_received, i.id
  loop
    select coalesce(max(i.threshold), 0)
      into v_destination_threshold
      from public.inventory i
     where i.facility_id = v_request.facility_id
       and i.medicine_id = v_allocation.medicine_id;

    insert into public.inventory (
      facility_id,
      medicine_id,
      supplier_id,
      quantity,
      threshold,
      batch_number,
      date_received,
      expiration_date,
      updated_at
    )
    values (
      v_request.facility_id,
      v_allocation.medicine_id,
      v_allocation.supplier_id,
      v_allocation.quantity,
      v_destination_threshold,
      v_allocation.batch_number,
      current_date,
      v_allocation.expiration_date,
      now()
    )
    on conflict on constraint inventory_unique_batch
    do update set
      quantity = public.inventory.quantity + excluded.quantity,
      updated_at = now()
    returning id into v_destination_inventory_id;

    update public.inventory
       set quantity = quantity - v_allocation.quantity,
           updated_at = now()
     where id = v_allocation.source_inventory_id;

    insert into public.medicine_request_fulfillments (
      request_id,
      request_item_id,
      source_inventory_id,
      destination_inventory_id,
      quantity,
      fulfilled_by
    )
    values (
      p_request_id,
      v_allocation.request_item_id,
      v_allocation.source_inventory_id,
      v_destination_inventory_id,
      v_allocation.quantity,
      v_caller_id
    );
  end loop;

  update public.medicine_requests
     set status = 'COMPLETED',
         approved_by = v_caller_id,
         approved_at = now(),
         remarks = nullif(btrim(p_remarks), '')
   where id = p_request_id;

  insert into public.activity_logs (user_id, action, module, details)
  values (
    v_caller_id,
    'Request Released',
    'Medicine Request',
    'Released and completed medicine request ' || p_request_id
  );

  insert into public.notifications (user_id, title, message)
  select
    v_request.requested_by,
    'Request Released',
    'Your medicine request ' || upper(substr(p_request_id::text, 1, 8))
      || ' has been released by CHO.'
  where coalesce(v_request.request_source, 'SYSTEM') = 'SYSTEM'
    and v_request.requested_by is not null;

  return p_request_id;
end;
$$;

revoke all on function public.approve_and_release_medicine_request(uuid, jsonb, text) from public;
revoke all on function public.approve_and_release_medicine_request(uuid, jsonb, text) from anon;
grant execute on function public.approve_and_release_medicine_request(uuid, jsonb, text) to authenticated;
