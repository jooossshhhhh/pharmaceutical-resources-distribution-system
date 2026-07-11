/*
=====================================================
PHASE 15C — MEDICINE REQUESTS RLS
=====================================================

Tables:
- medicine_requests
- medicine_request_items

Purpose:
Controls who can create, view,
approve, and manage medicine requests.

Business Rules:

BHW
----
✓ Create medicine requests
✓ View requests from own facility

✗ Cannot approve requests
✗ Cannot view unrelated requests

Pharma I
---------
✓ View all requests
✓ Approve requests
✓ Reject requests
✓ Update request status

Pharma II
----------
✓ Full access
✓ Approve requests
✓ Reject requests

Dependencies:
- profiles
- facilities
- medicine_requests
- medicine_request_items

Helper Functions:
- is_bhw()
- is_pharma_i()
- is_pharma_ii()
- get_user_facility()

=====================================================
*/


/*
=====================================================
MEDICINE REQUESTS RLS
=====================================================
*/


-- BHW can create requests

create policy "bhw_create_requests"

on medicine_requests

for insert

with check (
    is_bhw()
);



-- BHW can view requests from their facility

create policy "bhw_view_own_facility_requests"

on medicine_requests

for select

using (
    facility_id = get_user_facility()
);



-- Pharma I and Pharma II can view all requests

create policy "pharma_staff_view_requests"

on medicine_requests

for select

using (
    is_pharma_i()
    or
    is_pharma_ii()
);



-- Pharma I and Pharma II can update requests

create policy "pharma_staff_update_requests"

on medicine_requests

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



-- Pharma II can delete requests if needed

create policy "pharma_ii_delete_requests"

on medicine_requests

for delete

using (
    is_pharma_ii()
);



/*
=====================================================
MEDICINE REQUEST ITEMS RLS
=====================================================
*/


-- View request items when request is visible

create policy "view_request_items"

on medicine_request_items

for select

using (

    exists (

        select 1

        from medicine_requests mr

        where mr.id = medicine_request_items.request_id

        and (

            mr.facility_id = get_user_facility()

            or

            is_pharma_i()

            or

            is_pharma_ii()

        )
    )
);



-- Create request items

create policy "create_request_items"

on medicine_request_items

for insert

with check (

    exists (

        select 1

        from medicine_requests mr

        where mr.id = medicine_request_items.request_id

        and (

            mr.requested_by = auth.uid()

            or

            is_pharma_i()

            or

            is_pharma_ii()

        )
    )
);



-- Update request items

create policy "update_request_items"

on medicine_request_items

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



-- Delete request items

create policy "delete_request_items"

on medicine_request_items

for delete

using (
    is_pharma_ii()
);



/*
=====================================================
END OF PHASE 15C
=====================================================

Medicine Requests
-----------------

✓ BHW create requests

✓ BHW view own facility requests

✓ Pharma I view all requests

✓ Pharma I approve/reject requests

✓ Pharma II full access


Medicine Request Items
----------------------

✓ Request items follow parent request visibility

✓ Request creator can add items

✓ Pharma staff can manage items


Next Phase:
Phase 15D — Stock Transfers RLS

=====================================================
*/