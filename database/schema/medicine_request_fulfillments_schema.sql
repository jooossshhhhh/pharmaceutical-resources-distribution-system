/*
=====================================================
Medicine Request Fulfillments

Purpose:
Records which CHO inventory batch fulfilled each
BHW medicine request item.

Business Rules:
1. A request item can be fulfilled from multiple CHO batches.
2. Each fulfillment deducts one source CHO batch and creates
   or increments one destination facility inventory batch.
3. Fulfillment rows are append-only audit records.
=====================================================
*/

create table medicine_request_fulfillments (
    id uuid primary key default gen_random_uuid(),

    request_id uuid not null
        references medicine_requests(id)
        on delete cascade,

    request_item_id uuid not null
        references medicine_request_items(id)
        on delete cascade,

    source_inventory_id uuid not null
        references inventory(id)
        on delete restrict,

    destination_inventory_id uuid not null
        references inventory(id)
        on delete restrict,

    quantity integer not null
        check (quantity > 0),

    fulfilled_by uuid not null
        references profiles(id)
        on delete restrict,

    fulfilled_at timestamptz not null default now(),

    constraint medicine_request_fulfillments_unique_batch
        unique (request_item_id, source_inventory_id)
);

create index if not exists idx_request_fulfillments_request
    on medicine_request_fulfillments(request_id);

create index if not exists idx_request_fulfillments_item
    on medicine_request_fulfillments(request_item_id);

create index if not exists idx_request_fulfillments_source_inventory
    on medicine_request_fulfillments(source_inventory_id);

create index if not exists idx_request_fulfillments_destination_inventory
    on medicine_request_fulfillments(destination_inventory_id);

create index if not exists idx_request_fulfillments_fulfilled_by
    on medicine_request_fulfillments(fulfilled_by);
