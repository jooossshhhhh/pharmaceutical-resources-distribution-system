/*
=====================================================
MIGRATION: CHO Supply Request Seed Stock Fix

Repairs and replenishes Central Health Office inventory
so BHW "New Supply Request" availability has stock to
show:

  - Losartan "F-23-56" batch expired 2026-09-05
    -> extended to 2027-06-30
  - Amlodipine "SEED-BATCH-032" at zero quantity
    -> replenished to 480
  - New unexpired CHO seed batches added for
    Amoxicillin, Paracetamol, ORS, Salbutamol

RPC SYNC: re-run the canonical helper script AFTER this
file to redeploy get_cho_inventory_medicines() and
submit_bhw_medicine_request() with the fulfillment-aware
reserved-stock logic:

  database/helper-functions/cho_inventory_medicines_function_schema.sql
=====================================================
*/

-- Repair: Losartan "F-23-56" (expired 2026-09-05, qty 867).
update public.inventory
   set expiration_date = '2027-06-30'
 where id = '7ccf4c4a-579a-4ddf-b4c6-6057c94f16c9';

-- Replenish: Amlodipine "SEED-BATCH-032" (qty 0, exp 2026-12-31).
update public.inventory
   set quantity = 480
 where id = 'edafaa75-5153-4a97-8bd1-ee4968cb1a2e';

-- Seed: new unexpired CHO batches.
insert into public.inventory
  (facility_id, medicine_id, supplier_id, quantity, threshold, batch_number, date_received, expiration_date)
values
  ('0b7e2eaa-1072-4fb1-8e14-d6fb46097aad', 'c335c69d-4612-48a3-80c6-a20fa9e0263b', '9ed12799-0dd1-48e1-8712-97833242fd99', 360, 100, 'SEED-BATCH-033', '2026-09-02', '2027-08-15'),
  ('0b7e2eaa-1072-4fb1-8e14-d6fb46097aad', 'cbb3259e-6cc7-4075-8de2-e2bceb2961f1', '1bba775a-0149-4a0f-9494-551adc41d061', 520, 200, 'SEED-BATCH-034', '2026-09-02', '2027-09-30'),
  ('0b7e2eaa-1072-4fb1-8e14-d6fb46097aad', '3b86e056-e4fb-4917-8d9d-a1442d87241a', '5627f118-dfb3-47d4-9d7c-a21a766440b0', 300, 100, 'SEED-BATCH-035', '2026-09-02', '2027-10-15'),
  ('0b7e2eaa-1072-4fb1-8e14-d6fb46097aad', '0fa2485a-b690-4825-b53e-6676047d8a59', '5027103c-ddc5-4c74-ae28-a107ea77e6ee', 180, 40, 'SEED-BATCH-036', '2026-09-02', '2027-07-31');