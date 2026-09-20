create index if not exists idx_patient_medicine_records_medicine_dispensing_id
on public.patient_medicine_records(medicine_dispensing_id);

drop index if exists public.idx_patients_facility_id;
drop index if exists public.idx_profiles_facility_id;
drop index if exists public.idx_profile_facility_change_requests_profile_id;;
