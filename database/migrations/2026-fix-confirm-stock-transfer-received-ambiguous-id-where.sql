/*
=====================================================
2026 Fix: confirm_stock_transfer_received ambiguous id (where)

Purpose:
Qualifies the `where id = v_fulfillment.fulfillment_id`
reference in the READY_FOR_PICKUP branch of
confirm_stock_transfer_received. Because the function is
declared RETURNS TABLE(id uuid, ...), `id` is a PL/pgSQL
output-parameter variable and the unqualified `id` in the
fulfillment UPDATE was ambiguous (variable vs
stock_transfer_fulfillments.id column), raising ERROR 42702
and surfacing as HTTP 400.

This completes the fix started by
2026-fix-confirm-stock-transfer-received-ambiguous-returning.sql
and leaves the function in its final, working state.

See: documentation/IssuesLog/Issue-001-confirm-stock-transfer-received-400-bad-request.md
=====================================================
*/

create or replace function public.confirm_stock_transfer_received(p_transfer_id uuid)
 returns table(id uuid, status transfer_status, received_by uuid, received_at timestamptz)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_caller_facility uuid;
  v_caller_id uuid;
  v_destination_inventory_id uuid;
  v_destination_threshold integer;
  v_fulfillment record;
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

  if v_transfer.status = 'APPROVED'
     and exists (
       select 1
         from public.stock_transfer_fulfillments sf
        where sf.transfer_id = p_transfer_id
          and sf.destination_inventory_id is not null
     ) then
    update public.stock_transfers
       set status = 'COMPLETED',
           received_by = v_caller_id,
           received_at = now()
     where stock_transfers.id = p_transfer_id;
  elsif v_transfer.status = 'READY_FOR_PICKUP' then
    if not exists (
      select 1
        from public.stock_transfer_fulfillments sf
       where sf.transfer_id = p_transfer_id
    ) then
      raise exception 'This transfer has no source batch allocations.'
        using errcode = 'P0001';
    end if;

    for v_fulfillment in
      select
        sf.id as fulfillment_id,
        sf.quantity,
        i.medicine_id,
        i.supplier_id,
        i.batch_number,
        i.expiration_date
      from public.stock_transfer_fulfillments sf
      join public.inventory i on i.id = sf.source_inventory_id
      where sf.transfer_id = p_transfer_id
        and sf.destination_inventory_id is null
      order by i.expiration_date, i.date_received, i.id
    loop
      select coalesce(max(i.threshold), 0)
        into v_destination_threshold
        from public.inventory i
       where i.facility_id = v_transfer.destination_facility_id
         and i.medicine_id = v_fulfillment.medicine_id;

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
        v_fulfillment.medicine_id,
        v_fulfillment.supplier_id,
        v_fulfillment.quantity,
        v_destination_threshold,
        v_fulfillment.batch_number,
        current_date,
        v_fulfillment.expiration_date,
        now()
      )
      on conflict on constraint inventory_unique_batch
      do update set
        quantity = public.inventory.quantity + excluded.quantity,
        updated_at = now()
      returning public.inventory.id into v_destination_inventory_id;

      update public.stock_transfer_fulfillments
         set destination_inventory_id = v_destination_inventory_id,
             received_by = v_caller_id,
             received_at = now()
       where public.stock_transfer_fulfillments.id = v_fulfillment.fulfillment_id;
    end loop;

    update public.stock_transfers
       set status = 'COMPLETED',
           received_by = v_caller_id,
           received_at = now()
     where stock_transfers.id = p_transfer_id;
  else
    raise exception 'Only transfers ready for pickup can be marked as received.'
      using errcode = 'P0001';
  end if;

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
      || ' has been received by the destination facility.'
    from public.profiles p
   where (
       p.role in ('PHARMA_I', 'PHARMA_II')
       or p.facility_id = v_transfer.source_facility_id
     )
     and p.status = 'ACTIVE';

  return query
    select
      st.id,
      st.status,
      st.received_by,
      st.received_at
    from public.stock_transfers st
   where st.id = p_transfer_id;
end;
$function$;

revoke all on function public.confirm_stock_transfer_received(uuid) from public;
revoke all on function public.confirm_stock_transfer_received(uuid) from anon;
grant execute on function public.confirm_stock_transfer_received(uuid) to authenticated;
