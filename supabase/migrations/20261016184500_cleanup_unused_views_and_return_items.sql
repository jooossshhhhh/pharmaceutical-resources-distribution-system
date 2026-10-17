-- Migration: Cleanup Unused Views, Abandoned Return Items, and Streamline Dispensing
-- Description:
-- 1. Drops legacy unused SQL views (expiring_medicines_view, low_stock_view, inventory_overview).
-- 2. Drops abandoned stock_return_items table (returns are fully self-contained in stock_returns).
-- 3. Drops redundant patient_medicine_records shadow table (dispensing records are tracked exclusively in medicine_dispensing).
-- 4. Updates dispense_walk_in and add_patient_manual_dispensing_record to eliminate duplicate writes.
-- 5. Updates enforce_patient_archive_and_delete trigger to reference medicine_dispensing directly.

-- Step 1: Drop legacy unused views
DROP VIEW IF EXISTS public.expiring_medicines_view CASCADE;
DROP VIEW IF EXISTS public.low_stock_view CASCADE;
DROP VIEW IF EXISTS public.inventory_overview CASCADE;

-- Step 2: Drop abandoned stock_return_items table (0 rows, returns stored in stock_returns)
DROP TABLE IF EXISTS public.stock_return_items CASCADE;

-- Step 3: Drop redundant patient_medicine_records table (shadow mirror of medicine_dispensing)
DROP TABLE IF EXISTS public.patient_medicine_records CASCADE;
