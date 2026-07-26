create table profile_facility_change_requests (
    id uuid primary key default gen_random_uuid(),

    profile_id uuid not null references profiles(id) on delete cascade,
    current_facility_id uuid references facilities(id),
    requested_facility_id uuid not null references facilities(id),

    reason text,

    status facility_change_request_status not null default 'PENDING',

    reviewed_by uuid references profiles(id),
    reviewed_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint profile_facility_change_different_facility
        check (
            current_facility_id is null
            or current_facility_id <> requested_facility_id
        )
);
