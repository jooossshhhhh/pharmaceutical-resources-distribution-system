-- =========================================================================
-- Migration: Clear Operational Data & Retire Suppliers Table
-- =========================================================================

-- 1. Truncate operational dispensing, requests, returns, inventory, logs & notifications
TRUNCATE TABLE 
  public.medicine_dispensing,
  public.dispensing_idempotency_keys,
  public.medicine_request_fulfillments,
  public.medicine_request_items,
  public.medicine_requests,
  public.stock_returns,
  public.inventory,
  public.activity_logs,
  public.notifications
RESTART IDENTITY CASCADE;

-- 2. Drop foreign key constraint referencing suppliers from inventory
ALTER TABLE public.inventory 
  DROP CONSTRAINT IF EXISTS inventory_supplier_id_fkey;

-- 3. Drop supplier_id column from inventory
ALTER TABLE public.inventory 
  DROP COLUMN IF EXISTS supplier_id;

-- 4. Drop suppliers table
DROP TABLE IF EXISTS public.suppliers CASCADE;

-- 5. Update update_inventory_batch RPC (removing retired supplier_id column write)
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
     SET quantity = p_quantity,
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
