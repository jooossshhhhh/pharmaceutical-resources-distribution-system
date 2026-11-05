-- Migration: Fix ambiguous facility_id column reference in update_bhw_inventory_threshold
-- Description:
--   Resolves PostgreSQL 42702 ("column reference facility_id is ambiguous") caused by
--   RETURNS TABLE (id uuid, medicine_id uuid, facility_id uuid, threshold integer)
--   scoping the output parameter 'facility_id' as a PL/pgSQL variable.
--   Enables #variable_conflict use_column so PostgreSQL always prefers table columns
--   in SQL statements (such as ON CONFLICT clauses and RLS evaluations).

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
#variable_conflict use_column
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

  -- Upsert into facility_medicine_thresholds using explicit constraint name to avoid any column/variable ambiguity
  INSERT INTO public.facility_medicine_thresholds AS fmt (
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
  ON CONFLICT ON CONSTRAINT uq_facility_medicine_threshold DO UPDATE
  SET threshold = EXCLUDED.threshold,
      is_custom = true,
      updated_at = EXCLUDED.updated_at
  RETURNING fmt.id INTO v_fmt_id;

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
