-- ==============================================================================
-- Migration: 2026-remove-suppliers-from-request-release-rpcs.sql
-- Description:
--   1. Updates get_request_release_batches RPC:
--      - Removes join on retired public.suppliers table
--      - Removes dependency on retired inventory.supplier_id column
--      - Returns active CHO inventory batches matching requested items for allocation preview
--   2. Updates approve_and_release_medicine_request RPC:
--      - Removes supplier_id column write when creating/updating destination inventory
--      - Updates conflict constraint target to uq_inventory_facility_batch
--      - Preserves brand_name, unit_cost, and po_number during fulfillment transfer
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_request_release_batches(p_request_id uuid)
RETURNS TABLE (
  request_item_id uuid,
  medicine_id uuid,
  source_inventory_id uuid,
  supplier_id uuid,
  supplier_name text,
  batch_number text,
  quantity integer,
  threshold integer,
  date_received date,
  expiration_date date,
  recommended_quantity integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.role IN ('PHARMA_I', 'PHARMA_II')
       AND p.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Only active CHO pharmacy staff can view release batches.'
      USING errcode = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.medicine_requests r
     WHERE r.id = p_request_id
  ) THEN
    RAISE EXCEPTION 'Medicine request not found.'
      USING errcode = 'P0001';
  END IF;

  RETURN QUERY
  WITH requested_items AS (
    SELECT
      ri.id AS request_item_id,
      ri.medicine_id,
      ri.quantity AS requested_quantity
    FROM public.medicine_request_items ri
    WHERE ri.request_id = p_request_id
  ),
  cho_batches AS (
    SELECT
      rb.request_item_id,
      rb.medicine_id,
      rb.requested_quantity,
      i.id AS source_inventory_id,
      NULL::uuid AS supplier_id,
      NULL::text AS supplier_name,
      i.batch_number,
      i.quantity,
      i.threshold,
      i.date_received,
      i.expiration_date,
      COALESCE(
        SUM(i.quantity) OVER (
          PARTITION BY rb.request_item_id
          ORDER BY i.expiration_date, i.date_received, i.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ),
        0
      ) AS prior_quantity
    FROM requested_items rb
    JOIN public.inventory i ON i.medicine_id = rb.medicine_id
    JOIN public.facilities f ON f.id = i.facility_id
    WHERE f.facility_type = 'CHO'
      AND f.status = 'ACTIVE'
      AND i.quantity > 0
      AND i.expiration_date > CURRENT_DATE
  )
  SELECT
    cb.request_item_id,
    cb.medicine_id,
    cb.source_inventory_id,
    cb.supplier_id,
    cb.supplier_name,
    cb.batch_number,
    cb.quantity,
    cb.threshold,
    cb.date_received,
    cb.expiration_date,
    GREATEST(
      LEAST(cb.quantity, cb.requested_quantity - cb.prior_quantity),
      0
    )::integer AS recommended_quantity
  FROM cho_batches cb
  ORDER BY cb.request_item_id, cb.expiration_date, cb.date_received, cb.source_inventory_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_request_release_batches(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_request_release_batches(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_request_release_batches(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_and_release_medicine_request(
  p_request_id uuid,
  p_allocations jsonb,
  p_remarks text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_allocation record;
  v_caller_id uuid;
  v_destination_inventory_id uuid;
  v_destination_threshold integer;
  v_request public.medicine_requests%rowtype;
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
    SELECT COALESCE(MAX(i.threshold), 0)
      INTO v_destination_threshold
      FROM public.inventory i
     WHERE i.facility_id = v_request.facility_id
       AND i.medicine_id = v_allocation.medicine_id;

    INSERT INTO public.inventory (
      facility_id,
      medicine_id,
      quantity,
      threshold,
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
      v_destination_threshold,
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
      quantity = public.inventory.quantity + EXCLUDED.quantity,
      po_number = COALESCE(EXCLUDED.po_number, public.inventory.po_number),
      unit_cost = COALESCE(EXCLUDED.unit_cost, public.inventory.unit_cost),
      brand_name = COALESCE(EXCLUDED.brand_name, public.inventory.brand_name),
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
         remarks = NULLIF(btrim(p_remarks), '')
   WHERE id = p_request_id;

  INSERT INTO public.activity_logs (user_id, action, module, details)
  VALUES (
    v_caller_id,
    'Request Approved',
    'Medicine Request',
    'Approved and released medicine request ' || p_request_id
  );

  INSERT INTO public.notifications (user_id, title, message)
  SELECT
    v_request.requested_by,
    'Request Ready for Pickup',
    'Your medicine request ' || UPPER(SUBSTR(p_request_id::text, 1, 8))
      || ' has been approved and is ready for pickup at CHO.'
  WHERE COALESCE(v_request.request_source, 'SYSTEM') = 'SYSTEM'
    AND v_request.requested_by IS NOT NULL;

  RETURN p_request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_and_release_medicine_request(uuid, jsonb, text) FROM public;
REVOKE ALL ON FUNCTION public.approve_and_release_medicine_request(uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_and_release_medicine_request(uuid, jsonb, text) TO authenticated;
