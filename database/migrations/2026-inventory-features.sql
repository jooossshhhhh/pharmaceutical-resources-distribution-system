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
- The current activity_logs RLS policy is maintained in
  database/rls/program_forecasting_activitylogs_rls_schema.sql.

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
