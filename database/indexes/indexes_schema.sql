create index idx_profiles_role
on profiles(role);

create index idx_profiles_facility
on profiles(facility_id);

create unique index idx_profile_facility_change_one_pending
on profile_facility_change_requests(profile_id)
where status = 'PENDING';

create index idx_profile_facility_change_status
on profile_facility_change_requests(status);

create index idx_profile_facility_change_profile
on profile_facility_change_requests(profile_id);


create index idx_patients_facility
on patients(facility_id);

create index idx_facilities_code
on facilities(facility_code);
