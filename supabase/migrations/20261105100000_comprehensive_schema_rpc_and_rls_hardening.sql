-- Comprehensive Schema, Constraint, View, RLS, Grant, and RPC Hardening Migration

-- 1. Schema & Constraint Alignment
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS origin_facility_id uuid REFERENCES public.facilities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_origin_facility_id
  ON public.inventory USING btree (origin_facility_id);

ALTER TABLE public.other_programs
  DROP CONSTRAINT IF EXISTS other_programs_status_check;

ALTER TABLE public.other_programs
  ADD CONSTRAINT other_programs_status_check
  CHECK (status = ANY (ARRAY['UPCOMING'::text, 'ONGOING'::text, 'COMPLETED'::text, 'CANCELLED'::text]));

UPDATE public.other_programs
   SET status = 'ONGOING',
       updated_at = pg_catalog.now()
 WHERE status = 'UPCOMING'
   AND started_at IS NOT NULL
   AND completed_at IS NULL
   AND cancelled_at IS NULL;

-- 2. Drop Redundant Duplicate Indexes
DROP INDEX IF EXISTS public.idx_fmt_facility_medicine;
DROP INDEX IF EXISTS public.idx_facilities_code;

-- 3. Fix monthly_dispensing_summary View to Exclude Voided Transactions
CREATE OR REPLACE VIEW public.monthly_dispensing_summary WITH (security_invoker = true) AS
SELECT
  facility_id,
  medicine_id,
  (date_trunc('month'::text, dispense_date))::date AS month,
  sum(quantity) AS total_dispensed
FROM public.medicine_dispensing
WHERE COALESCE(record_type, 'LIVE_DISPENSING'::text) <> 'HISTORY_ONLY'::text
  AND voided_at IS NULL
GROUP BY facility_id, medicine_id, ((date_trunc('month'::text, dispense_date))::date);

-- 4. Revoke Excessive anon Grants
REVOKE ALL ON TABLE public.facility_medicine_thresholds FROM anon;
REVOKE ALL ON TABLE public.stock_returns FROM anon;
REVOKE ALL ON TABLE public.low_stock_view FROM anon;
REVOKE ALL ON TABLE public.patient_medicine_records FROM anon;
REVOKE ALL ON TABLE public.monthly_dispensing_summary FROM anon;

-- 5. Harden RLS Policies to Strictly Require status = 'ACTIVE' via Helper Functions
DROP POLICY IF EXISTS stock_returns_select_for_roles ON public.stock_returns;
CREATE POLICY stock_returns_select_for_roles
  ON public.stock_returns
  FOR SELECT
  TO authenticated
  USING (
    public.is_pharma_i()
    OR public.is_pharma_ii()
    OR (public.is_bhw() AND public.is_same_facility(facility_id))
  );

DROP POLICY IF EXISTS stock_returns_insert_for_roles ON public.stock_returns;
CREATE POLICY stock_returns_insert_for_roles
  ON public.stock_returns
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_pharma_i()
    OR public.is_pharma_ii()
    OR (public.is_bhw() AND public.is_same_facility(facility_id))
  );

DROP POLICY IF EXISTS stock_returns_update_for_pharma ON public.stock_returns;
CREATE POLICY stock_returns_update_for_pharma
  ON public.stock_returns
  FOR UPDATE
  TO authenticated
  USING (public.is_pharma_i() OR public.is_pharma_ii())
  WITH CHECK (public.is_pharma_i() OR public.is_pharma_ii());

DROP POLICY IF EXISTS stock_returns_delete_for_pharma ON public.stock_returns;
CREATE POLICY stock_returns_delete_for_pharma
  ON public.stock_returns
  FOR DELETE
  TO authenticated
  USING (public.is_pharma_i() OR public.is_pharma_ii());

DROP POLICY IF EXISTS view_programs ON public.other_programs;
CREATE POLICY view_programs
  ON public.other_programs
  FOR SELECT
  TO authenticated
  USING (
    public.is_pharma_i()
    OR public.is_pharma_ii()
    OR public.is_bhw()
  );

DROP POLICY IF EXISTS view_program_medicines ON public.program_medicines;
CREATE POLICY view_program_medicines
  ON public.program_medicines
  FOR SELECT
  TO authenticated
  USING (
    public.is_pharma_i()
    OR public.is_pharma_ii()
    OR public.is_bhw()
  );

DROP POLICY IF EXISTS "Allow read facility_medicine_thresholds for authenticated users" ON public.facility_medicine_thresholds;
CREATE POLICY "Allow read facility_medicine_thresholds for authenticated users"
  ON public.facility_medicine_thresholds
  FOR SELECT
  TO authenticated
  USING (
    public.is_pharma_i()
    OR public.is_pharma_ii()
    OR (public.is_bhw() AND public.is_same_facility(facility_id))
  );

