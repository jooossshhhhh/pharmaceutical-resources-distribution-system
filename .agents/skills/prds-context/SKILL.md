---
name: prds-context
description: >
  PRDS (Pharmaceutical Resources Distribution System) codebase introduction.
  Activate when working on any PRDS feature, bug, module, database change, or UI task.
  Provides: system overview, tech stack, module patterns, database structure, design system, conventions.
---

# PRDS Codebase Context

**System:** Pharmaceutical Resources Distribution System — City Health Office (CHO) of Naga, Cebu.
Manages pharmacy inventory, medicine requests, and stock transfers across 28 barangay health stations.

## Tech Stack

- **Frontend:** React 19, Vite 8, **Tailwind CSS v4** (CSS-first `@theme` — NOT v3 config style), React Router 7, Recharts 3
- **Maps:** Leaflet 1.9 + react-leaflet 5 (Nominatim geocoding)
- **Backend:** Supabase (PostgREST, GoTrue Auth, Realtime WebSocket, Storage)
- **Database:** PostgreSQL 15 — RLS, SECURITY DEFINER RPCs, triggers, views
- **Testing:** Node.js `--test` runner (`npm test` in `prds-web/`)
- **Dev server:** `cd prds-web && npm run dev`

> ⚠️ **Tailwind v4 warning:** Uses CSS-first config (`@theme` in CSS). Do NOT use `tailwind.config.js` or v3 class patterns.

## Three Roles

| Role        | Label                    | Scope                    |
|-------------|--------------------------|--------------------------|
| `PHARMA_II` | Pharmacist II            | Full system admin        |
| `PHARMA_I`  | Pharmacist I             | CHO operations           |
| `BHW`       | Barangay Health Worker   | Own facility only        |

Role gating is **dual**: UI route guards (`RoleGuard`) + DB (RLS + RPC permission checks).

## Module Pattern

Every feature follows:
```
ModuleXxx.jsx     → entry: profile.role check → renders Cho or Bhw variant
ChoXxxModule.jsx  → CHO implementation
BhwXxxModule.jsx  → BHW-scoped implementation
XxxService.js     → Supabase queries + RPC calls
xxxUtils.js       → pure helpers (unit-tested, no side effects)
xxxUtils.test.mjs → Node --test unit tests
```

Role-split modules: Requests, Transfers, Dispensing, Patients, Dashboard (config-split).
Route-split: Inventory (`/inventory` vs `/inventory-bhw`).

## Key File Locations

```
prds-web/src/
  context/AuthProvider.jsx     → auth state, useAuth() hook
  routes/AppRoutes.jsx         → all routes
  components/layout/           → AdminShell, AdminHeader, AdminSidebar
  components/ModalShell.jsx    → portal modal (preserves focus)
  modules/shared/              → AuditInboxUi, AuditInboxUtils
  services/supabase.js         → supabase client
database/
  schema/                      → 21 table definitions
  migrations/                  → 26 incremental files (2026-...)
  DATABASE_SETUP_ORDER.md      → apply order reference
documentation/
  1-Planning/PRDS System Architecture.md   → canonical architecture doc
  1-Planning/Module Guide.md               → all modules documented
```

## Auth Context Shape

```js
const { supabaseUser, profile, loading, isAuthenticated, isProfileApproved, refreshProfile } = useAuth();
// profile: { id, role, facility_id, first_name, last_name, status, ... }
```

## Supabase Data Pattern

```js
import { supabase } from "../../services/supabase";
// Direct queries + RPC calls
const { data, error } = await supabase.rpc("rpc_name", { p_param: value });
// Always throw error; return data || []
```

## Core Business Logic

| Concept | Where |
|---------|-------|
| FEFO batch allocation | `requestUtils.js`, `transferUtils.js`, `dispensingUtils.js` |
| Stock health status | `inventoryUtils.js` → `getStockStatus()` |
| Forecasting (SLR) | `forecastingUtils.js` → `calculateLinearRegression()`, `forecastSLR()` |
| Grouped date lists | `AuditInboxUtils.js` → `groupItemsByDate()`, `getRelativeTime()` |
| Nav filtering by role | `userManagementUtils.js` → `getAllowedNavItems()` |

## Request Workflow
`PENDING → APPROVED → ALLOCATED → RECEIVED` (or `REJECTED` / `CANCELLED`)

## Transfer Workflow
`PENDING → APPROVED → READY_FOR_PICKUP → COMPLETED` (or `REJECTED`)

## Design System

**Emerald palette (admin shell):**
- Primary: `#00a36c` (emerald)
- Mint accent: `#6be9c2` (sidebar active, avatar)
- Ink: `#0d1117` (headings/primary text)
- Slate: `#42474e` (secondary text)
- Border: `#d8dadc`
- Shell bg: `#f7f6f3` | Panel bg: `#f8f9ff` | Hover: `#eff4ff`

**Auth pages:** Navy left panel (`#1d3f8c`), orange accent (`#dc8939`), green submit (`#008000`).

**Typography:** Inter font, 14.5px base size (compact UI).

**Stock status badge tones:**
- HEALTHY: `bg-emerald-100 text-emerald-700`
- WATCH: `bg-amber-50 text-amber-700`
- LOW: `bg-orange-50 text-orange-700`
- CRITICAL: `bg-red-50 text-red-700`

## NPM Scripts (run from `prds-web/`)

```bash
npm run dev          # Vite dev server
npm test             # Node --test unit suites
npm run test:coverage
npm run build
npm run lint
```

## Key RPCs

| RPC | Purpose |
|-----|---------|
| `update_inventory_batch` | Stock adjustments + audit log |
| `approve_and_release_medicine_request` | FEFO allocation + fulfillment |
| `confirm_request_received` | BHW receipt confirmation |
| `get_cho_inventory_medicines` | CHO availability for BHW requests |
| `submit_bhw_medicine_request` | BHW request submission |
| `create_cho_stock_transfer` / `submit_bhw_stock_transfer_request` | Transfer creation |
| `approve_stock_transfer` / `reject_stock_transfer` | CHO approval actions |
| `allocate_stock_transfer_for_pickup` | FEFO allocation → READY_FOR_PICKUP |
| `confirm_stock_transfer_received` | Completes transfer |
| `dispense_medicines_rpc` | Dispensing transaction |

## Shared UI Components

- `ModalShell` — portal modal (preserves input focus)
- `AuditInboxUi` — status badges, filter chips, timeline
- `TransferUi` — transfer-specific status badges and cards
- `FacilityMap` — Leaflet map shared by dashboard/facilities/forecasting
- `PaginationControls` — table pagination

## Documentation Map

```
documentation/1-Planning/PRDS System Architecture.md  → authoritative architecture
documentation/1-Planning/Module Guide.md               → all 16 modules explained
documentation/2-Database/                              → DB tables, progress report
documentation/5-IssuesLog/                             → tracked bugs/issues
database/DATABASE_SETUP_ORDER.md                       → DB apply order
```
