create table profiles (
    id uuid primary key references auth.users(id) on delete cascade,

    first_name text not null,
    last_name text not null,

    email text unique,
    phone_number text,

    role user_role not null default 'BHW',

    facility_id uuid references facilities(id),

    status profile_status not null default 'PENDING',

    approved_by uuid references profiles(id),
    approved_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
