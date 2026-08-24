**Supabase Architecture Plan**

Pharmaceutical Resources Distribution System

- **Authentication Layer**

**Purpose:**

Handles user authentication, login, password management, and account sessions.

- **Supabase Features Used**

| **Feature**        | **Purpose**                |
| ------------------ | -------------------------- |
| Supabase Auth      | User Authentication        |
| Email Verification | Verify user email          |
| Password Reset     | Recover Accounts           |
| Session Management | Secure user login sessions |

- **Architecture**

auth.users

profiles

**Notes:**

- **auth.users** manages login credentials.
- profiles stores application-specific information.
- Profiles are linked to auth.users through the same UUID.

- **User Registration and Approval Workflow**

- **Registration Flow**

User Registration

Status = Pending

Reviewed by Pharma II

Status = Active

User Gains Access

- **User Status**

| **Status**  | **Description**                    |
| ----------- | ---------------------------------- |
| PENDING     | Waiting for Pharma II approval     |
| ACTIVE      | Approved and can access the system |
| DEACTIVATED | Account disabled                   |

- **Approval Authority**

| **Role**  | **Can Register** | **Can Approve Users** |
| --------- | ---------------- | --------------------- |
| BHW       | Yes              | No                    |
| Pharma I  | Yes              | No                    |
| Pharma II | Yes              | Yes                   |

- **Mater Data Layer**

Purpose:

Stores information that rarely changes.

<div class="joplin-table-wrapper"><table><tbody><tr><th><p><strong>Facilities</strong></p></th><th><p><strong>Medicines</strong></p></th><th><p><strong>Supplier</strong></p></th><th><p><strong>Patients</strong></p></th><th><p><strong>Other Program</strong></p></th></tr><tr><td><ul><li>CHO</li><li>Tinaan Health Center</li><li>Easth Poblacion Health Center</li></ul><p><strong>Purpose:</strong></p><p>Reference Table</p></td><td><ul><li>Paracetamol</li><li>Amoxicillin</li><li>Mefenamic Acid</li></ul><p><strong>Purpose:</strong></p><p>Medicine catalog</p></td><td><ul><li>ABC Pharma</li><li>XYZ Medical</li></ul><p>Purpose:</p><p>Traceability</p></td><td><p><strong>Purpose:</strong></p><p>Citizen records</p></td><td><p><strong>Purpose:</strong></p><p>Medical missions and special programs</p></td></tr></tbody></table></div>

- **Transaction Layer**

Purpose:

Stores day-to-day operational records.


| **Table**                | **Purpose**                    |
| ------------------------ | ------------------------------ |
| Inventory                | Current medicine stock         |
| Medicine Requests        | Requests from facilities       |
| Medicine Request Items   | Requested medicines            |
| Stock Transfers          | Movement of medicines          |
| Stock Transfer Items     | Transferred medicine           |
| Medicine Dispensing      | Medicine issuance transactions |
| Patient Medicine Records | Patient medicine history       |
| Program Medicines        | Medicines used in programs     |

- **Inventory Design**

**Inventory Represents**

- Facility
- Medicine
- Supplier
- Batch
- Expiration Date

**Purpose**

Tracks:

- Stock Quantity
- Batch Number
- Expiration Monitoring
- Supplier Traceability
- Forecasting Data
- Transfer Monitoring

- **Dispensing Channels**

The system supports three dispensing channels

| **Channel**       | **Description**                        |
| ----------------- | -------------------------------------- |
| Walk-In Patients  | Medicines directly issued to patients  |
| Facility Requests | Medicines requested by health centers  |
| Other Programs    | Medical missions and outreach programs |

- **Patient Eligibility Monitoring**

**Purpose:**

Prevents multiple free medicine claims within the same month.

- **Validation Rule**

Before Dispensing:

**Check:**  
Has the patient already received free medicine during the current month?

**Related Tables:**

Table:

- Patient
- Medicine Dispensing
- Patient Medicine Record

- **System Services Layer**

**Notifications**

