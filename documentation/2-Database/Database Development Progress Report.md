**Pharmaceutical Resources Distribution System (PRDS)**

**Database Development Progress Report**

**Project Title**

Pharmaceutical Resources Distribution System

**Database Platform**

Supabase (PostgreSQL)

**Primary Key Strategy**

All tables use UUID as the primary key:

- Data Type: UUID
- Default Value: gen_random_uuid()
- Purpose: Ensures globally unique identifiers and follows PostgreSQL/Supabase best practices.

**PHASE 1 - DATABASE PLANNING**

**Objective**

To identify the overall database architecture, user hierarchy, and core modules of the Pharmaceutical Resources Distribution System.

**Major Decisions**

**User Roles**

**Pharma II**

- System Administrator
- User Approval Authority
- Full System Access

**Pharma I**

- Operational Pharmacist
- Inventory Supervisor
- Patient Management
- Request and Transfer Approval Authority

**BHW (Barangay Health Worker)**

- Facility-Level Operations
- Patient Management
- Dispensing Management
- Medicine Request Creation

**Facility Hierarchy**

City Health Office (CHO)

↓

Barangay Health Centers

**Core Modules Identified**

- User Management
- Facility Management
- Medicine Management
- Inventory Management
- Medicine Requests
- Stock Transfers
- Patient Management
- Medicine Dispensing
- Programs Management
- Forecasting
- Notifications
- Activity Logging

**PHASE 2 - DATABASE DESIGN**

**Final Database Structure**

**Core Tables**

- profiles
- facilities
- medicines
- suppliers
- patients

**Inventory Module**

- inventory

**Request Module**

- medicine_requests
- medicine_request_items

**Transfer Module**

- stock_transfers
- stock_transfer_items

**Dispensing Module**

- medicine_dispensing
- patient_medicine_records

**Programs Module**

- other_programs
- program_medicines

**System Module**

- notifications
- activity_logs
- forecasting

**PHASE 3 - ENUMS**

Created standardized PostgreSQL enums to maintain data consistency throughout the system.

Implemented:

- user_role
- profile_status
- facility_status
- supplier_status
- request_status
- transfer_status
- dispensing_type

Purpose:

- Reduce data inconsistency
- Prevent invalid status values
- Improve database integrity

**PHASE 4 - CORE TABLES**

Created the following tables:

**profiles**

Stores user profiles and approval records.

**facilities**

Stores health facility information.

**medicines**

Stores medicine master records.

Key Design Decision:  
Medicine uniqueness is based on:

- Generic Name
- Dosage
- Unit of Measure

**suppliers**

Stores medicine supplier information.

**patients**

Stores patient information linked to facilities.

**PHASE 5 - INVENTORY LAYER**

Created inventory table.

Purpose:  
Centralized inventory monitoring and stock management.

Features:

- Batch Tracking
- Expiration Tracking
- Supplier Tracking
- Threshold Monitoring
- Stock Availability Monitoring

Implemented Constraints:

- Quantity cannot be negative
- Threshold cannot be negative
- Expiration date must be later than date received

**PHASE 6 - REQUEST MODULE**

Created:

- medicine_requests
- medicine_request_items

Purpose:  
Allows facilities to request medicines.

Workflow:

BHW

↓

Create Request

↓

Pharma I / Pharma II Review

↓

Approve / Reject

↓

Completed

**PHASE 7 - TRANSFER MODULE**

Created:

- stock_transfers
- stock_transfer_items

Purpose:  
Facilitates medicine transfer between facilities.

Supported Workflows:

- CHO to Barangay Transfer
- Barangay to Barangay Transfer (subject to approval)

**PHASE 8 - DISPENSING MODULE**

Created:

- medicine_dispensing
- patient_medicine_records

Purpose:  
Records medicine distribution and patient medicine history.

Future Support:

- One Free Medicine Claim Per Month
- Medicine Traceability

Traceability Chain:

Patient

↓

Dispensing

↓

Inventory Batch

↓

Supplier

**PHASE 9 - PROGRAMS MODULE**

Created:

- other_programs
- program_medicines

Purpose:  
Tracks health programs and medicines used in those programs.

Examples:

- Medical Missions
- Outreach Programs
- Vaccination Activities

**PHASE 10 - SYSTEM TABLES**

Created:

**notifications**

System-generated alerts and notifications.

**activity_logs**

Audit trail for system actions.

**forecasting**

Stores generated medicine demand forecasts.

**PHASE 11 - ROW LEVEL SECURITY PREPARATION**

Activities Completed:

- Table Relationship Testing
- Foreign Key Validation
- Constraint Validation
- Data Structure Verification

Decision:  
RLS implementation postponed until database testing was completed.

**PHASE 12 - HELPER FUNCTIONS**

Created:

- is_pharma_ii()
- is_pharma_i()
- is_bhw()
- get_user_facility()
- get_user_role()

Purpose:  
Simplify authorization and Row Level Security policies.

**PHASE 13 - DATABASE VIEWS**

Created:

**inventory_overview**

Unified inventory monitoring view.

**low_stock_view**

Displays medicines below threshold.

**expiring_medicines_view**

Displays medicines nearing expiration.

**monthly_dispensing_summary**

Displays monthly dispensing analytics.

**PHASE 14 - REALTIME IMPLEMENTATION**

Realtime enabled for:

- inventory
- notifications
- medicine_requests
- stock_transfers

Purpose:

