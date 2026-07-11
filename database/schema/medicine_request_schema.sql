/*
=====================================================
Medicine Requests

Purpose:
Stores medicine requests submitted by facilities.

Workflow:

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
1. Every request belongs to a facility.
2. Every request is created by a user.
3. Requests are approved by Pharma II.
4. Approved requests become read-only.
5. Request items are stored in
   medicine_request_items.
=====================================================
*/

create table medicine_requests (
    id uuid primary key default gen_random_uuid(),

    requested_by uuid not null
        references profiles(id)
        on delete restrict,

    facility_id uuid not null
        references facilities(id)
        on delete restrict,

    request_date timestamptz not null default now(),

    status request_status not null default 'PENDING',

    approved_by uuid
        references profiles(id)
        on delete restrict,

    approved_at timestamptz,

    remarks text
);