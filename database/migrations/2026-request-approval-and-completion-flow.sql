-- ==============================================================================
-- Migration: 2026-request-approval-and-completion-flow.sql
-- Description:
--   1. Fixes approve_and_release_medicine_request to update status to 'APPROVED'
--      (instead of prematurely setting 'COMPLETED'), keeping it in the Approved
--      category and notifying BHW that supplies are ready for pickup.
--   2. Updates confirm_request_received to allow active CHO pharmacy staff as well
--      as facility BHWs to mark an approved request as 'COMPLETED'.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.approve_and_release_medicine_request(
  p_request_id uuid,
  p_allocations jsonb,
  p_remarks text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
     set status = 'APPROVED',
         approved_by = v_caller_id,
         approved_at = now(),
         remarks = nullif(btrim(p_remarks), '')
   where id = p_request_id;

  insert into public.activity_logs (user_id, action, module, details)
  values (
    v_caller_id,
    'Request Approved',
    'Medicine Request',
    'Approved and released medicine request ' || p_request_id
  );

  insert into public.notifications (user_id, title, message)
  select
    v_request.requested_by,
    'Request Ready for Pickup',
    'Your medicine request ' || upper(substr(p_request_id::text, 1, 8))
      || ' has been approved and is ready for pickup at CHO.'
  where coalesce(v_request.request_source, 'SYSTEM') = 'SYSTEM'
    and v_request.requested_by is not null;

  return p_request_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_request_received(request_id uuid)
RETURNS TABLE(id uuid, status request_status, received_by uuid, received_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
    caller_profile public.profiles%rowtype;
    request_record public.medicine_requests%rowtype;
    target_request_id alias for $1;
begin
    select *
      into caller_profile
      from public.profiles p
     where p.id = auth.uid()
       and p.status = 'ACTIVE';

    if caller_profile.id is null then
        raise exception 'An active user profile is required.'
          using errcode = '42501';
    end if;

    if caller_profile.role not in ('BHW', 'PHARMA_I', 'PHARMA_II') then
        raise exception 'Only BHW or CHO pharmacy staff can complete requests.'
          using errcode = '42501';
    end if;

    select *
      into request_record
      from public.medicine_requests r
     where r.id = target_request_id
     for update;

    if request_record.id is null then
        raise exception 'Medicine request not found.'
          using errcode = 'P0001';
    end if;

    if caller_profile.role = 'BHW' and request_record.facility_id <> caller_profile.facility_id then
        raise exception 'You can only confirm receipt for requests from your own facility.'
          using errcode = '42501';
    end if;

    if request_record.status <> 'APPROVED' then
        raise exception 'Only approved requests can be marked as completed.'
          using errcode = 'P0001';
    end if;

    return query
        update public.medicine_requests
           set status = 'COMPLETED',
               received_by = auth.uid(),
               received_at = now()
         where medicine_requests.id = target_request_id
           and medicine_requests.status = 'APPROVED'
         returning
               medicine_requests.id,
               medicine_requests.status,
               medicine_requests.received_by,
               medicine_requests.received_at;

    insert into public.activity_logs (user_id, action, module, details)
    values (
        auth.uid(),
        'Request Completed',
        'Medicine Request',
        'Completed medicine request ' || target_request_id || ' by ' || caller_profile.role
    );

    if caller_profile.role = 'BHW' then
        insert into public.notifications (user_id, title, message)
        select
            p.id,
            'Request Received',
            'The medicine request ' || upper(substr(target_request_id::text, 1, 8))
                || ' has been received by ' || (
                    select f.facility_name
                      from public.facilities f
                     where f.id = caller_profile.facility_id
                ) || '.'
          from public.profiles p
         where p.role in ('PHARMA_I', 'PHARMA_II');
    else
        insert into public.notifications (user_id, title, message)
        select
            request_record.requested_by,
            'Request Completed',
            'Your medicine request ' || upper(substr(target_request_id::text, 1, 8))
                || ' has been marked as Completed.'
          where coalesce(request_record.request_source, 'SYSTEM') = 'SYSTEM'
            and request_record.requested_by is not null;
    end if;
end;
$function$;

revoke all on function public.confirm_request_received(uuid) from public;
revoke all on function public.confirm_request_received(uuid) from anon;
grant execute on function public.confirm_request_received(uuid) to authenticated;
