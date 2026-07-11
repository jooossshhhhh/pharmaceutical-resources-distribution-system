/*
=====================================================
PHASE 15E — PATIENTS & DISPENSING RLS
=====================================================

Tables:
- patients
- medicine_dispensing
- patient_medicine_records

Purpose:
Protect patient information and
medicine dispensing history while
allowing facility-level operations.

Business Rules:

BHW
----
✓ View patients from own facility
✓ Register patients for own facility
✓ Update patients from own facility

✓ View dispensing records from own facility
✓ Create dispensing records for own facility

✓ View patient medicine records
✓ Create patient medicine records
✓ Update patient medicine records

✗ Cannot view other facilities' records

Pharma I
---------
✓ View all patients
✓ View all dispensing records
✓ Manage dispensing records

✓ View all patient medicine records
✓ Manage patient medicine records

Pharma II
----------
✓ Full access

Dependencies:
- patients
- medicine_dispensing
- patient_medicine_records
- profiles

Helper Functions:
- is_bhw()
- is_pharma_i()
- is_pharma_ii()
- get_user_facility()

=====================================================
*/


/*
=====================================================
PATIENTS RLS
=====================================================
*/


-- BHW can view patients from own facility

create policy "bhw_view_own_patients"

on patients

for select

using (
    facility_id = get_user_facility()
);


-- BHW can register patients for own facility

create policy "bhw_insert_patients"

on patients

for insert

with check (
    facility_id = get_user_facility()
);


-- BHW can update patients from own facility

create policy "bhw_update_patients"

on patients

for update

using (
    facility_id = get_user_facility()
)

with check (
    facility_id = get_user_facility()
);


-- Pharma I and Pharma II can view all patients

create policy "pharma_staff_view_patients"

on patients

for select

using (
    is_pharma_i()
    or
    is_pharma_ii()
);


-- Pharma I and Pharma II can update all patients

create policy "pharma_staff_update_patients"

on patients

for update

using (
    is_pharma_i()
    or
    is_pharma_ii()
)

with check (
    is_pharma_i()
    or
    is_pharma_ii()
);


-- Pharma II can delete patients

create policy "pharma_ii_delete_patients"

on patients

for delete

using (
    is_pharma_ii()
);



/*
=====================================================
MEDICINE DISPENSING RLS
=====================================================
*/


-- BHW can view dispensing from own facility

create policy "bhw_view_own_dispensing"

on medicine_dispensing

for select

using (
    facility_id = get_user_facility()
);


-- BHW can create dispensing records

create policy "bhw_insert_dispensing"

on medicine_dispensing

for insert

with check (
    facility_id = get_user_facility()
);


-- BHW can update dispensing records
-- within own facility

create policy "bhw_update_dispensing"

on medicine_dispensing

for update

using (
    facility_id = get_user_facility()
)

with check (
    facility_id = get_user_facility()
);


-- Pharma I and Pharma II can view all dispensing

create policy "pharma_staff_view_dispensing"

on medicine_dispensing

for select

using (
    is_pharma_i()
    or
    is_pharma_ii()
);


-- Pharma I and Pharma II can manage dispensing

create policy "pharma_staff_update_dispensing"

on medicine_dispensing

for update

using (
    is_pharma_i()
    or
    is_pharma_ii()
)

with check (
    is_pharma_i()
    or
    is_pharma_ii()
);


-- Pharma II can delete dispensing

create policy "pharma_ii_delete_dispensing"

on medicine_dispensing

for delete

using (
    is_pharma_ii()
);



/*
=====================================================
PATIENT MEDICINE RECORDS RLS
=====================================================
*/


-- BHW can view records for patients
-- belonging to their facility

create policy "bhw_view_patient_records"

on patient_medicine_records

for select

using (

    exists (

        select 1
        from patients p

        where p.id = patient_medicine_records.patient_id

        and p.facility_id = get_user_facility()

    )

);


-- BHW can create records for patients
-- in their facility

create policy "bhw_insert_patient_records"

on patient_medicine_records

for insert

with check (

    exists (

        select 1
        from patients p

        where p.id = patient_medicine_records.patient_id

        and p.facility_id = get_user_facility()

    )

);


-- BHW can update records for patients
-- in their facility

create policy "bhw_update_patient_records"

on patient_medicine_records

for update

using (

    exists (

        select 1
        from patients p

        where p.id = patient_medicine_records.patient_id

        and p.facility_id = get_user_facility()

    )

)

with check (

    exists (

        select 1
        from patients p

        where p.id = patient_medicine_records.patient_id

        and p.facility_id = get_user_facility()

    )

);


-- Pharma I and Pharma II can view all records

create policy "pharma_staff_view_patient_records"

on patient_medicine_records

for select

using (

    is_pharma_i()

    or

    is_pharma_ii()

);


-- Pharma I and Pharma II can update all records

create policy "pharma_staff_update_patient_records"

on patient_medicine_records

for update

using (

    is_pharma_i()

    or

    is_pharma_ii()

)

with check (

    is_pharma_i()

    or

    is_pharma_ii()

);


-- Pharma II can delete records

create policy "pharma_ii_delete_patient_records"

on patient_medicine_records

for delete

using (
    is_pharma_ii()
);



/*
=====================================================
END OF PHASE 15E
=====================================================

Secured Tables:

✓ patients
✓ medicine_dispensing
✓ patient_medicine_records

Access Summary:

BHW
✓ Own facility only

Pharma I
✓ All facilities

Pharma II
✓ Full access

Supports:

✓ Patient management
✓ Medicine dispensing
✓ Medicine traceability
✓ Future one-free-claim-per-month rule

Next Phase:
PHASE 15F
- other_programs
- program_medicines
- forecasting
- activity_logs

=====================================================
*/