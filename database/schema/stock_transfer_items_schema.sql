/*
=====================================================
Stock Transfer Items

Purpose:
Stores the medicines included in a transfer.

Example:

Transfer #001

Paracetamol 500mg    Qty: 100
Amoxicillin 500mg    Qty: 50
Vitamin C            Qty: 200

Business Rules:
1. Every item belongs to a transfer.
2. Every item references a medicine.
3. Quantity must be greater than zero.
4. Duplicate medicine entries within the
   same transfer are not allowed.
=====================================================
*/

create table stock_transfer_items (

    id uuid primary key default gen_random_uuid(),

    transfer_id uuid not null
        references stock_transfers(id)
        on delete cascade,

    medicine_id uuid not null
        references medicines(id)
        on delete restrict,

    quantity integer not null
        check (quantity > 0),

    constraint transfer_item_unique_medicine
        unique (
            transfer_id,
            medicine_id
        )
);