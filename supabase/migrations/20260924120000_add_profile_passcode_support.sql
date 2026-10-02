-- Migration: Add 6-Digit Passcode Support to Profiles
-- Date: 2026-09-24

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS has_passcode BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS passcode_updated_at TIMESTAMPTZ NULL;

-- Function for authenticated user to update their own passcode status
CREATE OR REPLACE FUNCTION public.set_own_passcode_status(
  p_has_passcode BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  UPDATE public.profiles
  SET 
    has_passcode = p_has_passcode,
    passcode_updated_at = CASE WHEN p_has_passcode THEN NOW() ELSE NULL END
  WHERE id = v_user_id;

  -- Record audit log if activity log function exists
  BEGIN
    PERFORM public.record_activity_log(
      CASE WHEN p_has_passcode THEN 'Passcode Configured' ELSE 'Passcode Removed' END,
      'Authentication',
      CASE WHEN p_has_passcode THEN 'User successfully configured a 6-digit login passcode.' ELSE 'User removed their 6-digit login passcode.' END
    );
  EXCEPTION WHEN OTHERS THEN
    -- Silently continue if record_activity_log signature differs
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', TRUE,
    'has_passcode', p_has_passcode,
    'updated_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_own_passcode_status(BOOLEAN) TO authenticated;
