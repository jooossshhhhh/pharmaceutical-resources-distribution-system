/*
=====================================================
CHO Inventory Medicines RPC

Purpose:
Returns the medicines currently stocked (quantity > 0)
in the Central Health Office (CHO) inventory, for the
BHW medicine request form.

Request Rule:
1. BHWs may only request medicines that the CHO can
   actually fulfill, so the list is limited to
   medicines present in CHO inventory with stock
   available.
2. security definer is required because BHW users are
   restricted by inventory RLS to their own facility's
   rows; the CHO inventory must remain readable for
   request selection while direct table access stays
   locked down.

Dependencies:
- facilities (facility_type = 'CHO')
- inventory
- medicines
=====================================================
*/

create or replace function public.get_cho_inventory_medicines()
returns table (
  id uuid,
  generic_name text,
  brand_name text,
  dosage text,
  unit_of_measure text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (m.id)
    m.id,
    m.generic_name,
    m.brand_name,
    m.dosage,
    m.unit_of_measure
  from public.inventory i
  join public.medicines m
      on m.id = i.medicine_id
  join public.facilities f
      on f.id = i.facility_id
  where f.facility_type = 'CHO'
    and i.quantity > 0
  order by m.id, m.generic_name;
$$;

revoke all on function public.get_cho_inventory_medicines() from public;
grant execute on function public.get_cho_inventory_medicines() to authenticated;;
