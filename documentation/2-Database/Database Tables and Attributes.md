# PRDS Database Tables & Attributes Reference

> **System:** Pharmaceutical Resources Distribution System (PRDS) — City Health Office of Naga, Cebu.  
> **Database:** PostgreSQL (Supabase Cloud Backend) & SQLite (`prds.db` Local Client Cache).  
> **Last Verified:** October 2026

---

## 1. Core System Tables

### 1. `profiles`
Stores user profile information, role assignment, and authorization status linked to Supabase Auth (`auth.users`).

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, references `auth.users(id)` | Unique user authentication identifier |
| `first_name` | `text` | `NOT NULL` | User's first name |
| `last_name` | `text` | `NOT NULL` | User's last name |
| `email` | `text` | `UNIQUE` | User's email address |
| `phone_number` | `text` | Nullable | Contact number (used for Twilio Phone OTP) |
| `avatar_url` | `text` | Nullable | Storage URL for profile picture |
| `role` | `user_role` (ENUM) | `NOT NULL`, Default `'BHW'` | Role: `'PHARMA_II'`, `'PHARMA_I'`, or `'BHW'` |
| `facility_id` | `uuid` | References `facilities(id)` | Assigned health center or CHO |
| `status` | `profile_status` (ENUM) | `NOT NULL`, Default `'PENDING'` | Approval state: `'PENDING'`, `'ACTIVE'`, or `'DEACTIVATED'` |
| `approved_by` | `uuid` | References `profiles(id)` | Admin (`PHARMA_II`) who approved the account |
| `approved_at` | `timestamptz` | Nullable | Timestamp when account was approved |
| `created_at` | `timestamptz` | Default `now()` | Registration timestamp |
| `updated_at` | `timestamptz` | Default `now()` | Last profile update timestamp |

---

### 2. `facilities`
Stores the City Health Office central warehouse and the 28 Barangay Health Stations.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique facility identifier |
| `facility_name` | `text` | `NOT NULL` | Full name (e.g., "City Health Office", "Tinaan Health Center") |
| `facility_code` | `text` | `UNIQUE`, `NOT NULL` | Short code (e.g., "CHO", "TNHC", "MNGC") |
| `facility_type` | `text` | `NOT NULL` | Type: `'CHO'` or `'BHW'` (Barangay Health Station) |
| `address` | `text` | Nullable | Barangay address in City of Naga, Cebu |
| `status` | `text` | Default `'ACTIVE'` | Operational status (`'ACTIVE'` / `'INACTIVE'`) |
| `created_at` | `timestamptz` | Default `now()` | Facility creation timestamp |

---

### 3. `medicines`
Defines the standardized pharmaceutical formulary for the City of Naga.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique medicine identifier |
| `generic_name` | `text` | `NOT NULL` | Generic international nonproprietary name (e.g., "Paracetamol") |
| `brand_name` | `text` | Nullable | Commercial brand name (e.g., "Biogesic" or blank) |
| `dosage` | `text` | `NOT NULL` | Strength and dosage form (e.g., "500mg Tablet", "250mg/5mL Syrup") |
| `unit_of_measure` | `text` | `NOT NULL` | Packaging unit (e.g., "tablet", "capsule", "bottle", "vial", "box") |
| `unit_cost` | `numeric(10,2)` | `DEFAULT 0.00` | Acquisition / standard unit cost in PHP |
| `categories` | `text[]` | Default `'{}'` | Program tags (e.g., `["Analgesic", "Antibiotic", "Hypertension"]`) |

---

### 4. `suppliers`
Tracks licensed drug distributors and pharmaceutical manufacturers.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique supplier identifier |
| `supplier_name` | `text` | `NOT NULL` | Official company name |
| `contact_number` | `text` | Nullable | Representative telephone / mobile number |
| `address` | `text` | Nullable | Office / warehouse location |
| `status` | `text` | Default `'ACTIVE'` | Vendor status (`'ACTIVE'` / `'INACTIVE'`) |
| `created_at` | `timestamptz` | Default `now()` | Supplier registration timestamp |

---

### 5. `inventory`
Tracks physical medicine stock at each facility down to the specific batch, supplier, and expiration date.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique inventory record identifier |
| `facility_id` | `uuid` | References `facilities(id)` | Current location of stock |
| `medicine_id` | `uuid` | References `medicines(id)` | Medicine formulation |
| `supplier_id` | `uuid` | References `suppliers(id)` | Source vendor |
| `quantity` | `integer` | `CHECK (quantity >= 0)` | Physical balance on hand |
| `threshold` | `integer` | `CHECK (threshold >= 0)` | Safety stock reorder trigger |
| `batch_number` | `text` | `NOT NULL` | Manufacturer lot / batch number |
| `date_received` | `date` | `NOT NULL` | Date delivery was accepted |
| `expiration_date` | `date` | `CHECK (expiration_date > date_received)` | Expiry date (enforces FEFO dispensing) |
| `updated_at` | `timestamptz` | Default `now()` | Real-time balance modification timestamp |

