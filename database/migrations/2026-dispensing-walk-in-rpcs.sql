/*
=====================================================
MIGRATION: Walk-In Dispensing RPCs

Purpose:
Atomic server-side walk-in dispensing and voiding.

dispense_walk_in(p_patient_id, p_items):
1. Caller must be an active BHW, PHARMA_I, or PHARMA_II.
2. Stock is ALWAYS deducted from the caller's own
   facility inventory (BHW -> barangay stock,
   CHO staff -> CHO main stock).
3. BHW can only dispense to patients of their own
   facility; pharmacy staff can dispense to any
   patient.
4. Enforces the once-per-calendar-month rule per
   patient globally (any facility), excluding voided
   transactions. The patient row is locked so two
   simultaneous clerks cannot double-claim.
5. Allocates stock FEFO (expiration_date, then
   date_received) across non-expired batches,
   inserting one medicine_dispensing row per batch
   used, all sharing one dispensing_transaction_id,
   plus matching patient_medicine_records rows.

void_dispensing_transaction(p_transaction_id, p_reason):
1. PHARMA_II only (matches delete-level rights).
2. Restores every deducted quantity back to its
   source batch and stamps voided_by/voided_at/
   void_reason. Records stay visible for audit.
=====================================================
*/

create or replace function public.dispense_walk_in(
    p_patient_id uuid,
    p_items jsonb
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

    if p_items is null
       or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) = 0 then
        raise exception 'Add at least one medicine before completing the dispensing.'
            using errcode = '22023';
    end if;

    if exists (
        select 1
          from jsonb_to_recordset(p_items) as x(medicine_id uuid, quantity integer)
         where x.medicine_id is null
            or x.quantity is null
            or x.quantity <= 0
    ) then
        raise exception 'Every cart line requires a medicine and a positive quantity.'
            using errcode = '22023';
    end if;

    if exists (
        select 1
          from (
              select x.medicine_id
                from jsonb_to_recordset(p_items) as x(medicine_id uuid, quantity integer)
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
     for update;

    if v_patient.id is null then
        raise exception 'Patient not found.'
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

    if v_claim_count > 0 then
        raise exception 'This patient already claimed free medicine this month.'
            using errcode = 'P0001';
    end if;

    perform i.id
      from public.inventory i
     where i.facility_id = v_caller_facility
       and i.medicine_id in (
           select x.medicine_id
             from jsonb_to_recordset(p_items) as x(medicine_id uuid, quantity integer)
       )
     order by i.expiration_date, i.date_received, i.id
     for update;

    v_transaction_id := gen_random_uuid();

    for v_item in
        select x.medicine_id, sum(x.quantity)::integer as quantity
          from jsonb_to_recordset(p_items) as x(medicine_id uuid, quantity integer)
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
            raise exception 'Not enough available stock for one of the medicines. Available units: %.', v_remaining
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
        'Medicine Dispensed',
        'Dispensing',
        'Completed walk-in dispensing transaction '
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

revoke all on function public.dispense_walk_in(uuid, jsonb) from public;
revoke all on function public.dispense_walk_in(uuid, jsonb) from anon;
grant execute on function public.dispense_walk_in(uuid, jsonb) to authenticated;


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

    select exists (
        select 1
          from public.medicine_dispensing md
         where md.patient_id = p_patient_id
           and md.voided_at is null
           and date_trunc('month', md.dispense_date) = date_trunc('month', now())
    )
    into v_claimed;

    return jsonb_build_object('claimed_this_month', v_claimed);
end;
$$;

revoke all on function public.get_patient_monthly_claim_status(uuid) from public;
revoke all on function public.get_patient_monthly_claim_status(uuid) from anon;
grant execute on function public.get_patient_monthly_claim_status(uuid) to authenticated;


create or replace function public.void_dispensing_transaction(
    p_transaction_id uuid,
    p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_voider_name text;
begin
    if not public.is_pharma_ii() then
        raise exception 'Only Pharmacist II can void dispensing transactions.'
            using errcode = '42501';
    end if;

    if nullif(btrim(coalesce(p_reason, '')), '') is null then
        raise exception 'A void reason is required.'
            using errcode = '22023';
    end if;

    if not exists (
        select 1
          from public.medicine_dispensing md
         where md.dispensing_transaction_id = p_transaction_id
     for update
    ) then
        raise exception 'Dispensing transaction not found.'
            using errcode = 'P0001';
    end if;

    if exists (
        select 1
          from public.medicine_dispensing md
         where md.dispensing_transaction_id = p_transaction_id
           and md.voided_at is not null
    ) then
        raise exception 'This transaction has already been voided.'
            using errcode = 'P0001';
    end if;

    with voidable_rows as (
        select md.id, md.inventory_id, md.quantity
          from public.medicine_dispensing md
         where md.dispensing_transaction_id = p_transaction_id
    )
    update public.inventory i
       set quantity = i.quantity + vr.quantity,
           updated_at = now()
      from voidable_rows vr
     where i.id = vr.inventory_id;

    update public.medicine_dispensing md
       set voided_by = auth.uid(),
           voided_at = now(),
           void_reason = btrim(p_reason)
     where md.dispensing_transaction_id = p_transaction_id;

    select concat_ws(' ', p.first_name, p.last_name)
      into v_voider_name
      from public.profiles p
     where p.id = auth.uid();

    insert into public.activity_logs (user_id, action, module, details)
    values (
        auth.uid(),
        'Dispensing Voided',
        'Dispensing',
        'Voided dispensing transaction '
            || upper(substr(p_transaction_id::text, 1, 8))
            || '. Stock restored. Reason: '
            || btrim(p_reason)
    );

    insert into public.notifications (user_id, title, message)
    select
        p.id,
        'Dispensing Transaction Voided',
        'Walk-in transaction ' || upper(substr(p_transaction_id::text, 1, 8))
            || ' was voided by ' || coalesce(v_voider_name, 'an administrator')
            || ' and the stock was returned to inventory.'
      from public.profiles p
     where p.role in ('PHARMA_I', 'PHARMA_II')
       and p.status = 'ACTIVE';
end;
$$;

revoke all on function public.void_dispensing_transaction(uuid, text) from public;
revoke all on function public.void_dispensing_transaction(uuid, text) from anon;
grant execute on function public.void_dispensing_transaction(uuid, text) to authenticated;
