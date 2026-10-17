-- Migration: Fix update_inventory_batch function ambiguity and ensure PO number / unit cost updates
-- Description: Revokes execute on obsolete 7-parameter overload to eliminate PostgREST function selection conflict,
--              and grants execute on the comprehensive 9-parameter version with po_number and unit_cost support.

-- 1. Revoke public/authenticated access from ambiguous 7-parameter version so PostgREST uniquely selects 9-param function
REVOKE ALL ON FUNCTION public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date) FROM public, anon, authenticated;

-- 2. Ensure authenticated users have execute privileges on the 9-parameter update_inventory_batch function
GRANT EXECUTE ON FUNCTION public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date, text, numeric) TO authenticated;
