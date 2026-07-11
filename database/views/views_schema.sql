/*
=====================================================
PHASE 13 — DATABASE VIEWS (SECURITY FIXED)
=====================================================

Purpose:
Creates reusable reporting views that simplify
dashboard development, reporting, inventory
monitoring, and forecasting.

Security Enhancement:
All views use:

with (security_invoker = true)

This ensures that Row Level Security (RLS)
policies are enforced based on the currently
authenticated user instead of the view creator.

Fixes Supabase Advisor Warnings:

✓ Security Definer View
✓ inventory_overview
✓ low_stock_view
✓ expiring_medicines_view
✓ monthly_dispensing_summary

=====================================================
*/


/*
=====================================================
VIEW: inventory_overview
=====================================================
*/

create or replace view inventory_overview

with (security_invoker = true)

as

select

    i.id as inventory_id,

    f.id as facility_id,
    f.facility_name,

    m.id as medicine_id,
    m.generic_name,
    m.brand_name,
    m.dosage,
    m.unit_of_measure,

    s.id as supplier_id,
    s.supplier_name,

    i.quantity,
    i.threshold,

    i.batch_number,

    i.date_received,
    i.expiration_date,

    i.updated_at

from inventory i

join facilities f
    on i.facility_id = f.id

join medicines m
    on i.medicine_id = m.id

join suppliers s
    on i.supplier_id = s.id;



/*
=====================================================
VIEW: low_stock_view
=====================================================
*/

create or replace view low_stock_view

with (security_invoker = true)

as

select *

from inventory_overview

where quantity <= threshold;



/*
=====================================================
VIEW: expiring_medicines_view
=====================================================
*/

create or replace view expiring_medicines_view

with (security_invoker = true)

as

select *

from inventory_overview

where expiration_date between
      current_date
      and current_date + interval '90 days';



/*
=====================================================
VIEW: monthly_dispensing_summary
=====================================================
*/

create or replace view monthly_dispensing_summary

with (security_invoker = true)

as

select

    facility_id,

    medicine_id,

    date_trunc(
        'month',
        dispense_date
    )::date as month,

    sum(quantity) as total_dispensed

from medicine_dispensing

group by

    facility_id,
    medicine_id,

    date_trunc(
        'month',
        dispense_date
    );