# PRDS Application Folder Structure

> **Pharmaceutical Resources Distribution System (PRDS)** — City Health Office of Naga, Cebu.  
> Monorepo directory map covering the desktop application (`prds-desktop`), web client (`prds-web`), database schemas (`database`), Supabase backend (`supabase`), and documentation suite (`documentation`).

---

## 1. Top-Level Repository Architecture

```
prds/
├── prds-desktop/              # Primary native desktop application (Tauri v2 + Vite + React)
├── prds-web/                  # Browser client SPA (React 19 + Vite 8)
├── database/                  # PostgreSQL schema, RLS policies, migrations, and functions
├── supabase/                  # Local Supabase environment config and migrations
└── documentation/             # Technical planning, architecture, database, and usage guides
```

---

## 2. Desktop Application (`prds-desktop/`)

Built with Tauri v2 to provide offline-first capabilities, native Windows window integration, and a low memory footprint (~40 MB RAM) suitable for Barangay Health Station workstations.

```
prds-desktop/
├── src-tauri/                 # Native Rust Core & Window Shell
│   ├── Cargo.toml             # Rust dependencies (tauri v2, window plugins)
│   ├── tauri.conf.json        # Window sizes, permissions, native capabilities
│   └── src/
│       └── main.rs            # Desktop application entrypoint
├── src/                       # Frontend & Local Data Layer
│   ├── backend/               # Local data and offline synchronization engine
│   │   ├── client/
│   │   │   ├── dataClient.js  # Unified client bridging online Supabase & local cache
│   │   │   ├── networkErrorUtils.js # Connectivity and network failure categorizer
│   │   │   └── supabase.js    # Supabase JS client configuration
│   │   ├── database/
│   │   │   ├── sqliteClient.js  # Native SQLite schema initialization & connection (prds.db)
│   │   │   └── snapshotStore.js # Fast-boot snapshot persistence (STORAGE_KEYS)
│   │   ├── services/          # Feature services wrapping RPCs and offline outbox
│   │   │   ├── auth/          # Authentication & Profile management
│   │   │   ├── activityLogService.js
│   │   │   ├── dispensingService.js
│   │   │   ├── inventoryData.js
│   │   │   ├── notificationService.js
│   │   │   ├── patientsService.js
│   │   │   ├── requestsService.js
│   │   │   ├── transfersService.js
│   │   │   └── userManagementService.js
│   │   └── sync/              # Offline-first background synchronization
│   │       ├── networkStatus.js # Online/Offline network connectivity listener
│   │       ├── outboxQueue.js   # FIFO queue for mutations created while offline
│   │       ├── syncManager.js   # Conflict resolution & Supabase sync orchestrator
│   │       └── syncUtils.js     # Concurrency helpers, chunking, and error mappers
│   ├── frontend/              # User Interface Layer (React 19)
│   │   ├── components/        # Shared UI components
│   │   │   ├── layout/        # DesktopTitlebar, AdminShell, AdminSidebar, AdminHeader
│   │   │   ├── ModalShell.jsx # Focus-trapped accessible modal wrapper
│   │   │   └── PaginationControls.jsx # 10-entries-per-page pagination standard
│   │   ├── context/           # React context providers (AuthContext, SyncContext)
│   │   ├── routes/            # AppRoutes.jsx, RoleGuards.jsx
│   │   └── views/             # Core Feature Modules
│   │       ├── activity/      # ActivityLogsModule.jsx
│   │       ├── auth/          # LoginPage, RegisterPage, OTPVerification, ForgotPassword
│   │       ├── dashboard/     # DashboardModule.jsx, FacilityMap.jsx, ForecastDemandBars.jsx
│   │       ├── dispensing/    # DispensingWorkbench.jsx, DispensingUi.jsx
│   │       ├── facilities/    # FacilitiesModule.jsx, FacilityCard.jsx
│   │       ├── forecasting/   # ForecastingModule.jsx, ForecastingProjectionChart.jsx
│   │       ├── inventory/     # ChoInventoryModule.jsx, BhwInventoryModule.jsx
│   │       ├── medicines/     # MedicinesModule.jsx, MedicineCatalogTable.jsx
│   │       ├── notifications/ # NotificationsModule.jsx
│   │       ├── other-programs/# ComingSoonModule.jsx (PHARMA_II program placeholder)
│   │       ├── patients/      # PatientRegistry.jsx, patientComponents.jsx
│   │       ├── profile/       # ProfileSettingsModule.jsx
│   │       ├── reports/       # ReportModule.jsx (Physical Count, Stock Card, Dispensing, RIS)
│   │       ├── requests/      # ChoRequestsModule.jsx, BhwRequestsModule.jsx
│   │       ├── shared/        # Shared sub-view components and badges
│   │       ├── suppliers/     # SuppliersModule.jsx
│   │       ├── transfers/     # ChoTransfersModule.jsx, BhwTransfersModule.jsx
│   │       └── users/         # UserManagementModule.jsx, UserAccountsTable.jsx
│   └── shared/                # Pure utility functions & Unit Tests
│       └── utils/
│           ├── activityLogUtils.js (and .test.mjs)
│           ├── authErrorUtils.js (and .test.mjs)
│           ├── authRegistrationUtils.js (and .test.mjs)
│           ├── dashboardUtils.js (and .test.mjs)
│           ├── demandUtils.js (and .test.mjs)
│           ├── dispensingUtils.js (and .test.mjs)
│           ├── facilityUtils.js (and .test.mjs)
│           ├── forecastingUtils.js (and .test.mjs)
│           ├── inventoryUtils.js (and .test.mjs)
│           ├── medicineExportUtils.js (and .test.mjs)
│           ├── medicineUtils.js (and .test.mjs)
│           ├── notificationUtils.js (and .test.mjs)
│           ├── passcodeUtils.js (and .test.mjs)
│           ├── patientUtils.js (and .test.mjs)
│           ├── profileSettingsUtils.js (and .test.mjs)
│           ├── reportExportUtils.js (and .test.mjs)
│           ├── reportUtils.js (and .test.mjs)
│           ├── requestUtils.js (and .test.mjs)
│           ├── transferUtils.js (and .test.mjs)
│           └── userManagementUtils.js (and .test.mjs)
├── package.json
└── vite.config.js
```

