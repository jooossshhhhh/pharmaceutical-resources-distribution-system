alter policy "bhw_view_own_dispensing"
on public.medicine_dispensing
using (
  facility_id = public.get_user_facility()
  or exists (
    select 1
      from public.patients p
     where p.id = medicine_dispensing.patient_id
       and p.facility_id = public.get_user_facility()
  )
);

drop policy if exists "bhw_view_patient_history_dispensers" on public.profiles;

create policy "bhw_view_patient_history_dispensers"
on public.profiles
for select
to authenticated
using (
  id = public.get_current_profile_id()
  or exists (
    select 1
      from public.medicine_dispensing md
      join public.patients p on p.id = md.patient_id
     where md.dispensed_by = profiles.id
       and p.facility_id = public.get_user_facility()
  )
);
