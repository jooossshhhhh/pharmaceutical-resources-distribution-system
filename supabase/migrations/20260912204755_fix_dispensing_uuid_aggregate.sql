/*
=====================================================
MIGRATION: Fix Dispensing UUID Aggregate

Postgres does not support max(uuid). Cast referral UUIDs
to text for aggregation, then cast the selected value back.
=====================================================
*/

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
     where md.patient_id = p_patient_id
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
               where md.patient_id = p_patient_id
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
                dispensing_transaction_id
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
                v_transaction_id
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

revoke all on function public.dispense_walk_in(uuid, jsonb, text) from public;
revoke all on function public.dispense_walk_in(uuid, jsonb, text) from anon;
grant execute on function public.dispense_walk_in(uuid, jsonb, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
