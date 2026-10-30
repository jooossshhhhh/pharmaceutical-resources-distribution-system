-- Migration: Normalize Inventory Thresholds
-- Decouples safety stock thresholds from transient inventory lot rows into a dedicated
-- facility_medicine_thresholds table, establishing threshold as a persistent facility-level policy.

-- 1. Create facility_medicine_thresholds table
CREATE TABLE IF NOT EXISTS public.facility_medicine_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    medicine_id UUID NOT NULL REFERENCES public.medicines(id) ON DELETE RESTRICT,
    threshold INTEGER NOT NULL DEFAULT 0 CHECK (threshold >= 0),
    is_custom BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_facility_medicine_threshold UNIQUE (facility_id, medicine_id)
);

-- 2. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_fmt_facility_medicine 
    ON public.facility_medicine_thresholds (facility_id, medicine_id);

-- 3. Seed data from existing inventory lots
INSERT INTO public.facility_medicine_thresholds (facility_id, medicine_id, threshold, is_custom, updated_at)
SELECT 
    i.facility_id,
    i.medicine_id,
    COALESCE(MAX(i.threshold), 0) AS threshold,
    COALESCE(bool_or(i.threshold > 0), false) AS is_custom,
    COALESCE(MAX(i.updated_at), now()) AS updated_at
FROM public.inventory i
WHERE i.facility_id IS NOT NULL 
  AND i.medicine_id IS NOT NULL
GROUP BY i.facility_id, i.medicine_id
ON CONFLICT (facility_id, medicine_id) DO UPDATE
SET threshold = EXCLUDED.threshold,
    is_custom = EXCLUDED.is_custom,
    updated_at = EXCLUDED.updated_at;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.facility_medicine_thresholds ENABLE ROW LEVEL SECURITY;

-- Read policy: All authenticated users can read thresholds
DROP POLICY IF EXISTS "Allow read facility_medicine_thresholds for authenticated users" ON public.facility_medicine_thresholds;
CREATE POLICY "Allow read facility_medicine_thresholds for authenticated users"
ON public.facility_medicine_thresholds
FOR SELECT
TO authenticated
USING (true);

-- Write policy: CHO pharmacy staff can manage any facility; BHW can manage their own facility
DROP POLICY IF EXISTS "Allow write facility_medicine_thresholds for authorized staff" ON public.facility_medicine_thresholds;
CREATE POLICY "Allow write facility_medicine_thresholds for authorized staff"
ON public.facility_medicine_thresholds
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'ACTIVE'
          AND (
              p.role IN ('PHARMA_I', 'PHARMA_II')
              OR (p.role = 'BHW' AND p.facility_id = facility_medicine_thresholds.facility_id)
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.status = 'ACTIVE'
          AND (
              p.role IN ('PHARMA_I', 'PHARMA_II')
              OR (p.role = 'BHW' AND p.facility_id = facility_medicine_thresholds.facility_id)
          )
    )
);

-- 5. Trigger: Cascade threshold updates to existing inventory lots
CREATE OR REPLACE FUNCTION public.fn_fmt_cascade_to_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.inventory
     SET threshold = NEW.threshold,
         updated_at = NOW()
   WHERE facility_id = NEW.facility_id
     AND medicine_id = NEW.medicine_id
     AND threshold <> NEW.threshold;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fmt_cascade_to_inventory ON public.facility_medicine_thresholds;
CREATE TRIGGER trg_fmt_cascade_to_inventory
AFTER INSERT OR UPDATE OF threshold ON public.facility_medicine_thresholds
FOR EACH ROW
EXECUTE FUNCTION public.fn_fmt_cascade_to_inventory();

-- 6. Trigger: Automatically inherit facility threshold when new lots are inserted into inventory
CREATE OR REPLACE FUNCTION public.fn_inventory_inherit_threshold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_threshold integer;
BEGIN
  -- Look up established threshold for this facility and medicine
  SELECT threshold
    INTO v_threshold
    FROM public.facility_medicine_thresholds
   WHERE facility_id = NEW.facility_id
     AND medicine_id = NEW.medicine_id;

  IF v_threshold IS NOT NULL THEN
    -- Always inherit the established facility policy threshold
    NEW.threshold := v_threshold;
  ELSIF NEW.threshold IS NOT NULL AND NEW.threshold > 0 THEN
    -- If no established policy exists yet, record this initial threshold into facility_medicine_thresholds
    INSERT INTO public.facility_medicine_thresholds (facility_id, medicine_id, threshold, is_custom, updated_at)
    VALUES (NEW.facility_id, NEW.medicine_id, NEW.threshold, true, NOW())
    ON CONFLICT (facility_id, medicine_id) DO NOTHING;
  ELSE
    NEW.threshold := 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_inherit_threshold ON public.inventory;
CREATE TRIGGER trg_inventory_inherit_threshold
BEFORE INSERT ON public.inventory
FOR EACH ROW
EXECUTE FUNCTION public.fn_inventory_inherit_threshold();

-- 7. Update update_bhw_inventory_threshold to upsert facility_medicine_thresholds
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

  -- Also cascade threshold to all active inventory lots
  UPDATE public.inventory
     SET threshold = p_threshold,
         updated_at = NOW()
   WHERE inventory.facility_id = v_target_facility_id
     AND inventory.medicine_id = p_medicine_id;

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

REVOKE ALL ON FUNCTION public.update_bhw_inventory_threshold(uuid, integer, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_bhw_inventory_threshold(uuid, integer, uuid) TO authenticated;

-- 8. Enhance low_stock_view to join facility_medicine_thresholds
CREATE OR REPLACE VIEW public.low_stock_view
WITH (security_invoker = true)
AS
SELECT 
    f.id AS facility_id,
    f.facility_name,
    m.id AS medicine_id,
    m.generic_name,
    m.dosage,
    m.unit_of_measure,
    COALESCE(SUM(i.quantity) FILTER (WHERE COALESCE(i.status, 'ACTIVE') = 'ACTIVE' AND (i.expiration_date IS NULL OR i.expiration_date > CURRENT_DATE)), 0)::integer AS total_quantity,
    fmt.threshold AS reorder_threshold,
    COUNT(i.id) FILTER (WHERE COALESCE(i.status, 'ACTIVE') = 'ACTIVE' AND (i.expiration_date IS NULL OR i.expiration_date > CURRENT_DATE))::integer AS active_batches_count
FROM public.facility_medicine_thresholds fmt
JOIN public.facilities f ON f.id = fmt.facility_id
JOIN public.medicines m ON m.id = fmt.medicine_id
LEFT JOIN public.inventory i ON i.facility_id = fmt.facility_id AND i.medicine_id = fmt.medicine_id
GROUP BY f.id, f.facility_name, m.id, m.generic_name, m.dosage, m.unit_of_measure, fmt.threshold
HAVING COALESCE(SUM(i.quantity) FILTER (WHERE COALESCE(i.status, 'ACTIVE') = 'ACTIVE' AND (i.expiration_date IS NULL OR i.expiration_date > CURRENT_DATE)), 0) <= fmt.threshold;
