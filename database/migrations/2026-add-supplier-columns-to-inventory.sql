-- =========================================================================
-- Migration: Add Supplier Columns Directly to Inventory Table
-- Description:
--   1. Adds supplier_name, supplier_address, and supplier_contact directly to
--      public.inventory to preserve vendor traceability per batch without
--      requiring an external suppliers table.
--   2. Updates public.update_inventory_batch RPC to accept and persist supplier
--      metadata with default parameters for full backwards-compatibility.
-- =========================================================================

-- 1. Add supplier columns to inventory table
ALTER TABLE public.inventory 
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS supplier_address text,
  ADD COLUMN IF NOT EXISTS supplier_contact text;

-- 2. Drop older function overloads to prevent parameter default / ambiguity conflicts
DROP FUNCTION IF EXISTS public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date);
DROP FUNCTION IF EXISTS public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date, text, numeric);
DROP FUNCTION IF EXISTS public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date, text, numeric, text);
DROP FUNCTION IF EXISTS public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date, text, numeric, text, text, text, text);

-- 3. Create canonical update_inventory_batch RPC with supplier metadata support
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
  p_brand_name text default null,
  p_supplier_name text default null,
  p_supplier_address text default null,
  p_supplier_contact text default null
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
     SET quantity = p_quantity,
         threshold = p_threshold,
         batch_number = upper(btrim(p_batch_number)),
         date_received = p_date_received,
         expiration_date = p_expiration_date,
         po_number = coalesce(p_po_number, po_number),
         unit_cost = coalesce(p_unit_cost, unit_cost),
         brand_name = coalesce(p_brand_name, brand_name),
         supplier_name = coalesce(p_supplier_name, supplier_name),
         supplier_address = coalesce(p_supplier_address, supplier_address),
         supplier_contact = coalesce(p_supplier_contact, supplier_contact),
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

REVOKE ALL ON FUNCTION public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date, text, numeric, text, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date, text, numeric, text, text, text, text) TO authenticated;
