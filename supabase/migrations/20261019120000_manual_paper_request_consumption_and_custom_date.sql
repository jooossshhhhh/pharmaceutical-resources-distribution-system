/*
=====================================================
MIGRATION: Manual Paper Request Consumption and Custom Date

Adds:
1. paper_slip_reference to medicine_requests.
2. consumed_quantity to medicine_request_items.
3. Updates create_manual_medicine_request and create_manual_medicine_request_idempotent
   to support custom request_date and paper_slip_reference.
4. Updates approve_and_release_medicine_request to deduct past reported
   consumption from the requesting barangay health station's stock using FEFO.
=====================================================
*/

ALTER TABLE public.medicine_requests
    ADD COLUMN IF NOT EXISTS paper_slip_reference text;

ALTER TABLE public.medicine_request_items
    ADD COLUMN IF NOT EXISTS consumed_quantity integer DEFAULT 0;

CREATE OR REPLACE FUNCTION public.create_manual_medicine_request(
    p_facility_id uuid,
    p_items jsonb,
    p_manual_requested_by text DEFAULT NULL,
    p_remarks text DEFAULT NULL,
    p_request_date timestamptz DEFAULT NULL,
    p_paper_slip_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_request_id uuid;
BEGIN
    SELECT p.id
      INTO v_caller_id
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.role IN ('PHARMA_I', 'PHARMA_II')
       AND p.status = 'ACTIVE';

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Only active CHO staff can encode paper requests.'
            USING errcode = '42501';
    END IF;

    IF p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Add at least one medicine to the paper request.'
            USING errcode = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.facilities f
         WHERE f.id = p_facility_id
           AND f.status = 'ACTIVE'
           AND f.facility_type = 'HEALTH_CENTER'
    ) THEN
        RAISE EXCEPTION 'Choose an active barangay health center.'
            USING errcode = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM jsonb_to_recordset(p_items) AS x(medicine_id uuid, quantity integer, consumed_quantity integer)
         WHERE x.medicine_id IS NULL
            OR x.quantity IS NULL
            OR x.quantity <= 0
            OR (x.consumed_quantity IS NOT NULL AND x.consumed_quantity < 0)
            OR NOT EXISTS (SELECT 1 FROM public.medicines m WHERE m.id = x.medicine_id)
    ) THEN
        RAISE EXCEPTION 'Every paper request line requires a valid medicine and quantity.'
            USING errcode = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM (
              SELECT x.medicine_id
                FROM jsonb_to_recordset(p_items) AS x(medicine_id uuid)
               GROUP BY x.medicine_id
              HAVING count(*) > 1
          ) duplicated
    ) THEN
        RAISE EXCEPTION 'Each medicine can appear only once per paper request.'
            USING errcode = '22023';
    END IF;

    INSERT INTO public.medicine_requests (
        requested_by,
        facility_id,
        status,
        remarks,
        request_source,
        manual_requested_by,
        encoded_by,
        request_date,
        paper_slip_reference
    )
    VALUES (
        v_caller_id,
        p_facility_id,
        'PENDING',
        nullif(btrim(coalesce(p_remarks, '')), ''),
        'MANUAL_PAPER',
        nullif(btrim(coalesce(p_manual_requested_by, '')), ''),
        v_caller_id,
        coalesce(p_request_date, now()),
        nullif(btrim(coalesce(p_paper_slip_reference, '')), '')
    )
    RETURNING id INTO v_request_id;

    INSERT INTO public.medicine_request_items (
        request_id,
        medicine_id,
        quantity,
        consumed_quantity
    )
    SELECT v_request_id,
           x.medicine_id,
           x.quantity,
           coalesce(x.consumed_quantity, 0)
      FROM jsonb_to_recordset(p_items) AS x(medicine_id uuid, quantity integer, consumed_quantity integer);

    INSERT INTO public.activity_logs (user_id, action, module, details)
    VALUES (
        v_caller_id,
        'Paper Request Encoded',
        'Medicine Request',
        'Encoded paper medicine request ' || v_request_id || coalesce(' (Ref: ' || p_paper_slip_reference || ')', '') || '.'
    );

    RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_medicine_request(uuid, jsonb, text, text, timestamptz, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_medicine_request(uuid, jsonb, text, text, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_manual_medicine_request_idempotent(
    p_operation_id uuid,
    p_facility_id uuid,
    p_items jsonb,
    p_manual_requested_by text DEFAULT NULL,
    p_remarks text DEFAULT NULL,
    p_request_date timestamptz DEFAULT NULL,
    p_paper_slip_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_request_id uuid;
BEGIN
    v_request_id := private.claim_offline_operation(p_operation_id, 'MANUAL_MEDICINE_REQUEST');
    IF v_request_id IS NOT NULL THEN
        RETURN v_request_id;
    END IF;

    v_request_id := public.create_manual_medicine_request(
        p_facility_id,
        p_items,
        p_manual_requested_by,
        p_remarks,
        p_request_date,
        p_paper_slip_reference
    );

    UPDATE private.offline_operation_receipts
       SET result_id = v_request_id
     WHERE user_id = auth.uid()
       AND operation_id = p_operation_id;

    RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_medicine_request_idempotent(uuid, uuid, jsonb, text, text, timestamptz, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_medicine_request_idempotent(uuid, uuid, jsonb, text, text, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_and_release_medicine_request(
  p_request_id uuid,
  p_allocations jsonb,
  p_remarks text DEFAULT NULL
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
$function$;

REVOKE ALL ON FUNCTION public.approve_and_release_medicine_request(uuid, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_and_release_medicine_request(uuid, jsonb, text) TO authenticated;