**Purposes:**

Provides system alerts.

**Example:**

Notification:

- Request Approved
- Transfer Approved
- Transfer Received

**Activity Logs**

**Purpose:**

Tracks user actions.

**Structure**

| **Field** | **Purpose**          |
| --------- | -------------------- |
| Action    | What happened        |
| Module    | Where it happened    |
| Details   | Specific description |

**Example**

| **Field** | **Value**                 |
| --------- | ------------------------- |
| Action    | APPROVE_REQUEST           |
| Module    | Medicine Requests         |
| Details   | Approved Request #REQ-001 |

- **Forecasting Layer**

**Purpose**

Predict future medicine demand.

**Forecasting Sources**

Forecast calculations should use:

**Date Source**

- Medicine Dispensing
- Patient Medicine Records
- Program Medicine Usage

**Note:**

Forecasts should not rely solely on Inventory records.

Inventory reflects remaining stock, not actual consumption.

- **Security Layer (Row Level Security)**

Purpose

Restrict data access according to user roles.

<div class="joplin-table-wrapper"><table><tbody><tr><th><p><strong>Facility</strong></p></th><th><p><strong>Can Access</strong></p><p><strong>(Permission)</strong></p></th><th><p><strong>Cannot Access (Restrictions)</strong></p></th></tr><tr><td><p><strong>BHW</strong></p></td><td><ul><li>Own Facility Inventory</li><li>Own Facility Requests</li><li>Own Facility Transfers</li><li>Dispense Medicines</li><li>Own Reports</li><li>Own Forecast</li></ul></td><td><ul><li>Other Facility Inventory Details</li><li>User Management</li><li>Approval Functions</li></ul></td></tr><tr><td><p><strong>Pharma I</strong></p></td><td><ul><li>CHO Inventory</li><li>All Barangay Inventories</li><li>Medicine Requests</li><li>Stock Transfers</li><li>Reports</li><li>Forecast all facilities</li><li>Dispense Medicines</li></ul></td><td><ul><li>User Management</li></ul></td></tr><tr><td><p><strong>Pharma II</strong></p></td><td><ul><li>All facilities</li><li>User Management</li><li>All transactions</li><li>Forecast reports</li><li>System Administration</li><li>Approve User Registrations</li><li>Full system access (for cho)</li></ul></td><td></td></tr></tbody></table></div>

- **Recommended PostgreSQL Functions**

These are business rules that belong in the database.

| **Function**           | **Purpose**                       |
| ---------------------- | --------------------------------- |
| can_receive_medicine() | Check monthly patient eligibility |
| approve_request()      | Approve medicine requests         |
| complete_transfer()    | Process stock transfers           |
| generate_forecast()    | Generate forecasting data         |

- **Recommended Triggers**

| **Trigger**              | **Purpose**                        |
| ------------------------ | ---------------------------------- |
| Inventory Update Trigger | Deduct inventory after dispensing  |
| Activity Log Trigger     | Automatically create logs          |
| Notification Trigger     | Automatically create notifications |

- **Scheduled Jobs**
- **Low Stock Monitoring**

**Schedule:**

Daily

**Purpose**

**Check:**

Quantity <= Threshold

**Create:**

Low Stock Notification

- **Forecasting Generation**

**Schedule**

Monthly

**Purpose**

Generate forecasting records automatically.

- **Recommended Database Views**

| **View**                   | **Purpose**                    |
| -------------------------- | ------------------------------ |
| Inventory Overview         | Combined inventory information |
| Expiring Medicines         | Medicines nearing expiration   |
| Low Stock Medicines        | Medicines below threshold      |
| Monthly Dispensing Summary | Monthly usage statistics       |
| Facility Stock Summary     | Dashboard summary per facility |

- **Realtime Features**

**Live Inventory Updates**

Automatically updates inventory dashboards when stock changes.

**Live Notifications**

Automatically delivers:

- Request approvals
- Transfer approvals
- Low stock alerts
- Transfer receipts

without requiring page refresh.