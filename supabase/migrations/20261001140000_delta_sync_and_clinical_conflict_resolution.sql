-- Migration: 20261001140000_delta_sync_and_clinical_conflict_resolution.sql
-- PRDS High Priority Implementation: Delta Sync & Clinical Conflict Resolution
-- 1. Adds updated_at tracking & triggers for delta replication
-- 2. Creates sync_tombstones table for hard deletion auditing
-- 3. Creates stock_deficit_audits table & reconciliation workflow
-- 4. Updates dispense_walk_in to be conflict-tolerant (Clinical Primacy Axiom)

-- ============================================================================
-- 1. UPDATED_AT TRACKING FOR INCREMENTAL DELTA SYNCHRONIZATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Ensure updated_at exists on core replicated tables
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.facilities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.other_programs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.medicine_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.medicine_dispensing ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.forecasting ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Attach updated_at triggers
DROP TRIGGER IF EXISTS trg_medicines_updated_at ON public.medicines;
CREATE TRIGGER trg_medicines_updated_at BEFORE UPDATE ON public.medicines
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

DROP TRIGGER IF EXISTS trg_facilities_updated_at ON public.facilities;
CREATE TRIGGER trg_facilities_updated_at BEFORE UPDATE ON public.facilities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

DROP TRIGGER IF EXISTS trg_other_programs_updated_at ON public.other_programs;
CREATE TRIGGER trg_other_programs_updated_at BEFORE UPDATE ON public.other_programs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

DROP TRIGGER IF EXISTS trg_medicine_requests_updated_at ON public.medicine_requests;
CREATE TRIGGER trg_medicine_requests_updated_at BEFORE UPDATE ON public.medicine_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

DROP TRIGGER IF EXISTS trg_stock_transfers_updated_at ON public.stock_transfers;
CREATE TRIGGER trg_stock_transfers_updated_at BEFORE UPDATE ON public.stock_transfers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

DROP TRIGGER IF EXISTS trg_medicine_dispensing_updated_at ON public.medicine_dispensing;
CREATE TRIGGER trg_medicine_dispensing_updated_at BEFORE UPDATE ON public.medicine_dispensing
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

DROP TRIGGER IF EXISTS trg_notifications_updated_at ON public.notifications;
CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

-- ============================================================================
-- 2. HARD DELETION & TOMBSTONE TRACKING (sync_tombstones)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sync_tombstones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_tombstones_delta 
ON public.sync_tombstones (table_name, deleted_at DESC);

ALTER TABLE public.sync_tombstones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read sync_tombstones" ON public.sync_tombstones;
CREATE POLICY "Allow authenticated read sync_tombstones"
ON public.sync_tombstones
FOR SELECT TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.log_sync_tombstone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.sync_tombstones (table_name, record_id, deleted_at)
    VALUES (TG_TABLE_NAME, OLD.id, now());
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_tombstone ON public.inventory;
CREATE TRIGGER trg_inventory_tombstone
AFTER DELETE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.log_sync_tombstone();

DROP TRIGGER IF EXISTS trg_medicines_tombstone ON public.medicines;
CREATE TRIGGER trg_medicines_tombstone
AFTER DELETE ON public.medicines
FOR EACH ROW EXECUTE FUNCTION public.log_sync_tombstone();

DROP TRIGGER IF EXISTS trg_facilities_tombstone ON public.facilities;
CREATE TRIGGER trg_facilities_tombstone
AFTER DELETE ON public.facilities
FOR EACH ROW EXECUTE FUNCTION public.log_sync_tombstone();

DROP TRIGGER IF EXISTS trg_suppliers_tombstone ON public.suppliers;
CREATE TRIGGER trg_suppliers_tombstone
AFTER DELETE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.log_sync_tombstone();

DROP TRIGGER IF EXISTS trg_other_programs_tombstone ON public.other_programs;
CREATE TRIGGER trg_other_programs_tombstone
AFTER DELETE ON public.other_programs
FOR EACH ROW EXECUTE FUNCTION public.log_sync_tombstone();

-- ============================================================================
-- 3. STOCK DEFICIT AUDITS & RECONCILIATION
-- ============================================================================

