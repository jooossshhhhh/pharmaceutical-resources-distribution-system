/*
=====================================================
Backend/Auth Cleanup Index Follow-up - 2026-08-30

Purpose:
- Add the remaining FK index reported by Supabase advisor.
- Remove duplicate FK indexes where older indexes already cover the same columns.
=====================================================
*/

create index if not exists idx_patient_medicine_records_medicine_dispensing_id
on public.patient_medicine_records(medicine_dispensing_id);

drop index if exists public.idx_patients_facility_id;
drop index if exists public.idx_profiles_facility_id;
drop index if exists public.idx_profile_facility_change_requests_profile_id;
