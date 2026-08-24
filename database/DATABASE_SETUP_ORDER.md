# Database Setup Order

## 1. ENUMS

* enum_creation_schema.sql

## 2. CORE TABLES

* facilities_schema.sql
* profiles_schema.sql
* profile_facility_change_requests_schema.sql
* medicines_schema.sql
* suppliers_schema.sql
* patient_schema.sql



## 3. INVENTORY

* inventory_schema.sql
* medicine_constraint_schema.sql



## 4. REQUESTS

* medicine_request_schema.sql
* medicine_request_items_schema.sql
* medicine_request_fulfillments_schema.sql


## 5. TRANSFERS

* stock_tranfers_schema.sql
* stock_transfer_items_schema.sql
* stock_transfer_fulfillments_schema.sql


## 6. DISPENSING

* medicine_dispensing_schema.sql
* patient_medicine_records_schema.sql


## 7. PROGRAMS

* other_programs_schema.sql
* program_medicines_schema.sql


## 8. SYSTEM TABLES

* notitficatoins_schema.sql
* activity_logs_schema.sql
* forecasting_schema.sql


## 9. HELPER FUNCTIONS

* helper_functions_schema.sql
* auth_profile_trigger_schema.sql
* visible_notifications_function_schema.sql
* cho_inventory_medicines_function_schema.sql

## 10. INDEXES

* indexes_schema.sql


## 11. VIEWS

* views_schema.sql


## 12. REALTIME

* realtime_publication_schema.sql


## 13. RLS POLICIES

* medicines_rls_schema.sql
* facilities_inventory_rls_schema.sql
* medicine_reqeuests_rls_schema.sql
* patients_dispensing_rls_schema.sql
* profile_notifications_rls_schema.sql
* profile_facility_change_requests_rls_schema.sql
* program_forecasting_activitylogs_rls_schema.sql
* stock_transfers_rls_schema.sql
* suppliers_rls_schema.sql


## 14. MIGRATIONS (run in order)

* 2026-request-receipt-confirmation.sql
* 2026-cho-bhw-stock-availability.sql
* 2026-cho-request-batch-fulfillment.sql
* 2026-cho-request-fulfillment-indexes.sql
* 2026-inventory-features.sql
* 2026-facilities-coordinates.sql
* 2026-facilities-coordinates-cho-naga.sql
* 2026-profile-avatars.sql
* 2026-stock-transfer-batch-fulfillment.sql
* 2026-stock-transfer-source-controlled-workflow.sql
* 2026-fix-confirm-stock-transfer-received-ambiguous-returning.sql
* 2026-fix-confirm-stock-transfer-received-ambiguous-id-where.sql
* 2026-stock-transfer-source-allocation-source-only.sql
* 2026-patient-registration-logbook.sql
* 2026-dispensing-walk-in-transactions.sql
* 2026-dispensing-walk-in-rpcs.sql
* 2026-dispensing-performance-indexes.sql
* 2026-backend-audit-hardening.sql