-- Make inventory_id on medicine_dispensing nullable so deficit events can record
-- even when no cloud batch row is currently present for the facility
ALTER TABLE public.medicine_dispensing ALTER COLUMN inventory_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.stock_deficit_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispensing_id UUID NOT NULL REFERENCES public.medicine_dispensing(id) ON DELETE CASCADE,
    dispensing_transaction_id UUID NOT NULL,
    facility_id UUID NOT NULL REFERENCES public.facilities(id),
    medicine_id UUID NOT NULL REFERENCES public.medicines(id),
    inventory_batch_id UUID REFERENCES public.inventory(id),
    batch_number TEXT,
    dispensed_by UUID NOT NULL REFERENCES public.profiles(id),
    dispensed_quantity INTEGER NOT NULL,
    available_at_sync INTEGER NOT NULL,
    deficit_quantity INTEGER NOT NULL, -- e.g., 10 dispensed - 2 available = 8 deficit
    status TEXT NOT NULL DEFAULT 'PENDING_RECONCILIATION',
    reconciliation_action TEXT,        -- 'ADJUSTED_LEDGER', 'REALLOCATED_FROM_CHO', 'ACKNOWLEDGED_LOSS'
    reconciled_by UUID REFERENCES public.profiles(id),
    reconciled_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_deficit_audits_facility 
ON public.stock_deficit_audits (facility_id, status);

CREATE INDEX IF NOT EXISTS idx_stock_deficit_audits_status 
ON public.stock_deficit_audits (status, created_at DESC);

ALTER TABLE public.stock_deficit_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read stock deficit audits" ON public.stock_deficit_audits;
CREATE POLICY "Staff read stock deficit audits"
ON public.stock_deficit_audits
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            p.role IN ('PHARMA_I', 'PHARMA_II')
            OR p.facility_id = stock_deficit_audits.facility_id
          )
    )
);

DROP POLICY IF EXISTS "Pharma review stock deficit audits" ON public.stock_deficit_audits;
CREATE POLICY "Pharma review stock deficit audits"
ON public.stock_deficit_audits
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('PHARMA_I', 'PHARMA_II')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('PHARMA_I', 'PHARMA_II')
    )
);

