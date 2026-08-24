**PRDS System Architecture**

Pharmaceutical Resources Distribution System (PRDS) — City Health Office (CHO) of Naga, Cebu. Web application for managing pharmacy inventory, medicine requests, and stock transfers across 28 barangay health stations (BHS).

**1. System Overview**

PRDS follows a three-tier architecture:

```
┌─────────────────────┐
│  prds-web           │  React 19 SPA (Vite 8 + Tailwind CSS v4)
│  Vite + React SPA   │  Hosted statically; talks to Supabase directly
└────────┬────────────┘
         │ HTTPS (supabase-js)
┌────────▼────────────┐
│  Supabase           │  Managed PostgreSQL 15 + PostgREST (auto REST),
│  Backend-as-a-Service│  Auth (GoTrue), Realtime (WebSocket), Storage
└────────┬────────────┘
         │
┌────────▼────────────┐
│  PostgreSQL         │  Schema, enums, RLS policies, views,
│  database/          │  functions (RPC), triggers, realtime publication
└─────────────────────┘
```

There is no custom application server. Database access is enforced by PostgreSQL Row Level Security (RLS); every read/write flows through PostgREST with the caller's JWT, and sensitive operations go through SECURITY DEFINER functions (RPC). Driving directions:

| Layer        | Technology                                  |
| ------------ | ------------------------------------------- |
| Frontend     | React 19, Vite 8, Tailwind CSS v4, React Router 7 |
| Maps         | Leaflet 1.9 + react-leaflet 5 (Nominatim geocoding for search) |
| Backend      | Supabase: PostgREST, Auth, Realtime         |
| Database     | PostgreSQL (enums, RLS, functions, triggers, views) |
| Tests        | Node.js built-in `node --test` runner       |
| Runtime      | Node.js >= 24                               |

**2. Roles and Access**

| Role     | Description                                              |
| -------- | -------------------------------------------------------- |
| PHARMA_I | CHO staff: manages medicines catalog, stock, requests    |
| PHARMA_II| CHO administrator: full oversight (suppliers, stock transfers, users, forecasting) |
| BHW      | Barangay health worker: requests supplies, monitors own facility stock, tracks transfers |

Role gating is enforced twice: in the UI (route guards + sidebar visibility) and in the database (RLS policies + RPC permission checks).

| Route          | Module                       | Allowed roles                  |
| -------------- | ---------------------------- | ------------------------------ |
| `/dashboard`   | DashboardModule              | All                            |
| `/facilities`  | FacilitiesModule             | PHARMA_I, PHARMA_II            |
| `/medicines`   | MedicinesModule              | PHARMA_I, PHARMA_II            |
| `/suppliers`   | SuppliersModule              | PHARMA_II                      |
| `/inventory`   | ChoInventoryModule           | PHARMA_I, PHARMA_II            |
| `/inventory-bhw`| BhwInventoryModule          | BHW                            |
| `/requests`    | RequestsModule (splits internally) | All                      |
| `/transfers`   | TransfersModule (splits internally) | All                      |
| `/forecasting` | ForecastingModule            | All                            |
| `/notifications`| NotificationsModule         | All                            |
| `/activity-logs`| ActivityLogsModule          | All                            |
| `/users`       | UserManagementModule         | PHARMA_II                      |
| `/profile-settings`| ProfileSettingsModule     | All                            |

**3. Frontend (prds-web)**

**3.1 Tech Stack**

| Package               | Version | Purpose                          |
| --------------------- | ------- | -------------------------------- |
| react / react-dom     | 19.x    | UI framework                     |
| vite                  | 8.x     | Build tool / dev server          |
| tailwindcss + @tailwindcss/vite | 4.x | Styling (CSS-first config via `@theme`) |
| react-router-dom      | 7.x     | Routing, guards                  |
| leaflet / react-leaflet | 1.9 / 5 | Facility maps                   |
| @supabase/supabase-js | 2.x     | Auth, PostgREST queries, RPC, realtime |

**3.2 Folder Structure**

