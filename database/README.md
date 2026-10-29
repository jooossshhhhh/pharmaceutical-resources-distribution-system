# PRDS Database Backup

This folder contains the complete database structure and backup scripts for the Pharmaceutical Resource Distribution System (PRDS).

## Database Provider

* Supabase PostgreSQL

## Authentication Providers

* Supabase Auth (Phone OTP)
* Supabase Auth (Google Sign-In)
* Supabase Auth (Email Authentication)

## Folder Structure

### enums/
Contains PostgreSQL ENUM definitions used throughout the system (e.g., `user_role`, `request_status`, `transfer_status`, `notification_type`).

### schema/
Contains all database table creation scripts (e.g., `profiles`, `facilities`, `medicines`, `inventory`, `patients`, `medicine_requests`, `medicine_dispensing`, `stock_returns`, `notifications`, `forecasting`).

### helper-functions/
Contains PostgreSQL helper functions and stored procedures used by the database (e.g., activity logging, inventory calculations, walk-in dispensing, request fulfillment).

### indexes/
Contains database indexes used for performance optimization (e.g., `idx_inventory_fefo_active`, `idx_dispensing_patient_monthly_eligibility`).

### views/
Contains database views used for reporting and dashboards (e.g., `low_stock_view`, `monthly_dispensing_summary`, `patient_medicine_records`).

### rls/
Contains Row Level Security (RLS) policies enforcing multi-facility data isolation and role-based permissions (BHW vs PHARMA_I vs PHARMA_II).

## Database Creation Order

1. enums
2. schema
3. helper-functions
4. indexes
5. views
6. rls

## Core Database Rules & Policies

### 1. Immutable Record Rule (Audit Compliance)
Transactional ledger tables (`medicine_dispensing`, `stock_returns`, `inventory`) are **strictly immutable**. Physical row deletions (`DELETE FROM ...`) are prohibited at the database engine level via defensive triggers (`prevent_transaction_deletion()`):
* **Dispensing**: Erroneous records are cancelled using `void_dispensing_transaction()`, which stamps `voided_at`, `voided_by`, and `void_reason`, reversing deducted stock while preserving the audit record.
* **Inventory**: Depleted batches remain at `quantity = 0` to preserve lot/expiry history. Disposed batches are marked `status = 'DISPOSED'` with timestamp, disposer profile, and method.
* **Returns**: Cancelled returns are updated to `status = 'CANCELLED'`.

### 2. Financial Precision Standard
* All drug acquisition and batch valuation columns (`inventory.unit_cost`, `stock_returns.unit_cost`, `medicine_dispensing.unit_cost_at_dispense`) utilize `numeric(12, 4)`. This prevents fractional cent rounding loss across large institutional public health procurement.
* Line item totals (`total_cost_at_dispense`) are stored and rounded to standard 2-decimal currency (`numeric(12, 2)`).

### 3. FEFO (First-Expired, First-Out) Optimization
* Active stock queries utilize the partial compound index `idx_inventory_fefo_active` on `(facility_id, medicine_id, expiration_date ASC, date_received ASC) WHERE quantity > 0` for logarithmic allocation performance.

## Project

PRDS (Pharmaceutical Resource Distribution System)
Capstone Project

Technology Stack:
* **Frontend**: React.js + Vite + Tailwind CSS
* **Backend**: Supabase PostgreSQL
* **Desktop App**: Tauri Native SQLite (Hybrid Offline-First Store)
* **Authentication**: Supabase Auth
* **Future Mobile Application**: React Native
