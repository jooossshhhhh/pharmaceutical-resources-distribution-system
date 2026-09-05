/*
=====================================================
Backend Risk Control Role Scope Follow-up - 2026-09-05

Purpose:
- Treat Pharma I as CHO operational staff in backend helpers.
- Require CHO facility scope for transfer admin RPCs.
- Require active profile status for avatar updates.
=====================================================
*/

create or replace function public.is_pharma_i()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles p
        join public.facilities f
          on f.id = p.facility_id
        where p.id = public.get_current_profile_id()
          and p.role = 'PHARMA_I'
          and p.status = 'ACTIVE'
          and f.status = 'ACTIVE'
          and f.facility_type = 'CHO'
    );
$$;

create or replace function public.update_own_profile_avatar(p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if (select auth.uid()) is null then
        raise exception 'Not authenticated';
    end if;

    update public.profiles
    set avatar_url = nullif(trim(coalesce(p_avatar_url, '')), ''),
        updated_at = now()
    where id = (select auth.uid())
      and status = 'ACTIVE';

    if not found then
        raise exception 'Active profile not found';
    end if;

    insert into public.activity_logs (user_id, action, module, details)
    values (
        (select auth.uid()),
        'Profile Photo Updated',
        'User Account',
        'User updated their profile photo.'
    );
end;
$$;

create or replace function public.approve_stock_transfer_request(
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
    join public.facilities f on f.id = p.facility_id
   where p.id = auth.uid()
     and p.role in ('PHARMA_I', 'PHARMA_II')
     and p.status = 'ACTIVE'
     and f.status = 'ACTIVE'
     and f.facility_type = 'CHO';

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
    raise exception 'Only pending transfers can be approved.'
      using errcode = 'P0001';
  end if;

  update public.stock_transfers
     set status = 'APPROVED',
         approved_by = v_caller_id,
         approved_at = now(),
         remarks = coalesce(nullif(btrim(p_remarks), ''), remarks)
   where id = p_transfer_id;

  insert into public.activity_logs (user_id, action, module, details)
  values (
    v_caller_id,
    'Transfer Approved',
    'Stock Transfer',
    'Approved stock transfer ' || p_transfer_id || ' for source-facility allocation.'
  );

  insert into public.notifications (user_id, title, message)
  select
    p.id,
    'Transfer Approved for Allocation',
    'Stock transfer ' || upper(substr(p_transfer_id::text, 1, 8))
      || ' was approved by CHO. Your facility must allocate source batches for pickup.'
    from public.profiles p
   where p.facility_id = v_transfer.source_facility_id
     and p.status = 'ACTIVE';

  insert into public.notifications (user_id, title, message)
  values (
    v_transfer.requested_by,
    'Transfer Approved',
    'Your stock transfer ' || upper(substr(p_transfer_id::text, 1, 8))
      || ' was approved by CHO and is waiting for source-facility allocation.'
  );

  return p_transfer_id;
end;
$$;

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
    join public.facilities f on f.id = p.facility_id
   where p.id = auth.uid()
     and p.role in ('PHARMA_I', 'PHARMA_II')
     and p.status = 'ACTIVE'
     and f.status = 'ACTIVE'
     and f.facility_type = 'CHO';

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
    join public.facilities f on f.id = p.facility_id
   where p.id = auth.uid()
     and p.role in ('PHARMA_I', 'PHARMA_II')
     and p.status = 'ACTIVE'
     and f.status = 'ACTIVE'
     and f.facility_type = 'CHO';

  if v_profile_id is null then
    raise exception 'Only active CHO pharmacy staff can create stock transfers.'
      using errcode = '42501';
  end if;

  if p_source_facility_id is null or p_destination_facility_id is null or p_source_facility_id = p_destination_facility_id then
    raise exception 'Choose different active source and destination facilities.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.facilities f where f.id = p_source_facility_id and f.status = 'ACTIVE')
    or not exists (select 1 from public.facilities f where f.id = p_destination_facility_id and f.status = 'ACTIVE') then
    raise exception 'Source and destination facilities must both be active.'
      using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one medicine to the transfer.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
     where item.medicine_id is null
        or item.quantity is null
        or item.quantity <= 0
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
      raise exception 'Requested quantity exceeds the % units currently available from the source facility.', v_available_quantity
        using errcode = 'P0001';
    end if;
  end loop;

  insert into public.stock_transfers (source_facility_id, destination_facility_id, requested_by, remarks)
  values (p_source_facility_id, p_destination_facility_id, v_profile_id, nullif(btrim(p_remarks), ''))
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
