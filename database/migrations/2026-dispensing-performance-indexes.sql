-- Dispensing performance indexes
-- Covers the walk-in dispensing history query (per-facility, newest-first)
-- and the void path's batch restore lookup.

create index if not exists idx_medicine_dispensing_facility_date
  on public.medicine_dispensing (facility_id, dispense_date desc);

create index if not exists idx_medicine_dispensing_inventory_id
  on public.medicine_dispensing (inventory_id);
