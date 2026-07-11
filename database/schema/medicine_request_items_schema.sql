/*
=====================================================
Medicine Request Items

Purpose:
Stores the medicines included in a request.

Example:

Request #001

Paracetamol 500mg  Qty: 100
Amoxicillin 500mg  Qty: 50
Vitamin C          Qty: 200

Business Rules:
1. Every item belongs to a request.
2. Every item references a medicine.
3. Quantity must be greater than zero.
4. Duplicate medicine entries within the
   same request are not allowed.
=====================================================
*/

create table medicine_request_items (
    id uuid primary key default gen_random_uuid(),

    request_id uuid not null
        references medicine_requests(id)
        on delete cascade,

    medicine_id uuid not null
        references medicines(id)
        on delete restrict,

    quantity integer not null
        check (quantity > 0),

    constraint request_item_unique_medicine
        unique (
            request_id,
            medicine_id
        )
);