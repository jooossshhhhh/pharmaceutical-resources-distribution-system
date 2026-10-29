-- ==============================================================================
-- Migration: 2026-prds-normalization-and-audit-hardening.sql
-- Description:
-- 1. Adds unit_cost_at_dispense snapshot & generated total_cost_at_dispense to medicine_dispensing.
-- 2. Backfills existing dispensing records with their batch unit cost.
-- 3. Adds high-performance index on medicine_dispensing(patient_id, dispense_date) WHERE voided_at IS NULL.
-- 4. Replaces dropped patient_medicine_records table with a zero-cost read-only compatibility VIEW.
-- 5. Enforces composite unique constraint uq_inventory_id_medicine on inventory(id, medicine_id).
-- 6. Enforces composite foreign key fk_dispensing_inventory_medicine on medicine_dispensing(inventory_id, medicine_id).
-- 7. Updates dispense_walk_in RPC to freeze batch unit_cost into unit_cost_at_dispense at dispensing time.
-- ==============================================================================

-- 1. Add Cost Snapshot Columns to medicine_dispensing
ALTER TABLE public.medicine_dispensing 
  ADD COLUMN IF NOT EXISTS unit_cost_at_dispense numeric(10,2),
  ADD COLUMN IF NOT EXISTS total_cost_at_dispense numeric(12,2) 
    GENERATED ALWAYS AS (quantity * COALESCE(unit_cost_at_dispense, 0)) STORED;

-- Backfill any existing dispensing records from their original inventory batch
UPDATE public.medicine_dispensing md
   SET unit_cost_at_dispense = COALESCE(i.unit_cost, 0)
  FROM public.inventory i
 WHERE md.inventory_id = i.id
   AND md.unit_cost_at_dispense IS NULL;

-- 2. Monthly Eligibility Partial Index & Compatibility View
CREATE INDEX IF NOT EXISTS idx_dispensing_patient_monthly_eligibility 
  ON public.medicine_dispensing (patient_id, dispense_date) 
  WHERE voided_at IS NULL;

-- Create read-only compatibility view (zero storage cost) for any legacy queries
CREATE OR REPLACE VIEW public.patient_medicine_records 
WITH (security_invoker = true) AS
SELECT 
    id,
    patient_id,
    id AS medicine_dispensing_id,
    medicine_id,
    quantity AS medicine_quantity,
    prescribed_by AS remarks,
    dispensed_by,
    dispense_date AS date_stamp
FROM public.medicine_dispensing
WHERE voided_at IS NULL;

-- 3. Composite Foreign Key Constraint (Constrained Denormalization)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_inventory_id_medicine'
    ) THEN
        ALTER TABLE public.inventory ADD CONSTRAINT uq_inventory_id_medicine UNIQUE (id, medicine_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_dispensing_inventory_medicine'
    ) THEN
        ALTER TABLE public.medicine_dispensing 
          ADD CONSTRAINT fk_dispensing_inventory_medicine 
          FOREIGN KEY (inventory_id, medicine_id) 
          REFERENCES public.inventory (id, medicine_id) 
          ON DELETE RESTRICT;
    END IF;
END $$;

