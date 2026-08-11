/*
=====================================================
Stock Transfer Fulfillments

Purpose:
Records which source inventory batch allocated each
stock transfer item.

Business Rules:
1. A transfer item can be allocated from multiple
   source batches.
2. Source inventory is deducted when the source
   facility marks the transfer ready for pickup.
3. Destination inventory is created or incremented
   when the destination confirms receipt.
4. Fulfillment rows are append-only audit records.
=====================================================
*/

create table stock_transfer_fulfillments (
    id uuid primary key default gen_random_uuid(),

    transfer_id uuid not null
        references stock_transfers(id)
        on delete cascade,

    transfer_item_id uuid not null
        references stock_transfer_items(id)
        on delete cascade,

    source_inventory_id uuid not null
        references inventory(id)
        on delete restrict,

    destination_inventory_id uuid
        references inventory(id)
        on delete restrict,

    quantity integer not null
        check (quantity > 0),

    fulfilled_by uuid not null
        references profiles(id)
        on delete restrict,

    fulfilled_at timestamptz not null default now(),

    received_by uuid
        references profiles(id)
        on delete restrict,

    received_at timestamptz,

    constraint stock_transfer_fulfillments_unique_batch
        unique (transfer_item_id, source_inventory_id)
);

create index if not exists idx_transfer_fulfillments_transfer
    on stock_transfer_fulfillments(transfer_id);

create index if not exists idx_transfer_fulfillments_item
    on stock_transfer_fulfillments(transfer_item_id);

create index if not exists idx_transfer_fulfillments_source_inventory
    on stock_transfer_fulfillments(source_inventory_id);

create index if not exists idx_transfer_fulfillments_destination_inventory
    on stock_transfer_fulfillments(destination_inventory_id);

create index if not exists idx_transfer_fulfillments_fulfilled_by
    on stock_transfer_fulfillments(fulfilled_by);

create index if not exists idx_transfer_fulfillments_received_by
    on stock_transfer_fulfillments(received_by);
