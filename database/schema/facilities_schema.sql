create table facilities (
    id uuid primary key default gen_random_uuid(),

    facility_name text not null,
    facility_code text not null unique,

    facility_type facility_type not null,

    address text not null,

    status facility_status not null default 'ACTIVE',

    latitude numeric(10,7)
        check (
            latitude is null
            or (
                latitude >= -90
                and latitude <= 90
            )
        ),

    longitude numeric(10,7)
        check (
            longitude is null
            or (
                longitude >= -180
                and longitude <= 180
            )
        )
);
