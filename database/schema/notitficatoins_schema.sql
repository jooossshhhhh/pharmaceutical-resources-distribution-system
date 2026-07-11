/*
=====================================================
Notifications

Purpose:
Stores notifications intended for specific users.

Examples:
- Low Stock Alert
- Transfer Approved
- Request Approved
- Registration Approved
- Expiration Alert

Business Rules:
1. Every notification belongs to a user.
2. Notifications can be marked as read.
=====================================================
*/

create table notifications (

    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references profiles(id)
        on delete cascade,

    title text not null,

    message text not null,

    is_read boolean not null
        default false,

    created_at timestamptz not null
        default now()
);