- Real-time stock updates
- Real-time request monitoring
- Real-time transfer monitoring
- Real-time notification delivery

**PHASE 15 - ROW LEVEL SECURITY IMPLEMENTATION**

**Phase 15A**

Protected:

- profiles
- notifications

**Phase 15B**

Protected:

- facilities
- inventory

**Phase 15C**

Protected:

- medicine_requests
- medicine_request_items

**Phase 15D**

Protected:

- stock_transfers
- stock_transfer_items

**Phase 15E**

Protected:

- patients
- medicine_dispensing
- patient_medicine_records

**Phase 15F**

Protected:

- other_programs
- program_medicines
- forecasting
- activity_logs

Implemented Role-Based Access Control:

- BHW
- Pharma I
- Pharma II

**PHASE 16 - WALK-IN DISPENSING LAYER**

Activities Completed:

Schema extensions to medicine_dispensing:

- dispensing_transaction_id (uuid) - groups multiple batch rows into one claim transaction
- voided_by (uuid -> profiles), voided_at (timestamptz), void_reason (text) - reversible-transaction audit trail

Security Definer RPCs (granted to authenticated only):

- dispense_walk_in(p_patient_id, p_items) - role and facility checks, patient row lock for concurrency, monthly claim guard (voided claims excluded), FEFO allocation across non-expired batches, atomic inventory deduction, activity logging, staff notifications
- get_patient_monthly_claim_status(p_patient_id) - returns claimed_this_month for eligibility checks
- void_dispensing_transaction(p_transaction_id, p_reason) - Pharma II only; restores all deducted batch quantities

Performance Indexes:

- idx_medicine_dispensing_facility_date (facility_id, dispense_date desc)
- idx_medicine_dispensing_inventory_id
- idx_medicine_dispensing_patient_date
- idx_medicine_dispensing_transaction

Purpose:  
Enforce One Free Medicine Claim Per Month per patient (previously listed as Future Support in Phase 8) with FEFO traceability and voidable transactions.

Verification:  
All RPC paths smoke-tested live against Supabase (double-claim rejection, void-and-re-dispense cycle, multi-batch FEFO split, cross-facility BHW rejection).

**PHASE 17 - TERMINAL PASSCODE & MULTI-ACCOUNT AUTH**

Activities Completed:
- Schema extensions to `profiles` and `auth.users`:
  - `passcode_hash` (text), `passcode_updated_at` (timestamptz), `has_passcode` (boolean)
- Security Definer RPC:
  - `set_own_passcode_status(p_has_passcode, p_passcode_hash, p_passcode_updated_at)` for authenticated self-service passcode updates.
- Fast multi-account workstation switching supporting offline passcode validation with local PBKDF2/SHA-256 hash checks.

**PHASE 18 - DOH/DPRI MEDICINE PRICING MAPPING**

Activities Completed:
- Standardized unit costs and retail prices populated across all 86 formulary medicines in Naga CHO catalog (`20261001120000_populate_philippine_medicine_prices.sql`).
- Linked to physical inventory batches for monetary valuation in inventory ledgers and physical count reports.

**PHASE 19 - INCREMENTAL DELTA SYNC & CLINICAL CONFLICT RESOLUTION**

Activities Completed:
- Server-side `sync_tombstones` table capturing soft/hard deletes across all tables for incremental local deletion replication.
- Server-side `stock_deficit_audits` table enforcing the Clinical Primacy Axiom (offline physical dispensing cannot be rejected by cloud inventory shortages).
- Security Definer RPCs:
  - `record_stock_deficit_audit(...)` - logs non-blocking discrepancies when inventory drops below zero.
  - `reconcile_stock_deficit(p_audit_id, p_resolution_action, p_adjustment_quantity, p_notes)` - Pharma II reconciliation action.

**PHASE 20 - COMMERCIAL INVENTORY VS STOCK RETURNS SEGREGATION**

Activities Completed:
- Clean architectural decoupling of commercial inventory procurement from field stock returns.
- `inventory` table:
  - Added `po_number` (varchar 100) and `unit_cost` (numeric 12,2) for commercial Supplier -> CHO intake (`20261008070000_inventory_po_number_and_unit_cost.sql`).
  - Purged return batches from `inventory` (`20261009120000_purge_returns_from_inventory.sql`).
- Dedicated `stock_returns` and `stock_return_items` tables (`20261009110000_stock_returns_schema.sql`):
  - Tracks return slips, source/destination facility relations, returned-by details, return reasons, items, and verification custody status.
  - Full RLS protection for `PHARMA_I`, `PHARMA_II`, and `BHW` roles.
- Cleanup: Dropped deprecated `stock_transfers` and `stock_transfer_items` tables (`20261009100000_cleanup_drop_transfers.sql`).

**PHASE 21 - TAURI EMBEDDED SQLITE REPLICATION & OUTBOX ENGINE**

Activities Completed:
- Embedded SQLite replication schema in `%APPDATA%/com.prds.naga/prds.db` supporting WAL mode.
- Local `sync_metadata` table tracking incremental watermarks and offline passcode sessions.
- Transactional `outbox_queue` enabling resilient optimistic mutations with exponential backoff and idempotency keys.

**PROJECT STATUS**

Database Development Status:  
COMPLETED (through Phase 21)

Total Tables:  
21

Total Enums:  
7

Total Views:  
4

Total Helper Functions:  
6

Business Logic RPCs:  
7

Realtime Tables:  
4

RLS-Protected Tables:  
21

Database Architecture Completion:  
100%