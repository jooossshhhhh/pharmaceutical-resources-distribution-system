/*
=====================================================
MIGRATION: Patient Manual Dispensing Records

Adds history-only manual records for past patient claims.
Manual rows do not deduct inventory and are excluded from
live dispensing eligibility plus forecasting summaries.
=====================================================
*/

alter table public.medicine_dispensing
    add column if not exists is_manual_record boolean not null default false,
    add column if not exists manual_dispensed_by text;

alter table public.medicine_dispensing
    alter column inventory_id drop not null;

create index if not exists idx_medicine_dispensing_manual_patient_date
    on public.medicine_dispensing(patient_id, dispense_date desc)
    where is_manual_record = true;

create or replace view public.monthly_dispensing_summary as
select
    facility_id,
    medicine_id,
    date_trunc('month', dispense_date)::date as month,
    sum(quantity) as total_dispensed
from public.medicine_dispensing
where coalesce(is_manual_record, false) = false
group by facility_id, medicine_id, date_trunc('month', dispense_date)::date;

grant select on public.monthly_dispensing_summary to authenticated;

do $$
declare
    v_function_sql text;
begin
    select pg_get_functiondef('public.dispense_walk_in(uuid,jsonb,text)'::regprocedure)
      into v_function_sql;

    v_function_sql := replace(
        v_function_sql,
        'where md.patient_id = p_patient_id
       and md.voided_at is null',
        'where coalesce(md.is_manual_record, false) = false
       and md.patient_id = p_patient_id
       and md.voided_at is null'
    );

    v_function_sql := replace(
        v_function_sql,
        'where md.patient_id = p_patient_id
                 and md.medicine_id = x.medicine_id',
        'where coalesce(md.is_manual_record, false) = false
                 and md.patient_id = p_patient_id
                 and md.medicine_id = x.medicine_id'
    );

    execute v_function_sql;
end $$;

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
         where coalesce(md.is_manual_record, false) = false
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

create or replace function public.add_patient_manual_dispensing_record(
    p_patient_id uuid,
    p_medicine_id uuid,
    p_needed_quantity integer,
    p_quantity integer,
    p_dispensing_facility_id uuid,
    p_prescribed_by text,
    p_manual_dispensed_by text,
    p_dispense_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_caller_id uuid;
    v_caller_role public.user_role;
    v_dispensing_id uuid;
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
        manual_dispensed_by
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
        btrim(p_manual_dispensed_by)
    )
    returning id into v_dispensing_id;

    insert into public.activity_logs (user_id, action, module, details)
    values (
        v_caller_id,
        'Manual Patient Record Added',
        'Patients',
        'Added manual dispensing record '
            || upper(substr(v_transaction_id::text, 1, 8))
            || ' for patient ' || p_patient_id || '.'
    );

    return jsonb_build_object(
        'id', v_dispensing_id,
        'transaction_id', v_transaction_id
    );
end;
$$;

revoke all on function public.get_patient_monthly_claim_status(uuid) from public;
revoke all on function public.get_patient_monthly_claim_status(uuid) from anon;
grant execute on function public.get_patient_monthly_claim_status(uuid) to authenticated;

revoke all on function public.add_patient_manual_dispensing_record(uuid, uuid, integer, integer, uuid, text, text, date) from public;
revoke all on function public.add_patient_manual_dispensing_record(uuid, uuid, integer, integer, uuid, text, text, date) from anon;
grant execute on function public.add_patient_manual_dispensing_record(uuid, uuid, integer, integer, uuid, text, text, date) to authenticated;

select pg_notify('pgrst', 'reload schema');
