create table suppliers (
    id uuid primary key default gen_random_uuid(),

    supplier_name text not null,

    contact_number text,

    address text,

    status supplier_status not null default 'ACTIVE',

    constraint suppliers_name_unique
        unique (supplier_name)
);
