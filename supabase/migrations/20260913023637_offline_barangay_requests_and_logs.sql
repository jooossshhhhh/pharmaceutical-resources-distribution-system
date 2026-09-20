/*
=====================================================
MIGRATION: Offline Barangay Requests and Logs

Supports CHO encoding of paper barangay requests and
barangay dispensing logs without adding new tables.
=====================================================
*/

alter table public.medicine_requests
    add column if not exists request_source text not null default 'SYSTEM',
    add column if not exists manual_requested_by text,
    add column if not exists encoded_by uuid references public.profiles(id);

do $$
begin
    alter table public.medicine_requests
      add constraint medicine_requests_source_check
      check (request_source in ('SYSTEM', 'MANUAL_PAPER'));
exception
    when duplicate_object then null;
end $$;

update public.medicine_requests
   set encoded_by = requested_by
 where encoded_by is null;

alter table public.medicine_dispensing
    add column if not exists record_type text not null default 'LIVE_DISPENSING';

do $$
begin
    alter table public.medicine_dispensing
      add constraint medicine_dispensing_record_type_check
      check (record_type in ('LIVE_DISPENSING', 'HISTORY_ONLY', 'BARANGAY_DISPENSING_LOG'));
exception
    when duplicate_object then null;
end $$;

update public.medicine_dispensing
   set record_type = 'HISTORY_ONLY'
 where coalesce(is_manual_record, false) = true
   and record_type = 'LIVE_DISPENSING';

create index if not exists idx_medicine_dispensing_record_type_patient_date
    on public.medicine_dispensing(record_type, patient_id, dispense_date desc);

create or replace view public.monthly_dispensing_summary as
select
    facility_id,
    medicine_id,
    date_trunc('month', dispense_date)::date as month,
    sum(quantity) as total_dispensed
from public.medicine_dispensing
where coalesce(record_type, 'LIVE_DISPENSING') <> 'HISTORY_ONLY'
group by facility_id, medicine_id, date_trunc('month', dispense_date)::date;

grant select on public.monthly_dispensing_summary to authenticated;

