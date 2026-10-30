-- Migration: BHW Inventory Threshold Permission
-- Allows BHWs to update the reorder threshold for medicines in their own assigned facility.
-- Also allows CHO pharmacy staff to update thresholds for any facility or their own.

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
  v_count integer;
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

  -- Update all active lots of this medicine in the target facility
  RETURN QUERY
  UPDATE public.inventory
     SET threshold = p_threshold,
         updated_at = NOW()
   WHERE inventory.facility_id = v_target_facility_id
     AND inventory.medicine_id = p_medicine_id
   RETURNING inventory.id, inventory.medicine_id, inventory.facility_id, inventory.threshold;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'No inventory records found for this medicine in the specified facility.'
      USING errcode = 'P0001';
  END IF;

  -- Log to activity logs
  INSERT INTO public.activity_logs (user_id, action, module, details)
  VALUES (
    auth.uid(),
    'Update Threshold',
    'Inventory',
    'Updated inventory threshold to ' || p_threshold || ' for medicine ' || p_medicine_id || ' at facility ' || v_target_facility_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_bhw_inventory_threshold(uuid, integer, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_bhw_inventory_threshold(uuid, integer, uuid) TO authenticated;
