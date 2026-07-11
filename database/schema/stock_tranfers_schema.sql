/*
=====================================================
Stock Transfers

Purpose:
Records medicine transfers between facilities.

Supported Workflows:
- CHO → Barangay
- Barangay → Barangay (with CHO approval)

Status Flow:

PENDING
    ↓
APPROVED
    ↓
COMPLETED

or

PENDING
    ↓
REJECTED

Business Rules:
1. Every transfer has a source facility.
2. Every transfer has a destination facility.
3. Source and destination facilities must be different.
4. Every transfer is requested by a user.
5. Every transfer is approved by Pharma II.
6. A completed transfer may record who received it.
7. Facilities cannot be deleted while transfer records exist.
=====================================================
*/

create table stock_transfers (

    id uuid primary key default gen_random_uuid(),

    source_facility_id uuid not null
        references facilities(id)
        on delete restrict,

    destination_facility_id uuid not null
        references facilities(id)
        on delete restrict,

    requested_by uuid not null
        references profiles(id)
        on delete restrict,

    approved_by uuid
        references profiles(id)
        on delete restrict,

    approved_at timestamptz,

    status transfer_status not null
        default 'PENDING',

    created_at timestamptz not null
        default now(),

    transfer_date timestamptz,

    received_by uuid
        references profiles(id)
        on delete restrict,

    received_at timestamptz,

    remarks text,

    constraint transfer_different_facilities
        check (
            source_facility_id <> destination_facility_id
        )
);