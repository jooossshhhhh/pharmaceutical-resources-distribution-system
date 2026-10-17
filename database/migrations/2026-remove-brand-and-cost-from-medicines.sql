-- =========================================================================
-- Migration: Remove brand_name and unit_cost from medicines table
-- Description:
--   1. Ensures public.inventory has brand_name (text) and unit_cost (numeric).
--   2. Backfills brand_name and unit_cost from medicines into inventory where null.
--   3. Drops brand_name and unit_cost columns from public.medicines since they
--      vary per inventory batch / purchase order procurement.
--   4. Updates update_inventory_batch RPC to support brand_name updates.
--   5. Updates get_cho_inventory_medicines RPC to avoid referencing m.brand_name.
-- =========================================================================

-- 1. Ensure inventory table has brand_name and unit_cost
ALTER TABLE public.inventory 
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS unit_cost numeric(10,2);

-- 2. Backfill existing inventory batches from medicines where inventory values are null
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
      FROM information_schema.columns 
     WHERE table_schema = 'public' 
       AND table_name = 'medicines' 
       AND column_name = 'brand_name'
  ) THEN
    UPDATE public.inventory i
       SET brand_name = COALESCE(i.brand_name, m.brand_name)
      FROM public.medicines m
     WHERE i.medicine_id = m.id
       AND i.brand_name IS NULL
       AND m.brand_name IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 
      FROM information_schema.columns 
     WHERE table_schema = 'public' 
       AND table_name = 'medicines' 
       AND column_name = 'unit_cost'
  ) THEN
    UPDATE public.inventory i
       SET unit_cost = COALESCE(i.unit_cost, m.unit_cost)
      FROM public.medicines m
     WHERE i.medicine_id = m.id
       AND i.unit_cost IS NULL
       AND m.unit_cost IS NOT NULL;
  END IF;
END $$;

-- 3. Drop brand_name and unit_cost from public.medicines
ALTER TABLE public.medicines 
  DROP COLUMN IF EXISTS brand_name CASCADE,
  DROP COLUMN IF EXISTS unit_cost CASCADE;

-- 4. Update get_cho_inventory_medicines RPC to return NULL::text for brand_name
CREATE OR REPLACE FUNCTION public.get_cho_inventory_medicines()
RETURNS TABLE (
  id uuid,
  generic_name text,
  brand_name text,
  dosage text,
  unit_of_measure text,
  physical_quantity bigint,
  reserved_quantity bigint,
  available_quantity bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH cho_facility AS (
    SELECT f.id
      FROM public.facilities f
     WHERE f.facility_type = 'CHO'
       AND f.status = 'ACTIVE'
     LIMIT 1
  ),
  physical_stock AS (
    SELECT i.medicine_id, SUM(i.quantity)::bigint AS quantity
      FROM public.inventory i
     WHERE i.facility_id = (SELECT id FROM cho_facility)
       AND COALESCE(i.status, 'ACTIVE') = 'ACTIVE'
     GROUP BY i.medicine_id
  ),
  reserved_stock AS (
    SELECT ri.medicine_id, SUM(ri.quantity)::bigint AS quantity
      FROM public.medicine_request_items ri
      JOIN public.medicine_requests r ON r.id = ri.request_id
     WHERE r.status IN ('PENDING', 'APPROVED')
       AND NOT EXISTS (
         SELECT 1
           FROM public.medicine_request_fulfillments mf
          WHERE mf.request_item_id = ri.id
       )
     GROUP BY ri.medicine_id
  )
  SELECT
    m.id,
    m.generic_name,
    NULL::text AS brand_name,
    m.dosage,
    m.unit_of_measure,
    ps.quantity AS physical_quantity,
    COALESCE(rs.quantity, 0)::bigint AS reserved_quantity,
    GREATEST(ps.quantity - COALESCE(rs.quantity, 0), 0)::bigint AS available_quantity
  FROM physical_stock ps
  JOIN public.medicines m ON m.id = ps.medicine_id
  LEFT JOIN reserved_stock rs ON rs.medicine_id = ps.medicine_id
  ORDER BY m.generic_name, m.dosage;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cho_inventory_medicines() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_cho_inventory_medicines() TO authenticated;

-- 5. Update update_inventory_batch RPC to support brand_name and unit_cost updates
CREATE OR REPLACE FUNCTION public.update_inventory_batch(
  p_inventory_id uuid,
  p_supplier_id uuid,
  p_quantity integer,
  p_threshold integer,
  p_batch_number text,
  p_date_received date,
  p_expiration_date date,
  p_po_number text default null,
  p_unit_cost numeric default null,
  p_brand_name text default null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_existing public.inventory%rowtype;
BEGIN
  SELECT p.id
    INTO v_caller_id
    FROM public.profiles p
    JOIN public.facilities f ON f.id = p.facility_id
   WHERE p.id = auth.uid()
     AND p.role IN ('PHARMA_I', 'PHARMA_II')
     AND p.status = 'ACTIVE'
     AND f.status = 'ACTIVE'
     AND f.facility_type = 'CHO';

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Only active CHO pharmacy staff can update inventory batches.'
      USING errcode = '42501';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity must be zero or higher.'
      USING errcode = '22023';
  END IF;

  IF p_threshold IS NULL OR p_threshold < 0 THEN
    RAISE EXCEPTION 'Threshold must be zero or higher.'
      USING errcode = '22023';
  END IF;

  IF nullif(btrim(coalesce(p_batch_number, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Batch number is required.'
      USING errcode = '22023';
  END IF;

  IF p_date_received IS NULL OR p_expiration_date IS NULL THEN
    RAISE EXCEPTION 'Date received and expiration date are required.'
      USING errcode = '22023';
  END IF;

  IF p_expiration_date <= p_date_received THEN
    RAISE EXCEPTION 'Expiration date must be later than date received.'
      USING errcode = '22023';
  END IF;

  SELECT *
    INTO v_existing
    FROM public.inventory i
   WHERE i.id = p_inventory_id
   FOR UPDATE;

  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Inventory batch not found.'
      USING errcode = 'P0001';
  END IF;

  UPDATE public.inventory
     SET supplier_id = p_supplier_id,
         quantity = p_quantity,
         threshold = p_threshold,
         batch_number = upper(btrim(p_batch_number)),
         date_received = p_date_received,
         expiration_date = p_expiration_date,
         po_number = coalesce(p_po_number, po_number),
         unit_cost = coalesce(p_unit_cost, unit_cost),
         brand_name = coalesce(p_brand_name, brand_name),
         updated_at = now()
   WHERE id = p_inventory_id;

  INSERT INTO public.activity_logs (user_id, action, module, details)
  VALUES (
    v_caller_id,
    'Stock Updated',
    'Inventory',
    'Updated inventory batch ' || upper(btrim(p_batch_number))
      || ': ' || p_quantity || ' units, threshold ' || p_threshold || '.'
  );

  RETURN p_inventory_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date, text, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date, text, numeric, text) TO authenticated;