```
prds-web/src/
  assets/            Static assets (logo)
  components/        Shared components
    layout/          AdminShell, AdminHeader, AdminSidebar
    ErrorBoundary.jsx, ModalShell.jsx
  context/           AuthProvider, useAuth
  features/auth/     Login, Register, OTP, Forgot Password, Pending Approval, AuthService, ProfileService
  modules/           One folder per feature
    activity/        Activity logs
    dashboard/       Dashboard + FacilityMap component
    facilities/      Facility management, LocationPicker
    forecasting/     Stock forecasting
    inventory/       Cho / Bhw split modules, inventoryData, demandUtils
    medicines/       Medicines catalog
    notifications/   Notifications center
    profile/         Profile settings, OTP modal, password
    requests/        Request module + RequestsService + requestUtils
    suppliers/       Supplier management
    transfers/       Transfer module + TransfersService + transferUtils + TransferUi
    users/           User management
  routes/            AppRoutes, ProtectedRoutes, RoleGuard
  services/          supabase client, API layer
  utils/             Shared helpers (nagaMap, etc.)
```

**3.3 Conventions**

- **Role-split modules**: `RequestsModule` and `TransfersModule` pick their CHO vs BHW implementation from `profile.role`; the inventory routes are split at the route level (`/inventory` vs `/inventory-bhw`).
- **Data access**: modules call a per-feature service (`RequestsService.js`, `TransfersService.js`, `ProfileService.js`) which wraps supabase queries/RPCs. PostgREST errors are normalized (e.g. `PGRST204` receipt-column fallback in `RequestsService`).
- **Logic in utils**: pure helpers live in `*Utils.js` and are unit-tested with Node's `--test` runner (`transferUtils.test.mjs`, `requestUtils.test.mjs`, `inventoryUtils.test.mjs`, `profileSettingsUtils.test.mjs`, `userManagementUtils.test.mjs`).
- **Shared UI**: `ModalShell` (portal-based modals that keep input focus), `ErrorBoundary` (app-level), `TransferUi` (status badges, filter chips, metric cards), `FacilityMap` (shared by dashboard + facilities + forecasting).
- **Workflow logic**: requests and transfers use FEFO (first-expiry-first-out) batch allocation builders (`buildFefoBatchAllocations`, `buildFefoTransferAllocations`).

**3.4 Scripts**

| Command            | Description                                  |
| ------------------ | -------------------------------------------- |
| `npm run dev`      | Vite dev server with HMR                     |
| `npm run build`    | Production build to `dist/`                  |
| `npm run lint`     | ESLint over the project                      |
| `npm test`         | Node `--test` unit suites                    |
| `npm run test:coverage` | Run tests with coverage report          |
| `npm run preview`  | Preview production build locally             |

**4. Backend (Supabase)**

**4.1 Database Folder Layout**

```
database/
  schema/            Table definitions
  enums/             Enum types (transfer/request statuses, roles, etc.)
  indexes/           Performance indexes
  views/             Database views
  rls/               Row Level Security policies (per-table, e.g. suppliers_rls_schema.sql)
  helper-functions/  Functions, triggers, helper RPCs
  migrations/        Incremental schema changes (numbered by year/feature)
  realtime/          Realtime publication schema
  DATABASE_SETUP_ORDER.md   Ordered apply sequence
```

**4.2 Core Tables**

| Group          | Tables |
| -------------- | ------ |
| Identity       | `auth.users`, `profiles` (role, facility binding, avatar, phone) |
| Reference      | `facilities` (incl. coordinates), `medicines`, `suppliers` |
| Stock          | `inventory` (batch-level: facility, medicine, batch no., quantity, threshold, expiry) |
| Requests       | `medicine_requests`, `medicine_request_items`, `medicine_request_fulfillments` |
| Transfers      | `stock_transfers`, `stock_transfer_fulfillments` (batch allocations per transfer) |
| Activity       | `activity_logs` (audit trail for stock adjustments, adds, etc.), `notifications` |
| Forecasting    | Predicted-demand tables used by the forecasting module |

**4.3 RPC Functions (SECURITY DEFINER)**

