/*
=====================================================
Stock Transfer Batch Fulfillment

Purpose:
Makes stock transfers batch-aware and transactional.

Workflow:
PENDING
  -> approve_and_release_stock_transfer()
  -> APPROVED with source inventory deducted and
     destination inventory created/incremented
  -> confirm_stock_transfer_received()
  -> COMPLETED receipt confirmation only

APPROVED means released. COMPLETED means received.
=====================================================
*/

create table if not exists public.stock_transfer_fulfillments (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  transfer_item_id uuid not null references public.stock_transfer_items(id) on delete cascade,
  source_inventory_id uuid not null references public.inventory(id) on delete restrict,
  destination_inventory_id uuid not null references public.inventory(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  fulfilled_by uuid not null references public.profiles(id) on delete restrict,
  fulfilled_at timestamptz not null default now(),
  constraint stock_transfer_fulfillments_unique_batch
    unique (transfer_item_id, source_inventory_id)
);

alter table public.stock_transfer_fulfillments enable row level security;

drop policy if exists "view_stock_transfer_fulfillments" on public.stock_transfer_fulfillments;

create policy "view_stock_transfer_fulfillments"
on public.stock_transfer_fulfillments
for select
to authenticated
using (
  public.is_pharma_i()
  or public.is_pharma_ii()
  or exists (
    select 1
      from public.stock_transfers st
     where st.id = stock_transfer_fulfillments.transfer_id
       and (
         st.source_facility_id = public.get_user_facility()
         or st.destination_facility_id = public.get_user_facility()
       )
  )
);

grant select on public.stock_transfer_fulfillments to authenticated;

create index if not exists idx_transfer_fulfillments_transfer
on public.stock_transfer_fulfillments(transfer_id);

create index if not exists idx_transfer_fulfillments_item
on public.stock_transfer_fulfillments(transfer_item_id);

create index if not exists idx_transfer_fulfillments_source_inventory
on public.stock_transfer_fulfillments(source_inventory_id);

create index if not exists idx_transfer_fulfillments_destination_inventory
on public.stock_transfer_fulfillments(destination_inventory_id);

create index if not exists idx_transfer_fulfillments_fulfilled_by
on public.stock_transfer_fulfillments(fulfilled_by);

/*
=====================================================
Source availability for transfer selection
=====================================================
*/

create or replace function public.get_transfer_source_availability(
  p_source_facility_id uuid default null
)
returns table (
  source_facility_id uuid,
  source_facility_name text,
  source_facility_code text,
  medicine_id uuid,
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
declare
  v_user_facility uuid;
  v_user_role public.user_role;
begin
  select p.role, p.facility_id
    into v_user_role, v_user_facility
    from public.profiles p
   where p.id = auth.uid()
     and p.status = 'ACTIVE';

  if v_user_role is null then
    raise exception 'An active account is required to view transfer availability.'
      using errcode = '42501';
  end if;

  if v_user_role not in ('BHW', 'PHARMA_I', 'PHARMA_II') then
    raise exception 'Your role cannot view transfer availability.'
      using errcode = '42501';
  end if;

  return query
  with physical_stock as (
    select
      i.facility_id,
      i.medicine_id,
      sum(i.quantity)::bigint as quantity
    from public.inventory i
    join public.facilities f on f.id = i.facility_id
    where f.status = 'ACTIVE'
      and i.quantity > 0
      and i.expiration_date > current_date
      and (p_source_facility_id is null or i.facility_id = p_source_facility_id)
      and (
        v_user_role in ('PHARMA_I', 'PHARMA_II')
        or i.facility_id <> v_user_facility
      )
    group by i.facility_id, i.medicine_id
    having sum(i.quantity) > 0
  ),
  reserved_stock as (
    select
      st.source_facility_id as facility_id,
      sti.medicine_id,
      sum(sti.quantity)::bigint as quantity
    from public.stock_transfer_items sti
    join public.stock_transfers st on st.id = sti.transfer_id
    where st.status = 'PENDING'
       or (
         st.status = 'APPROVED'
         and not exists (
           select 1
             from public.stock_transfer_fulfillments sf
            where sf.transfer_item_id = sti.id
         )
       )
    group by st.source_facility_id, sti.medicine_id
  )
  select
    f.id as source_facility_id,
    f.facility_name as source_facility_name,
    f.facility_code as source_facility_code,
    m.id as medicine_id,
    m.generic_name,
    m.brand_name,
    m.dosage,
    m.unit_of_measure,
    ps.quantity as physical_quantity,
    coalesce(rs.quantity, 0)::bigint as reserved_quantity,
    greatest(ps.quantity - coalesce(rs.quantity, 0), 0)::bigint as available_quantity
  from physical_stock ps
  join public.facilities f on f.id = ps.facility_id
  join public.medicines m on m.id = ps.medicine_id
  left join reserved_stock rs
    on rs.facility_id = ps.facility_id
   and rs.medicine_id = ps.medicine_id
  where greatest(ps.quantity - coalesce(rs.quantity, 0), 0) > 0
  order by f.facility_name, m.generic_name, m.brand_name, m.dosage;
end;
$$;

revoke all on function public.get_transfer_source_availability(uuid) from public;
revoke all on function public.get_transfer_source_availability(uuid) from anon;
grant execute on function public.get_transfer_source_availability(uuid) to authenticated;

/*
=====================================================
BHW transfer request submission
=====================================================
*/

create or replace function public.submit_bhw_stock_transfer_request(
  p_source_facility_id uuid,
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
  v_destination_facility_id uuid;
  v_item record;
  v_physical_quantity bigint;
  v_profile_id uuid;
  v_reserved_quantity bigint;
  v_transfer_id uuid;
begin
  select p.id, p.facility_id
    into v_profile_id, v_destination_facility_id
    from public.profiles p
    join public.facilities f on f.id = p.facility_id
   where p.id = auth.uid()
     and p.role = 'BHW'
     and p.status = 'ACTIVE'
     and f.facility_type = 'HEALTH_CENTER'
     and f.status = 'ACTIVE';

  if v_profile_id is null or v_destination_facility_id is null then
    raise exception 'An active BHW account assigned to an active health center is required.'
      using errcode = '42501';
  end if;

  if p_source_facility_id is null or p_source_facility_id = v_destination_facility_id then
    raise exception 'Choose a valid source facility different from your own facility.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.facilities f
     where f.id = p_source_facility_id
       and f.status = 'ACTIVE'
  ) then
    raise exception 'Selected source facility is not active.'
      using errcode = 'P0001';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one medicine to the transfer request.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
     where item.medicine_id is null or item.quantity is null or item.quantity <= 0
  ) then
    raise exception 'Every transfer item requires a medicine and a positive whole-number quantity.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
     group by item.medicine_id
    having count(*) > 1
  ) then
    raise exception 'Each medicine can appear only once per transfer.'
      using errcode = '23505';
  end if;

  perform i.id
    from public.inventory i
   where i.facility_id = p_source_facility_id
     and i.medicine_id in (
       select item.medicine_id
         from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
     )
   order by i.id
   for update;

  for v_item in
    select item.medicine_id, item.quantity
      from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
  loop
    select coalesce(sum(i.quantity), 0)::bigint
      into v_physical_quantity
      from public.inventory i
     where i.facility_id = p_source_facility_id
       and i.expiration_date > current_date
       and i.medicine_id = v_item.medicine_id;

    select coalesce(sum(sti.quantity), 0)::bigint
      into v_reserved_quantity
      from public.stock_transfer_items sti
      join public.stock_transfers st on st.id = sti.transfer_id
     where sti.medicine_id = v_item.medicine_id
       and st.source_facility_id = p_source_facility_id
       and (
         st.status = 'PENDING'
         or (
           st.status = 'APPROVED'
           and not exists (
             select 1
               from public.stock_transfer_fulfillments sf
              where sf.transfer_item_id = sti.id
           )
         )
       );

    v_available_quantity := greatest(v_physical_quantity - v_reserved_quantity, 0);

    if v_physical_quantity <= 0 then
      raise exception 'The selected medicine is not currently stocked at the source facility.'
        using errcode = 'P0001';
    end if;

    if v_item.quantity > v_available_quantity then
      raise exception 'Requested quantity exceeds the % units currently available from the source facility.',
        v_available_quantity
        using errcode = 'P0001';
    end if;
  end loop;

  insert into public.stock_transfers (
    source_facility_id,
    destination_facility_id,
    requested_by,
    remarks
  )
  values (
    p_source_facility_id,
    v_destination_facility_id,
    v_profile_id,
    nullif(btrim(p_remarks), '')
  )
  returning id into v_transfer_id;

  insert into public.stock_transfer_items (transfer_id, medicine_id, quantity)
  select v_transfer_id, item.medicine_id, item.quantity
    from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer);

  insert into public.activity_logs (user_id, action, module, details)
  values (
    v_profile_id,
    'Stock Transfer Requested',
    'Stock Transfer',
    'Submitted stock transfer request ' || v_transfer_id
  );

  insert into public.notifications (user_id, title, message)
  select
    p.id,
    'Transfer Request Submitted',
    'A stock transfer request ' || upper(substr(v_transfer_id::text, 1, 8))
      || ' is waiting for CHO review.'
    from public.profiles p
   where p.role in ('PHARMA_I', 'PHARMA_II')
     and p.status = 'ACTIVE';

  return v_transfer_id;
