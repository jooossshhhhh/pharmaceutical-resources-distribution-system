-- Migration: Aggregate brand name in get_cho_inventory_medicines
-- Description:
--   Aggregates non-empty brand_name values from inventory batches at CHO facilities
--   instead of returning NULL::text, ensuring that brand names like 'ritemed'
--   display correctly in the BHW Supply Request module.

CREATE OR REPLACE FUNCTION public.get_cho_inventory_medicines()
RETURNS TABLE (
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
SET search_path = ''
AS $$
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
      AND i.quantity > 0
      AND (i.expiration_date IS NULL OR i.expiration_date > CURRENT_DATE)
    GROUP BY i.medicine_id
    HAVING SUM(i.quantity) > 0
  ),
  reserved_stock AS (
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
$$;

REVOKE ALL ON FUNCTION public.get_cho_inventory_medicines() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_cho_inventory_medicines() TO authenticated;