| Function                                  | Purpose |
| ----------------------------------------- | ------- |
| `update_inventory_batch`                  | Stock adjustments (restock/consume/set-level) with facility scoping and audit logging |
| `review_medicine_request`                 | CHO request review with FEFO batch allocation and fulfillment rows |
| `get_request_release_batches`             | List releasable batches for a request |
| `confirm_request_received`                | Marks a request received (receipt confirmation) |
| `get_cho_inventory_medicines`             | CHO availability lookup for request items |
| `get_stock_transfer_source_availability`  | Available source-facility stock for transfer items |
| `create_cho_stock_transfer` / `submit_bhw_stock_transfer_request` | Transfer creation (CHO vs BHW sources) |
| `approve_stock_transfer` / `reject_stock_transfer` | CHO approval actions |
| `allocate_stock_transfer_for_pickup`      | Batch allocation -> READY_FOR_PICKUP |
| `get_stock_transfer_allocation_batches`   | Batches available for allocation |
| `confirm_stock_transfer_received`         | Completes the transfer |

**4.4 Transfer Workflow**

```
PENDING (requested) -> APPROVED -> READY_FOR_PICKUP (allocated from source batches) -> COMPLETED (received)
          └──────────────> REJECTED
```

**4.5 Security Model**

- **RLS**: every table has per-role policies (BHW row-scoped to their `facility_id`; CHO roles get facility-wide access). See `database/rls/*`.
- **RPC permission checks**: SECURITY DEFINER functions validate the caller's role and ownership before mutating.
- **Frontend parity**: UI hides actions the RLS would reject (e.g. BHW has no Adjust Stock button).

**4.6 Realtime**

Publishing is defined in `database/realtime/realtime_publication_schema.sql` and consumed for live notification and transfer-progress updates.

**5. Color Palette**

**5.1 Admin Application (primary)**

| Token         | Hex       | Usage |
| ------------- | --------- | ----- |
| Primary emerald | `#00a36c` | Primary actions, active accents, healthy stock, scrollbar hover |
| Mint accent   | `#6be9c2` | Sidebar active item, avatar, progress bars, map popup gradient |
| Ink           | `#0d1117` | Headings, primary text, dark buttons |
| Slate         | `#42474e` | Body/secondary text, scrollbar thumb |
| Border        | `#d8dadc` | Cards, dividers, inputs |
| Shell bg      | `#f7f6f3` | App background (with emerald radial glows) |
| Panel bg      | `#f8f9ff` | Sidebar, header, table theads |
| Hover         | `#eff4ff` | Row/nav/button hover states |
| Track         | `#f3efe9` | Scrollbar track, warm neutral |
| Surface       | `#ffffff` | Cards, modals, popups |

**5.2 Semantic Stock Health Colors**

| Status    | Hex       | Meaning |
| --------- | --------- | ------- |
| HEALTHY   | `#00a36c` | Sufficient stock |
| WATCH     | `#f59e0b` | Amber, watch tier |
| LOW       | `#f97316` | Low stock |
| CRITICAL  | `#ef4444` | Critical / out of stock |

Status badges use Tailwind soft tones: `bg-emerald-100 text-emerald-700`, `bg-amber-50/red-50/orange-50/blue-50/teal-50` with their 700-level text for labels.

**5.3 Auth Pages (Login / Register / OTP / Forgot Password)**

| Token         | Hex       | Usage |
| ------------- | --------- | ----- |
| Navy          | `#1d3f8c` / `#254fa8` / `#0e1f47` | Left brand panel gradient |
| Orange accent | `#dc8939` | "System" brand accent word |
| Rose          | `#b53e53` | Decorative blurred glow |
| Success green | `#008000` / hover `#006600` | Submit buttons |
| Link blue     | `#003b7a` | Text links |

The auth pages use a distinct blue/green palette; the in-app experience uses the emerald palette above.

**5.4 Typography**

- Font: **Inter** (with ui-sans-serif fallbacks).
- Base size: **14.5px** (90.6% of 16px) to keep the whole UI compact at 100% browser zoom.
- `font-black` is softened to weight 700 inside the admin shell and modals; uppercase labels use wide letter-spacing (`0.08em` effective).

**6. Verification**

- `npm run lint` - passes.
- `npm run build` - passes.
- `npm test` - Node `--test` suites pass (transferUtils, requestUtils, inventoryUtils, profileSettingsUtils, userManagementUtils).
- Dev server returns HTTP 200 on boot.

**See also:** `WorkLog.md` (development history), `Supabase Architecture Plan.md` (auth/approval design), `Database Tables and Attributes.md`, `Database Development Progress Report.md`, `BACKEND LOGIC DESIGN.md`, `System Features Planning.md`.