end;
$$;

revoke all on function public.submit_bhw_stock_transfer_request(uuid, jsonb, text) from public;
revoke all on function public.submit_bhw_stock_transfer_request(uuid, jsonb, text) from anon;
grant execute on function public.submit_bhw_stock_transfer_request(uuid, jsonb, text) to authenticated;

/*
=====================================================
CHO direct transfer creation
=====================================================
*/

create or replace function public.create_cho_stock_transfer(
  p_source_facility_id uuid,
  p_destination_facility_id uuid,
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
  v_item record;
  v_physical_quantity bigint;
  v_profile_id uuid;
  v_reserved_quantity bigint;
  v_transfer_id uuid;
begin
  select p.id
    into v_profile_id
    from public.profiles p
   where p.id = auth.uid()
     and p.role in ('PHARMA_I', 'PHARMA_II')
     and p.status = 'ACTIVE';

  if v_profile_id is null then
    raise exception 'Only active CHO pharmacy staff can create stock transfers.'
      using errcode = '42501';
  end if;

  if p_source_facility_id is null
     or p_destination_facility_id is null
     or p_source_facility_id = p_destination_facility_id then
    raise exception 'Choose different active source and destination facilities.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.facilities f where f.id = p_source_facility_id and f.status = 'ACTIVE'
  )
  or not exists (
    select 1 from public.facilities f where f.id = p_destination_facility_id and f.status = 'ACTIVE'
  ) then
    raise exception 'Source and destination facilities must both be active.'
      using errcode = 'P0001';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one medicine to the transfer.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
     where item.medicine_id is null or item.quantity is null or item.quantity <= 0
  ) then
    raise exception 'Every transfer item requires a medicine and a positive whole-number quantity.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
     group by item.medicine_id
    having count(*) > 1
  ) then
    raise exception 'Each medicine can appear only once per transfer.'
      using errcode = '23505';
  end if;

  perform i.id
    from public.inventory i
   where i.facility_id = p_source_facility_id
     and i.medicine_id in (
       select item.medicine_id
         from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
     )
   order by i.id
   for update;

  for v_item in
    select item.medicine_id, item.quantity
      from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
  loop
    select coalesce(sum(i.quantity), 0)::bigint
      into v_physical_quantity
      from public.inventory i
     where i.facility_id = p_source_facility_id
       and i.expiration_date > current_date
       and i.medicine_id = v_item.medicine_id;

    select coalesce(sum(sti.quantity), 0)::bigint
      into v_reserved_quantity
      from public.stock_transfer_items sti
      join public.stock_transfers st on st.id = sti.transfer_id
     where sti.medicine_id = v_item.medicine_id
       and st.source_facility_id = p_source_facility_id
       and (
         st.status = 'PENDING'
         or (
           st.status = 'APPROVED'
           and not exists (
             select 1
               from public.stock_transfer_fulfillments sf
              where sf.transfer_item_id = sti.id
           )
         )
       );

    v_available_quantity := greatest(v_physical_quantity - v_reserved_quantity, 0);

    if v_item.quantity > v_available_quantity then
      raise exception 'Requested quantity exceeds the % units currently available from the source facility.',
        v_available_quantity
        using errcode = 'P0001';
    end if;
  end loop;

  insert into public.stock_transfers (
    source_facility_id,
    destination_facility_id,
    requested_by,
    remarks
  )
  values (
    p_source_facility_id,
    p_destination_facility_id,
    v_profile_id,
    nullif(btrim(p_remarks), '')
  )
  returning id into v_transfer_id;

  insert into public.stock_transfer_items (transfer_id, medicine_id, quantity)
  select v_transfer_id, item.medicine_id, item.quantity
    from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer);

  insert into public.activity_logs (user_id, action, module, details)
  values (
    v_profile_id,
    'Stock Transfer Created',
    'Stock Transfer',
    'Created stock transfer ' || v_transfer_id
  );

  return v_transfer_id;
