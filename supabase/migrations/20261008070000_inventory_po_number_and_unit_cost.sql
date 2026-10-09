-- =====================================================
-- Migration: Add PO Number and Unit Cost to Inventory
-- Supports PO batch receiving and lot-specific acquisition pricing
-- =====================================================

ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS po_number text,
ADD COLUMN IF NOT EXISTS unit_cost numeric(10,2);

CREATE INDEX IF NOT EXISTS idx_inventory_po_number 
ON public.inventory(po_number);

-- Update update_inventory_batch RPC to support po_number and unit_cost
CREATE OR REPLACE FUNCTION public.update_inventory_batch(
  p_inventory_id uuid,
  p_supplier_id uuid,
  p_quantity integer,
  p_threshold integer,
  p_batch_number text,
  p_date_received date,
  p_expiration_date date,
  p_po_number text default null,
  p_unit_cost numeric default null
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

-- Backward-compatible overload with 7 parameters
CREATE OR REPLACE FUNCTION public.update_inventory_batch(
  p_inventory_id uuid,
  p_supplier_id uuid,
  p_quantity integer,
  p_threshold integer,
  p_batch_number text,
  p_date_received date,
  p_expiration_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.update_inventory_batch(
    p_inventory_id,
    p_supplier_id,
    p_quantity,
    p_threshold,
    p_batch_number,
    p_date_received,
    p_expiration_date,
    null,
    null
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date, text, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date, text, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_inventory_batch(uuid, uuid, integer, integer, text, date, date) TO authenticated;
