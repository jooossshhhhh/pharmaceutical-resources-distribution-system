/*
=====================================================
MIGRATION: Patient Created By and Registered By Audit
Date: 2026-10-06

Purpose:
Aligns patients.created_by with authentication session
stamps and ensures database triggers / defaults backfill
auth.uid() whenever explicit created_by is omitted.

Changes:
- Sets default auth.uid() for patients.created_by column.
- Adds index on patients.created_by if not existing.
- Adds before-insert trigger ensuring created_by is
  automatically stamped with auth.uid() when null.
=====================================================
*/

-- 1. Ensure created_by defaults to auth.uid()
alter table public.patients
    alter column created_by set default auth.uid();

-- 2. Index for fast foreign key lookups and queries
create index if not exists idx_patients_created_by
    on public.patients(created_by);

-- 3. Safety trigger to ensure created_by is always stamped if null
create or replace function public.stamp_patient_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.created_by is null then
        new.created_by := auth.uid();
    end if;
    return new;
end;
$$;

drop trigger if exists on_patient_created_by_stamp on public.patients;
create trigger on_patient_created_by_stamp
before insert on public.patients
for each row
when (new.created_by is null)
execute function public.stamp_patient_created_by();
