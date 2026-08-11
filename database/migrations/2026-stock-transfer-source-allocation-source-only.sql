/*
=====================================================
Stock Transfer Source-Only Allocation Guard

Purpose:
Tightens the facility-controlled transfer workflow so
only the source facility can allocate batches and mark
an approved transfer ready for pickup. CHO users still
approve/reject and monitor, but do not bypass source
facility allocation unless CHO is the source facility.
=====================================================
*/

create or replace function public.get_stock_transfer_allocation_batches(p_transfer_id uuid)
returns table (
  transfer_item_id uuid,
  medicine_id uuid,
  source_inventory_id uuid,
  supplier_id uuid,
  supplier_name text,
  batch_number text,
  quantity integer,
  threshold integer,
  date_received date,
  expiration_date date,
  recommended_quantity integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_facility uuid;
  v_source_facility uuid;
begin
  select p.facility_id
    into v_caller_facility
    from public.profiles p
   where p.id = auth.uid()
     and p.status = 'ACTIVE';

  if v_caller_facility is null then
    raise exception 'An active account assigned to a facility is required.'
      using errcode = '42501';
  end if;

  select st.source_facility_id
    into v_source_facility
    from public.stock_transfers st
   where st.id = p_transfer_id
     and st.status = 'APPROVED';

  if v_source_facility is null then
    raise exception 'Approved stock transfer not found.'
      using errcode = 'P0001';
  end if;

  if v_caller_facility <> v_source_facility then
    raise exception 'Only the source facility can allocate this transfer.'
      using errcode = '42501';
  end if;

  return query
  with requested_items as (
    select
      sti.id as transfer_item_id,
      sti.medicine_id,
      sti.quantity as requested_quantity,
      st.source_facility_id
    from public.stock_transfer_items sti
    join public.stock_transfers st on st.id = sti.transfer_id
    where sti.transfer_id = p_transfer_id
  ),
  source_batches as (
    select
      ri.transfer_item_id,
      ri.medicine_id,
      ri.requested_quantity,
      i.id as source_inventory_id,
      i.supplier_id,
      s.supplier_name,
      i.batch_number,
      i.quantity,
      i.threshold,
      i.date_received,
      i.expiration_date,
      coalesce(
        sum(i.quantity) over (
          partition by ri.transfer_item_id
          order by i.expiration_date, i.date_received, i.id
          rows between unbounded preceding and 1 preceding
        ),
        0
      ) as prior_quantity
    from requested_items ri
    join public.inventory i
      on i.medicine_id = ri.medicine_id
     and i.facility_id = ri.source_facility_id
    join public.suppliers s on s.id = i.supplier_id
    where i.quantity > 0
      and i.expiration_date > current_date
  )
  select
    sb.transfer_item_id,
    sb.medicine_id,
    sb.source_inventory_id,
    sb.supplier_id,
    sb.supplier_name,
    sb.batch_number,
    sb.quantity,
    sb.threshold,
    sb.date_received,
    sb.expiration_date,
    greatest(
      least(sb.quantity, sb.requested_quantity - sb.prior_quantity),
      0
    )::integer as recommended_quantity
  from source_batches sb
  order by sb.transfer_item_id, sb.expiration_date, sb.date_received, sb.source_inventory_id;
end;
$$;

revoke all on function public.get_stock_transfer_allocation_batches(uuid) from public;
revoke all on function public.get_stock_transfer_allocation_batches(uuid) from anon;
grant execute on function public.get_stock_transfer_allocation_batches(uuid) to authenticated;

create or replace function public.allocate_stock_transfer_for_pickup(
  p_transfer_id uuid,
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
  v_caller_facility uuid;
  v_caller_id uuid;
  v_transfer public.stock_transfers%rowtype;
begin
  select p.id, p.facility_id
    into v_caller_id, v_caller_facility
    from public.profiles p
   where p.id = auth.uid()
     and p.status = 'ACTIVE';

  if v_caller_id is null or v_caller_facility is null then
    raise exception 'An active account assigned to a facility is required.'
      using errcode = '42501';
  end if;

  select *
    into v_transfer
    from public.stock_transfers st
   where st.id = p_transfer_id
   for update;

  if v_transfer.id is null then
    raise exception 'Stock transfer not found.'
      using errcode = 'P0001';
  end if;

  if v_transfer.status <> 'APPROVED' then
    raise exception 'Only CHO-approved transfers can be allocated for pickup.'
      using errcode = 'P0001';
  end if;

  if v_caller_facility <> v_transfer.source_facility_id then
    raise exception 'Only the source facility can allocate this transfer.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.stock_transfer_fulfillments sf
     where sf.transfer_id = p_transfer_id
  ) then
    raise exception 'This transfer has already been allocated.'
      using errcode = 'P0001';
  end if;

  if p_allocations is null
     or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Choose at least one source batch allocation.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_allocations) as a(
        transfer_item_id uuid,
        source_inventory_id uuid,
        quantity integer
      )
     where a.transfer_item_id is null
        or a.source_inventory_id is null
        or a.quantity is null
        or a.quantity <= 0
  ) then
    raise exception 'Every batch allocation requires a transfer item, source batch, and positive quantity.'
      using errcode = '22023';
  end if;

  perform i.id
    from public.inventory i
   where i.id in (
     select a.source_inventory_id
       from jsonb_to_recordset(p_allocations) as a(
         transfer_item_id uuid,
         source_inventory_id uuid,
         quantity integer
       )
   )
   order by i.id
   for update;

  if exists (
    select 1
      from jsonb_to_recordset(p_allocations) as a(
        transfer_item_id uuid,
        source_inventory_id uuid,
        quantity integer
      )
      left join public.stock_transfer_items sti
        on sti.id = a.transfer_item_id
       and sti.transfer_id = p_transfer_id
      left join public.inventory i
        on i.id = a.source_inventory_id
     where sti.id is null
        or i.id is null
        or i.facility_id <> v_transfer.source_facility_id
        or i.medicine_id <> sti.medicine_id
        or i.expiration_date <= current_date
  ) then
    raise exception 'One or more selected batches cannot fulfill this transfer item.'
      using errcode = 'P0001';
  end if;

  if exists (
    with allocation_totals as (
      select a.transfer_item_id, sum(a.quantity)::integer as quantity
        from jsonb_to_recordset(p_allocations) as a(
          transfer_item_id uuid,
          source_inventory_id uuid,
          quantity integer
        )
       group by a.transfer_item_id
    )
    select 1
      from public.stock_transfer_items sti
      left join allocation_totals at on at.transfer_item_id = sti.id
     where sti.transfer_id = p_transfer_id
       and coalesce(at.quantity, 0) <> sti.quantity
  ) then
    raise exception 'Batch allocations must exactly match every transfer quantity.'
      using errcode = '22023';
  end if;

  if exists (
    with batch_totals as (
      select a.source_inventory_id, sum(a.quantity)::integer as quantity
        from jsonb_to_recordset(p_allocations) as a(
          transfer_item_id uuid,
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
    raise exception 'Batch allocation exceeds current source stock. Refresh and try again.'
      using errcode = 'P0001';
  end if;

  for v_allocation in
    with allocation_rows as (
      select
        a.transfer_item_id,
        a.source_inventory_id,
        sum(a.quantity)::integer as quantity
      from jsonb_to_recordset(p_allocations) as a(
        transfer_item_id uuid,
        source_inventory_id uuid,
        quantity integer
      )
      group by a.transfer_item_id, a.source_inventory_id
    )
    select
      ar.transfer_item_id,
      ar.source_inventory_id,
      ar.quantity
    from allocation_rows ar
    join public.inventory i on i.id = ar.source_inventory_id
    order by i.expiration_date, i.date_received, i.id
  loop
    update public.inventory
       set quantity = quantity - v_allocation.quantity,
           updated_at = now()
     where id = v_allocation.source_inventory_id;

    insert into public.stock_transfer_fulfillments (
      transfer_id,
      transfer_item_id,
      source_inventory_id,
      quantity,
      fulfilled_by
    )
    values (
      p_transfer_id,
      v_allocation.transfer_item_id,
      v_allocation.source_inventory_id,
      v_allocation.quantity,
      v_caller_id
    );
  end loop;

  update public.stock_transfers
     set status = 'READY_FOR_PICKUP',
         transfer_date = now(),
         remarks = coalesce(nullif(btrim(p_remarks), ''), remarks)
   where id = p_transfer_id;

  insert into public.activity_logs (user_id, action, module, details)
  values (
    v_caller_id,
    'Transfer Ready for Pickup',
    'Stock Transfer',
    'Allocated source batches and marked stock transfer ' || p_transfer_id || ' ready for pickup.'
  );

  insert into public.notifications (user_id, title, message)
  select
    p.id,
    'Transfer Ready for Pickup',
    'Stock transfer ' || upper(substr(p_transfer_id::text, 1, 8))
      || ' is ready for pickup from the source facility.'
    from public.profiles p
   where p.facility_id = v_transfer.destination_facility_id
     and p.status = 'ACTIVE';

  insert into public.notifications (user_id, title, message)
  select
    p.id,
    'Transfer Ready for Pickup',
    'Stock transfer ' || upper(substr(p_transfer_id::text, 1, 8))
      || ' was allocated by the source facility.'
    from public.profiles p
   where p.role in ('PHARMA_I', 'PHARMA_II')
     and p.status = 'ACTIVE';

  return p_transfer_id;
end;
$$;

revoke all on function public.allocate_stock_transfer_for_pickup(uuid, jsonb, text) from public;
revoke all on function public.allocate_stock_transfer_for_pickup(uuid, jsonb, text) from anon;
grant execute on function public.allocate_stock_transfer_for_pickup(uuid, jsonb, text) to authenticated;
