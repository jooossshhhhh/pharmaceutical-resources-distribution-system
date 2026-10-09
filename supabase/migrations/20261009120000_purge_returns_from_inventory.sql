-- ==============================================================================
-- Migration: 20261009120000_purge_returns_from_inventory.sql
-- Description: Purges legacy return stock records from commercial inventory table.
-- Architectural Rule: public.inventory is strictly for Supplier procurement.
-- All returned stocks are recorded exclusively in public.stock_returns & public.stock_return_items.
-- ==============================================================================

DELETE FROM public.inventory
WHERE origin_facility_id IS NOT NULL
   OR intake_type = 'RETURN'
   OR po_number LIKE 'RET-%';
