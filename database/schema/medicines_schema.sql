create table medicines (
    id uuid primary key default gen_random_uuid(),

    generic_name text not null,

    brand_name text,

    unit_of_measure text not null,

    dosage text not null,

    unit_cost numeric(10,2)
);

-- The live database also applies medicines_unique_definition
-- in database/schema/medicine_constraint_schema.sql.
