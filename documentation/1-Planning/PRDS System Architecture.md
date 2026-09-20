# PRDS System Architecture

> **Pharmaceutical Resources Distribution System (PRDS)** — City Health Office (CHO) of Naga, Cebu.  
> Cross-platform supply chain, pharmacy inventory, medicine dispensing, and forecasting system connecting the Central Health Office with 28 Barangay Health Stations (BHS).

---

## 1. System Overview & Dual-Client Architecture

PRDS operates as a dual-client system backed by a unified cloud database and an offline-first synchronization engine:

```
┌─────────────────────────────────────────────────────────────┐
│                       PRDS Clients                          │
├──────────────────────────────┬──────────────────────────────┤
│       prds-desktop           │           prds-web           │
│   Tauri v2 Desktop App       │       React 19 Web SPA       │
│   (Rust Shell + WebView2)    │    (Zero-Install Browser)    │
│   • Local SQLite / Dexie DB  │    • Online Supabase JS      │
│   • Background Sync Engine   │    • Direct PostgREST / RPC  │
│   • Offline Outbox Queue     │    • Browser Caching         │
│   • ~40 MB RAM Footprint     │                              │
└──────────────┬───────────────┴──────────────┬───────────────┘
               │                              │
               │   HTTPS / WSS (supabase-js)   │
               ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Backend (BaaS)                  │
│  • GoTrue Auth (Google OAuth, Email/Password, Phone OTP)    │
│  • PostgREST (Auto REST API over PostgreSQL)                │
│  • Realtime (WebSocket channels for notifications & sync)   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  PostgreSQL 15 Database                     │
│  • Relational Schemas (inventory, dispensing, requests, etc)│
│  • Row Level Security (RLS) Policies                        │
│  • SECURITY DEFINER Stored Procedures (RPC Functions)       │
│  • Automated Triggers & Materialized Dispensing Views       │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 Technology Stack Summary

| Layer | Technology | Key Characteristics |
| :--- | :--- | :--- |
| **Desktop Shell** | **Tauri v2 (Rust)** | Native Windows binary, ~12 MB installer, ~40 MB RAM footprint, Microsoft Edge WebView2 runtime. Ideal for barangay computers. |
| **Local Desktop Storage** | **SQLite / Dexie.js (IndexedDB)** | ACID-compliant local database for offline snapshot persistence and mutation outbox queuing. |
| **Web Frontend** | **React 19 + Vite 8** | Modern component architecture, Fast Refresh (HMR), tree-shaken production bundles. |
| **Styling & UI** | **Tailwind CSS v4 + Lucide Icons** | CSS-first `@theme` design tokens, custom scrollbars, dark/light theme accents, accessible modals. |
| **Routing** | **React Router 7** | Client-side declarative routing with role-based Route Guards. |
| **Cloud Backend** | **Supabase (PostgreSQL 15)** | Managed database, PostgREST RESTful endpoints, GoTrue authentication. |
| **Testing** | **Node.js Test Runner (`node --test`)** | Native zero-dependency unit tests running across desktop and web shared utilities. |

---

## 2. Roles, Privileges & Route Matrix

PRDS enforces strict three-tiered Role-Based Access Control (RBAC) at two independent levels:
1. **Frontend Route Guards & UI Scoping:** Restricts views, sidebars, and action buttons.
2. **Database Row Level Security (RLS) & RPCs:** Enforces tenant isolation even if frontend guards are bypassed.

| Role | System Identity | Operational Scope |
| :--- | :--- | :--- |
| **PHARMA_II** | Chief Pharmacist / Admin | Full administrative oversight: user management, suppliers, inter-facility stock transfers, master catalog, forecasting. |
| **PHARMA_I** | CHO Staff Pharmacist | Central operations: central inventory, medicine catalog, request review & batch allocation, dispensing, facilities. |
| **BHW** | Barangay Health Worker | Facility-scoped: facility inventory, patient registry, dispensing POS, medicine requests, transfer receipt. |

### 2.1 Route Matrix

| Route | Module Component | Allowed Roles | Data Scoping |
| :--- | :--- | :---: | :--- |
| `/dashboard` | `DashboardModule` | All | Scoped to assigned facility for BHW; city-wide for CHO. |
| `/dispensing` | `DispensingModule` | All | Dispenses from Central Stock (CHO) or Local Facility Stock (BHW). |
| `/patients` | `PatientRegistry` | All | All patients for CHO; facility-registered patients for BHW. |
| `/inventory` | `ChoInventoryModule` | PHARMA_I, PHARMA_II | Central warehouse stock + multi-facility stock health monitors. |
| `/inventory-bhw` | `BhwInventoryModule` | BHW | Local facility stock, FEFO batch details, lot activity history. |
| `/requests` | `RequestsModule` (split) | All | Request fulfillment workbench (CHO) vs. Requisition logbook (BHW). |
| `/transfers` | `TransfersModule` (split) | All | Inter-facility transfer management (CHO) vs. Incoming transfers (BHW). |
| `/facilities` | `FacilitiesModule` | PHARMA_I, PHARMA_II | Directory, GPS mapping, and contact records for all 28 BHS. |
| `/medicines` | `MedicinesModule` | PHARMA_I, PHARMA_II | Master pharmaceutical catalog, dosages, categories, units. |
| `/suppliers` | `SuppliersModule` | PHARMA_II | Pharmaceutical distributor profiles, contracts, and contacts. |
| `/forecasting` | `ForecastingModule` | All | OLS linear regression demand forecasting and stockout risk tiers. |
| `/notifications` | `NotificationsModule` | All | Role- and facility-scoped operational alerts and audit events. |
| `/activity-logs` | `ActivityLogsModule` | All | Immutable audit trail for stock adjustments, dispensing, and orders. |
| `/users` | `UserManagementModule` | PHARMA_II | Account approval queue, role assignments, and credential status. |
| `/profile-settings`| `ProfileSettingsModule` | All | Profile details, phone linking, password reset, login methods. |

---

## 3. Desktop Application Stack (`prds-desktop`)

### 3.1 Why Tauri v2 was Chosen
Barangay Health Stations frequently operate on budget-tier or aging hardware with 4 GB to 8 GB RAM. Electron-based alternatives consume 150–300 MB RAM on idle. Tauri v2:
- Utilizes the OS-provided Microsoft Edge WebView2 runtime.
- Consumes only **~40 MB RAM**.
- Produces compact native installers (~12 MB).
- Implements capability-based security: JavaScript can only access declared native APIs.

### 3.2 Offline-First Architecture & Outbox Queue
```
User Action (e.g. Dispense Medicine)
       │
       ▼
