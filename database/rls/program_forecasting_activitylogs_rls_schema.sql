/*
=====================================================
PHASE 15F — PROGRAMS, FORECASTING,
ACTIVITY LOGS RLS
=====================================================

Tables:
- other_programs
- program_medicines
- forecasting
- activity_logs

Purpose:
Controls access to system-wide programs,
forecasting data, and audit logs.

Business Rules:

BHW
----
✓ View programs
✓ View program medicines
✓ View forecasting for own facility

✗ Cannot modify programs
✗ Cannot modify forecasts
✗ Cannot view all activity logs

Pharma I
---------
✓ View all programs
✓ Manage programs
✓ View all forecasts

✓ View activity logs

Pharma II
----------
✓ Full access

Dependencies:
- other_programs
- program_medicines
- forecasting
- activity_logs

Helper Functions:
- is_bhw()
- is_pharma_i()
- is_pharma_ii()
- get_user_facility()

=====================================================
*/


/*
=====================================================
OTHER PROGRAMS RLS
=====================================================
*/


-- All authenticated users can view programs

create policy "view_programs"

on other_programs

for select

using (
    auth.uid() is not null
);


-- Pharma I and Pharma II manage programs

create policy "manage_programs"

on other_programs

for all

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



/*
=====================================================
PROGRAM MEDICINES RLS
=====================================================
*/


-- All authenticated users can view

create policy "view_program_medicines"

on program_medicines

for select

using (
    auth.uid() is not null
);


-- Pharma I and Pharma II manage

create policy "manage_program_medicines"

on program_medicines

for all

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



/*
=====================================================
FORECASTING RLS
=====================================================
*/


-- BHW can view forecasting
-- only for own facility

create policy "bhw_view_own_forecasts"

on forecasting

for select

using (
    facility_id = get_user_facility()
);


-- Pharma staff can view all forecasts

create policy "pharma_staff_view_forecasts"

on forecasting

for select

using (
    is_pharma_i()
    or
    is_pharma_ii()
);


-- Forecast generation and edits

create policy "pharma_staff_manage_forecasts"

on forecasting

for all

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



/*
=====================================================
ACTIVITY LOGS RLS
=====================================================

Audit Trail Design

Activity logs are append-only.

Users may:
✓ View logs
✓ Insert logs

Users may NOT:
✗ Update logs
✗ Delete logs

This preserves the integrity
of the audit trail.

=====================================================
*/


-- Pharma I and Pharma II can view logs

create policy "pharma_staff_view_logs"

on activity_logs

for select

using (
    is_pharma_i()
    or
    is_pharma_ii()
);


-- Pharma II can create logs

create policy "pharma_ii_insert_logs"

on activity_logs

for insert

with check (
    is_pharma_ii()
);



/*
=====================================================
END OF PHASE 15F
=====================================================

Secured Tables:

✓ other_programs
✓ program_medicines
✓ forecasting
✓ activity_logs

Access Summary:

BHW
✓ View programs
✓ View program medicines
✓ View own facility forecasts

Pharma I
✓ Manage programs
✓ Manage forecasting
✓ View logs

Pharma II
✓ Full access
✓ Create audit logs

Activity Logs
-------------
✓ View
✓ Insert

✗ Update
✗ Delete

=====================================================

ALL RLS PHASES COMPLETED

Phase 15A
✓ profiles
✓ notifications

Phase 15B
✓ facilities
✓ inventory

Phase 15C
✓ medicine_requests
✓ medicine_request_items

Phase 15D
✓ stock_transfers
✓ stock_transfer_items

Phase 15E
✓ patients
✓ medicine_dispensing
✓ patient_medicine_records

Phase 15F
✓ other_programs
✓ program_medicines
✓ forecasting
✓ activity_logs

=====================================================
*/