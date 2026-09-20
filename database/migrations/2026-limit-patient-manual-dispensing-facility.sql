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
    v_caller_facility uuid;
    v_caller_id uuid;
    v_caller_role public.user_role;
    v_dispensing_id uuid;
    v_first_dispensing_id uuid;
    v_patient_facility uuid;
    v_remaining integer;
    v_take integer;
    v_transaction_id uuid := gen_random_uuid();
begin
    select p.id, p.role, p.facility_id
      into v_caller_id, v_caller_role, v_caller_facility
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

    select pt.facility_id
      into v_patient_facility
      from public.patients pt
     where pt.id = p_patient_id;

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

    if v_patient_facility is null then
        raise exception 'Patient not found.'
            using errcode = 'P0001';
    end if;

    if p_dispensing_facility_id not in (v_caller_facility, v_patient_facility) then
        raise exception 'Dispensing facility must be CHO/current facility or the patient registered health center.'
            using errcode = '42501';
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

revoke all on function public.add_patient_manual_dispensing_record(uuid, uuid, integer, integer, uuid, text, text, date, text) from public;
revoke all on function public.add_patient_manual_dispensing_record(uuid, uuid, integer, integer, uuid, text, text, date, text) from anon;
grant execute on function public.add_patient_manual_dispensing_record(uuid, uuid, integer, integer, uuid, text, text, date, text) to authenticated;
