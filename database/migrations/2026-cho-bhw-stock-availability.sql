/*
=====================================================
MIGRATION: CHO-Based BHW Stock Availability

The RPC functions for this feature are defined in the
canonical helper script:

  database/helper-functions/cho_inventory_medicines_function_schema.sql

- get_cho_inventory_medicines()
- submit_bhw_medicine_request(jsonb, text)

That script also seeds the supabase function grants.
Run it AFTER all schema and RLS files are applied.
This file remains as a migration-order marker only;
it intentionally contains no executable SQL.
=====================================================
*/