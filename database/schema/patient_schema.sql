create table patients (
    id uuid primary key default gen_random_uuid(),

    first_name text not null,

    last_name text not null,

    gender gender_type not null,

    date_of_birth date not null,

    facility_id uuid not null
        references facilities(id)
);
