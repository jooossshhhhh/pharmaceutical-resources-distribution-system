create index idx_profiles_role
on profiles(role);

create index idx_profiles_facility
on profiles(facility_id);


create index idx_patients_facility
on patients(facility_id);

create index idx_facilities_code
on facilities(facility_code);