Unified Data Client (dataClient.js)
       │
   Is Online?
   ├── YES ──> Execute Supabase RPC / Mutation directly
   │             └── Update local snapshot cache
   │
   └── NO ───> Write mutation to local Outbox Queue
                 ├── Optimistically update local snapshot
                 ├── Render instant UI confirmation to worker
                 └── Tag record with status: "PENDING_SYNC"

Reconnection Detected (networkStatus.js)
       │
       ▼
Sync Manager (syncManager.js)
       │
       ├── Reads Outbox Queue FIFO
       ├── Replays mutations to Supabase RPC endpoints
       ├── Resolves any version/concurrency conflicts
       └── Pulls latest remote delta into local cache
```

### 3.3 Folder Structure (`prds-desktop`)
```
prds-desktop/
├── src-tauri/                 # Native Rust Shell
│   ├── Cargo.toml             # Rust dependencies (tauri, plugins)
│   ├── tauri.conf.json        # Window setup, permissions, capabilities
│   └── src/main.rs            # Desktop application entrypoint
├── src/
│   ├── backend/               # Local data & sync tier
│   │   ├── client/            # Unified data client (online/offline bridge)
│   │   ├── database/          # Local SQLite / Dexie schema & snapshot store
│   │   ├── services/          # Business logic services (Auth, Dispensing, Inventory)
│   │   └── sync/              # SyncManager, OutboxQueue, NetworkStatus
│   ├── frontend/              # React UI Layer
│   │   ├── components/        # DesktopTitlebar, ModalShell, PaginationControls
│   │   ├── context/           # AuthContext, SyncContext
│   │   ├── routes/            # AppRoutes, RoleGuards
│   │   └── views/             # 13 Core module views (Forecasting, Dispensing, etc.)
│   └── shared/                # Pure utility functions & unit tests
│       └── utils/             # forecastingUtils, dispensingUtils, etc.
├── package.json
└── vite.config.js
```

---

## 4. Backend Database Architecture (Supabase)

### 4.1 Core Schema Groups
- **Identity & Accounts:** `auth.users`, `profiles` (links auth UUID with role, facility, full name, phone number, and account approval status).
- **Master Catalog & Facilities:** `medicines` (generic, brand, dosage, category, threshold), `facilities` (BHS metadata, coordinates, contact info), `suppliers`.
- **Physical Inventory:** `inventory` (batch-level records: `facility_id`, `medicine_id`, `lot_number`, `quantity`, `expiration_date`, `threshold`).
- **Dispensing Transactions:** `medicine_dispensing`, `medicine_dispensing_items`, `monthly_dispensing_summary` (aggregated historical consumption feeding forecasting).
- **Supply Chain:** `medicine_requests`, `medicine_request_items`, `medicine_request_fulfillments`, `stock_transfers`, `stock_transfer_fulfillments`.
- **Audit & Compliance:** `activity_logs`, `notifications`.

### 4.2 SECURITY DEFINER Stored Procedures (RPCs)
Sensitive mutations that alter inventory or grant access execute through atomic PostgreSQL functions:
- `dispense_medicines_atomic`: Atomically deducts stock from FEFO-selected batches, creates dispensing items, logs activity, and prevents negative balances.
- `review_medicine_request`: CHO approval of BHW requisitions with automated FEFO batch allocation.
- `confirm_stock_transfer_received`: Finalizes inter-facility transfers by decrementing source inventory and incrementing destination inventory in a single database transaction.
- `update_inventory_batch`: Regulated stock adjustments with mandatory audit reasons.

---

## 5. UI/UX Design System & Standards

### 5.1 Design Tokens
- **Primary Action / Health Brand:** Emerald Green (`#00a36c`) and Mint (`#6be9c2`).
- **Surface & Backgrounds:** Crisp white cards (`#ffffff`) over light neutral canvas (`#f7f6f3`) with slate borders (`#d8dadc`).
- **Typography:** Inter (14.5px base font scale) with high-legibility tabular figures for inventory counts.

### 5.2 Table Pagination Standard
All tabular displays across both desktop and web are standardized to **exactly 10 entries per page** using `usePaginatedRows` and `<PaginationControls>` to ensure consistent performance on low-spec hardware.

---

## 6. Build & Test Commands

| Environment | Command | Description |
| :--- | :--- | :--- |
| **Desktop Dev** | `npm run desktop` (in `prds-desktop`) | Boots Vite frontend + Tauri native window with HMR. |
| **Desktop Build** | `npm run build` (in `prds-desktop`) | Compiles production assets and builds Windows binary. |
| **Desktop Tests** | `npm test` (in `prds-desktop`) | Runs Node.js test runner across all shared unit suites. |
| **Web Dev** | `npm run dev` (in `prds-web`) | Boots web development server. |
| **Web Build** | `npm run build` (in `prds-web`) | Compiles production web bundle to `dist/`. |
| **Web Tests** | `npm test` (in `prds-web`) | Runs web test suite. |