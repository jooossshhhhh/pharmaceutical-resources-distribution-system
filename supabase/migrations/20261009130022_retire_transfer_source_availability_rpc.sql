-- Transfers are retired in PRDS. Keep this RPC as a harmless compatibility
-- shim for older desktop clients that may still call it during a running session.
CREATE OR REPLACE FUNCTION public.get_transfer_source_availability(
  p_source_facility_id uuid DEFAULT NULL
)
RETURNS TABLE(
  source_facility_id uuid,
  source_facility_name text,
  source_facility_code text,
  medicine_id uuid,
  generic_name text,
  brand_name text,
  dosage text,
  unit_of_measure text,
  physical_quantity bigint,
  reserved_quantity bigint,
  available_quantity bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    NULL::uuid AS source_facility_id,
    NULL::text AS source_facility_name,
    NULL::text AS source_facility_code,
    NULL::uuid AS medicine_id,
    NULL::text AS generic_name,
    NULL::text AS brand_name,
    NULL::text AS dosage,
    NULL::text AS unit_of_measure,
    0::bigint AS physical_quantity,
    0::bigint AS reserved_quantity,
    0::bigint AS available_quantity
  WHERE FALSE;
$$;
