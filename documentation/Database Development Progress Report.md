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

**PROJECT STATUS**

Database Development Status:  
COMPLETED

Total Tables:  
17

Total Enums:  
7

Total Views:  
4

Total Helper Functions:  
5

Realtime Tables:  
4

RLS-Protected Tables:  
17

Database Architecture Completion:  
100%