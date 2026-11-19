# Pharmaceutical Resources Distribution System (PRDS) — City of Naga, Cebu

An offline-first desktop healthcare logistics and inventory management system built for the **City Health Office (CHO)** and all **28 Barangay Health Stations (BHS)** in the City of Naga, Cebu.

PRDS digitizes pharmaceutical receiving, FEFO batch allocation, walk-in and barangay medicine dispensing, replenishment requisitions, stock returns, community health program reservations, demand forecasting, GIS facility monitoring, and official DOH/LGU Excel and PDF reporting.

---

## Core Modules & Capabilities

### 1. Offline-First Sync Engine & Embedded SQLite
- **Local Persistence (`prds.db`)**: Uses Tauri v2 with embedded SQLite (`@tauri-apps/plugin-sql`) and in-memory/snapshot fallbacks so health stations continue operating during internet or power interruptions.
- **Mutex-Protected Outbox Queue**: Queues offline inventory updates, dispensing records, requisitions, stock returns, patient updates, medicine catalog edits, and health program transitions for ordered synchronization to Supabase when connectivity returns.
- **Incremental Delta Sync & Soft Deletes**: Uses `updated_at` watermarks, `deleted_items_log` tombstones, server-clock-skew protection, and paginated queries (`fetchAllRows`).

### 2. Warehouse & Barangay Inventory Management
- **FEFO Lot Tracking**: Organizes batches by expiration date, date received, purchase order (`po_number`), brand, supplier metadata, and unit cost.
- **Barangay Stock Reconciliation**: Supports paper-based and connected health stations in reconciling physical monthly balances against active commercial lots.
- **Threshold & Early-Warning Alerts**: Tracks facility-specific reorder thresholds (`facility_medicine_thresholds`) alongside expired, quarantined, and disposed stock workflows.

### 3. Dispensing, Requisitions & Stock Returns
- **Dispensing Workbench**: Supports CHO walk-in and BHS patient dispensing with FEFO auto-allocation, monthly claim tracking, void/deficit-audit reversals, and pending-request stock reservations.
- **Barangay Medicine Requisitions**: Structured request submission, CHO review/partial approval with FEFO release batch assignment, and manual paper-based requisitions.
- **Stock Returns**: Station-to-CHO return submissions with custom reason capture, confirmation dialogs, and multi-line batch support.

### 4. Other Health Programs & Schedule Alerts
- **Community Outreach Planning**: Manages medical missions and special health drives (`UPCOMING`, `ONGOING`, `COMPLETED`, `CANCELLED`) with medicine reservations and post-program return reconciliation.
- **Schedule Alignment Notifications**: Highlights programs scheduled today, upcoming, or overdue using local calendar dates.

### 5. Analytics, Demand Forecasting & GIS Facility Map
- **Demand Forecasting**: Multi-month stock consumption trends, stockout risk analysis, facility stock comparisons, and printable multi-page vector PDF exports (`jspdf`).
- **GIS Facility Distribution Map**: Interactive Leaflet map across Naga City health facilities showing stock health status (`OK`, `WATCH`, `CRITICAL`) and station metrics.

### 6. Regulatory DOH / LGU Reports & Exports
- **Daily Dispensing & Issuance Views**: Separate searchable and paginated tables for Walk-in Dispensing and Barangay Requisition Issuances.
- **Monthly Inventory Physical Count**: Consolidated ledger across beginning balance, procurement deliveries, confirmed returns, issuances, program allocations, expired lots, and remaining balances.
- **Native Excel (`.xlsx`) & PDF Generation**: Produces official formatted workbooks (Daily RIS, Walk-in Slip, Barangay Issuance Slip, Monthly Physical Count, Detailed Inventory, Medicines, and Patient Registry).