-- Stored procedure for Chief Pharmacist reconciliation
CREATE OR REPLACE FUNCTION public.reconcile_stock_deficit(
    p_audit_id UUID,
    p_action TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role public.user_role;
    v_audit public.stock_deficit_audits%ROWTYPE;
BEGIN
    SELECT p.id, p.role
      INTO v_caller_id, v_caller_role
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.status = 'ACTIVE';

    IF v_caller_id IS NULL OR v_caller_role NOT IN ('PHARMA_I', 'PHARMA_II') THEN
        RAISE EXCEPTION 'Only pharmacists can reconcile stock deficits.'
            USING errcode = '42501';
    END IF;

    IF p_action NOT IN ('ADJUSTED_LEDGER', 'REALLOCATED_FROM_CHO', 'ACKNOWLEDGED_LOSS') THEN
        RAISE EXCEPTION 'Invalid reconciliation action: %.', p_action
            USING errcode = '22023';
    END IF;

    SELECT *
      INTO v_audit
      FROM public.stock_deficit_audits
     WHERE id = p_audit_id
     FOR UPDATE;

    IF v_audit.id IS NULL THEN
        RAISE EXCEPTION 'Stock deficit audit record not found.'
            USING errcode = 'P0001';
    END IF;

    IF v_audit.status <> 'PENDING_RECONCILIATION' THEN
        RAISE EXCEPTION 'This deficit audit has already been reconciled.'
            USING errcode = '22023';
    END IF;

    UPDATE public.stock_deficit_audits
       SET status = 'RECONCILED',
           reconciliation_action = p_action,
           reconciled_by = v_caller_id,
           reconciled_at = now(),
           notes = coalesce(p_notes, notes),
           updated_at = now()
     WHERE id = p_audit_id;

    INSERT INTO public.activity_logs (user_id, action, module, details)
    VALUES (
        v_caller_id,
        'Stock Deficit Reconciled',
        'Inventory',
        format('Reconciled deficit of %s units for medicine %s with action %s.', v_audit.deficit_quantity, v_audit.medicine_id, p_action)
    );

    RETURN jsonb_build_object(
        'audit_id', p_audit_id,
        'status', 'RECONCILED',
        'action', p_action,
        'reconciled_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_stock_deficit(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 4. CONFLICT-TOLERANT WALK-IN DISPENSING (CLINICAL PRIMACY AXIOM)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.dispense_walk_in(
    p_patient_id uuid,
    p_items jsonb,
    p_prescribed_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id uuid;
    v_caller_facility uuid;
    v_caller_role public.user_role;
    v_patient public.patients%rowtype;
    v_transaction_id uuid;
    v_item record;
    v_batch record;
    v_take integer;
    v_available integer;
    v_remaining integer;
    v_dispensing_id uuid;
    v_claim_count integer;
    v_fallback_batch_id uuid;
    v_fallback_batch_num text;
    v_deficit_count integer := 0;
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
        -- Calculate total physical stock available at sync
        SELECT coalesce(sum(i.quantity), 0)
          INTO v_available
          FROM public.inventory i
         WHERE i.facility_id = v_caller_facility
           and i.medicine_id = v_item.medicine_id
           and i.quantity > 0
           and i.expiration_date > current_date;

        v_remaining := v_item.quantity;

        -- 1. Deduct from available unexpired batches using FEFO
        FOR v_batch IN
            SELECT i.id, i.quantity, i.batch_number
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
                record_type
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
                'LIVE_DISPENSING'
            )
            RETURNING public.medicine_dispensing.id INTO v_dispensing_id;

            INSERT INTO public.patient_medicine_records (
                patient_id,
                medicine_dispensing_id,
                medicine_id,
                medicine_quantity,
                dispensed_by,
                date_stamp
            )
            VALUES (
                p_patient_id,
                v_dispensing_id,
                v_item.medicine_id,
                v_take,
                v_caller_id,
                now()
            );

            v_remaining := v_remaining - v_take;
        END LOOP;

        -- 2. CLINICAL CONFLICT RESOLUTION: If physical medicine was dispensed offline
        -- but available ledger was decremented online, NEVER discard the clinical event!
        -- Record the deficit in stock_deficit_audits and notify the Chief Pharmacist.
        IF v_remaining > 0 THEN
            v_deficit_count := v_deficit_count + 1;

            -- Lookup most recent batch for this facility & medicine to associate batch metadata
            SELECT i.id, i.batch_number
              INTO v_fallback_batch_id, v_fallback_batch_num
              FROM public.inventory i
             WHERE i.facility_id = v_caller_facility
               AND i.medicine_id = v_item.medicine_id
             ORDER BY i.expiration_date DESC, i.date_received DESC
             LIMIT 1;

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
                record_type
            )
            VALUES (
                v_caller_facility,
                v_item.medicine_id,
                v_fallback_batch_id,
                v_remaining,
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
                'LIVE_DISPENSING'
            )
            RETURNING public.medicine_dispensing.id INTO v_dispensing_id;

            INSERT INTO public.patient_medicine_records (
                patient_id,
                medicine_dispensing_id,
                medicine_id,
                medicine_quantity,
                dispensed_by,
                date_stamp
            )
            VALUES (
                p_patient_id,
                v_dispensing_id,
                v_item.medicine_id,
                v_remaining,
                v_caller_id,
                now()
            );

            INSERT INTO public.stock_deficit_audits (
                dispensing_id,
                dispensing_transaction_id,
                facility_id,
                medicine_id,
                inventory_batch_id,
                batch_number,
                dispensed_by,
                dispensed_quantity,
                available_at_sync,
                deficit_quantity,
                status
            )
            VALUES (
                v_dispensing_id,
                v_transaction_id,
                v_caller_facility,
                v_item.medicine_id,
                v_fallback_batch_id,
                v_fallback_batch_num,
                v_caller_id,
                v_item.quantity,
                v_available,
                v_remaining,
                'PENDING_RECONCILIATION'
            );

            -- Notify CHO Pharmacists of offline deficit requiring reconciliation
            INSERT INTO public.notifications (
                user_id,
                title,
                message,
                created_at
            )
            SELECT
                p.id,
                'Stock Deficit Warning (Offline Sync)',
                format('Offline walk-in dispensing created a deficit of %s units for medicine %s at facility.', v_remaining, v_item.medicine_id),
                now()
              FROM public.profiles p
             WHERE p.role = 'PHARMA_II'
               AND p.status = 'ACTIVE';
        END IF;
    END LOOP;

    INSERT INTO public.activity_logs (user_id, action, module, details)
    VALUES (
        v_caller_id,
        CASE WHEN v_deficit_count > 0 THEN 'Medicine Released (Deficit Logged)' ELSE 'Medicine Released' END,
        'Dispensing',
        'Released walk-in dispensing transaction '
            || upper(substr(v_transaction_id::text, 1, 8))
            || ' for patient ' || p_patient_id
            || CASE WHEN v_deficit_count > 0 THEN ' with offline deficit logged for review.' ELSE '.' END
    );

    RETURN jsonb_build_object(
        'transaction_id', v_transaction_id,
        'facility_id', v_caller_facility,
        'patient_id', p_patient_id,
        'dispensed_at', now(),
        'deficits_logged', v_deficit_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.dispense_walk_in(uuid, jsonb, text) FROM public;
REVOKE ALL ON FUNCTION public.dispense_walk_in(uuid, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dispense_walk_in(uuid, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
