/*
=====================================================
Medicine Dispensing

Purpose:
Records actual medicine dispensing transactions.

Supports:
- Walk-in Patients
- Barangay Dispensing
- Medical Missions
- Inventory Deduction
- Forecasting Data

Business Rules:
1. Every dispensing record belongs to a facility.
2. Every dispensing record references a medicine.
3. Every dispensing record references inventory.
4. Every dispensing record references a patient.
5. Quantity must be greater than zero.
=====================================================
*/

create table medicine_dispensing (

    id uuid primary key default gen_random_uuid(),

    facility_id uuid not null
        references facilities(id)
        on delete restrict,

    medicine_id uuid not null
        references medicines(id)
        on delete restrict,

    inventory_id uuid not null
        references inventory(id)
        on delete restrict,

    quantity integer not null
        check (quantity > 0),

    dispensing_type dispensing_type not null,

    dispensed_by uuid not null
        references profiles(id)
        on delete restrict,

    patient_id uuid not null
        references patients(id)
        on delete restrict,

    dispense_date timestamptz not null
        default now()
);