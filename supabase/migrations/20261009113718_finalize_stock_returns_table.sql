-- ==============================================================================
-- Migration: Finalize Stock Returns Table
-- Purpose: Store one returned medicine lot per stock_returns row using the
-- finalized CHO/BHW stock return ledger columns.
-- ==============================================================================

ALTER TABLE public.stock_returns
  ADD COLUMN IF NOT EXISTS lot_no text,
  ADD COLUMN IF NOT EXISTS medicine_id uuid REFERENCES public.medicines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS medicine_name text,
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS quantity integer,
  ADD COLUMN IF NOT EXISTS unit_cost numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expiration_date date,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS submitted_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Legacy slip columns are retained as nullable compatibility fields so old
-- clients do not break, but the application now writes the finalized columns.
ALTER TABLE public.stock_returns
  ALTER COLUMN return_slip_no DROP NOT NULL,
  ALTER COLUMN source_facility_id DROP NOT NULL,
  ALTER COLUMN destination_facility_id DROP NOT NULL,
  ALTER COLUMN return_date DROP NOT NULL,
  ALTER COLUMN return_reason DROP NOT NULL,
  ALTER COLUMN status SET DEFAULT 'PENDING';

ALTER TABLE public.stock_returns
  DROP CONSTRAINT IF EXISTS stock_returns_status_check;

ALTER TABLE public.stock_returns
  ADD CONSTRAINT stock_returns_status_check
  CHECK (status IN ('PENDING', 'RECEIVED', 'VERIFIED', 'CANCELLED'));

UPDATE public.stock_returns sr
SET
  lot_no = COALESCE(sr.lot_no, sri.batch_number),
  medicine_id = COALESCE(sr.medicine_id, sri.medicine_id),
  medicine_name = COALESCE(sr.medicine_name, m.generic_name),
  brand_name = COALESCE(sr.brand_name, m.brand_name),
  quantity = COALESCE(sr.quantity, sri.quantity),
  unit_cost = COALESCE(sr.unit_cost, sri.unit_cost, 0),
  expiration_date = COALESCE(sr.expiration_date, sri.expiration_date),
  reason = COALESCE(sr.reason, sr.return_reason, 'OTHER'),
  facility_id = COALESCE(sr.facility_id, sr.source_facility_id),
  submitted_by_id = COALESCE(sr.submitted_by_id, sr.returned_by_id),
  verified_by_id = COALESCE(sr.verified_by_id, sr.received_by_id),
  submitted_at = COALESCE(sr.submitted_at, sr.created_at, now()),
  verified_at = COALESCE(sr.verified_at, CASE WHEN sr.status = 'VERIFIED' THEN sr.updated_at ELSE NULL END),
  status = CASE WHEN sr.status = 'RECEIVED' THEN 'PENDING' ELSE sr.status END,
  updated_at = now()
FROM public.stock_return_items sri
LEFT JOIN public.medicines m ON m.id = sri.medicine_id
WHERE sri.return_id = sr.id
  AND sr.lot_no IS NULL;

UPDATE public.stock_returns
SET
  reason = COALESCE(reason, return_reason, 'OTHER'),
  facility_id = COALESCE(facility_id, source_facility_id),
  submitted_by_id = COALESCE(submitted_by_id, returned_by_id),
  verified_by_id = COALESCE(verified_by_id, received_by_id),
  submitted_at = COALESCE(submitted_at, created_at, now()),
  unit_cost = COALESCE(unit_cost, 0),
  status = COALESCE(status, 'PENDING'),
  updated_at = now()
WHERE reason IS NULL
   OR facility_id IS NULL
   OR submitted_at IS NULL
   OR status IS NULL;

ALTER TABLE public.stock_returns
  ALTER COLUMN lot_no SET NOT NULL,
  ALTER COLUMN medicine_name SET NOT NULL,
  ALTER COLUMN quantity SET NOT NULL,
  ALTER COLUMN unit_cost SET NOT NULL,
  ALTER COLUMN expiration_date SET NOT NULL,
  ALTER COLUMN reason SET NOT NULL,
  ALTER COLUMN facility_id SET NOT NULL,
  ALTER COLUMN submitted_at SET NOT NULL;

ALTER TABLE public.stock_returns
  DROP CONSTRAINT IF EXISTS stock_returns_quantity_check,
  ADD CONSTRAINT stock_returns_quantity_check CHECK (quantity > 0),
  DROP CONSTRAINT IF EXISTS stock_returns_unit_cost_check,
  ADD CONSTRAINT stock_returns_unit_cost_check CHECK (unit_cost >= 0);

CREATE INDEX IF NOT EXISTS idx_stock_returns_facility ON public.stock_returns(facility_id);
CREATE INDEX IF NOT EXISTS idx_stock_returns_medicine ON public.stock_returns(medicine_id);
CREATE INDEX IF NOT EXISTS idx_stock_returns_lot_no ON public.stock_returns(lot_no);
CREATE INDEX IF NOT EXISTS idx_stock_returns_submitted_at ON public.stock_returns(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_returns_reason ON public.stock_returns(reason);

DROP POLICY IF EXISTS "pharma_staff_all_stock_returns" ON public.stock_returns;
DROP POLICY IF EXISTS "bhw_view_facility_stock_returns" ON public.stock_returns;
DROP POLICY IF EXISTS "bhw_insert_facility_stock_returns" ON public.stock_returns;

CREATE POLICY "pharma_staff_all_stock_returns"
ON public.stock_returns
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('PHARMA_I', 'PHARMA_II')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role IN ('PHARMA_I', 'PHARMA_II')
  )
);

CREATE POLICY "bhw_view_own_stock_returns"
ON public.stock_returns
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.facility_id = stock_returns.facility_id
  )
);

CREATE POLICY "bhw_insert_own_stock_returns"
ON public.stock_returns
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'BHW'
      AND p.facility_id = stock_returns.facility_id
  )
);

GRANT SELECT, INSERT, UPDATE ON public.stock_returns TO authenticated;
