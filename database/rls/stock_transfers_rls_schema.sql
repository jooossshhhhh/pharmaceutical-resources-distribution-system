/*
=====================================================
PHASE 15D — STOCK TRANSFERS RLS
=====================================================

Tables:
- stock_transfers
- stock_transfer_items

Purpose:
Controls stock transfer visibility,
approval workflow, and receiving workflow.

Business Rules:

BHW
----
✓ Create transfer requests
✓ View transfers involving their facility
✓ Confirm receipt

✗ Cannot approve transfers

Pharma I
---------
✓ View all transfers
✓ Approve transfers
✓ Reject transfers

Pharma II
----------
✓ Full access

Dependencies:
- stock_transfers
- stock_transfer_items
- profiles

Helper Functions:
- is_bhw()
- is_pharma_i()
- is_pharma_ii()
- get_user_facility()

=====================================================
*/


/*
=====================================================
STOCK TRANSFERS RLS
=====================================================
*/


-- BHW can create transfer requests

create policy "bhw_create_transfer_requests"

on stock_transfers

for insert

with check (
    is_bhw()
);



-- BHW can view transfers involving
-- their facility

create policy "bhw_view_facility_transfers"

on stock_transfers

for select

using (

    source_facility_id = get_user_facility()

    or

    destination_facility_id = get_user_facility()

);



-- Pharma staff can view all transfers

create policy "pharma_staff_view_transfers"

on stock_transfers

for select

using (

    is_pharma_i()

    or

    is_pharma_ii()

);



-- Pharma staff can approve/reject transfers

create policy "pharma_staff_update_transfers"

on stock_transfers

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



-- Pharma II can delete transfers

create policy "pharma_ii_delete_transfers"

on stock_transfers

for delete

using (
    is_pharma_ii()
);



/*
=====================================================
STOCK TRANSFER ITEMS RLS
=====================================================
*/


-- View transfer items when transfer
-- is visible

create policy "view_transfer_items"

on stock_transfer_items

for select

using (

    exists (

        select 1

        from stock_transfers st

        where st.id = stock_transfer_items.transfer_id

        and (

            st.source_facility_id = get_user_facility()

            or

            st.destination_facility_id = get_user_facility()

            or

            is_pharma_i()

            or

            is_pharma_ii()

        )
    )
);



-- Create transfer items

create policy "create_transfer_items"

on stock_transfer_items

for insert

with check (

    exists (

        select 1

        from stock_transfers st

        where st.id = stock_transfer_items.transfer_id

        and (

            st.requested_by = auth.uid()

            or

            is_pharma_i()

            or

            is_pharma_ii()

        )
    )
);



-- Update transfer items

create policy "update_transfer_items"

on stock_transfer_items

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



-- Delete transfer items

create policy "delete_transfer_items"

on stock_transfer_items

for delete

using (
    is_pharma_ii()
);



/*
=====================================================
END OF PHASE 15D
=====================================================

Stock Transfers
---------------

✓ BHW create transfer requests

✓ BHW view transfers involving
  their facility

✓ Pharma I approve transfers

✓ Pharma II full access


Stock Transfer Items
--------------------

✓ Visibility follows parent transfer

✓ Transfer creator can add items

✓ Pharma staff can manage items


Next Phase:
Phase 15E — Patients, Dispensing,
and Patient Medicine Records

=====================================================
*/