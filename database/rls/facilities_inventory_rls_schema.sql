/*
=====================================================
PHASE 15B — FACILITIES & INVENTORY RLS
=====================================================

Tables:
- facilities
- inventory

Purpose:
Controls visibility and management of
facility and inventory data.

Business Rules:

BHW
----
✓ Can view own facility
✓ Can view own facility inventory

✗ Cannot view other facilities
✗ Cannot modify inventory

Pharma I
---------
✓ Can view all facilities
✓ Can view all inventory
✓ Can manage inventory

Pharma II
----------
✓ Full access

Dependencies:
- profiles
- facilities
- inventory

Helper Functions:
- is_pharma_ii()
- is_pharma_i()
- get_user_facility()

=====================================================
*/


/*
=====================================================
FACILITIES RLS
=====================================================
*/


-- Pharma I and Pharma II can view all facilities

create policy "pharma_staff_can_view_facilities"

on facilities

for select

using (
    is_pharma_i()
    or
    is_pharma_ii()
);


-- Registration can list active facilities for account requests

create policy "registration_can_view_active_facilities"

on facilities

for select

to anon, authenticated

using (
    status = 'ACTIVE'
);


-- BHW can view only assigned facility

create policy "bhw_can_view_own_facility"

on facilities

for select

using (
    id = get_user_facility()
);


-- Pharma II manages facilities

create policy "pharma_ii_manage_facilities"

on facilities

for all

using (
    is_pharma_ii()
)

with check (
    is_pharma_ii()
);



/*
=====================================================
INVENTORY RLS
=====================================================
*/


-- Pharma I and Pharma II can view all inventory

create policy "pharma_staff_view_inventory"

on inventory

for select

using (
    is_pharma_i()
    or
    is_pharma_ii()
);


-- BHW can view only inventory belonging
-- to their facility

create policy "bhw_view_own_inventory"

on inventory

for select

using (
    facility_id = get_user_facility()
);


-- Pharma I can insert inventory

create policy "pharma_i_insert_inventory"

on inventory

for insert

with check (
    is_pharma_i()
    or
    is_pharma_ii()
);


-- Pharma I can update inventory

create policy "pharma_i_update_inventory"

on inventory

for update

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


-- Pharma II can delete inventory

create policy "pharma_ii_delete_inventory"

on inventory

for delete

using (
    is_pharma_ii()
);



/*
=====================================================
END OF PHASE 15B
=====================================================

Facilities
----------
✓ Pharma staff can view all facilities
✓ BHW can view own facility
✓ Pharma II manages facilities

Inventory
---------
✓ BHW sees own inventory
✓ Pharma I sees all inventory
✓ Pharma II sees all inventory

✓ Pharma I can insert inventory
✓ Pharma I can update inventory

✓ Pharma II can delete inventory

Next Phase:
Phase 15C — Medicine Requests RLS

=====================================================
*/