---

## 3. Web Application (`prds-web/`)

Zero-install browser client with 100% design and feature parity with `prds-desktop`.

```
prds-web/
├── public/                    # Static brand logos and public assets
├── src/
│   ├── assets/                # Logos, SVG icons, images
│   ├── components/            # Shared UI components (AdminShell, ModalShell, Pagination)
│   ├── context/               # AuthContext
│   ├── features/auth/         # AuthService, LoginPage, RegisterPage, OTPVerification
│   ├── modules/               # Feature modules mirroring desktop views
│   │   ├── activity/
│   │   ├── dashboard/
│   │   ├── dispensing/
│   │   ├── facilities/
│   │   ├── forecasting/
│   │   ├── inventory/
│   │   ├── medicines/
│   │   ├── notifications/
│   │   ├── patients/
│   │   ├── profile/
│   │   ├── requests/
│   │   ├── suppliers/
│   │   ├── transfers/
│   │   └── users/
│   ├── routes/                # AppRoutes.jsx, RoleGuards.jsx
│   ├── services/              # Supabase API client and feature services
│   ├── index.css              # Tailwind CSS v4 design tokens and theme rules
│   └── main.jsx               # React DOM root mounting
├── package.json
└── vite.config.js
```

---

## 4. Database & Backend Schemas (`database/` & `supabase/`)

```
database/
├── enums/                     # Custom PostgreSQL enum types (roles, transfer statuses, request priorities)
├── helper-functions/          # SECURITY DEFINER stored procedures, triggers, and RPCs
├── indexes/                   # Performance indexes on foreign keys and search columns
├── migrations/                # Version-controlled incremental schema migrations
├── realtime/                  # Realtime publication setups
├── rls/                       # Row Level Security policies per table
├── schema/                    # Table creation DDL statements
└── views/                     # Materialized and virtual views (monthly dispensing summaries)

supabase/
├── config.toml                # Local Supabase studio and port configuration
├── migrations/                # Supabase CLI migration scripts
└── templates/                 # Custom HTML templates for auth emails and confirmations
```

---

## 5. Architectural Placement Rules & Conventions

To maintain codebase cleanlines and prevent architectural drift, the following placement conventions are strictly enforced:

* **Backend Services:** Put Supabase queries, RPC calls, and offline mutation handling in `prds-desktop/src/backend/services/`.
* **Sync & Outbox:** Put snapshot synchronization, network monitoring, and outbox behavior in `prds-desktop/src/backend/sync/`.
* **Shared UI:** Put reusable UI components used across multiple features in `prds-desktop/src/frontend/components/`.
* **Feature-Scoped UI:** Put feature-only UI views and sub-components in `prds-desktop/src/frontend/views/<feature>/components/`.
* **Pure Domain Logic:** Put pure calculations, formatting, mathematical algorithms, and field validations in `prds-desktop/src/shared/utils/`.
* **Unit Testing:** Keep tests beside the utility or service they verify, using `.test.mjs` running via the native Node.js test runner (`node --test`).
* **Clean Tree:** Do not create empty category folders. Add a folder only when it contains an active implementation.
* **Client Boundaries:** `prds-desktop` is the primary maintained client. `prds-web` is retained as a frozen legacy reference client and should not receive new desktop organization work.

