-- Migration: Drop Threshold Column from Inventory
-- Completes normalization of inventory thresholds by removing the redundant
-- threshold column from public.inventory and dropping the bridging triggers.
-- Thresholds are now exclusively managed in public.facility_medicine_thresholds.

-- 1. Drop bridging triggers and trigger functions
DROP TRIGGER IF EXISTS trg_fmt_cascade_to_inventory ON public.facility_medicine_thresholds;
DROP FUNCTION IF EXISTS public.fn_fmt_cascade_to_inventory() CASCADE;

DROP TRIGGER IF EXISTS trg_inventory_inherit_threshold ON public.inventory;
DROP FUNCTION IF EXISTS public.fn_inventory_inherit_threshold() CASCADE;

-- 2. Drop redundant threshold column from public.inventory
ALTER TABLE public.inventory DROP COLUMN IF EXISTS threshold;

-- 3. Update update_bhw_inventory_threshold RPC (upsert facility_medicine_thresholds only)
CREATE OR REPLACE FUNCTION public.update_bhw_inventory_threshold(
  p_medicine_id uuid,
  p_threshold integer,
  p_facility_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  medicine_id uuid,
  facility_id uuid,
  threshold integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_profile public.profiles%ROWTYPE;
  v_target_facility_id uuid;
  v_fmt_id uuid;
BEGIN
  -- Authenticate caller
  SELECT *
    INTO v_caller_profile
    FROM public.profiles p
   WHERE p.id = auth.uid()
     AND p.status = 'ACTIVE';

  IF v_caller_profile.id IS NULL THEN
    RAISE EXCEPTION 'An active user profile is required.'
      USING errcode = '42501';
  END IF;

  -- Validate role permissions
  IF v_caller_profile.role NOT IN ('BHW', 'PHARMA_I', 'PHARMA_II') THEN
    RAISE EXCEPTION 'Only BHWs or CHO pharmacy staff can update inventory thresholds.'
      USING errcode = '42501';
  END IF;

  -- Determine target facility:
  -- BHW can ONLY update their own facility.
  IF v_caller_profile.role = 'BHW' THEN
    IF v_caller_profile.facility_id IS NULL THEN
      RAISE EXCEPTION 'You must be assigned to a facility to update thresholds.'
        USING errcode = '42501';
    END IF;

    IF p_facility_id IS NOT NULL AND p_facility_id <> v_caller_profile.facility_id THEN
      RAISE EXCEPTION 'You can only edit inventory thresholds for your own barangay health station.'
        USING errcode = '42501';
    END IF;

    v_target_facility_id := v_caller_profile.facility_id;
  ELSE
    -- CHO Pharmacist can update their own or specified facility
    v_target_facility_id := COALESCE(p_facility_id, v_caller_profile.facility_id);
  END IF;

  -- Validate threshold
  IF p_threshold IS NULL OR p_threshold < 0 THEN
    RAISE EXCEPTION 'Threshold must be zero or higher.'
      USING errcode = '22023';
  END IF;

  -- Upsert into facility_medicine_thresholds (persisted even when stock is 0)
  INSERT INTO public.facility_medicine_thresholds (
    facility_id,
    medicine_id,
    threshold,
    is_custom,
    updated_at
  )
  VALUES (
    v_target_facility_id,
    p_medicine_id,
    p_threshold,
    true,
    NOW()
  )
  ON CONFLICT (facility_id, medicine_id) DO UPDATE
  SET threshold = EXCLUDED.threshold,
      is_custom = true,
      updated_at = EXCLUDED.updated_at
  RETURNING facility_medicine_thresholds.id INTO v_fmt_id;

  -- Log to activity logs
  INSERT INTO public.activity_logs (user_id, action, module, details)
  VALUES (
    auth.uid(),
    'Update Threshold',
    'Inventory',
    'Updated inventory threshold to ' || p_threshold || ' for medicine ' || p_medicine_id || ' at facility ' || v_target_facility_id
  );

  RETURN QUERY
  SELECT 
    fmt.id,
    fmt.medicine_id,
    fmt.facility_id,
    fmt.threshold
  FROM public.facility_medicine_thresholds fmt
  WHERE fmt.id = v_fmt_id;
END;
$$;

-- 4. Update approve_and_release_medicine_request RPC (insert without threshold column)
CREATE OR REPLACE FUNCTION public.approve_and_release_medicine_request(
  p_request_id uuid,
  p_allocations jsonb,
  p_remarks text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_allocation record;
  v_caller_id uuid;
  v_destination_inventory_id uuid;
  v_request public.medicine_requests%rowtype;
  v_item record;
  v_remaining_consumed integer;
  v_bhs_batch record;
  v_take_consumed integer;
BEGIN
  SELECT p.id
    INTO v_caller_id
    FROM public.profiles p
   WHERE p.id = auth.uid()
     AND p.role IN ('PHARMA_I', 'PHARMA_II')
     AND p.status = 'ACTIVE';

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Only active CHO pharmacy staff can release medicine requests.'
      USING errcode = '42501';
  END IF;

  SELECT *
    INTO v_request
    FROM public.medicine_requests r
   WHERE r.id = p_request_id
   FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Medicine request not found.'
      USING errcode = 'P0001';
  END IF;

  IF v_request.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Only pending requests can be released.'
      USING errcode = 'P0001';
  END IF;

  IF p_allocations IS NULL
     OR jsonb_typeof(p_allocations) <> 'array'
     OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Allocate at least one requested medicine before release.'
      USING errcode = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(p_allocations) AS a(
        request_item_id uuid,
        source_inventory_id uuid,
        quantity integer
      )
     WHERE a.request_item_id IS NULL
        OR a.source_inventory_id IS NULL
        OR a.quantity IS NULL
        OR a.quantity <= 0
  ) THEN
    RAISE EXCEPTION 'Every lot allocation requires a request item, CHO lot, and positive quantity.'
      USING errcode = '22023';
  END IF;

  PERFORM i.id
    FROM public.inventory i
   WHERE i.id IN (
     SELECT a.source_inventory_id
       FROM jsonb_to_recordset(p_allocations) AS a(
         request_item_id uuid,
         source_inventory_id uuid,
         quantity integer
       )
   )
   ORDER BY i.id
   FOR UPDATE;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(p_allocations) AS a(
        request_item_id uuid,
        source_inventory_id uuid,
        quantity integer
      )
      LEFT JOIN public.medicine_request_items ri
        ON ri.id = a.request_item_id
       AND ri.request_id = p_request_id
      LEFT JOIN public.inventory i
        ON i.id = a.source_inventory_id
      LEFT JOIN public.facilities f
        ON f.id = i.facility_id
     WHERE ri.id IS NULL
        OR i.id IS NULL
        OR f.facility_type <> 'CHO'
        OR f.status <> 'ACTIVE'
        OR i.medicine_id <> ri.medicine_id
        OR i.expiration_date <= CURRENT_DATE
  ) THEN
    RAISE EXCEPTION 'One or more selected lots cannot fulfill this request item.'
      USING errcode = 'P0001';
  END IF;

  IF EXISTS (
    WITH allocation_totals AS (
      SELECT a.request_item_id, SUM(a.quantity)::integer AS quantity
        FROM jsonb_to_recordset(p_allocations) AS a(
          request_item_id uuid,
          source_inventory_id uuid,
          quantity integer
        )
       GROUP BY a.request_item_id
    )
    SELECT 1
      FROM allocation_totals at
      JOIN public.medicine_request_items ri ON ri.id = at.request_item_id
     WHERE ri.request_id = p_request_id
       AND at.quantity > ri.quantity
  ) THEN
    RAISE EXCEPTION 'Release quantity cannot exceed requested quantity.'
      USING errcode = '22023';
  END IF;

  IF EXISTS (
    WITH batch_totals AS (
      SELECT a.source_inventory_id, SUM(a.quantity)::integer AS quantity
        FROM jsonb_to_recordset(p_allocations) AS a(
          request_item_id uuid,
          source_inventory_id uuid,
          quantity integer
        )
       GROUP BY a.source_inventory_id
    )
    SELECT 1
      FROM batch_totals bt
      JOIN public.inventory i ON i.id = bt.source_inventory_id
     WHERE bt.quantity > i.quantity
  ) THEN
    RAISE EXCEPTION 'Lot allocation exceeds current CHO stock. Refresh and try again.'
      USING errcode = 'P0001';
  END IF;

  -- Deduct past reported consumption from the requesting facility's inventory
  FOR v_item IN
    SELECT ri.id, ri.medicine_id, ri.consumed_quantity
      FROM public.medicine_request_items ri
     WHERE ri.request_id = p_request_id
       AND ri.consumed_quantity > 0
  LOOP
    v_remaining_consumed := v_item.consumed_quantity;

    FOR v_bhs_batch IN
      SELECT i.id, i.quantity
        FROM public.inventory i
       WHERE i.facility_id = v_request.facility_id
         AND i.medicine_id = v_item.medicine_id
         AND i.quantity > 0
       ORDER BY i.expiration_date ASC, i.date_received ASC, i.id ASC
       FOR UPDATE
    LOOP
      EXIT WHEN v_remaining_consumed <= 0;
      v_take_consumed := LEAST(v_bhs_batch.quantity, v_remaining_consumed);

      UPDATE public.inventory
         SET quantity = quantity - v_take_consumed,
             updated_at = NOW()
       WHERE id = v_bhs_batch.id;

      v_remaining_consumed := v_remaining_consumed - v_take_consumed;
    END LOOP;

    IF (v_item.consumed_quantity - v_remaining_consumed) > 0 THEN
      INSERT INTO public.activity_logs (user_id, action, module, details)
      VALUES (
        v_caller_id,
        'Inventory Deducted',
        'Medicine Request',
        'Deducted ' || (v_item.consumed_quantity - v_remaining_consumed) || ' past consumed units from facility ' || v_request.facility_id || ' based on paper requisition.'
      );
    END IF;
  END LOOP;

  -- Transfer allocated batches from CHO to BHS
  FOR v_allocation IN
    WITH allocation_rows AS (
      SELECT
        a.request_item_id,
        a.source_inventory_id,
        SUM(a.quantity)::integer AS quantity
      FROM jsonb_to_recordset(p_allocations) AS a(
        request_item_id uuid,
        source_inventory_id uuid,
        quantity integer
      )
      GROUP BY a.request_item_id, a.source_inventory_id
    )
    SELECT
      ar.request_item_id,
      ar.source_inventory_id,
      ar.quantity,
      i.medicine_id,
      i.batch_number,
      i.expiration_date,
      i.po_number,
      i.unit_cost,
      i.brand_name
    FROM allocation_rows ar
    JOIN public.inventory i ON i.id = ar.source_inventory_id
    ORDER BY i.expiration_date, i.date_received, i.id
  LOOP
    -- Ensure destination facility has a threshold record in facility_medicine_thresholds
    INSERT INTO public.facility_medicine_thresholds (facility_id, medicine_id, threshold, is_custom, updated_at)
    VALUES (v_request.facility_id, v_allocation.medicine_id, 50, false, NOW())
    ON CONFLICT (facility_id, medicine_id) DO NOTHING;

    INSERT INTO public.inventory (
      facility_id,
      medicine_id,
      quantity,
      batch_number,
      date_received,
      expiration_date,
      po_number,
      unit_cost,
      brand_name,
      updated_at
    )
    VALUES (
      v_request.facility_id,
      v_allocation.medicine_id,
      v_allocation.quantity,
      v_allocation.batch_number,
      CURRENT_DATE,
      v_allocation.expiration_date,
      v_allocation.po_number,
      v_allocation.unit_cost,
      v_allocation.brand_name,
      NOW()
    )
    ON CONFLICT ON CONSTRAINT uq_inventory_facility_batch
    DO UPDATE SET
      quantity = public.inventory.quantity + excluded.quantity,
      updated_at = NOW()
    RETURNING id INTO v_destination_inventory_id;

    UPDATE public.inventory
       SET quantity = quantity - v_allocation.quantity,
           updated_at = NOW()
     WHERE id = v_allocation.source_inventory_id;

    INSERT INTO public.medicine_request_fulfillments (
      request_id,
      request_item_id,
      source_inventory_id,
      destination_inventory_id,
      quantity,
      fulfilled_by
    )
    VALUES (
      p_request_id,
      v_allocation.request_item_id,
      v_allocation.source_inventory_id,
      v_destination_inventory_id,
      v_allocation.quantity,
      v_caller_id
    );
  END LOOP;

  UPDATE public.medicine_requests
     SET status = 'APPROVED',
         approved_by = v_caller_id,
         approved_at = NOW(),
         remarks = NULLIF(bTRIM(p_remarks), '')
   WHERE id = p_request_id;

  INSERT INTO public.activity_logs (user_id, action, module, details)
  VALUES (
    v_caller_id,
    'Request Approved',
    'Medicine Request',
    'Approved and released medicine request ' || p_request_id
  );

  RETURN p_request_id;
