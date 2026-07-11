/*
=====================================================
Other Programs

Purpose:
Stores program activities that involve
medicine distribution.

Examples:
- Medical Mission
- Senior Citizen Program
- PWD Program
- Community Outreach Program

Business Rules:
1. A program has a name.
2. A program has a scheduled date.
3. A program may have multiple medicines.
=====================================================
*/

create table other_programs (

    id uuid primary key default gen_random_uuid(),

    program_name text not null,

    program_date date not null,

    description text
);