-- 6. Drop Ambiguous Legacy Overloaded Function Signatures
DROP FUNCTION IF EXISTS public.complete_other_program(uuid);
DROP FUNCTION IF EXISTS public.create_manual_medicine_request(uuid, jsonb, text, text);
DROP FUNCTION IF EXISTS public.create_manual_medicine_request_idempotent(uuid, uuid, jsonb, text, text);

-- 7. Harden & Fix RPC Functions

-- 7a. approve_and_release_medicine_request (Add SET search_path TO '', exclude RETURN/non-ACTIVE lots, copy supplier metadata)
CREATE OR REPLACE FUNCTION public.approve_and_release_medicine_request(
  p_request_id uuid,
  p_allocations jsonb,
  p_remarks text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
        OR COALESCE(i.status, 'ACTIVE') <> 'ACTIVE'
        OR COALESCE(i.intake_type, 'PROCUREMENT') = 'RETURN'
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
      i.brand_name,
      i.supplier_name,
      i.supplier_address,
      i.supplier_contact
    FROM allocation_rows ar
    JOIN public.inventory i ON i.id = ar.source_inventory_id
    ORDER BY i.expiration_date, i.date_received, i.id
  LOOP
    INSERT INTO public.facility_medicine_thresholds (facility_id, medicine_id, threshold, is_custom, updated_at)
    VALUES (v_request.facility_id, v_allocation.medicine_id, 50, false, NOW())
    ON CONFLICT ON CONSTRAINT uq_facility_medicine_threshold DO NOTHING;

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
      supplier_name,
      supplier_address,
      supplier_contact,
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
      v_allocation.supplier_name,
      v_allocation.supplier_address,
      v_allocation.supplier_contact,
      NOW()
    )
    ON CONFLICT ON CONSTRAINT uq_inventory_facility_batch
    DO UPDATE SET
      quantity = public.inventory.quantity + excluded.quantity,
      unit_cost = COALESCE(excluded.unit_cost, public.inventory.unit_cost),
      brand_name = COALESCE(excluded.brand_name, public.inventory.brand_name),
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

  RETURN p_request_id;
END;
$function$;

-- 7b. update_inventory_batch (Add SET search_path TO '')
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
SET search_path TO ''
AS $function$
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

  IF p_threshold IS NOT NULL THEN
    INSERT INTO public.facility_medicine_thresholds (facility_id, medicine_id, threshold, is_custom, updated_at)
    VALUES (v_existing.facility_id, v_existing.medicine_id, p_threshold, true, NOW())
    ON CONFLICT ON CONSTRAINT uq_facility_medicine_threshold
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
$function$;

