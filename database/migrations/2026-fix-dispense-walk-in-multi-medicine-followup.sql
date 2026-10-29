-- Migration: 2026-fix-dispense-walk-in-multi-medicine-followup.sql
-- Description: Fixes walk-in dispensing when completing partial claims alongside newly prescribed medicines.
-- Previously, checking 'prior.needed_quantity IS NULL' when v_claim_count > 0 blocked any newly prescribed
-- medicine during a follow-up transaction. This migration ensures the monthly allocation limit is evaluated
-- per medicine rather than globally, permitting newly prescribed medicines while preserving per-medicine caps.

CREATE OR REPLACE FUNCTION public.dispense_walk_in(p_patient_id uuid, p_items jsonb, p_prescribed_by text)
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

    -- Enforce monthly limit per medicine:
    -- A patient cannot exceed the prescribed needed quantity for any medicine in a given month,
    -- nor re-claim a medicine that has already reached its needed quantity this month.
    -- Newly prescribed medicines (prior.needed_quantity IS NULL) are permitted.
    IF EXISTS (
        SELECT 1
          FROM jsonb_to_recordset(p_items) AS x(medicine_id uuid, quantity integer)
          JOIN LATERAL (
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
         WHERE prior.needed_quantity IS NOT NULL
           AND (
               prior.released_quantity >= prior.needed_quantity
               OR prior.released_quantity + x.quantity > prior.needed_quantity
           )
    ) THEN
        RAISE EXCEPTION 'This patient has already reached or exceeded the prescribed quantity for this medicine this month.'
            USING errcode = 'P0001';
    END IF;

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
                v_batch.unit_cost
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

REVOKE ALL ON FUNCTION public.dispense_walk_in(uuid, jsonb, text) FROM public;
REVOKE ALL ON FUNCTION public.dispense_walk_in(uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dispense_walk_in(uuid, jsonb, text) TO authenticated;
