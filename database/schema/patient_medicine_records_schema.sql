/*
=====================================================
Patient Medicine Records

Purpose:
Stores medicine history per patient.

Supports:
- Monthly eligibility validation
- Patient history lookup
- Medicine claim monitoring
- Audit trail

Business Rules:
1. Every record belongs to a patient.
2. Every record references a medicine.
3. Every record references a dispensing transaction.




Monthly Claim Rule

We are not enforcing it in the database schema.

Instead, later in Supabase:

Before dispensing:

select count(*)
from patient_medicine_records
where patient_id = :patient_id
and date_trunc('month', date_stamp)
    = date_trunc('month', now());

If count > 0:

Patient already received free medicine this month.



=====================================================
*/

create table patient_medicine_records (

    id uuid primary key default gen_random_uuid(),

    patient_id uuid not null
        references patients(id)
        on delete restrict,

    medicine_dispensing_id uuid not null
        references medicine_dispensing(id)
        on delete restrict,

    medicine_id uuid not null
        references medicines(id)
        on delete restrict,

    medicine_quantity integer not null
        check (medicine_quantity > 0),

    remarks text,

    dispensed_by uuid not null
        references profiles(id)
        on delete restrict,

    date_stamp timestamptz not null
        default now()
);