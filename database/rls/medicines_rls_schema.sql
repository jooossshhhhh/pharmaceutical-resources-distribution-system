/*
=====================================================
MEDICINES RLS
=====================================================

Purpose:
Controls access to the medicine catalog.

Business Rules:
1. Active users can view medicine definitions needed by
   inventory, requests, dispensing, and reports.
2. Pharma I and Pharma II can create and update medicine
   definitions.
3. Only Pharma II can delete medicine definitions.

Dependencies:
- profiles
- helper functions:
  - is_bhw()
  - is_pharma_i()
  - is_pharma_ii()
=====================================================
*/

alter table medicines enable row level security;

drop policy if exists "pharma_staff_view_medicines"
on medicines;

drop policy if exists "pharma_staff_insert_medicines"
on medicines;

drop policy if exists "pharma_staff_update_medicines"
on medicines;

drop policy if exists "pharma_ii_delete_medicines"
on medicines;


create policy "pharma_staff_view_medicines"

on medicines

for select

to authenticated

using (
    is_pharma_i()
    or
    is_pharma_ii()
    or
    is_bhw()
);


create policy "pharma_staff_insert_medicines"

on medicines

for insert

to authenticated

with check (
    is_pharma_i()
    or
    is_pharma_ii()
);


create policy "pharma_staff_update_medicines"

on medicines

for update

to authenticated

using (
    is_pharma_i()
    or
    is_pharma_ii()
)

with check (
    is_pharma_i()
    or
    is_pharma_ii()
);


create policy "pharma_ii_delete_medicines"

on medicines

for delete

to authenticated

using (
    is_pharma_ii()
);
