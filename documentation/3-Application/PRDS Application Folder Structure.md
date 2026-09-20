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
│   │   │   └── supabase.js    # Supabase JS client configuration
│   │   ├── database/
│   │   │   ├── dexieDb.js     # IndexedDB / SQLite schema
│   │   │   └── snapshotStore.js # Fast-boot snapshot persistence (STORAGE_KEYS)
│   │   ├── services/          # Feature services wrapping RPCs and offline outbox
│   │   │   ├── auth/          # Authentication & Profile management
│   │   │   ├── dispensingService.js
│   │   │   ├── inventoryData.js
│   │   │   ├── requestsService.js
│   │   │   └── transfersService.js
│   │   └── sync/              # Offline-first background synchronization
│   │       ├── networkStatus.js # Online/Offline network connectivity listener
│   │       ├── outboxQueue.js   # FIFO queue for mutations created while offline
│   │       └── syncManager.js   # Conflict resolution & Supabase sync orchestrator
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
│   │       ├── dashboard/     # DashboardModule.jsx, FacilityMap.jsx
│   │       ├── dispensing/    # DispensingWorkbench.jsx, DispensingUi.jsx
│   │       ├── facilities/    # FacilitiesModule.jsx, FacilityCard.jsx
│   │       ├── forecasting/   # ForecastingModule.jsx, ForecastingProjectionChart.jsx
│   │       ├── inventory/     # ChoInventoryModule.jsx, BhwInventoryModule.jsx
│   │       ├── medicines/     # MedicinesModule.jsx, MedicineCatalogTable.jsx
│   │       ├── notifications/ # NotificationsModule.jsx
│   │       ├── patients/      # PatientRegistry.jsx, patientComponents.jsx
│   │       ├── profile/       # ProfileSettingsModule.jsx
│   │       ├── requests/      # ChoRequestsModule.jsx, BhwRequestsModule.jsx
│   │       ├── suppliers/     # SuppliersModule.jsx
│   │       ├── transfers/     # ChoTransfersModule.jsx, BhwTransfersModule.jsx
│   │       └── users/         # UserManagementModule.jsx, UserAccountsTable.jsx
│   └── shared/                # Pure utility functions & Unit Tests
│       └── utils/
│           ├── dispensingUtils.js (and .test.mjs)
│           ├── forecastingUtils.js (and .test.mjs)
│           ├── inventoryUtils.js (and .test.mjs)
│           ├── patientUtils.js (and .test.mjs)
│           ├── requestUtils.js (and .test.mjs)
│           └── transferUtils.js (and .test.mjs)
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
