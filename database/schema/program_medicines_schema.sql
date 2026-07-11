/*
=====================================================
Program Medicines

Purpose:
Stores medicines used during a program.

Examples:

Medical Mission
    - Paracetamol
    - Amoxicillin
    - Vitamin C

Business Rules:
1. Every record belongs to a program.
2. Every record references a medicine.
3. Quantity used must be greater than zero.
4. Duplicate medicines within the same
   program are not allowed.
=====================================================
*/

create table program_medicines (

    id uuid primary key default gen_random_uuid(),

    program_id uuid not null
        references other_programs(id)
        on delete cascade,

    medicine_id uuid not null
        references medicines(id)
        on delete restrict,

    quantity_used integer not null
        check (quantity_used > 0),

    constraint program_medicine_unique
        unique (
            program_id,
            medicine_id
        )
);