/*
=====================================================
MIGRATION: Patient Registration Logbook

Purpose:
Extends the patients table into a full registration
logbook used by both BHW and CHO patient modules.

Changes:
- Adds middle_name, suffix, contact_number, address,
  patient_code, created_by, created_at, updated_at
- Creates a patient_code sequence + before-insert
  trigger so every patient gets a sequential code
  formatted like PRD-0001 (concurrency-safe).
- Adds a unique constraint on patient_code.
- Adds a pharma insert RLS policy (pharma staff
  register patients for any health center; BHW keeps
  its own-facility-only insert policy from Phase 15E).

Notes:
- RLS for select / update / delete already exists in
  patients_dispensing_rls_schema.sql (Phase 15E).
- Run after the Phase 15E patient RLS policies exist.
=====================================================
*/


-- ==========================================
-- New columns
-- ==========================================

alter table patients
    add column if not exists middle_name text,
    add column if not exists suffix text,
    add column if not exists contact_number text,
    add column if not exists address text,
    add column if not exists patient_code text,
    add column if not exists created_by uuid
        references profiles(id),
    add column if not exists created_at timestamptz
        not null default now(),
    add column if not exists updated_at timestamptz
        not null default now();


-- ==========================================
-- Patient code sequence + trigger
-- ==========================================

create sequence if not exists patient_code_seq
    start with 1
    increment by 1
    no cycle;

create or replace function generate_patient_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.patient_code := 'PRD-' || lpad(nextval('patient_code_seq')::text, 4, '0');
    return new;
end;
$$;

drop trigger if exists on_patient_code_generated on public.patients;
create trigger on_patient_code_generated
before insert on public.patients
for each row
when (new.patient_code is null)
execute function generate_patient_code();


-- ==========================================
-- Backfill existing rows with codes, then enforce
-- not null + uniqueness. patient_code_seq is not
-- touched by the backfill so existing rows keep
-- sequential codes and new rows continue from there.
-- ==========================================

update patients
set patient_code = 'PRD-BACKFILL-' || gen_random_uuid()
where patient_code is null;

alter table patients
    alter column patient_code set not null,
    add constraint patients_patient_code_key unique (patient_code);


-- ==========================================
-- RLS: pharma staff can register patients for any
-- chosen health center (CHO-wide registration).
-- BHW keeps the own-facility-only insert policy.
-- ==========================================

drop policy if exists "pharma_staff_insert_patients" on patients;

create policy "pharma_staff_insert_patients"
on patients
for insert
to authenticated
with check (
    is_pharma_ii()
    or is_pharma_i()
);