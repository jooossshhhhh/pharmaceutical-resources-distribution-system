create or replace function public.get_transfer_source_availability(p_source_facility_id uuid default null)
returns table(
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
language sql
stable
security invoker
set search_path = ''
as $$
  select
    null::uuid as source_facility_id,
    null::text as source_facility_name,
    null::text as source_facility_code,
    null::uuid as medicine_id,
    null::text as generic_name,
    null::text as brand_name,
    null::text as dosage,
    null::text as unit_of_measure,
    0::bigint as physical_quantity,
    0::bigint as reserved_quantity,
    0::bigint as available_quantity
  where false;
$$;;