-- 4. Update dispense_walk_in to Snapshot Unit Cost
CREATE OR REPLACE FUNCTION public.dispense_walk_in(
    p_patient_id uuid,
    p_items jsonb,
    p_prescribed_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_caller_id uuid;
    v_caller_facility uuid;
    v_caller_role public.user_role;
    v_patient public.patients%rowtype;
    v_transaction_id uuid;
    v_item record;
    v_batch record;
    v_take integer;
    v_remaining integer;
    v_dispensing_id uuid;
    v_claim_count integer;
BEGIN
    SELECT p.id, p.facility_id, p.role
      INTO v_caller_id, v_caller_facility, v_caller_role
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.status = 'ACTIVE';

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'An active account is required to dispense medicine.'
            USING errcode = '42501';
    END IF;

    IF v_caller_role NOT IN ('BHW', 'PHARMA_I', 'PHARMA_II') THEN
        RAISE EXCEPTION 'Your role cannot perform walk-in dispensing.'
            USING errcode = '42501';
    END IF;

    IF v_caller_facility IS NULL THEN
        RAISE EXCEPTION 'Your account is not assigned to a facility.'
            USING errcode = '42501';
    END IF;

    IF nullif(btrim(coalesce(p_prescribed_by, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Prescribed by is required.'
            USING errcode = '22023';
    END IF;

    IF p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Add at least one medicine before completing the dispensing.'
            USING errcode = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM jsonb_to_recordset(p_items) AS x(
              medicine_id uuid,
              needed_quantity integer,
              quantity integer,
              follow_up_action text,
              follow_up_date date,
              referred_facility_id uuid
          )
         WHERE x.medicine_id IS NULL
            OR x.quantity IS NULL
            OR x.needed_quantity IS NULL
            OR x.quantity <= 0
            OR x.needed_quantity <= 0
            OR x.needed_quantity < x.quantity
            OR (
                x.follow_up_action IS NOT NULL
                AND (
                    x.follow_up_action NOT IN ('SCHEDULE_NEXT_WEEK', 'REFER_TO_BARANGAY')
                    OR (x.follow_up_action = 'SCHEDULE_NEXT_WEEK' AND x.follow_up_date IS NULL)
                    OR (x.follow_up_action = 'REFER_TO_BARANGAY' AND x.referred_facility_id IS NULL)
                )
            )
    ) THEN
        RAISE EXCEPTION 'Every cart line requires valid needed, released, and follow-up details.'
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
        RAISE EXCEPTION 'Each medicine may only appear once in the cart.'
            USING errcode = '22023';
    END IF;

    SELECT *
      INTO v_patient
      FROM public.patients pt
     WHERE pt.id = p_patient_id
       AND pt.archived_at IS NULL
     FOR UPDATE;

    IF v_patient.id IS NULL THEN
        RAISE EXCEPTION 'Active patient not found.'
            USING errcode = 'P0001';
    END IF;

    IF v_caller_role = 'BHW' AND v_patient.facility_id <> v_caller_facility THEN
        RAISE EXCEPTION 'Barangay health workers can only dispense to patients of their own facility.'
            USING errcode = '42501';
    END IF;

    -- Enforce once-per-month claim rule
    SELECT count(*)
      INTO v_claim_count
      FROM public.medicine_dispensing md
     WHERE coalesce(md.record_type, 'LIVE_DISPENSING') <> 'HISTORY_ONLY'
       AND md.patient_id = p_patient_id
       AND md.voided_at IS NULL
       AND date_trunc('month', md.dispense_date) = date_trunc('month', now());

    IF v_claim_count > 0 AND EXISTS (
        SELECT 1
          FROM jsonb_to_recordset(p_items) AS x(medicine_id uuid, quantity integer)
          LEFT JOIN LATERAL (
              SELECT
                  max(coalesce(md.needed_quantity, md.quantity))::integer AS needed_quantity,
                  coalesce(sum(md.quantity), 0)::integer AS released_quantity
                FROM public.medicine_dispensing md
               WHERE coalesce(md.record_type, 'LIVE_DISPENSING') <> 'HISTORY_ONLY'
                 AND md.patient_id = p_patient_id
                 AND md.medicine_id = x.medicine_id
                 AND md.voided_at IS NULL
                 AND date_trunc('month', md.dispense_date) = date_trunc('month', now())
          ) prior ON true
         WHERE prior.needed_quantity IS NULL
            OR prior.released_quantity >= prior.needed_quantity
            OR prior.released_quantity + x.quantity > prior.needed_quantity
    ) THEN
        RAISE EXCEPTION 'This patient already claimed free medicine this month.'
            USING errcode = 'P0001';
    END IF;

    -- Lock inventory rows
    PERFORM i.id
      FROM public.inventory i
     WHERE i.facility_id = v_caller_facility
       AND i.medicine_id IN (
           SELECT x.medicine_id
             FROM jsonb_to_recordset(p_items) AS x(medicine_id uuid)
       )
     ORDER BY i.expiration_date, i.date_received, i.id
     FOR UPDATE;

    v_transaction_id := gen_random_uuid();

    FOR v_item IN
        SELECT
            x.medicine_id,
            max(x.needed_quantity)::integer AS needed_quantity,
            sum(x.quantity)::integer AS quantity,
            max(x.follow_up_action) FILTER (WHERE x.needed_quantity > x.quantity) AS follow_up_action,
            max(x.follow_up_date) FILTER (WHERE x.needed_quantity > x.quantity) AS follow_up_date,
            (max(x.referred_facility_id::text) FILTER (WHERE x.needed_quantity > x.quantity))::uuid AS referred_facility_id
          FROM jsonb_to_recordset(p_items) AS x(
              medicine_id uuid,
              needed_quantity integer,
              quantity integer,
              follow_up_action text,
              follow_up_date date,
              referred_facility_id uuid
          )
         GROUP BY x.medicine_id
    LOOP
        SELECT coalesce(sum(i.quantity), 0)
          INTO v_remaining
          FROM public.inventory i
         WHERE i.facility_id = v_caller_facility
           AND i.medicine_id = v_item.medicine_id
           AND i.quantity > 0
           AND i.expiration_date > current_date;

        IF v_remaining < v_item.quantity THEN
            RAISE EXCEPTION 'Not enough available stock for one of the medicines. Available quantity: %.', v_remaining
                USING errcode = 'P0001';
        END IF;

        v_remaining := v_item.quantity;

        -- FEFO allocation loop: now selects i.unit_cost for snapshotting!
        FOR v_batch IN
            SELECT i.id, i.quantity, i.unit_cost
              FROM public.inventory i
             WHERE i.facility_id = v_caller_facility
               AND i.medicine_id = v_item.medicine_id
               AND i.quantity > 0
               AND i.expiration_date > current_date
             ORDER BY i.expiration_date, i.date_received, i.id
        LOOP
            EXIT WHEN v_remaining <= 0;

            v_take := least(v_batch.quantity, v_remaining);

            UPDATE public.inventory
               SET quantity = quantity - v_take,
                   updated_at = now()
             WHERE public.inventory.id = v_batch.id;

            -- Insert dispensing record WITH frozen unit_cost snapshot
            INSERT INTO public.medicine_dispensing (
                facility_id,
                medicine_id,
                inventory_id,
                quantity,
                needed_quantity,
                prescribed_by,
                follow_up_action,
                follow_up_date,
                referred_facility_id,
                dispensing_type,
                dispensed_by,
                patient_id,
                dispense_date,
                dispensing_transaction_id,
                record_type,
                unit_cost_at_dispense
            )
            VALUES (
                v_caller_facility,
                v_item.medicine_id,
                v_batch.id,
                v_take,
                v_item.needed_quantity,
                btrim(p_prescribed_by),
                v_item.follow_up_action,
                v_item.follow_up_date,
                v_item.referred_facility_id,
                'WALK_IN',
                v_caller_id,
                p_patient_id,
                now(),
                v_transaction_id,
                'LIVE_DISPENSING',
                v_batch.unit_cost -- Snapshot from batch!
            )
            RETURNING public.medicine_dispensing.id INTO v_dispensing_id;

            v_remaining := v_remaining - v_take;
        END LOOP;
    END LOOP;

    INSERT INTO public.activity_logs (user_id, action, module, details)
    VALUES (
        v_caller_id,
        'Medicine Released',
        'Dispensing',
        'Released walk-in dispensing transaction '
            || upper(substr(v_transaction_id::text, 1, 8))
            || ' for patient ' || p_patient_id || '.'
    );

    RETURN jsonb_build_object(
        'transaction_id', v_transaction_id,
        'facility_id', v_caller_facility,
        'patient_id', p_patient_id,
        'dispensed_at', now()
    );
END;
$function$;