create or replace function public.get_patient_monthly_claim_status(
    p_patient_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_caller_id uuid;
    v_caller_facility uuid;
    v_caller_role public.user_role;
    v_patient_facility uuid;
    v_claimed boolean;
begin
    select p.id, p.facility_id, p.role
      into v_caller_id, v_caller_facility, v_caller_role
      from public.profiles p
     where p.id = auth.uid()
       and p.status = 'ACTIVE';

    if v_caller_id is null then
        raise exception 'An active account is required to view patient dispensing status.'
            using errcode = '42501';
    end if;

    if v_caller_role not in ('BHW', 'PHARMA_I', 'PHARMA_II') then
        raise exception 'Your role cannot view patient dispensing status.'
            using errcode = '42501';
    end if;

    select pt.facility_id
      into v_patient_facility
      from public.patients pt
     where pt.id = p_patient_id;

    if v_patient_facility is null then
        raise exception 'Patient not found.'
            using errcode = 'P0001';
    end if;

    if v_caller_role = 'BHW' and v_patient_facility is distinct from v_caller_facility then
        raise exception 'Barangay health workers can only view dispensing status for patients of their own facility.'
            using errcode = '42501';
    end if;

    with claim_groups as (
        select
            md.medicine_id,
            max(coalesce(md.needed_quantity, md.quantity))::integer as needed_quantity,
            sum(md.quantity)::integer as released_quantity
          from public.medicine_dispensing md
         where coalesce(md.record_type, 'LIVE_DISPENSING') <> 'HISTORY_ONLY'
           and md.patient_id = p_patient_id
           and md.voided_at is null
           and date_trunc('month', md.dispense_date) = date_trunc('month', now())
         group by md.medicine_id
    )
    select exists (select 1 from claim_groups)
       and not exists (
           select 1
             from claim_groups cg
            where cg.released_quantity < cg.needed_quantity
       )
      into v_claimed;

    return jsonb_build_object('claimed_this_month', coalesce(v_claimed, false));
end;
$$;

create or replace function public.dispense_walk_in(
    p_patient_id uuid,
    p_items jsonb,
    p_prescribed_by text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id uuid;
    v_caller_facility uuid;
    v_caller_role public.user_role;
    v_patient public.patients%rowtype;
    v_transaction_id uuid;
    v_item record;
    v_batch record;
    v_take integer;
    v_remaining integer;
    v_dispensing_id uuid;
    v_claim_count integer;
begin
    select p.id, p.facility_id, p.role
      into v_caller_id, v_caller_facility, v_caller_role
      from public.profiles p
     where p.id = auth.uid()
       and p.status = 'ACTIVE';

    if v_caller_id is null then
        raise exception 'An active account is required to dispense medicine.'
            using errcode = '42501';
    end if;

    if v_caller_role not in ('BHW', 'PHARMA_I', 'PHARMA_II') then
        raise exception 'Your role cannot perform walk-in dispensing.'
            using errcode = '42501';
    end if;

    if v_caller_facility is null then
        raise exception 'Your account is not assigned to a facility.'
            using errcode = '42501';
    end if;

    if nullif(btrim(coalesce(p_prescribed_by, '')), '') is null then
        raise exception 'Prescribed by is required.'
            using errcode = '22023';
    end if;

    if p_items is null
       or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) = 0 then
        raise exception 'Add at least one medicine before completing the dispensing.'
            using errcode = '22023';
    end if;

    if exists (
        select 1
          from jsonb_to_recordset(p_items) as x(
              medicine_id uuid,
              needed_quantity integer,
              quantity integer,
              follow_up_action text,
              follow_up_date date,
              referred_facility_id uuid
          )
         where x.medicine_id is null
            or x.quantity is null
            or x.needed_quantity is null
            or x.quantity <= 0
            or x.needed_quantity <= 0
            or x.needed_quantity < x.quantity
            or (
                x.follow_up_action is not null
                and (
                    x.follow_up_action not in ('SCHEDULE_NEXT_WEEK', 'REFER_TO_BARANGAY')
                    or (x.follow_up_action = 'SCHEDULE_NEXT_WEEK' and x.follow_up_date is null)
                    or (x.follow_up_action = 'REFER_TO_BARANGAY' and x.referred_facility_id is null)
                )
            )
    ) then
        raise exception 'Every cart line requires valid needed, released, and follow-up details.'
            using errcode = '22023';
    end if;

    if exists (
        select 1
          from (
              select x.medicine_id
                from jsonb_to_recordset(p_items) as x(medicine_id uuid)
               group by x.medicine_id
              having count(*) > 1
          ) duplicated
    ) then
        raise exception 'Each medicine may only appear once in the cart.'
            using errcode = '22023';
    end if;

    select *
      into v_patient
      from public.patients pt
     where pt.id = p_patient_id
       and pt.archived_at is null
     for update;

    if v_patient.id is null then
        raise exception 'Active patient not found.'
            using errcode = 'P0001';
    end if;

    if v_caller_role = 'BHW' and v_patient.facility_id <> v_caller_facility then
        raise exception 'Barangay health workers can only dispense to patients of their own facility.'
            using errcode = '42501';
    end if;

    select count(*)
      into v_claim_count
      from public.medicine_dispensing md
     where coalesce(md.record_type, 'LIVE_DISPENSING') <> 'HISTORY_ONLY'
       and md.patient_id = p_patient_id
       and md.voided_at is null
       and date_trunc('month', md.dispense_date) = date_trunc('month', now());

    if v_claim_count > 0 and exists (
        select 1
          from jsonb_to_recordset(p_items) as x(medicine_id uuid, quantity integer)
          left join lateral (
              select
                  max(coalesce(md.needed_quantity, md.quantity))::integer as needed_quantity,
                  coalesce(sum(md.quantity), 0)::integer as released_quantity
                from public.medicine_dispensing md
               where coalesce(md.record_type, 'LIVE_DISPENSING') <> 'HISTORY_ONLY'
                 and md.patient_id = p_patient_id
                 and md.medicine_id = x.medicine_id
                 and md.voided_at is null
                 and date_trunc('month', md.dispense_date) = date_trunc('month', now())
          ) prior on true
         where prior.needed_quantity is null
            or prior.released_quantity >= prior.needed_quantity
            or prior.released_quantity + x.quantity > prior.needed_quantity
    ) then
        raise exception 'This patient already claimed free medicine this month.'
            using errcode = 'P0001';
    end if;

    perform i.id
      from public.inventory i
     where i.facility_id = v_caller_facility
       and i.medicine_id in (
           select x.medicine_id
             from jsonb_to_recordset(p_items) as x(medicine_id uuid)
       )
     order by i.expiration_date, i.date_received, i.id
     for update;

    v_transaction_id := gen_random_uuid();

    for v_item in
        select
            x.medicine_id,
            max(x.needed_quantity)::integer as needed_quantity,
            sum(x.quantity)::integer as quantity,
            max(x.follow_up_action) filter (where x.needed_quantity > x.quantity) as follow_up_action,
            max(x.follow_up_date) filter (where x.needed_quantity > x.quantity) as follow_up_date,
            (max(x.referred_facility_id::text) filter (where x.needed_quantity > x.quantity))::uuid as referred_facility_id
          from jsonb_to_recordset(p_items) as x(
              medicine_id uuid,
              needed_quantity integer,
              quantity integer,
              follow_up_action text,
              follow_up_date date,
              referred_facility_id uuid
          )
         group by x.medicine_id
    loop
        select coalesce(sum(i.quantity), 0)
          into v_remaining
          from public.inventory i
         where i.facility_id = v_caller_facility
           and i.medicine_id = v_item.medicine_id
           and i.quantity > 0
           and i.expiration_date > current_date;

        if v_remaining < v_item.quantity then
            raise exception 'Not enough available stock for one of the medicines. Available quantity: %.', v_remaining
                using errcode = 'P0001';
        end if;

        v_remaining := v_item.quantity;

        for v_batch in
            select i.id, i.quantity
              from public.inventory i
             where i.facility_id = v_caller_facility
               and i.medicine_id = v_item.medicine_id
               and i.quantity > 0
               and i.expiration_date > current_date
             order by i.expiration_date, i.date_received, i.id
        loop
            exit when v_remaining <= 0;

            v_take := least(v_batch.quantity, v_remaining);

            update public.inventory
               set quantity = quantity - v_take,
                   updated_at = now()
             where public.inventory.id = v_batch.id;

            insert into public.medicine_dispensing (
                facility_id,
                medicine_id,
                inventory_id,
                quantity,
                needed_quantity,
                prescribed_by,
                follow_up_action,
                follow_up_date,
                referred_facility_id,
                dispensing_type,
                dispensed_by,
                patient_id,
                dispense_date,
                dispensing_transaction_id,
                record_type
            )
            values (
                v_caller_facility,
                v_item.medicine_id,
                v_batch.id,
                v_take,
                v_item.needed_quantity,
                btrim(p_prescribed_by),
                v_item.follow_up_action,
                v_item.follow_up_date,
                v_item.referred_facility_id,
                'WALK_IN',
                v_caller_id,
                p_patient_id,
                now(),
                v_transaction_id,
                'LIVE_DISPENSING'
            )
            returning public.medicine_dispensing.id into v_dispensing_id;

            insert into public.patient_medicine_records (
                patient_id,
                medicine_dispensing_id,
                medicine_id,
                medicine_quantity,
                dispensed_by,
                date_stamp
            )
            values (
                p_patient_id,
                v_dispensing_id,
                v_item.medicine_id,
                v_take,
                v_caller_id,
                now()
            );

            v_remaining := v_remaining - v_take;
        end loop;
    end loop;

    insert into public.activity_logs (user_id, action, module, details)
    values (
        v_caller_id,
        'Medicine Released',
        'Dispensing',
        'Released walk-in dispensing transaction '
            || upper(substr(v_transaction_id::text, 1, 8))
            || ' for patient ' || p_patient_id || '.'
    );

    return jsonb_build_object(
        'transaction_id', v_transaction_id,
        'facility_id', v_caller_facility,
        'patient_id', p_patient_id,
        'dispensed_at', now()
    );
end;
$$;

drop function if exists public.add_patient_manual_dispensing_record(uuid, uuid, integer, integer, uuid, text, text, date);

create or replace function public.add_patient_manual_dispensing_record(
    p_patient_id uuid,
    p_medicine_id uuid,
    p_needed_quantity integer,
    p_quantity integer,
    p_dispensing_facility_id uuid,
    p_prescribed_by text,
    p_manual_dispensed_by text,
    p_dispense_date date,
    p_record_type text default 'HISTORY_ONLY'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_available_quantity integer;
    v_batch record;
    v_caller_id uuid;
    v_caller_role public.user_role;
    v_dispensing_id uuid;
    v_first_dispensing_id uuid;
    v_remaining integer;
    v_take integer;
    v_transaction_id uuid := gen_random_uuid();
begin
    select p.id, p.role
      into v_caller_id, v_caller_role
      from public.profiles p
     where p.id = auth.uid()
       and p.status = 'ACTIVE';

    if v_caller_id is null then
        raise exception 'An active account is required to add manual patient records.'
            using errcode = '42501';
    end if;

    if v_caller_role not in ('PHARMA_I', 'PHARMA_II') then
        raise exception 'Only CHO staff can add manual patient records.'
            using errcode = '42501';
    end if;

    p_record_type := coalesce(p_record_type, 'HISTORY_ONLY');

    if p_record_type not in ('HISTORY_ONLY', 'BARANGAY_DISPENSING_LOG') then
        raise exception 'Choose a valid record type.'
            using errcode = '22023';
    end if;

    if p_patient_id is null
       or p_medicine_id is null
       or p_dispensing_facility_id is null
       or p_needed_quantity is null
       or p_quantity is null
       or p_needed_quantity <= 0
       or p_quantity <= 0
       or p_needed_quantity < p_quantity
       or nullif(btrim(coalesce(p_prescribed_by, '')), '') is null
       or nullif(btrim(coalesce(p_manual_dispensed_by, '')), '') is null
       or p_dispense_date is null
       or p_dispense_date > current_date then
        raise exception 'Complete all manual record fields with valid values.'
            using errcode = '22023';
    end if;

    if not exists (select 1 from public.patients pt where pt.id = p_patient_id) then
        raise exception 'Patient not found.'
            using errcode = 'P0001';
    end if;

    if not exists (select 1 from public.medicines m where m.id = p_medicine_id) then
        raise exception 'Medicine not found.'
            using errcode = 'P0001';
    end if;

    if not exists (
        select 1
          from public.facilities f
         where f.id = p_dispensing_facility_id
           and f.status = 'ACTIVE'
    ) then
        raise exception 'Active dispensing facility not found.'
            using errcode = 'P0001';
    end if;

    if p_record_type = 'HISTORY_ONLY' then
        insert into public.medicine_dispensing (
            facility_id,
            medicine_id,
            inventory_id,
            quantity,
            needed_quantity,
            prescribed_by,
            dispensing_type,
            dispensed_by,
            patient_id,
            dispense_date,
            dispensing_transaction_id,
            is_manual_record,
            manual_dispensed_by,
            record_type
        )
        values (
            p_dispensing_facility_id,
            p_medicine_id,
            null,
            p_quantity,
            p_needed_quantity,
            btrim(p_prescribed_by),
            'WALK_IN',
            v_caller_id,
            p_patient_id,
            p_dispense_date::timestamptz,
            v_transaction_id,
            true,
            btrim(p_manual_dispensed_by),
            'HISTORY_ONLY'
        )
        returning id into v_first_dispensing_id;
    else
        perform i.id
          from public.inventory i
         where i.facility_id = p_dispensing_facility_id
           and i.medicine_id = p_medicine_id
           and i.quantity > 0
           and i.expiration_date > current_date
         order by i.expiration_date, i.date_received, i.id
         for update;

        select coalesce(sum(i.quantity), 0)::integer
          into v_available_quantity
          from public.inventory i
         where i.facility_id = p_dispensing_facility_id
           and i.medicine_id = p_medicine_id
           and i.quantity > 0
           and i.expiration_date > current_date;

        if v_available_quantity < p_quantity then
            raise exception 'Not enough available stock at the selected dispensing facility. Available quantity: %.', v_available_quantity
                using errcode = 'P0001';
        end if;

        v_remaining := p_quantity;

        for v_batch in
            select i.id, i.quantity
              from public.inventory i
             where i.facility_id = p_dispensing_facility_id
               and i.medicine_id = p_medicine_id
               and i.quantity > 0
               and i.expiration_date > current_date
             order by i.expiration_date, i.date_received, i.id
        loop
            exit when v_remaining <= 0;
            v_take := least(v_batch.quantity, v_remaining);

            update public.inventory
               set quantity = quantity - v_take,
                   updated_at = now()
             where public.inventory.id = v_batch.id;

            insert into public.medicine_dispensing (
                facility_id,
                medicine_id,
                inventory_id,
                quantity,
                needed_quantity,
                prescribed_by,
                dispensing_type,
                dispensed_by,
                patient_id,
                dispense_date,
                dispensing_transaction_id,
                is_manual_record,
                manual_dispensed_by,
                record_type
            )
            values (
                p_dispensing_facility_id,
                p_medicine_id,
                v_batch.id,
                v_take,
                p_needed_quantity,
                btrim(p_prescribed_by),
                'WALK_IN',
                v_caller_id,
                p_patient_id,
                p_dispense_date::timestamptz,
                v_transaction_id,
                true,
                btrim(p_manual_dispensed_by),
                'BARANGAY_DISPENSING_LOG'
            )
            returning id into v_dispensing_id;

            if v_first_dispensing_id is null then
                v_first_dispensing_id := v_dispensing_id;
            end if;

            insert into public.patient_medicine_records (
                patient_id,
                medicine_dispensing_id,
                medicine_id,
                medicine_quantity,
                dispensed_by,
                date_stamp
            )
            values (
                p_patient_id,
                v_dispensing_id,
                p_medicine_id,
                v_take,
                v_caller_id,
                p_dispense_date::timestamptz
            );

            v_remaining := v_remaining - v_take;
        end loop;
    end if;

    insert into public.activity_logs (user_id, action, module, details)
    values (
        v_caller_id,
        case when p_record_type = 'BARANGAY_DISPENSING_LOG'
            then 'Barangay Dispensing Log Added'
            else 'Manual Patient Record Added'
        end,
        'Patients',
        'Added '
            || lower(replace(p_record_type, '_', ' '))
            || ' transaction '
            || upper(substr(v_transaction_id::text, 1, 8))
            || ' for patient ' || p_patient_id || '.'
    );

    return jsonb_build_object(
        'id', v_first_dispensing_id,
        'transaction_id', v_transaction_id,
        'record_type', p_record_type
    );
end;
$$;

create or replace function public.create_manual_medicine_request(
    p_facility_id uuid,
    p_items jsonb,
    p_manual_requested_by text default null,
    p_remarks text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id uuid;
    v_request_id uuid;
begin
    select p.id
      into v_caller_id
      from public.profiles p
     where p.id = auth.uid()
       and p.role in ('PHARMA_I', 'PHARMA_II')
       and p.status = 'ACTIVE';

    if v_caller_id is null then
        raise exception 'Only active CHO staff can encode paper requests.'
            using errcode = '42501';
    end if;

    if p_items is null
       or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) = 0 then
        raise exception 'Add at least one medicine to the paper request.'
            using errcode = '22023';
    end if;

    if not exists (
        select 1
          from public.facilities f
         where f.id = p_facility_id
           and f.status = 'ACTIVE'
           and f.facility_type = 'HEALTH_CENTER'
    ) then
        raise exception 'Choose an active barangay health center.'
            using errcode = 'P0001';
    end if;

    if exists (
        select 1
          from jsonb_to_recordset(p_items) as x(medicine_id uuid, quantity integer)
         where x.medicine_id is null
            or x.quantity is null
            or x.quantity <= 0
            or not exists (select 1 from public.medicines m where m.id = x.medicine_id)
    ) then
        raise exception 'Every paper request line requires a valid medicine and quantity.'
            using errcode = '22023';
    end if;

    if exists (
        select 1
          from (
              select x.medicine_id
                from jsonb_to_recordset(p_items) as x(medicine_id uuid)
               group by x.medicine_id
              having count(*) > 1
          ) duplicated
    ) then
        raise exception 'Each medicine can appear only once per paper request.'
            using errcode = '22023';
    end if;

    insert into public.medicine_requests (
        requested_by,
        facility_id,
        status,
        remarks,
        request_source,
        manual_requested_by,
        encoded_by
    )
    values (
        v_caller_id,
        p_facility_id,
        'PENDING',
        nullif(btrim(coalesce(p_remarks, '')), ''),
        'MANUAL_PAPER',
        nullif(btrim(coalesce(p_manual_requested_by, '')), ''),
        v_caller_id
    )
    returning id into v_request_id;

    insert into public.medicine_request_items (request_id, medicine_id, quantity)
    select v_request_id, x.medicine_id, x.quantity
      from jsonb_to_recordset(p_items) as x(medicine_id uuid, quantity integer);

    insert into public.activity_logs (user_id, action, module, details)
    values (
        v_caller_id,
        'Paper Request Encoded',
        'Medicine Request',
        'Encoded paper medicine request ' || v_request_id || '.'
    );

    return v_request_id;
end;
$$;

revoke all on function public.get_patient_monthly_claim_status(uuid) from public;
revoke all on function public.get_patient_monthly_claim_status(uuid) from anon;
grant execute on function public.get_patient_monthly_claim_status(uuid) to authenticated;

revoke all on function public.dispense_walk_in(uuid, jsonb, text) from public;
revoke all on function public.dispense_walk_in(uuid, jsonb, text) from anon;
grant execute on function public.dispense_walk_in(uuid, jsonb, text) to authenticated;

revoke all on function public.add_patient_manual_dispensing_record(uuid, uuid, integer, integer, uuid, text, text, date, text) from public;
revoke all on function public.add_patient_manual_dispensing_record(uuid, uuid, integer, integer, uuid, text, text, date, text) from anon;
grant execute on function public.add_patient_manual_dispensing_record(uuid, uuid, integer, integer, uuid, text, text, date, text) to authenticated;

revoke all on function public.create_manual_medicine_request(uuid, jsonb, text, text) from public;
revoke all on function public.create_manual_medicine_request(uuid, jsonb, text, text) from anon;
grant execute on function public.create_manual_medicine_request(uuid, jsonb, text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