---

## 2. Dispensing & Patient Tables

### 6. `patients`
Central master registry of residents receiving medical care across all barangays.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique patient identifier |
| `first_name` | `text` | `NOT NULL` | Patient's first name |
| `last_name` | `text` | `NOT NULL` | Patient's last name |
| `gender` | `text` | `NOT NULL` | Biological sex (`'MALE'` / `'FEMALE'`) |
| `date_of_birth` | `date` | `NOT NULL` | Birthdate (used for age calculation) |
| `facility_id` | `uuid` | References `facilities(id)` | Home barangay health center |
| `created_at` | `timestamptz` | Default `now()` | Registration date |

---

### 7. `patient_medicine_records`
Clinical dispensing history linked directly to patient files.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique record identifier |
| `patient_id` | `uuid` | References `patients(id)` | Patient recipient |
| `medicine_id` | `uuid` | References `medicines(id)` | Medicine dispensed |
| `quantity` | `integer` | `CHECK (quantity > 0)` | Number of units issued |
| `remarks` | `text` | Nullable | Clinical notes (e.g., PWD ID, Senior Citizen, prescription #) |
| `dispensed_by` | `uuid` | References `profiles(id)` | BHW or Pharmacist who released stock |
| `created_at` | `timestamptz` | Default `now()` | Timestamp of transaction |

---

### 8. `medicine_dispensing`
Financial and inventory audit log for each dispensing transaction.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique transaction ID |
| `facility_id` | `uuid` | References `facilities(id)` | Facility where stock was dispensed |
| `medicine_id` | `uuid` | References `medicines(id)` | Medicine formulation |
| `inventory_id` | `uuid` | References `inventory(id)` | Exact batch deducted |
| `patient_id` | `uuid` | References `patients(id)` | Patient receiving medicine |
| `quantity` | `integer` | `CHECK (quantity > 0)` | Quantity deducted |
| `dispensing_type` | `text` | Default `'PATIENT'` | Dispensing channel (`'PATIENT'`, `'PROGRAM'`, `'EMERGENCY'`) |
| `dispensed_by` | `uuid` | References `profiles(id)` | Staff member executing deduction |
| `dispense_date` | `timestamptz` | Default `now()` | Date and time of physical dispensing |

---

## 3. Requisitions & Inter-Facility Transfers

### 9. `medicine_requests`
Requisitions submitted by Barangay Health Stations to the City Health Office.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique request identifier |
| `facility_id` | `uuid` | References `facilities(id)` | Requesting health station |
| `requested_by` | `uuid` | References `profiles(id)` | BHW creator |
| `request_date` | `timestamptz` | Default `now()` | Submission timestamp |
| `status` | `request_status` (ENUM) | Default `'PENDING'` | Status: `'PENDING'`, `'APPROVED'`, `'REJECTED'`, `'COMPLETED'` |
| `approved_by` | `uuid` | References `profiles(id)` | Pharmacist reviewing the request |
| `remarks` | `text` | Nullable | Justification or delivery notes |

### 10. `medicine_request_items`
Individual line items requested in a requisition.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique item line identifier |
| `request_id` | `uuid` | References `medicine_requests(id)` | Parent requisition |
| `medicine_id` | `uuid` | References `medicines(id)` | Requested medicine |
| `quantity` | `integer` | `CHECK (quantity > 0)` | Quantity requested |

### 11. `medicine_request_fulfillments`
Tracks specific CHO warehouse inventory batches allocated to fulfill request items.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique fulfillment line |
| `request_item_id` | `uuid` | References `medicine_request_items(id)` | Request line item |
| `inventory_id` | `uuid` | References `inventory(id)` | Source batch deducted at CHO |
| `quantity_fulfilled` | `integer` | `CHECK (quantity_fulfilled > 0)` | Actual units issued |

---

### 12. `stock_transfers`
Inter-facility medicine transfers between health centers or from CHO to barangays.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique transfer identifier |
| `source_facility_id` | `uuid` | References `facilities(id)` | Originating health center |
| `destination_facility_id` | `uuid` | References `facilities(id)` | Receiving health center |
| `requested_by` | `uuid` | References `profiles(id)` | Initiating staff member |
| `approved_by` | `uuid` | References `profiles(id)` | Authorizing Pharmacist |
| `approved_at` | `timestamptz` | Nullable | Timestamp of authorization |
| `received_by` | `uuid` | References `profiles(id)` | Staff confirming receipt |
| `received_at` | `timestamptz` | Nullable | Physical acceptance timestamp |
| `status` | `transfer_status` (ENUM) | Default `'PENDING'` | `'PENDING'`, `'APPROVED'`, `'IN_TRANSIT'`, `'RECEIVED'`, `'REJECTED'` |
| `remarks` | `text` | Nullable | Reason for transfer |
| `created_at` | `timestamptz` | Default `now()` | Creation timestamp |

### 13. `stock_transfer_items`
Line items specified in a stock transfer.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique transfer item ID |
| `transfer_id` | `uuid` | References `stock_transfers(id)` | Parent transfer header |
| `medicine_id` | `uuid` | References `medicines(id)` | Medicine formulation |
| `quantity` | `integer` | `CHECK (quantity > 0)` | Quantity being moved |

### 14. `stock_transfer_fulfillments`
Exact batches deducted at the source facility and credited to the destination facility.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique fulfillment ID |
| `transfer_item_id` | `uuid` | References `stock_transfer_items(id)` | Parent transfer item |
| `inventory_id` | `uuid` | References `inventory(id)` | Source batch deducted |
| `quantity_fulfilled` | `integer` | `CHECK (quantity_fulfilled > 0)` | Physical quantity transferred |

---

## 4. Forecasting & Analytics Tables

### 15. `forecasting`
Server-generated or client-synchronized monthly demand predictions.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique forecast ID |
| `medicine_id` | `uuid` | References `medicines(id)` | Medicine evaluated |
| `facility_id` | `uuid` | References `facilities(id)` | Health facility scoped |
| `forecast_month` | `date` | `NOT NULL` | Target prediction month (e.g. `2026-11-01`) |
| `predicted_quantity` | `integer` | `CHECK (predicted_quantity >= 0)` | Estimated consumption units |
| `generated_at` | `timestamptz` | Default `now()` | Model computation timestamp |

### 16. `monthly_dispensing_summary` (Database View)
Materialized / virtual view summarizing monthly actuals used as the regression training dataset.

| Column | Type | Description |
| :--- | :--- | :--- |
| `facility_id` | `uuid` | Facility where dispensing occurred |
| `medicine_id` | `uuid` | Medicine dispensed |
| `month` | `text` / `date` | Month start date (`YYYY-MM-01`) |
| `total_dispensed` | `bigint` | Aggregate actual units dispensed in that month |

---

## 5. Administration & System Logs

### 17. `activity_logs`
Immutable audit trail capturing all operational actions across the system.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique log ID |
| `user_id` | `uuid` | References `profiles(id)` | Actor who performed the action |
| `action` | `text` | `NOT NULL` | Action code (e.g., `'DISPENSE'`, `'APPROVE_USER'`, `'STOCK_TRANSFER'`) |
| `module` | `text` | `NOT NULL` | Module name (e.g., `'DISPENSING'`, `'USERS'`, `'INVENTORY'`) |
| `details` | `text` | `NOT NULL` | Plain-English summary of the operation |
| `created_at` | `timestamptz` | Default `now()` | Exact timestamp of event |

### 18. `notifications`
In-app alert inbox for threshold breaches, transfer updates, and requisition approvals.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique notification ID |
| `user_id` | `uuid` | References `profiles(id)` | Recipient user |
| `title` | `text` | `NOT NULL` | Alert title (e.g., "Low Stock Alert", "Requisition Approved") |
| `message` | `text` | `NOT NULL` | Informative body text |
| `is_read` | `boolean` | Default `false` | Read status |
| `created_at` | `timestamptz` | Default `now()` | Generation timestamp |

### 19. `profile_facility_change_requests`
Requests submitted by staff members seeking reassignment to another health facility.

| Column | Type | Constraints / References | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY`, Default `gen_random_uuid()` | Unique request ID |
| `user_id` | `uuid` | References `profiles(id)` | Requesting user |
| `current_facility_id` | `uuid` | References `facilities(id)` | Existing station |
| `requested_facility_id` | `uuid` | References `facilities(id)` | Desired new station |
| `status` | `text` | Default `'PENDING'` | Status: `'PENDING'`, `'APPROVED'`, `'REJECTED'`, `'CANCELLED'` |
| `reviewed_by` | `uuid` | References `profiles(id)` | Pharmacist II reviewing request |
| `created_at` | `timestamptz` | Default `now()` | Submission timestamp |

---

## 6. Local SQLite Tables (`prds.db` in Desktop Client)

| Table | Purpose |
| :--- | :--- |
| `offline_mutation_queue` | FIFO queue storing locally committed transactions while offline, synced when online |
| `sync_metadata` | Stores sync watermarks (`last_pulled_at`), active user session info, and facility locks |
| `inventory`, `facilities`, `medicines`, `patients` | Local mirror tables allowing full offline read and write capability |