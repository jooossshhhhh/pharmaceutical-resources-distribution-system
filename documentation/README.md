# PRDS Documentation

Home for the Pharmaceutical Resources Distribution System (PRDS) — an offline-first desktop application (`prds-desktop`) and browser application (`prds-web`) for managing pharmacy inventory, medicine dispensing, requisitions, inter-facility stock transfers, and demand forecasting across the City Health Office (CHO) of Naga, Cebu and its 28 barangay health stations.

---

## 🗺️ Map of Content

> 📌 **Quick Index:** See the [Checklist Progress](./Checklist%20Progress.md) document for a summarized status and directory of recently authored planning, sync architecture, and security specifications.

### 1 - Planning & Architecture

System-level architecture, future synchronization plans, cloud backend blueprints, and security governance policies.

- [PRDS System Architecture](./1-Planning/PRDS%20System%20Architecture.md) — Dual-client system overview (Tauri v2 desktop + React 19 web), offline-first outbox synchronization, role matrix, and Supabase backend.
- [PRDS High Priority Implementation Plan - Delta Sync and Clinical Conflict Resolution](./1-Planning/PRDS%20High%20Priority%20Implementation%20Plan%20-%20Delta%20Sync%20and%20Clinical%20Conflict%20Resolution.md) — Technical blueprint for delta sync watermarks (`.gt('updated_at')`), tombstone deletion tracking, and the Clinical Primacy Axiom conflict resolution engine.
- [Supabase Architecture Plan](./1-Planning/Supabase%20Architecture%20Plan.md) — PostgreSQL data schemas, user authentication lifecycle, RLS policies, and RPC stored procedures.
- [PRDS Information Security Policy](./1-Planning/PRDS%20Information%20Security%20Policy.md) — Security rules, workstation protection at Barangay Health Stations, and data privacy compliance.
- [Twilio Verify Guidelines](./1-Planning/Twilio%20Guidelines.md) — Comprehensive technical reference for Phone OTP authentication, pay-on-success billing, and Supabase integration.

---

### 2 - Database

Database design, data dictionaries, schema migrations, and column attributes.

- [Current Supabase Database Setup & Schema Reference](./2-Database/Current%20Supabase%20Database%20Setup%20and%20Schema%20Reference.md) — Comprehensive technical reference of the live Supabase PostgreSQL setup, 20 active tables, ERD, foreign key relationships, RLS policies, and stored procedure RPCs.
- [Database Tables and Attributes](./2-Database/Database%20Tables%20and%20Attributes.md) — Table schemas, foreign keys, data types, and column documentation for all 21 tables.
- [Database Development Progress Report](./2-Database/Database%20Development%20Progress%20Report.md) — Migration history and schema change log.
- [PRDS Database ERD Guide](./2-Database/PRDS_Database_ERD_Guide.md) — Entity Relationship Diagram reference with direct links to the interactive [Schema Visualizer](../database/erd-visualizer.html) and [Draw.io Schema](../database/prds_erd_schema_a4.drawio).

---

### 3 - Application

Application folder architecture, live module guides, feature workflows, mathematical engines, and domain logic.

- [PRDS Application Folder Structure](./3-Application/PRDS%20Application%20Folder%20Structure.md) — Monorepo directory map for `prds-desktop`, `prds-web`, `database`, and `supabase`, including strict architectural placement conventions.
- [PRDS Module Guide](./3-Application/Module%20Guide.md) — End-to-end user workflows, technical notes, role matrices, and interpretation rules for all core desktop modules.
- [PRDS Offline and Online Sync Architecture](./3-Application/PRDS%20Offline%20and%20Online%20Sync%20Architecture.md) — Authoritative technical architecture of cloud-to-local data ingestion, dual-layer storage (LevelDB + SQLite `prds.db`), physical disk paths, three-zone session separation, mutation lifecycle, and conflict resolution policies.
- [City of Naga Inventory Workflow Architecture](./3-Application/City%20of%20Naga%20Inventory%20Workflow%20Architecture.md) — Formalization of the centralized Hub-and-Spoke supply chain model, CHO sole procurement intake, BHW requisition boundaries, and inventory reconciliation.
- [Forecasting Interpretation & Analytics Guide](./3-Application/Forecasting%20Interpretation%20and%20Analytics%20Guide.md) — Plain-language health worker guide explaining demand trends, stockout risk tiers, coverage multipliers, practical clinical actions, and developer statistical appendix.
- [Report Module Components and Interpretation Guide](./3-Application/Report%20Module%20Components%20and%20Interpretation%20Guide.md) — Component architecture, Daily RIS vs. Monthly Physical Count ledger, 6-stage KPI reconciliation formulas, and official Excel export specifications.
- [CHO Inventory Physical Count Report Plan and Analysis](./3-Application/CHO%20Inventory%20Physical%20Count%20Report%20Plan%20and%20Analysis.md) — Low-level column-by-column breakdown (`C` through `AI`) of `inventory-form.xlsx`, mathematical reconciliation formulas, and CFB/XML export architecture.
- [Patient Management Flow](./3-Application/Patient%20Management%20Flow.md) — Citizen residency verification, sequential `patient_code` generation, deduplication matching, and clinical dispensing records.
- [PRDS Input Validation and Security Guidelines](./3-Application/PRDS%20Input%20Validation%20and%20Security%20Guidelines.md) — Field-by-field validation standards, Philippine phone number normalization, password complexity policies, progressive lockout, and OTP throttling.

---


### 4 - Logs

Historical development session records and formal audits.

- [WorkLog](./4-Logs/WorkLog.md) — Chronological development task log, module refactoring history, and legacy data ingestion audit.
- [Backend Security Audit - 2026-08-22](./4-Logs/Backend%20Audit%20-%202026-08-22.md) — Security audit of backend functions, RLS policies, and RPC endpoints.
- [Codebase Organization Audit - 2026-09-20](./4-Logs/PRDS%20Codebase%20Organization%20Audit%20-%202026-09-20.md) — Monorepo cleanup, dead code elimination, and architectural consolidation audit.

---

### 5 - IssuesLog

Issue tracking and resolutions, one file per issue with timestamps.

- [IssuesLog Index](./5-IssuesLog/README.md) — Index and status tracker for logged system defects.
- [Issue 001 - Stock Transfer Received RPC 400 Bad Request](./5-IssuesLog/Issue-001-confirm-stock-transfer-received-400-bad-request.md) — Resolution for stock transfer confirmation payload mismatch.

---

### 6 - ClientData

Reference spreadsheets and official templates provided by the City Health Office:

- `Dispensing.xlsx` — Official dispensing logbook template.
- `InventoryForm.xlsx` — Monthly physical inventory count form.
- `ListOfMedicine.xlsx` — Essential drug list and catalog reference.
- `RequestIssuanceSlip.xlsx` — Official Requisition and Issue Slip (RIS) form.

---

## 📐 Documentation Conventions

- **Planning & Architecture** docs live in `1-Planning/` (system strategies, blueprints, specifications).
- **Database & Data Dictionaries** live in `2-Database/`.
- **Application & Domain Guides** live in `3-Application/`.
- **Audits & Development Logs** live in `4-Logs/`.
- **Issue Tracking** lives in `5-IssuesLog/` formatted as `Issue-###-<short-title>.md`, with `Date Reported` and `Date Resolved`.
- **Client Forms** live in `6-ClientData/`.