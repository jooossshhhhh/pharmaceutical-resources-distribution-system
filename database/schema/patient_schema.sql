create table patients (
    id uuid primary key default gen_random_uuid(),

    first_name text not null,
    middle_name text,
    last_name text not null,
    suffix text,

    gender gender_type not null,
    date_of_birth date not null,
    contact_number text,
    address text,

    facility_id uuid not null
        references facilities(id),
    created_by uuid
        references profiles(id),

    patient_code text not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    archived_at timestamptz,
    archived_by uuid
        references profiles(id) on delete restrict,
    archive_reason text
);
