-- =====================================================
-- Migration: Add Stock Returns & Disposal to Inventory
-- Supports:
-- 1. Returned medicines from Barangays (without supplier/PO)
-- 2. Clean condemnation/disposal of expired stock
-- =====================================================

ALTER TABLE public.inventory
ADD COLUMN IF NOT EXISTS origin_facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS intake_type text DEFAULT 'PROCUREMENT',
ADD COLUMN IF NOT EXISTS return_reason text,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS disposed_at timestamptz,
ADD COLUMN IF NOT EXISTS disposal_method text,
ADD COLUMN IF NOT EXISTS disposed_by uuid REFERENCES public.profiles(id);

-- Allow supplier_id to be nullable for returned stocks (which have no supplier)
ALTER TABLE public.inventory ALTER COLUMN supplier_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_origin_facility
ON public.inventory(origin_facility_id);

CREATE INDEX IF NOT EXISTS idx_inventory_intake_type
ON public.inventory(intake_type);

CREATE INDEX IF NOT EXISTS idx_inventory_status
ON public.inventory(status);