end;
$$;

revoke all on function public.create_cho_stock_transfer(uuid, uuid, jsonb, text) from public;
revoke all on function public.create_cho_stock_transfer(uuid, uuid, jsonb, text) from anon;
grant execute on function public.create_cho_stock_transfer(uuid, uuid, jsonb, text) to authenticated;

/*
=====================================================
Transfer release batch lookup
=====================================================
*/

create or replace function public.get_stock_transfer_release_batches(p_transfer_id uuid)
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
begin
  if not exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.role in ('PHARMA_I', 'PHARMA_II')
       and p.status = 'ACTIVE'
  ) then
    raise exception 'Only active CHO pharmacy staff can view transfer release batches.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.stock_transfers st
     where st.id = p_transfer_id
  ) then
    raise exception 'Stock transfer not found.'
      using errcode = 'P0001';
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

revoke all on function public.get_stock_transfer_release_batches(uuid) from public;
revoke all on function public.get_stock_transfer_release_batches(uuid) from anon;
grant execute on function public.get_stock_transfer_release_batches(uuid) to authenticated;

/*
=====================================================
Approve and release stock transfer from source batches
=====================================================
*/

create or replace function public.approve_and_release_stock_transfer(
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
  v_caller_id uuid;
  v_destination_inventory_id uuid;
  v_destination_threshold integer;
  v_transfer public.stock_transfers%rowtype;
begin
  select p.id
    into v_caller_id
    from public.profiles p
   where p.id = auth.uid()
     and p.role in ('PHARMA_I', 'PHARMA_II')
     and p.status = 'ACTIVE';

  if v_caller_id is null then
    raise exception 'Only active CHO pharmacy staff can approve stock transfers.'
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

  if v_transfer.status <> 'PENDING' then
    raise exception 'Only pending transfers can be approved and released.'
      using errcode = 'P0001';
  end if;

  if p_allocations is null
     or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Choose at least one source batch allocation before approval.'
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
     where i.facility_id = v_transfer.destination_facility_id
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
      v_transfer.destination_facility_id,
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

    insert into public.stock_transfer_fulfillments (
      transfer_id,
      transfer_item_id,
      source_inventory_id,
      destination_inventory_id,
      quantity,
      fulfilled_by
    )
    values (
      p_transfer_id,
      v_allocation.transfer_item_id,
      v_allocation.source_inventory_id,
      v_destination_inventory_id,
      v_allocation.quantity,
      v_caller_id
    );
  end loop;

  update public.stock_transfers
     set status = 'APPROVED',
         approved_by = v_caller_id,
         approved_at = now(),
         transfer_date = now(),
         remarks = coalesce(nullif(btrim(p_remarks), ''), remarks)
   where id = p_transfer_id;

  insert into public.activity_logs (user_id, action, module, details)
  values (
    v_caller_id,
    'Transfer Approved and Released',
    'Stock Transfer',
    'Approved and released stock transfer ' || p_transfer_id
  );

  insert into public.notifications (user_id, title, message)
  values (
    v_transfer.requested_by,
    'Transfer Approved',
    'Your stock transfer ' || upper(substr(p_transfer_id::text, 1, 8))
      || ' has been approved and released.'
  );

  insert into public.notifications (user_id, title, message)
  select
    p.id,
    'Incoming Transfer Released',
    'Stock transfer ' || upper(substr(p_transfer_id::text, 1, 8))
      || ' has been released to your facility.'
    from public.profiles p
   where p.facility_id = v_transfer.destination_facility_id
     and p.status = 'ACTIVE'
     and p.id <> v_transfer.requested_by;

  return p_transfer_id;
end;
$$;

revoke all on function public.approve_and_release_stock_transfer(uuid, jsonb, text) from public;
revoke all on function public.approve_and_release_stock_transfer(uuid, jsonb, text) from anon;
grant execute on function public.approve_and_release_stock_transfer(uuid, jsonb, text) to authenticated;

/*
=====================================================
Reject stock transfer request
=====================================================
*/

create or replace function public.reject_stock_transfer_request(
  p_transfer_id uuid,
  p_remarks text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_transfer public.stock_transfers%rowtype;
begin
  select p.id
    into v_caller_id
    from public.profiles p
   where p.id = auth.uid()
     and p.role in ('PHARMA_I', 'PHARMA_II')
     and p.status = 'ACTIVE';

  if v_caller_id is null then
    raise exception 'Only active CHO pharmacy staff can reject stock transfers.'
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

  if v_transfer.status <> 'PENDING' then
    raise exception 'Only pending transfers can be rejected.'
      using errcode = 'P0001';
  end if;

  update public.stock_transfers
     set status = 'REJECTED',
         approved_by = v_caller_id,
         approved_at = now(),
         remarks = coalesce(nullif(btrim(p_remarks), ''), remarks)
   where id = p_transfer_id;

  insert into public.activity_logs (user_id, action, module, details)
  values (
    v_caller_id,
    'Transfer Rejected',
    'Stock Transfer',
    'Rejected stock transfer ' || p_transfer_id
  );

  insert into public.notifications (user_id, title, message)
  values (
    v_transfer.requested_by,
    'Transfer Rejected',
    'Your stock transfer ' || upper(substr(p_transfer_id::text, 1, 8))
      || ' has been rejected by CHO.'
  );

  return p_transfer_id;
end;
$$;

revoke all on function public.reject_stock_transfer_request(uuid, text) from public;
revoke all on function public.reject_stock_transfer_request(uuid, text) from anon;
grant execute on function public.reject_stock_transfer_request(uuid, text) to authenticated;

/*
=====================================================
Receipt-only transfer confirmation
=====================================================
*/

create or replace function public.confirm_stock_transfer_received(p_transfer_id uuid)
returns table (
  id uuid,
  status public.transfer_status,
  received_by uuid,
  received_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
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

  if v_transfer.destination_facility_id <> v_caller_facility then
    raise exception 'You can only confirm receipt for transfers sent to your facility.'
      using errcode = '42501';
  end if;

  if v_transfer.status <> 'APPROVED' then
    raise exception 'Only approved and released transfers can be marked as received.'
      using errcode = 'P0001';
  end if;

  return query
    update public.stock_transfers
       set status = 'COMPLETED',
           received_by = v_caller_id,
           received_at = now()
     where stock_transfers.id = p_transfer_id
     returning
       stock_transfers.id,
       stock_transfers.status,
       stock_transfers.received_by,
       stock_transfers.received_at;

  insert into public.activity_logs (user_id, action, module, details)
  values (
    v_caller_id,
    'Transfer Received',
    'Stock Transfer',
    'Confirmed receipt of stock transfer ' || p_transfer_id
  );

  insert into public.notifications (user_id, title, message)
  select
    p.id,
    'Transfer Received',
    'Stock transfer ' || upper(substr(p_transfer_id::text, 1, 8))
      || ' has been received.'
    from public.profiles p
   where p.role in ('PHARMA_I', 'PHARMA_II')
     and p.status = 'ACTIVE';
end;
$$;

revoke all on function public.confirm_stock_transfer_received(uuid) from public;
revoke all on function public.confirm_stock_transfer_received(uuid) from anon;
grant execute on function public.confirm_stock_transfer_received(uuid) to authenticated;
