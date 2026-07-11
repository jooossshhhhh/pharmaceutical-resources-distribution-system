/*
=====================================================
Activity Logs

Purpose:
Stores audit trail records for user actions.

Examples:
- User Approved Registration
- Medicine Dispensed
- Transfer Approved
- Request Rejected
- Inventory Updated

Business Rules:
1. Every log belongs to a user.
2. Logs are immutable historical records.
=====================================================
*/

create table activity_logs (

    id uuid primary key default gen_random_uuid(),

    user_id uuid
        references profiles(id)
        on delete set null,

    action text not null,

    module text not null,

    details text not null,

    created_at timestamptz not null
        default now()
);