### 7. Role-Based Access, Desktop UX & OTA Updates
- **Role-Based Access Control (RBAC)**: Dedicated permissions enforced in UI and PostgreSQL RLS for **Pharmacist II (Admin)**, **CHO Pharmacist**, and **Barangay Health Worker (BHW)**.
- **Session & Station Security**: Supabase Auth + Google OAuth deep-link callback (`prds://`), 6-digit terminal quick-unlock passcodes with per-account lockout, and session auto-recovery.
- **Workspace Customizations**: Responsive `rem`-based UI Display Scaling (`85%`, `100%`, `115%`, `125%`) and a searchable role-aware **Help & FAQ Hub**.
- **In-App Auto-Updates**: Cryptographically signed OTA updates via `@tauri-apps/plugin-updater` and GitHub Releases (`latest.json`).

---

## Technology Stack

- **Desktop Shell & Local DB**: Tauri v2 (Rust), `@tauri-apps/plugin-sql` (SQLite), `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-deep-link`
- **Frontend**: React 19, React Router v7, Vite 8, Tailwind CSS v4, Lucide Icons, Recharts, Leaflet / React-Leaflet v5
- **Export & Reporting**: SheetJS (`xlsx`), `jspdf`, `html2canvas`
- **Cloud Backend**: Supabase (PostgreSQL, Row-Level Security, PL/pgSQL RPCs, Auth)

---

## Repository Structure

```text
prds/
├── prds-desktop/                 # Tauri v2 + React desktop application
│   ├── scripts/                  # Tauri wrapper (run-tauri.js / latest.json generator) & inspection scripts
│   ├── src/
│   │   ├── backend/              # Supabase clients, SQLite/snapshot stores, outbox sync & services
│   │   ├── frontend/             # React routes, keep-alive layout, UI components & feature modules
│   │   └── shared/               # Pure calculation, validation, FEFO, export & formatting utilities
│   ├── src-tauri/                # Rust host application, Tauri v2 config & Minisign bundle setup
│   └── vite.config.js
├── supabase/
│   └── migrations/               # PostgreSQL schema, RPC, RLS & data-integrity migrations
├── database/                     # Schema definitions, ERD scripts/diagrams & SQL documentation
└── scripts/                      # Workspace helper scripts
```

---

## End-User Installation (Windows)

### Fresh Install
1. Download the latest Windows installer (`PRDS.Naga_<version>_x64-setup.exe`, currently **`PRDS.Naga_1.0.3_x64-setup.exe`**) from the [GitHub Releases](https://github.com/jooossshhhhh/pharmaceutical-resources-distribution-system/releases) page.
2. Run the setup executable and launch **PRDS Naga** from the Start Menu or Desktop shortcut.
3. Sign in with your City Health Office or Barangay Health Station account.

### In-App Over-the-Air (OTA) Upgrade
Existing installations can upgrade in place from **System Preferences -> Check for Updates** without losing local SQLite offline data.

### System Requirements
- **OS**: Windows 10 or Windows 11 (64-bit)
- **Runtime**: Microsoft Edge WebView2 (pre-installed on Windows 10/11)
- **RAM**: 2 GB minimum (4 GB recommended)

---

## Developer Setup & Build

### Prerequisites
- Node.js 20+ and npm
- Rust toolchain (`cargo`) and Windows MSVC build tools (for Tauri desktop builds)

### Environment Variables
Create `prds-desktop/.env` with your Supabase project credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_PUBLIC_SITE_URL=http://localhost:5173
```

### Commands (Run inside `prds-desktop/`)

```bash
# Install dependencies
npm install

# Start web development server
npm run dev

# Start Tauri desktop app in development mode
npm run desktop

# Run unit tests (Node test runner)
npm test

# Run ESLint check across src/
npx eslint src

# Build production web assets
npm run build

# Build & sign Windows NSIS/MSI installers and generate latest.json
npm run desktop:build
```

### Database Migrations
Apply SQL migrations in `supabase/migrations/` in chronological order to keep PostgreSQL RPCs, tables, and RLS policies synchronized with the desktop client.

