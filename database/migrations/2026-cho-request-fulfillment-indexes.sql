/*
=====================================================
CHO Request Fulfillment Indexes

Purpose:
Adds covering indexes for fulfillment foreign keys that
are read during request tracking and inventory audit views.
=====================================================
*/

create index if not exists idx_request_fulfillments_destination_inventory
on public.medicine_request_fulfillments(destination_inventory_id);

create index if not exists idx_request_fulfillments_fulfilled_by
on public.medicine_request_fulfillments(fulfilled_by);
