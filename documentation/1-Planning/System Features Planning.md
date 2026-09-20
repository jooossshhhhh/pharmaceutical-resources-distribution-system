# PRDS System Features Planning & Role Matrix

> **Pharmaceutical Resources Distribution System (PRDS)** — City Health Office (CHO) of Naga, Cebu.  
> Detailed feature matrix, operational workflows, and role permissions across Central Office and Barangay Health Stations.

---

## 1. Role Definitions & Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                      PHARMA_II                              │
│       (Chief Pharmacist / System Administrator)             │
│   Full city-wide authority, user approvals, master catalog,  │
│      supplier contracts, inter-facility stock transfers     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      PHARMA_I                               │
│              (CHO Operational Pharmacist)                   │
│   Central warehouse inventory, dispensing, request reviews, │
│        batch allocations, facility monitoring & trends       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        BHW                                  │
│              (Barangay Health Worker)                       │
│   Facility-level dispensing (POS), patient registry,         │
│     local inventory, stock replenishment requests           │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Comprehensive Role-Feature Matrix

| Feature / Capability | PHARMA_II | PHARMA_I | BHW | Operational Details |
| :--- | :---: | :---: | :---: | :--- |
| **System Dashboard** | City-Wide | City-Wide | Assigned Facility | Stat cards, stock alerts, demand charts, and quick-action feeds. |
| **User Account Approvals** | ✓ | — | — | Review, approve, or reject new registrations for BHW and PHARMA_I. |
| **User Account Management** | ✓ | — | — | Edit user profile assignments, roles, or deactivate accounts. |
| **Master Medicine Catalog** | ✓ | ✓ | — | Add, update, and manage generic names, brands, dosages, and safety thresholds. |
| **Supplier Directory** | ✓ | — | — | Manage pharmaceutical supplier profiles, contacts, and order references. |
| **Central Inventory (CHO)** | ✓ | ✓ | — | Batch-level inventory management, lot tracking, FEFO restocks, manual adjustments. |
| **Barangay Inventory (BHS)** | View All | View All | Own Facility | Local stock monitoring, batch lot lookup, and expiration tracking. |
| **Medicine Dispensing (POS)** | Central Stock | Central Stock | Facility Stock | Point-of-sale dispensing to registered/walk-in patients with automated FEFO. |
| **Patient Registry** | City-Wide | City-Wide | Own Facility | Patient profiling, demographic tracking, dispensing history, duplicate detection. |
| **Medicine Requisitions** | Approve/Reject | Review/Allocate | Create/Track | BHW submits replenishment requests; CHO reviews and allocates batches. |
| **Stock Transfers** | Create/Approve | Create/Approve | Receive/Confirm | Redistribution of nearly-expiring or excess stock between facilities. |
| **Demand Forecasting** | All Facilities | All Facilities | Own Facility | OLS linear regression models, stockout risk alerts, and CSV exports. |
| **Notifications** | City-Wide | City-Wide | Own Facility | Realtime operational notifications for low stock, approvals, and deliveries. |
| **System Activity Logs** | All Users | Operations | Own Facility | Immutable audit trail of stock adjustments, dispensing, and order fulfillment. |
| **Profile Settings** | ✓ | ✓ | ✓ | Manage linked credentials (Email, Password, Phone OTP), name, and avatar. |

---

## 3. Module Workflows by Role

### 3.1 PHARMA_II (Chief Pharmacist / Admin)
1. **User Approvals:** Reviews the queue of new sign-ups. Validates employee credentials, assigns proper facility scopes, and activates accounts.
2. **Inter-Facility Stock Rebalancing:** Identifies health centers with impending batch expirations or overstocked inventories and initiates stock transfers to facilities experiencing stockout risks.
3. **Supplier & Catalog Governance:** Authorizes newly approved pharmaceutical items and maintains procurement distributor profiles.
4. **Strategic Forecasting:** Evaluates municipal consumption trends to prepare quarterly and annual procurement plans for the Naga City Government.

### 3.2 PHARMA_I (CHO Operations Pharmacist)
1. **Request Fulfillment Workbench:** Receives incoming requisitions from the 28 Barangay Health Stations. Uses the automated FEFO batch allocator to assign soonest-expiring central stock to fulfill requests.
2. **Central Warehouse Dispensing:** Dispenses prescriptions directly to patients visiting the Naga City Central Health Office.
3. **Inventory Lot Adjustments:** Logs official deliveries from suppliers, inspects batch numbers and expiry dates, and records verified stock adjustments with mandatory audit reasons.

### 3.3 BHW (Barangay Health Worker)
1. **Patient Care & Dispensing:** Searches for local community members or registers walk-in patients. Dispenses prescribed medicines using the automated FEFO batch selector.
2. **Local Stock Replenishment:** Monitors the facility inventory dashboard. When items reach low stock or the forecasting module flags a *Stockout Risk*, submits a requisition to CHO.
3. **Receiving Deliveries & Transfers:** Inspects incoming medicine deliveries from CHO or transfers from peer barangays, verifies batch lot counts, and clicks **Confirm Receipt** to update local inventory.