-- 7c. confirm_request_received (Add #variable_conflict use_column & filter p.status = 'ACTIVE' on notifications)
CREATE OR REPLACE FUNCTION public.confirm_request_received(request_id uuid)
RETURNS TABLE(id uuid, status public.request_status, received_by uuid, received_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
    caller_profile public.profiles%rowtype;
    request_record public.medicine_requests%rowtype;
    target_request_id alias for $1;
begin
    select *
      into caller_profile
      from public.profiles p
     where p.id = auth.uid()
       and p.status = 'ACTIVE';

    if caller_profile.id is null then
        raise exception 'An active user profile is required.'
          using errcode = '42501';
    end if;

    if caller_profile.role not in ('BHW', 'PHARMA_I', 'PHARMA_II') then
        raise exception 'Only BHW or CHO pharmacy staff can complete requests.'
          using errcode = '42501';
    end if;

    select *
      into request_record
      from public.medicine_requests r
     where r.id = target_request_id
     for update;

    if request_record.id is null then
        raise exception 'Medicine request not found.'
          using errcode = 'P0001';
    end if;

    if caller_profile.role = 'BHW' and request_record.facility_id <> caller_profile.facility_id then
        raise exception 'You can only confirm receipt for requests from your own facility.'
          using errcode = '42501';
    end if;

    if request_record.status <> 'APPROVED' then
        raise exception 'Only approved requests can be marked as completed.'
          using errcode = 'P0001';
    end if;

    return query
        update public.medicine_requests
           set status = 'COMPLETED',
               received_by = auth.uid(),
               received_at = now()
         where medicine_requests.id = target_request_id
           and medicine_requests.status = 'APPROVED'
         returning
               medicine_requests.id,
               medicine_requests.status,
               medicine_requests.received_by,
               medicine_requests.received_at;

    insert into public.activity_logs (user_id, action, module, details)
    values (
        auth.uid(),
        'Request Completed',
        'Medicine Request',
        'Completed medicine request ' || target_request_id || ' by ' || caller_profile.role
    );

    if caller_profile.role = 'BHW' then
        insert into public.notifications (user_id, title, message)
        select
            p.id,
            'Request Received',
            'The medicine request ' || upper(substr(target_request_id::text, 1, 8))
                || ' has been received by ' || (
                    select f.facility_name
                      from public.facilities f
                     where f.id = caller_profile.facility_id
                ) || '.'
          from public.profiles p
         where p.role in ('PHARMA_I', 'PHARMA_II')
           and p.status = 'ACTIVE';
    else
        insert into public.notifications (user_id, title, message)
        select
            request_record.requested_by,
            'Request Completed',
            'Your medicine request ' || upper(substr(target_request_id::text, 1, 8))
                || ' has been marked as Completed.'
          where coalesce(request_record.request_source, 'SYSTEM') = 'SYSTEM'
            and request_record.requested_by is not null;
    end if;
end;
$function$;

-- 7d. get_request_release_batches (Add #variable_conflict use_column & filter out RETURN / non-ACTIVE lots)
CREATE OR REPLACE FUNCTION public.get_request_release_batches(p_request_id uuid)
RETURNS TABLE(
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
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
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
      i.supplier_name AS supplier_name,
      i.batch_number,
      i.quantity,
      COALESCE(fmt.threshold, 0) AS threshold,
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
    LEFT JOIN public.facility_medicine_thresholds fmt
      ON fmt.facility_id = i.facility_id AND fmt.medicine_id = i.medicine_id
    WHERE f.facility_type = 'CHO'
      AND f.status = 'ACTIVE'
      AND COALESCE(i.status, 'ACTIVE') = 'ACTIVE'
      AND COALESCE(i.intake_type, 'PROCUREMENT') <> 'RETURN'
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
$function$;

-- 7e. get_cho_inventory_medicines (Unify reservations across medicine_requests AND other_programs, exclude RETURN lots)
CREATE OR REPLACE FUNCTION public.get_cho_inventory_medicines()
RETURNS TABLE(
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
SET search_path TO ''
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH physical_stock AS (
    SELECT
      i.medicine_id,
      SUM(i.quantity)::bigint AS quantity,
      STRING_AGG(DISTINCT NULLIF(TRIM(i.brand_name), ''), ', ') AS brand_name
    FROM public.inventory i
    JOIN public.facilities f ON f.id = i.facility_id
    WHERE f.facility_type = 'CHO'
      AND f.status = 'ACTIVE'
      AND COALESCE(i.status, 'ACTIVE') = 'ACTIVE'
      AND COALESCE(i.intake_type, 'PROCUREMENT') <> 'RETURN'
      AND i.quantity > 0
      AND (i.expiration_date IS NULL OR i.expiration_date > CURRENT_DATE)
    GROUP BY i.medicine_id
    HAVING SUM(i.quantity) > 0
  ),
  request_reserved AS (
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
  ),
  program_reserved AS (
    SELECT pm.medicine_id, SUM(pm.quantity_allocated)::bigint AS quantity
      FROM public.program_medicines pm
      JOIN public.other_programs op ON op.id = pm.program_id
      JOIN public.facilities f ON f.id = op.facility_id
     WHERE f.facility_type = 'CHO'
       AND f.status = 'ACTIVE'
       AND op.status IN ('UPCOMING', 'ONGOING')
       AND pm.quantity_allocated > 0
     GROUP BY pm.medicine_id
  ),
  reserved_stock AS (
    SELECT
       COALESCE(rr.medicine_id, pr.medicine_id) AS medicine_id,
      (COALESCE(rr.quantity, 0) + COALESCE(pr.quantity, 0))::bigint AS quantity
    FROM request_reserved rr
    FULL OUTER JOIN program_reserved pr ON pr.medicine_id = rr.medicine_id
  )
  SELECT
    m.id,
    m.generic_name,
    ps.brand_name AS brand_name,
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
$function$;

-- 7f. submit_bhw_medicine_request (Respect both medicine_requests and other_programs reservations, exclude RETURN/non-ACTIVE lots)
CREATE OR REPLACE FUNCTION public.submit_bhw_medicine_request(
  p_items jsonb,
  p_remarks text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_available_quantity bigint;
  v_facility_id uuid;
  v_item record;
  v_physical_quantity bigint;
  v_profile_id uuid;
  v_request_id uuid;
  v_request_reserved bigint;
  v_program_reserved bigint;
  v_reserved_quantity bigint;
begin
  select p.id, p.facility_id
    into v_profile_id, v_facility_id
    from public.profiles p
    join public.facilities f on f.id = p.facility_id
   where p.id = auth.uid()
     and p.role = 'BHW'
     and p.status = 'ACTIVE'
     and f.facility_type = 'HEALTH_CENTER'
     and f.status = 'ACTIVE';

  if v_profile_id is null or v_facility_id is null then
    raise exception 'An active BHW account assigned to an active health center is required.'
      using errcode = '42501';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one medicine to the request.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
     where item.medicine_id is null or item.quantity is null or item.quantity <= 0
  ) then
    raise exception 'Every request item requires a medicine and a positive whole-number quantity.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
     group by item.medicine_id
    having count(*) > 1
  ) then
    raise exception 'Each medicine can appear only once per request.'
      using errcode = '23505';
  end if;

  perform i.id
    from public.inventory i
    join public.facilities f on f.id = i.facility_id
   where f.facility_type = 'CHO'
     and f.status = 'ACTIVE'
     and i.medicine_id in (
       select item.medicine_id
         from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
     )
   order by i.id
   for update of i;

  for v_item in
    select item.medicine_id, item.quantity
      from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer)
  loop
    select coalesce(sum(i.quantity), 0)::bigint
      into v_physical_quantity
      from public.inventory i
      join public.facilities f on f.id = i.facility_id
     where f.facility_type = 'CHO'
       and f.status = 'ACTIVE'
       and coalesce(i.status, 'ACTIVE') = 'ACTIVE'
       and coalesce(i.intake_type, 'PROCUREMENT') <> 'RETURN'
       and i.expiration_date > current_date
       and i.medicine_id = v_item.medicine_id;

    select coalesce(sum(ri.quantity), 0)::bigint
      into v_request_reserved
      from public.medicine_request_items ri
      join public.medicine_requests r on r.id = ri.request_id
     where ri.medicine_id = v_item.medicine_id
       and (
         r.status = 'PENDING'
         or (
           r.status = 'APPROVED'
           and not exists (
             select 1
               from public.medicine_request_fulfillments mf
              where mf.request_item_id = ri.id
           )
         )
       );

    select coalesce(sum(pm.quantity_allocated), 0)::bigint
      into v_program_reserved
      from public.program_medicines pm
      join public.other_programs op on op.id = pm.program_id
      join public.facilities f on f.id = op.facility_id
     where f.facility_type = 'CHO'
       and f.status = 'ACTIVE'
       and op.status in ('UPCOMING', 'ONGOING')
       and pm.medicine_id = v_item.medicine_id
       and pm.quantity_allocated > 0;

    v_reserved_quantity := v_request_reserved + v_program_reserved;
    v_available_quantity := greatest(v_physical_quantity - v_reserved_quantity, 0);

    if v_physical_quantity <= 0 then
      raise exception 'The selected medicine is not currently stocked at CHO.'
        using errcode = 'P0001';
    end if;

    if v_item.quantity > v_available_quantity then
      raise exception 'Requested quantity exceeds the % units currently available at CHO.',
        v_available_quantity
        using errcode = 'P0001';
    end if;
  end loop;

  insert into public.medicine_requests (requested_by, facility_id, remarks)
  values (v_profile_id, v_facility_id, nullif(btrim(p_remarks), ''))
  returning id into v_request_id;

  insert into public.medicine_request_items (request_id, medicine_id, quantity)
  select v_request_id, item.medicine_id, item.quantity
    from jsonb_to_recordset(p_items) as item(medicine_id uuid, quantity integer);

  insert into public.activity_logs (user_id, action, module, details)
  values (
    v_profile_id,
    'Medicine Request Submitted',
    'Medicine Request',
    'Submitted medicine request ' || v_request_id
  );

  return v_request_id;
end;
$function$;

-- 7g. save_other_program (Respect both other_programs and medicine_requests reservations, exclude RETURN/non-ACTIVE lots)
CREATE OR REPLACE FUNCTION public.save_other_program(
  p_program_id uuid DEFAULT NULL::uuid,
  p_program_name text DEFAULT NULL::text,
  p_program_date date DEFAULT NULL::date,
  p_description text DEFAULT NULL::text,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_program public.other_programs%rowtype;
  v_facility_id uuid;
  v_item jsonb;
  v_medicine_id uuid;
  v_quantity integer;
  v_stock integer;
  v_program_reserved integer;
  v_request_reserved integer;
  v_reserved integer;
begin
  if auth.uid() is null or not (public.is_pharma_i() or public.is_pharma_ii()) then
    raise exception 'Only CHO pharmacists can manage Other Programs.' using errcode = '42501';
  end if;

  if nullif(pg_catalog.btrim(p_program_name), '') is null or p_program_date is null then
    raise exception 'Program name and date are required.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one program medicine is required.' using errcode = '22023';
  end if;

  select facility_id into v_facility_id from public.profiles where id = auth.uid();
  if v_facility_id is null then
    raise exception 'Your account is not assigned to a facility.' using errcode = '22023';
  end if;

  if p_program_id is null then
    insert into public.other_programs (facility_id, program_name, program_date, description, status)
    values (v_facility_id, pg_catalog.btrim(p_program_name), p_program_date, nullif(pg_catalog.btrim(p_description), ''), 'UPCOMING')
    returning * into v_program;
  else
    select * into v_program from public.other_programs where id = p_program_id for update;
    if not found then
      insert into public.other_programs (id, facility_id, program_name, program_date, description, status)
      values (p_program_id, v_facility_id, pg_catalog.btrim(p_program_name), p_program_date, nullif(pg_catalog.btrim(p_description), ''), 'UPCOMING')
      returning * into v_program;
    else
      if v_program.status not in ('UPCOMING', 'ONGOING') then
        raise exception 'Only upcoming or ongoing programs can be edited.' using errcode = '22023';
      end if;
      if v_program.facility_id is not null and v_program.facility_id <> v_facility_id then
        raise exception 'This program belongs to another facility.' using errcode = '42501';
      end if;

      update public.other_programs
      set facility_id = coalesce(v_program.facility_id, v_facility_id),
          program_name = pg_catalog.btrim(p_program_name),
          program_date = p_program_date,
          description = nullif(pg_catalog.btrim(p_description), ''),
          updated_at = pg_catalog.now()
      where id = p_program_id
      returning * into v_program;
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_medicine_id := nullif(v_item->>'medicine_id', '')::uuid;
    v_quantity := coalesce((v_item->>'quantity_allocated')::integer, (v_item->>'quantity_used')::integer);
    if v_medicine_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception 'Each program medicine needs a positive allocated quantity.' using errcode = '22023';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_program.facility_id::text || ':' || v_medicine_id::text, 0)
    );

    select coalesce(sum(quantity), 0)::integer into v_stock
    from public.inventory
    where facility_id = v_program.facility_id
      and medicine_id = v_medicine_id
      and coalesce(status, 'ACTIVE') = 'ACTIVE'
      and coalesce(intake_type, 'PROCUREMENT') <> 'RETURN'
      and quantity > 0
      and (expiration_date is null or expiration_date >= current_date);

    select coalesce(sum(pm.quantity_allocated), 0)::integer into v_program_reserved
    from public.program_medicines pm
    join public.other_programs op on op.id = pm.program_id
    where op.facility_id = v_program.facility_id
      and op.status in ('UPCOMING', 'ONGOING')
      and op.id <> v_program.id
      and pm.medicine_id = v_medicine_id
      and pm.quantity_allocated > 0;

    select coalesce(sum(ri.quantity), 0)::integer into v_request_reserved
    from public.medicine_request_items ri
    join public.medicine_requests r on r.id = ri.request_id
    where ri.medicine_id = v_medicine_id
      and r.status in ('PENDING', 'APPROVED')
      and not exists (
        select 1
        from public.medicine_request_fulfillments mf
        where mf.request_item_id = ri.id
      );

    v_reserved := v_program_reserved + v_request_reserved;

    if v_stock - v_reserved < v_quantity then
      raise exception 'Insufficient available CHO stock for the selected medicine.' using errcode = '22003';
    end if;
  end loop;

  update public.program_medicines
  set quantity_allocated = 0,
      quantity_returned = 0
  where program_id = v_program.id
    and medicine_id not in (
      select (item->>'medicine_id')::uuid
      from jsonb_array_elements(p_items) as item
      where nullif(item->>'medicine_id', '') is not null
    );

  insert into public.program_medicines (program_id, medicine_id, quantity_allocated, quantity_returned, quantity_used)
  select
    v_program.id,
    (item->>'medicine_id')::uuid,
    coalesce((item->>'quantity_allocated')::integer, (item->>'quantity_used')::integer),
    0,
    coalesce((item->>'quantity_allocated')::integer, (item->>'quantity_used')::integer)
  from jsonb_array_elements(p_items) as item
  on conflict (program_id, medicine_id) do update
  set quantity_allocated = excluded.quantity_allocated,
      quantity_returned = 0,
      quantity_used = excluded.quantity_used;

  return v_program.id;
end;
$function$;

-- 7h. complete_other_program (Single unified signature with default p_returns, exclude RETURN/non-ACTIVE lots)
CREATE OR REPLACE FUNCTION public.complete_other_program(
  p_program_id uuid,
  p_returns jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_program public.other_programs%rowtype;
  v_item record;
  v_inventory record;
  v_allocated integer;
  v_returned integer;
  v_dispensed integer;
  v_remaining integer;
  v_take integer;
  v_stock integer;
  v_reserved integer;
  v_total_allocated integer := 0;
  v_total_returned integer := 0;
  v_total_dispensed integer := 0;
begin
  if auth.uid() is null or not (public.is_pharma_i() or public.is_pharma_ii()) then
    raise exception 'Only CHO pharmacists can complete Other Programs.' using errcode = '42501';
  end if;

  select * into v_program from public.other_programs where id = p_program_id for update;
  if not found then
    raise exception 'Program was not found.' using errcode = 'P0002';
  end if;

  if v_program.status = 'COMPLETED' then
    return jsonb_build_object('program_id', v_program.id, 'status', 'COMPLETED');
  end if;

  if v_program.status not in ('UPCOMING', 'ONGOING') then
    raise exception 'Only upcoming or ongoing programs can be completed.' using errcode = '22023';
  end if;

  if v_program.facility_id is null then
    raise exception 'This program has no dispensing facility.' using errcode = '22023';
  end if;

  for v_item in
    select id, medicine_id, quantity_allocated, quantity_used
    from public.program_medicines
    where program_id = v_program.id
      and quantity_allocated > 0
    for update
  loop
    v_allocated := v_item.quantity_allocated;

    select coalesce((ret.value->>'quantity_returned')::integer, 0)
    into v_returned
    from jsonb_array_elements(coalesce(p_returns, '[]'::jsonb)) as ret(value)
    where nullif(ret.value->>'medicine_id', '')::uuid = v_item.medicine_id
    limit 1;

    v_returned := coalesce(v_returned, 0);

    if v_returned < 0 or v_returned > v_allocated then
      raise exception 'Returned quantity must be between 0 and the allocated quantity (%).', v_allocated using errcode = '22023';
    end if;

    v_dispensed := v_allocated - v_returned;
    v_total_allocated := v_total_allocated + v_allocated;
    v_total_returned := v_total_returned + v_returned;
    v_total_dispensed := v_total_dispensed + v_dispensed;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_program.facility_id::text || ':' || v_item.medicine_id::text, 0)
    );

    if v_dispensed > 0 then
      select coalesce(sum(quantity), 0)::integer into v_stock
      from public.inventory
      where facility_id = v_program.facility_id
        and medicine_id = v_item.medicine_id
        and coalesce(status, 'ACTIVE') = 'ACTIVE'
        and coalesce(intake_type, 'PROCUREMENT') <> 'RETURN'
        and quantity > 0
        and (expiration_date is null or expiration_date >= current_date);

      select coalesce(sum(pm.quantity_allocated), 0)::integer into v_reserved
      from public.program_medicines pm
      join public.other_programs op on op.id = pm.program_id
      where op.facility_id = v_program.facility_id
        and op.status in ('UPCOMING', 'ONGOING')
        and op.id <> v_program.id
        and pm.medicine_id = v_item.medicine_id
        and pm.quantity_allocated > 0;

      if v_stock - v_reserved < v_dispensed then
        raise exception 'CHO stock is no longer sufficient to complete this program.' using errcode = '22003';
      end if;

      v_remaining := v_dispensed;
      for v_inventory in
        select id, quantity
        from public.inventory
        where facility_id = v_program.facility_id
          and medicine_id = v_item.medicine_id
          and coalesce(status, 'ACTIVE') = 'ACTIVE'
          and coalesce(intake_type, 'PROCUREMENT') <> 'RETURN'
          and quantity > 0
          and (expiration_date is null or expiration_date >= current_date)
        order by expiration_date asc nulls last, date_received asc nulls last, id
        for update
      loop
        exit when v_remaining = 0;
        v_take := least(v_remaining, v_inventory.quantity);
        update public.inventory
           set quantity = quantity - v_take,
               updated_at = pg_catalog.now()
         where id = v_inventory.id;
        v_remaining := v_remaining - v_take;
      end loop;
    end if;

    begin
      update public.program_medicines
      set quantity_allocated = v_allocated,
          quantity_returned = v_returned,
          quantity_used = v_dispensed
      where id = v_item.id;
    exception when check_violation then
      update public.program_medicines
      set quantity_allocated = v_allocated,
          quantity_returned = v_returned,
          quantity_used = greatest(v_dispensed, 1)
      where id = v_item.id;
    end;
  end loop;

  update public.other_programs
  set status = 'COMPLETED',
      started_at = coalesce(started_at, pg_catalog.now()),
      completed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = v_program.id;

  return jsonb_build_object(
    'program_id', v_program.id,
    'status', 'COMPLETED',
    'total_allocated', v_total_allocated,
    'total_returned', v_total_returned,
    'total_dispensed', v_total_dispensed
  );
end;
$function$;

-- 7i. start_other_program (Cleanly set status = 'ONGOING')
CREATE OR REPLACE FUNCTION public.start_other_program(p_program_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_program public.other_programs%rowtype;
begin
  if auth.uid() is null or not (public.is_pharma_i() or public.is_pharma_ii()) then
    raise exception 'Only CHO pharmacists can start Other Programs.' using errcode = '42501';
  end if;

  select * into v_program from public.other_programs where id = p_program_id for update;
  if not found then
    raise exception 'Program was not found.' using errcode = 'P0002';
  end if;

  if v_program.status = 'COMPLETED' then
    return jsonb_build_object(
      'program_id', v_program.id,
      'status', 'COMPLETED',
      'started_at', v_program.started_at
    );
  end if;

  if v_program.status = 'ONGOING' then
    return jsonb_build_object(
      'program_id', v_program.id,
      'status', 'ONGOING',
      'started_at', v_program.started_at
    );
  end if;

  if v_program.status <> 'UPCOMING' then
    raise exception 'Only upcoming programs can be marked as ongoing.' using errcode = '22023';
  end if;

  if v_program.program_date > current_date then
    raise exception 'Scheduled date has not arrived yet. Please reschedule the program to today first.' using errcode = '22023';
  end if;

  update public.other_programs
  set status = 'ONGOING',
      started_at = coalesce(started_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where id = v_program.id
  returning * into v_program;

  return jsonb_build_object(
    'program_id', v_program.id,
    'status', 'ONGOING',
    'started_at', v_program.started_at
  );
end;
$function$;

-- 7j. record_activity_log (Expand allowed actions for Stock Returns & Inventory disposal)
CREATE OR REPLACE FUNCTION public.record_activity_log(p_action text, p_module text, p_details text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_log_id uuid;
begin
  if v_user_id is null then
    raise exception 'An authenticated user is required to record an activity.' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.profiles
     where id = v_user_id
       and status = 'ACTIVE'
  ) then
    raise exception 'An active profile is required to record an activity.' using errcode = '42501';
  end if;

  if not (
    (p_module = 'Inventory' and p_action in ('Stock Added', 'Stock Removed', 'Stock Imported', 'Stock Updated', 'Batch Disposed'))
    or (p_module = 'Stock Returns' and p_action in ('Stock Return Submitted', 'Stock Return Confirmed', 'Stock Return Updated'))
    or (p_module = 'Authentication' and p_action in ('User Signed In', 'User Signed Out'))
  ) then
    raise exception 'This activity action must be recorded by its owning database operation.' using errcode = '42501';
  end if;

  insert into public.activity_logs (user_id, action, module, details)
  values (
    v_user_id,
    nullif(pg_catalog.btrim(p_action), ''),
    nullif(pg_catalog.btrim(p_module), ''),
    nullif(pg_catalog.btrim(p_details), '')
  )
  returning id into v_log_id;

  return v_log_id;
end;
$function$;

-- 7k. Trigger to atomically deduct source facility inventory and record activity logs on stock_returns lifecycle
CREATE OR REPLACE FUNCTION public.handle_stock_return_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_target_inventory_id uuid;
  v_actor_id uuid;
  v_facility_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- 1. Find the source batch in the submitting facility's inventory
    IF NEW.source_inventory_id IS NOT NULL THEN
      SELECT i.id
        INTO v_target_inventory_id
        FROM public.inventory i
       WHERE i.id = NEW.source_inventory_id
         AND i.facility_id = NEW.facility_id
       FOR UPDATE;
    END IF;

    IF v_target_inventory_id IS NULL THEN
      SELECT i.id
        INTO v_target_inventory_id
        FROM public.inventory i
       WHERE i.facility_id = NEW.facility_id
         AND upper(pg_catalog.btrim(i.batch_number)) = upper(pg_catalog.btrim(NEW.lot_no))
         AND (NEW.medicine_id IS NULL OR i.medicine_id = NEW.medicine_id)
       ORDER BY i.quantity DESC, i.expiration_date ASC, i.id ASC
       LIMIT 1
       FOR UPDATE;
    END IF;

    IF v_target_inventory_id IS NOT NULL AND NEW.quantity > 0 THEN
      UPDATE public.inventory
         SET quantity = GREATEST(0, quantity - NEW.quantity),
             updated_at = pg_catalog.now()
       WHERE id = v_target_inventory_id;
    END IF;

    -- 2. Record activity log
    v_actor_id := COALESCE(NEW.submitted_by_id, auth.uid());
    IF v_actor_id IS NOT NULL THEN
      INSERT INTO public.activity_logs (user_id, action, module, details)
      VALUES (
        v_actor_id,
        CASE WHEN NEW.status IN ('CONFIRMED', 'VERIFIED') THEN 'Stock Return Confirmed' ELSE 'Stock Return Submitted' END,
        'Stock Returns',
        'Submitted stock return ' || COALESCE(NEW.return_id, NEW.id::text)
          || ' (Lot ' || NEW.lot_no || ': ' || NEW.quantity || ' units of ' || NEW.medicine_name || ').'
      );
    END IF;

    -- 3. Notify active CHO Pharmacists when a pending return is submitted
    IF NEW.status = 'PENDING' THEN
      SELECT f.facility_name
        INTO v_facility_name
        FROM public.facilities f
       WHERE f.id = NEW.facility_id;

      INSERT INTO public.notifications (user_id, title, message)
      SELECT
        p.id,
        'New Stock Return Submitted',
        COALESCE(v_facility_name, 'Barangay Health Center')
          || ' submitted return ' || COALESCE(NEW.return_id, NEW.id::text)
          || ' for ' || NEW.quantity || ' unit(s) of ' || NEW.medicine_name
          || ' (Lot: ' || NEW.lot_no || ').'
      FROM public.profiles p
      WHERE p.role IN ('PHARMA_I', 'PHARMA_II')
        AND p.status = 'ACTIVE';
    END IF;

    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('CONFIRMED', 'VERIFIED') THEN
      v_actor_id := COALESCE(NEW.confirmed_by_id, auth.uid());
      IF v_actor_id IS NOT NULL THEN
        INSERT INTO public.activity_logs (user_id, action, module, details)
        VALUES (
          v_actor_id,
          'Stock Return Confirmed',
          'Stock Returns',
          'Confirmed stock return ' || COALESCE(NEW.return_id, NEW.id::text)
            || ' (Lot ' || NEW.lot_no || ': ' || NEW.quantity || ' units of ' || NEW.medicine_name || ').'
        );
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_handle_stock_return_lifecycle ON public.stock_returns;
CREATE TRIGGER trg_handle_stock_return_lifecycle
  AFTER INSERT OR UPDATE ON public.stock_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_stock_return_lifecycle();

-- 7l. Safe SECURITY DEFINER RPC to resolve phone number to email during unified password sign-in
CREATE OR REPLACE FUNCTION public.resolve_login_email_by_phone(p_phone_number text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_digits text;
  v_normalized text;
  v_email text;
BEGIN
  v_digits := pg_catalog.regexp_replace(coalesce(p_phone_number, ''), '[^0-9]', '', 'g');
  v_normalized := CASE
    WHEN v_digits ~ '^63[0-9]{10}$' THEN '0' || pg_catalog.substr(v_digits, 3)
    WHEN v_digits ~ '^9[0-9]{9}$' THEN '0' || v_digits
    WHEN v_digits ~ '^09[0-9]{9}$' THEN v_digits
    ELSE NULL
  END;

  IF v_normalized IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.email
    INTO v_email
    FROM public.profiles p
   WHERE p.phone_number = v_normalized
     AND p.email IS NOT NULL
   ORDER BY CASE WHEN p.status = 'ACTIVE' THEN 0 ELSE 1 END, p.created_at DESC
   LIMIT 1;

  RETURN v_email;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email_by_phone(text) TO anon, authenticated;

-- =============================================================================
-- 8. ADVISOR POLISH: TRIGGER HARDENING, COVERING INDEXES & RLS INITPLAN
-- =============================================================================

-- 8a. Harden prevent_transaction_deletion with SET search_path TO ''
CREATE OR REPLACE FUNCTION public.prevent_transaction_deletion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Physical deletion of % records is prohibited. Use status updates or archive instead.', TG_TABLE_NAME
    USING ERRCODE = '42501';
  RETURN NULL;
END;
$function$;

-- 8b. Revoke direct PostgREST RPC execution on internal trigger functions
REVOKE EXECUTE ON FUNCTION public.handle_stock_return_lifecycle() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_direct_row_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_patient_archive_and_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_patient_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_and_log_facility_change_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_last_active_pharma_ii_lockout() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_google_identity_email() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_transaction_deletion() FROM PUBLIC, anon, authenticated;

-- 8c. Add covering indexes for the remaining foreign keys
CREATE INDEX IF NOT EXISTS idx_fmt_medicine_id
  ON public.facility_medicine_thresholds (medicine_id);

CREATE INDEX IF NOT EXISTS idx_medicine_dispensing_inventory_medicine
  ON public.medicine_dispensing (inventory_id, medicine_id);

-- 8d. Optimize facility_medicine_thresholds write policy to avoid per-row auth.uid() initplan
ALTER POLICY "Allow write facility_medicine_thresholds for authorized staff" ON public.facility_medicine_thresholds
  USING (public.is_pharma_i() OR public.is_pharma_ii() OR (public.is_bhw() AND public.is_same_facility(facility_id)))
  WITH CHECK (public.is_pharma_i() OR public.is_pharma_ii() OR (public.is_bhw() AND public.is_same_facility(facility_id)));

