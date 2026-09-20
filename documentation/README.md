# PRDS Documentation

Home for the Pharmaceutical Resources Distribution System (PRDS) — an offline-first desktop application (`prds-desktop`) and browser application (`prds-web`) for managing pharmacy inventory, medicine dispensing, requisitions, stock transfers, and demand forecasting across the City Health Office (CHO) of Naga, Cebu and its 28 barangay health stations.

---

## Map of Content

### 1 - Planning & Architecture

System architecture, offline synchronization, module workflows, forecasting mathematics, and security policies.

- [PRDS System Architecture](./1-Planning/PRDS%20System%20Architecture.md) — Dual-client system overview (Tauri v2 desktop + React 19 web), offline-first outbox synchronization, role matrix, and Supabase backend.
- [Forecasting Interpretation & Analytics Guide](./1-Planning/FORECASTING_INTERPRETATION_AND_ANALYTICS_GUIDE.md) — Step-by-step OLS linear regression computation process, intermediate sums, worked numerical example, stock coverage risk tiers, and glossary.
- [PRDS Module Guide](./1-Planning/Module%20Guide.md) — End-to-end user workflows, technical notes, and interpretation rules for all 13 core modules.
- [PRDS Desktop Migration & Offline Sync Guide](./1-Planning/PRDS%20Desktop%20Migration%20and%20Offline%20Sync%20Guide.md) — Technical details of the Tauri v2 desktop shell, local SQLite/IndexedDB snapshot caching, and network status sync.
- [System Features Planning](./1-Planning/System%20Features%20Planning.md) — Role-based feature matrix (PHARMA_II, PHARMA_I, BHW) and operational responsibilities.
- [Supabase Architecture Plan](./1-Planning/Supabase%20Architecture%20Plan.md) — PostgreSQL data schemas, user authentication lifecycle, RLS policies, and RPC stored procedures.
- [PRDS Information Security Policy](./1-Planning/PRDS%20Information%20Security%20Policy.md) — Security rules, acceptable use, workstation protection at Barangay Health Stations, and data privacy compliance.

### 2 - Database

Database design, data dictionaries, and migration tracking.

- [Database Tables and Attributes](./2-Database/Database%20Tables%20and%20Attributes.md) — Table schemas, foreign keys, data types, and column documentation.
- [Database Development Progress Report](./2-Database/Database%20Development%20Progress%20Report.md) — Migration history and schema change log.

### 3 - Application

Application folder architecture, component organization, and domain logic.

- [PRDS Application Folder Structure](./3-Application/PRDS%20Application%20Folder%20Structure.md) — Monorepo directory map for `prds-desktop`, `prds-web`, `database`, and `supabase`.
- [Patient Management Flow](./3-Application/Patient.md) — Patient registration, demographic tracking, and dispensing history flow.

### 4 - Logs

Historical development session records.

- [WorkLog](./4-Logs/WorkLog.md) — Development task log.
- [PRDS Development Session History](./4-Logs/PRDS%20DEVELOPMENT%20OPENCODE.md) — Extended development session logs.

### 5 - IssuesLog

Issue tracking and resolutions, one file per issue with timestamps.

- [IssuesLog Index](./5-IssuesLog/README.md)
- [Issue 001 - Stock Transfer Received RPC 400 Bad Request](./5-IssuesLog/Issue-001-confirm-stock-transfer-received-400-bad-request.md)
- [Backend Audit - 2026-08-22](./5-IssuesLog/Backend%20Audit%20-%202026-08-22.md)

---

## Documentation Conventions

- **Planning & Reference** docs live in `1-Planning/`, `2-Database/`, and `3-Application/`.
- **Logs** (historical records) live in `4-Logs/`.
- **Issues** live in `5-IssuesLog/` formatted as `Issue-###-<short-title>.md`, with `Date Reported` and `Date Resolved`.