# Supabase Architecture Plan

> **System:** Pharmaceutical Resources Distribution System (PRDS)  
> **Jurisdiction:** City Health Office (CHO) of Naga, Cebu & 28 Barangay Health Stations  
> **Backend Infrastructure:** Supabase (PostgreSQL 15, GoTrue Auth, PostgREST, Realtime)  

---

## 1. Authentication & Identity Layer

The authentication layer manages user credentials, account lifecycle, session validation, and role-based access.

### Core Features Used:
* **Supabase GoTrue:** User credential management and PKCE token issuance.
* **Email Verification & Password Reset:** Account security and password recovery flows.
* **Phone OTP (Twilio Verify):** SMS verification for mobile logins (+63 Philippines).
* **Session Management:** Secure JWT token issuance with 1-hour access token rotation.

### Architecture (`auth.users` vs `public.profiles`):
* `auth.users`: Managed by GoTrue; securely stores hashed passwords, emails, phones, and auth metadata.
* `public.profiles`: Managed by PRDS; stores domain user profiles (first name, last name, assigned facility, role, account status) keyed to `auth.users.id` via foreign key UUID.

### User Registration & Approval Workflow:
1. **Registration:** User submits registration form → Account created with `status = 'PENDING'`.
2. **Review:** Chief Pharmacist (`PHARMA_II`) reviews pending applications in the User Management Workbench.
3. **Approval:** `PHARMA_II` verifies credentials, sets role/facility, and updates `status = 'ACTIVE'`.
4. **Access Granted:** User gains access to their authorized module routes.

| Role | Can Self-Register | Can Approve New Accounts |
| :--- | :---: | :---: |
| **BHW** | Yes | No |
| **PHARMA_I** | Yes | No |
| **PHARMA_II** | Yes | Yes |

---

## 2. Master Data Layer

Stores foundational reference data that changes infrequently:

| Master Table | Scope & Purpose | Example Entities |
| :--- | :--- | :--- |
| **`facilities`** | Reference table for healthcare facilities | City Health Office (VMCH), Tinaan Health Center, East Poblacion Health Center. |
| **`medicines`** | Master drug catalog and specifications | Generic Name, Brand Name, Unit of Measure (Tablet/Bottle), Dosage, Safety Thresholds. |
| **`suppliers`** | Pharmaceutical distributors & traceability | Approved LGU drug suppliers, contact numbers, distributor addresses. |
| **`patients`** | Citizen demographic records | Full name, date of birth, PhilHealth ID, assigned barangay station. |
| **`other_programs`** | Targeted municipal health campaigns | Medical Missions, Operation Tuli, Anti-Rabies, School Deworming. |

---

## 3. Transaction Layer

Captures day-to-day operational events across the supply chain:

| Table | Purpose |
| :--- | :--- |
| **`inventory`** | Batch-level medicine stock on hand (lot number, expiration date, quantity, location). |
| **`medicine_requests`** | Downstream replenishment orders submitted by Barangay Health Stations. |
| **`medicine_request_items`**| Line-item medicines and requested quantities. |
| **`stock_transfers`** | Inter-facility inventory redistribution (excess or near-expiry balancing). |
| **`stock_transfer_items`** | Line-item batches allocated to stock transfers. |
| **`medicine_dispensing`** | Point-of-sale medicine disbursements to patients with FEFO batch deduction. |
| **`patient_medicine_records`**| Patient clinical dispensation history and dosage records. |
| **`program_medicines`** | Batches allocated to special outreach public health programs. |

---

## 4. Dispensing Channels & Verification Rules

PRDS supports three distinct pharmaceutical dispensing channels:
1. **Walk-In Patients:** Directly dispensed to citizens at the CHO clinic counter or barangay station.
2. **Facility Replenishments:** Requisitions approved by CHO and transferred to barangays.
3. **Special Programs:** Bulk allocations for municipal health drives.

### Patient Eligibility & Double-Dispensing Prevention:
Before confirming patient dispensing, the system checks whether the patient has already claimed free medicines within restricted clinical cooldown windows (e.g. within the last 14–30 days for maintenance medications).

---

## 5. Security Layer: Row Level Security (RLS)

PostgreSQL Row Level Security ensures tenant isolation and role governance at the database engine level:

| User Role | Permitted Database Access | Prohibited Operations |
| :--- | :--- | :--- |
| **`BHW`** | • Own station inventory<br/>• Own station requests & transfers<br/>• Dispensing to station patients<br/>• Own station reports & forecasts | • Cannot view other station inventory details<br/>• Cannot manage users or approve registrations<br/>• Cannot modify master medicine catalog |
| **`PHARMA_I`** | • Central warehouse inventory<br/>• City-wide inventory monitoring<br/>• Request review & FEFO allocation<br/>• Dispensing at CHO pharmacy | • Cannot approve user registrations<br/>• Cannot modify system-wide security settings |
| **`PHARMA_II`** | • Full system access across all 28 facilities<br/>• User management & account approval<br/>• Supplier contracts & catalog governance<br/>• Audit log inspection & statutory report sign-off | None (System Administrator & Chief Pharmacist). |

---

## 6. Realtime Publications & Database Automations

### Realtime Channels:
* **`inventory-changes`**: Broadcasts batch quantity changes to active dashboards.
* **`notifications-channel`**: Pushes real-time alerts for low stock, expiring batches, and requisition approvals.

### Key Database Automations:
* **Automated FEFO Lot Selection:** Stored procedures allocate batches with the soonest expiration dates first.
* **Activity Audit Triggers:** Automatically inserts immutable audit entries on stock adjustments, status transitions, and user deactivations.