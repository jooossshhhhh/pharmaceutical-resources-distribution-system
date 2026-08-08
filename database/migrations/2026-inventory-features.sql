/*
=====================================================
MIGRATION: Inventory Productivity Features

Purpose:
Supports the inventory module productivity upgrades:
  1. Real-time inventory sync across open sessions
     (low stock / edits / deletions reflect instantly).
  2. Per-item stock history in the stock details modal.

Changes:
- Adds the inventory table to the supabase_realtime
  publication so clients can subscribe to live changes.
- Extends the role_scoped_view_logs policy on
  activity_logs so Pharma I users can also read
  Inventory-module logs created by other staff members
  (needed for the per-item stock history panel; today
  Pharma I can only see their own + BHW logs).

Notes:
- Realtime subscriptions still respect row-level
  security, so BHW users only receive changes for
  inventory rows at their own facility.
- Run this file against the database just like the
  other migrations in database/migrations/.
=====================================================
*/

alter publication supabase_realtime
    add table inventory;

drop policy if exists "role_scoped_view_logs"
    on activity_logs;

create policy "role_scoped_view_logs"
    on activity_logs
    for select
    to authenticated
    using (
        is_pharma_i()
        and (
            user_id = (select auth.uid())
            or
            exists (
                select 1
                from profiles log_profile
                where log_profile.id = activity_logs.user_id
                and log_profile.role = 'BHW'
            )
            or
            module = 'Inventory'
        )
        or
        is_pharma_ii()
        or
        (
            is_bhw()
            and
            user_id = (select auth.uid())
        )
    );