END;
$$;

-- 5. Update update_inventory_batch RPC (upsert facility_medicine_thresholds and remove inventory.threshold update)
CREATE OR REPLACE FUNCTION public.update_inventory_batch(
  p_inventory_id uuid,
  p_supplier_id uuid,
  p_quantity integer,
  p_threshold integer,
  p_batch_number text,
  p_date_received date,
  p_expiration_date date,
  p_po_number text DEFAULT NULL::text,
  p_unit_cost numeric DEFAULT NULL::numeric,
  p_brand_name text DEFAULT NULL::text,
  p_supplier_name text DEFAULT NULL::text,
  p_supplier_address text DEFAULT NULL::text,
  p_supplier_contact text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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

  IF p_threshold IS NOT NULL AND p_threshold < 0 THEN
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

  -- If threshold is provided, update or insert into facility_medicine_thresholds
  IF p_threshold IS NOT NULL THEN
    INSERT INTO public.facility_medicine_thresholds (facility_id, medicine_id, threshold, is_custom, updated_at)
    VALUES (v_existing.facility_id, v_existing.medicine_id, p_threshold, true, NOW())
    ON CONFLICT (facility_id, medicine_id)
    DO UPDATE SET
      threshold = EXCLUDED.threshold,
      is_custom = true,
      updated_at = NOW();
  END IF;

  UPDATE public.inventory
     SET quantity = p_quantity,
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
      || ': ' || p_quantity || ' units.'
  );

  RETURN p_inventory_id;
END;
$$;
