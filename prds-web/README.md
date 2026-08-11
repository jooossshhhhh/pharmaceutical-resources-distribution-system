# PRDS — Pharmaceutical Resources Distribution System

Web application for the City Health Office (CHO) of Naga to manage the
inventory, distribution, and tracking of pharmaceutical resources across
28 barangay health stations (BHS).

## Roles

| Role       | Description                                                        |
| ---------- | ------------------------------------------------------------------ |
| PHARMA_II  | CHO-level administrator. Full oversight of inventory, suppliers, stock transfers, and forecasting. |
| PHARMA_I   | CHO-level staff. Manages medicines, stock, and requests.           |
| BHW        | Barangay health worker. Requests supplies, monitors facility stock, and tracks dispensing. |

## Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS v4, React Router v7
- **Maps:** Leaflet + react-leaflet 5
- **Backend:** Supabase (PostgreSQL, Row Level Security, Auth)
- **Runtime:** Node.js >= 24 (uses the built-in `node --test` runner)

## Getting Started

```bash
npm install
```

Copy the environment template and fill in your Supabase project values:

```bash
copy .env.example .env
```

| Variable                  | Description                          |
| ------------------------- | ------------------------------------ |
| `VITE_SUPABASE_URL`       | Supabase project URL                 |
| `VITE_SUPABASE_ANON_KEY`  | Supabase anon (publishable) key      |

Then start the dev server:

```bash
npm run dev
```

## Scripts

| Command            | Description                                         |
| ------------------ | --------------------------------------------------- |
| `npm run dev`      | Start the Vite dev server with HMR                  |
| `npm run build`    | Production build to `dist/`                         |
| `npm run lint`     | Run ESLint over the project                         |
| `npm test`         | Run the test suites (Node's built-in runner)        |
| `npm run test:coverage` | Run tests with experimental coverage report    |
| `npm run preview`  | Preview the production build locally                |

## Repository Map

```
prds-web/            Frontend application
  src/modules/       Feature modules (one folder per feature)
    activity/        Activity logs
    dashboard/       Dashboard + facility map
    facilities/      Facility management and map view
    forecasting/     Stock forecasting
    inventory/       CHO & BHW inventory modules
    medicines/       Medicines catalog and constraints
    notifications/   Notifications center
    profile/         Profile, phone linking, OTP
    requests/        Medicine requests
    suppliers/       Supplier management
    users/           User management
  src/services/      Supabase client and API layer
  src/utils/         Shared helpers (e.g. Naga map coordinates)
database/            PostgreSQL schema and SQL
  schema/            Table definitions
  enums/             Enum types
  indexes/           Indexes
  views/             Database views
  rls/               Row Level Security policies
  helper-functions/  Functions, triggers, helpers
  migrations/        Incremental schema changes
documentation/       Design and planning docs
```

## Documentation

- [Database Development Progress Report](../documentation/Database%20Development%20Progress%20Report.md)
- [System Features Planning](../documentation/System%20Features%20Planning.md)
- [Supabase Architecture Plan](../documentation/Supabase%20Architecture%20Plan.md)
- [Database Tables and Attributes](../documentation/Database%20Tables%20and%20Attributes.md)
- [PRDS Web + Mobile Application Folder Structure](../documentation/PRDS%20Web%20+%20Mobile%20Application%20Folder%20Structure.md)
