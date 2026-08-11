/*
=====================================================
SUPPLIERS RLS
=====================================================

Purpose:
Controls access to supplier records.

Business Rules:
1. Only Pharma II can view, create, update, and delete
   supplier records. Supplier management is a
   Central Health Office (CHO) admin task.
2. PHARMA_I and BHW cannot access supplier records
   directly. Inventory views that join suppliers run
   with the view owner's privileges and are unaffected.

Dependencies:
- profiles
- helper functions:
  - is_pharma_ii()
=====================================================
*/

alter table suppliers enable row level security;

drop policy if exists "pharma_ii_view_suppliers"
on suppliers;

drop policy if exists "pharma_ii_insert_suppliers"
on suppliers;

drop policy if exists "pharma_ii_update_suppliers"
on suppliers;

drop policy if exists "pharma_ii_delete_suppliers"
on suppliers;


create policy "pharma_ii_view_suppliers"

on suppliers

for select

to authenticated

using (
    is_pharma_ii()
);


create policy "pharma_ii_insert_suppliers"

on suppliers

for insert

to authenticated

with check (
    is_pharma_ii()
);


create policy "pharma_ii_update_suppliers"

on suppliers

for update

to authenticated

using (
    is_pharma_ii()
)

with check (
    is_pharma_ii()
);


create policy "pharma_ii_delete_suppliers"

on suppliers

for delete

to authenticated

using (
    is_pharma_ii()
);
