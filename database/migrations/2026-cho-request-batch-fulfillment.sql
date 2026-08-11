/*
=====================================================
CHO Batch-Based Request Fulfillment

Purpose:
Moves BHW request approval from a simple status update
to a transactional CHO batch release.

Workflow:
PENDING
  -> approve_and_release_medicine_request()
  -> APPROVED with CHO inventory deducted and facility
     inventory created/incremented
  -> confirm_request_received()
  -> COMPLETED receipt confirmation only
=====================================================
*/

create table if not exists public.medicine_request_fulfillments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.medicine_requests(id) on delete cascade,
  request_item_id uuid not null references public.medicine_request_items(id) on delete cascade,
  source_inventory_id uuid not null references public.inventory(id) on delete restrict,
  destination_inventory_id uuid not null references public.inventory(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  fulfilled_by uuid not null references public.profiles(id) on delete restrict,
  fulfilled_at timestamptz not null default now(),
  constraint medicine_request_fulfillments_unique_batch
    unique (request_item_id, source_inventory_id)
);

alter table public.medicine_request_fulfillments enable row level security;

drop policy if exists "view_request_fulfillments" on public.medicine_request_fulfillments;

create policy "view_request_fulfillments"
on public.medicine_request_fulfillments
for select
to authenticated
using (
  public.is_pharma_i()
  or public.is_pharma_ii()
  or exists (
    select 1
      from public.medicine_requests r
     where r.id = medicine_request_fulfillments.request_id
       and r.facility_id = public.get_user_facility()
  )
);

grant select on public.medicine_request_fulfillments to authenticated;

create index if not exists idx_request_fulfillments_request
on public.medicine_request_fulfillments(request_id);

create index if not exists idx_request_fulfillments_item
on public.medicine_request_fulfillments(request_item_id);

create index if not exists idx_request_fulfillments_source_inventory
on public.medicine_request_fulfillments(source_inventory_id);

create index if not exists idx_request_fulfillments_destination_inventory
on public.medicine_request_fulfillments(destination_inventory_id);

create index if not exists idx_request_fulfillments_fulfilled_by
on public.medicine_request_fulfillments(fulfilled_by);

/*
=====================================================
CHO availability for BHW request selection

Defined canonically in:
  database/helper-functions/cho_inventory_medicines_function_schema.sql
(get_cho_inventory_medicines() and its grants).

NOT redeclared here to avoid a deployment-order
overwrite of the canonical logic.
=====================================================
*/

/*
=====================================================
CHO release batch lookup
=====================================================
*/

create or replace function public.get_request_release_batches(p_request_id uuid)
returns table (
  request_item_id uuid,
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
    raise exception 'Only active CHO pharmacy staff can view release batches.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.medicine_requests r
     where r.id = p_request_id
  ) then
    raise exception 'Medicine request not found.'
      using errcode = 'P0001';
  end if;

  return query
  with requested_items as (
    select
      ri.id as request_item_id,
      ri.medicine_id,
      ri.quantity as requested_quantity
    from public.medicine_request_items ri
    where ri.request_id = p_request_id
  ),
  cho_batches as (
    select
      rb.request_item_id,
      rb.medicine_id,
      rb.requested_quantity,
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
          partition by rb.request_item_id
          order by i.expiration_date, i.date_received, i.id
          rows between unbounded preceding and 1 preceding
        ),
        0
      ) as prior_quantity
    from requested_items rb
    join public.inventory i on i.medicine_id = rb.medicine_id
    join public.facilities f on f.id = i.facility_id
    join public.suppliers s on s.id = i.supplier_id
    where f.facility_type = 'CHO'
      and f.status = 'ACTIVE'
      and i.quantity > 0
      and i.expiration_date > current_date
  )
  select
    cb.request_item_id,
    cb.medicine_id,
    cb.source_inventory_id,
    cb.supplier_id,
    cb.supplier_name,
    cb.batch_number,
    cb.quantity,
    cb.threshold,
    cb.date_received,
    cb.expiration_date,
    greatest(
      least(cb.quantity, cb.requested_quantity - cb.prior_quantity),
      0
    )::integer as recommended_quantity
  from cho_batches cb
  order by cb.request_item_id, cb.expiration_date, cb.date_received, cb.source_inventory_id;
end;
$$;

revoke all on function public.get_request_release_batches(uuid) from public;
revoke all on function public.get_request_release_batches(uuid) from anon;
grant execute on function public.get_request_release_batches(uuid) to authenticated;

/*
=====================================================
Approve and release BHW request from CHO batches
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
    raise exception 'Only active CHO pharmacy staff can approve medicine requests.'
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
    raise exception 'Only pending requests can be approved and released.'
      using errcode = 'P0001';
  end if;

  if p_allocations is null
     or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Choose at least one CHO batch allocation before approval.'
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
    raise exception 'Every batch allocation requires a request item, CHO batch, and positive quantity.'
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
    raise exception 'One or more selected batches cannot fulfill this request item.'
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
      from public.medicine_request_items ri
      left join allocation_totals at on at.request_item_id = ri.id
     where ri.request_id = p_request_id
       and coalesce(at.quantity, 0) <> ri.quantity
  ) then
    raise exception 'Batch allocations must exactly match every requested quantity.'
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
    raise exception 'Batch allocation exceeds current CHO stock. Refresh and try again.'
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
     set status = 'APPROVED',
         approved_by = v_caller_id,
         approved_at = now(),
         remarks = nullif(btrim(p_remarks), '')
   where id = p_request_id;

  insert into public.activity_logs (user_id, action, module, details)
  values (
    v_caller_id,
    'Request Approved and Released',
    'Medicine Request',
    'Approved and released medicine request ' || p_request_id
  );

  insert into public.notifications (user_id, title, message)
  values (
    v_request.requested_by,
    'Request Approved',
    'Your medicine request ' || upper(substr(p_request_id::text, 1, 8))
      || ' has been approved and released by CHO.'
  );

  return p_request_id;
end;
$$;

revoke all on function public.approve_and_release_medicine_request(uuid, jsonb, text) from public;
revoke all on function public.approve_and_release_medicine_request(uuid, jsonb, text) from anon;
grant execute on function public.approve_and_release_medicine_request(uuid, jsonb, text) to authenticated;

/*
=====================================================
Inventory batch update RPC
=====================================================
*/

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
  v_caller_facility uuid;
  v_existing public.inventory%rowtype;
begin
  select p.id, f.id
    into v_caller_id, v_caller_facility
    from public.profiles p
    join public.facilities f on f.id = p.facility_id
   where p.id = auth.uid()
     and p.role in ('PHARMA_I', 'PHARMA_II')
     and p.status = 'ACTIVE'
     and f.facility_type = 'CHO'
     and f.status = 'ACTIVE';

  if v_caller_id is null then
    raise exception 'Only active CHO pharmacy staff can update inventory batches.'
      using errcode = '42501';
  end if;

  if v_caller_facility is null then
    raise exception 'An active CHO facility assignment is required to update inventory batches.'
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

  if p_supplier_id is null then
    raise exception 'Supplier is required.'
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

  if v_existing.facility_id <> v_caller_facility then
    raise exception 'You can only update inventory batches at your own CHO facility.'
      using errcode = '42501';
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

revoke all on function public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date) from public;
revoke all on function public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date) from anon;
grant execute on function public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date) to authenticated;
