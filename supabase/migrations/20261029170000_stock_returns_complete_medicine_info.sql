-- ==============================================================================
-- Migration: Add dosage and unit_of_measure to stock_returns
-- Purpose: Ensure stock returns capture complete medicine specifications
-- (generic name, dosage, brand, unit of measurement) for audit & inventory re-entry.
-- ==============================================================================

ALTER TABLE public.stock_returns
  ADD COLUMN IF NOT EXISTS dosage text,
  ADD COLUMN IF NOT EXISTS unit_of_measure text;

-- Backfill existing stock_returns records from medicines master table
UPDATE public.stock_returns sr
SET
  dosage = COALESCE(sr.dosage, m.dosage, ''),
  unit_of_measure = COALESCE(sr.unit_of_measure, m.unit_of_measure, '')
FROM public.medicines m
WHERE m.id = sr.medicine_id
  AND (sr.dosage IS NULL OR sr.unit_of_measure IS NULL);
