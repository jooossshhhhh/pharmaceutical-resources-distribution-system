/*
=====================================================
Inventory Table

Purpose:
Stores the current medicine stock of each facility.

This table supports:
- Stock Monitoring
- Low Stock Alerts
- Expiration Watchlist
- Medicine Dispensing
- Stock Transfers
- Medicine Requests
- Forecasting

Business Rules:
1. A facility can have multiple medicine batches.
2. The same medicine can come from different suppliers.
3. The same medicine can have multiple batches.
4. Quantity can be 0 to preserve inventory history.
5. Threshold is facility-specific and supports forecasting.
6. Duplicate batch entries within the same facility are not allowed.
7. Expiration date must be later than the received date.
8. Facilities, medicines, and suppliers cannot be deleted while inventory records reference them.

Phase 5:
✅ UUID Primary Key
✅ Foreign Keys
✅ ON DELETE RESTRICT
✅ Quantity Validation
✅ Threshold Validation
✅ Expiration Validation
✅ Duplicate Batch Prevention
✅ Forecasting Support
✅ Low Stock Alert Support
✅ Supplier Tracking
✅ Batch Tracking
=====================================================
*/

create table inventory (
    id uuid primary key default gen_random_uuid(),

    facility_id uuid not null
        references facilities(id)
        on delete restrict,

    medicine_id uuid not null
        references medicines(id)
        on delete restrict,

    supplier_id uuid not null
        references suppliers(id)
        on delete restrict,

    quantity integer not null
        check (quantity >= 0),

    threshold integer not null
        check (threshold >= 0),

    batch_number text not null,

    date_received date not null,

    expiration_date date not null,

    updated_at timestamptz not null default now(),

    constraint inventory_expiration_check
        check (expiration_date > date_received),

    constraint inventory_unique_batch
        unique (
            facility_id,
            medicine_id,
            supplier_id,
            batch_number
        )
);