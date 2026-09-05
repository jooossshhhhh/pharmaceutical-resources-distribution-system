/*
=====================================================
Patient Archive And Safe Delete - 2026-09-05

Purpose:
- Archive patients instead of deleting active records.
- Keep dispensing and patient medicine history intact.
- Allow permanent delete only for Pharmacist II when
  the archived patient has no linked history.
=====================================================
*/

alter table public.patients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid
    references public.profiles(id) on delete restrict,
  add column if not exists archive_reason text;

create index if not exists idx_patients_archived_at
  on public.patients(archived_at);

create index if not exists idx_patients_facility_archived_at
  on public.patients(facility_id, archived_at);

create or replace function public.enforce_patient_archive_and_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_history boolean := false;
begin
  if tg_op = 'UPDATE' then
    if new.archived_at is distinct from old.archived_at
      or new.archived_by is distinct from old.archived_by
      or coalesce(new.archive_reason, '') is distinct from coalesce(old.archive_reason, '')
    then
      if not (public.is_pharma_i() or public.is_pharma_ii()) then
        raise exception 'Only CHO staff can archive or restore patient records.';
      end if;

      if old.archived_at is null and new.archived_at is not null then
        new.archived_by := public.get_current_profile_id();
        new.archive_reason := nullif(trim(coalesce(new.archive_reason, '')), '');
      elsif old.archived_at is not null and new.archived_at is null then
        new.archived_by := null;
        new.archive_reason := null;
      else
        new.archived_by := coalesce(old.archived_by, public.get_current_profile_id());
        new.archive_reason := nullif(trim(coalesce(new.archive_reason, '')), '');
      end if;
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if not public.is_pharma_ii() then
      raise exception 'Only Pharmacist II can permanently delete patient records.';
    end if;

    if old.archived_at is null then
      raise exception 'Archive the patient before permanent deletion.';
    end if;

    select
      exists (
        select 1
        from public.medicine_dispensing md
        where md.patient_id = old.id
      )
      or exists (
        select 1
        from public.patient_medicine_records pmr
        where pmr.patient_id = old.id
      )
    into v_has_history;

    if v_has_history then
      raise exception 'This patient has dispensing history and cannot be permanently deleted. Keep the archived record for audit history.';
    end if;

    return old;
  end if;

  return null;
end;
$$;

revoke all on function public.enforce_patient_archive_and_delete() from public, anon, authenticated;

drop trigger if exists enforce_patient_archive_and_delete_on_update on public.patients;
create trigger enforce_patient_archive_and_delete_on_update
before update on public.patients
for each row
execute function public.enforce_patient_archive_and_delete();

drop trigger if exists enforce_patient_archive_and_delete_on_delete on public.patients;
create trigger enforce_patient_archive_and_delete_on_delete
before delete on public.patients
for each row
execute function public.enforce_patient_archive_and_delete();
