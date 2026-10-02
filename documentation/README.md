# PRDS Documentation

Home for the Pharmaceutical Resources Distribution System (PRDS) — an offline-first desktop application (`prds-desktop`) and browser application (`prds-web`) for managing pharmacy inventory, medicine dispensing, requisitions, stock transfers, and demand forecasting across the City Health Office (CHO) of Naga, Cebu and its 28 barangay health stations.

---

## Map of Content

> 📌 **Quick Index:** See the [Checklist Progress](./Checklist%20Progress.md) document for a summarized status and directory of recently authored planning, sync architecture, and security specifications.

### 1 - Planning & Architecture

System-level architecture, offline synchronization strategy, module workflows, forecasting mathematics, and security policies.

- [PRDS System Architecture](./1-Planning/PRDS%20System%20Architecture.md) — Dual-client system overview (Tauri v2 desktop + React 19 web), offline-first outbox synchronization, role matrix, and Supabase backend.
- [Forecasting Interpretation & Analytics Guide](./1-Planning/Forecasting%20Interpretation%20and%20Analytics%20Guide.md) — Step-by-step OLS linear regression computation process, intermediate sums, worked numerical example, stock coverage risk tiers, and glossary.
- [PRDS Module Guide](./1-Planning/Module%20Guide.md) — End-to-end user workflows, technical notes, and interpretation rules for all 13 core modules.
- [PRDS Desktop Migration & Offline Sync Guide](./1-Planning/PRDS%20Desktop%20Migration%20and%20Offline%20Sync%20Guide.md) — Technical details of the Tauri v2 desktop shell, local SQLite/IndexedDB snapshot caching, and network status sync.
- [System Features Planning](./1-Planning/System%20Features%20Planning.md) — Role-based feature matrix (PHARMA_II, PHARMA_I, BHW) and operational responsibilities.
- [Supabase Architecture Plan](./1-Planning/Supabase%20Architecture%20Plan.md) — PostgreSQL data schemas, user authentication lifecycle, RLS policies, and RPC stored procedures.
- [PRDS Information Security Policy](./1-Planning/PRDS%20Information%20Security%20Policy.md) — Security rules, workstation protection at Barangay Health Stations, and data privacy compliance.
- [Twilio Verify Guidelines](./1-Planning/Twilio%20Guidelines.md) — Comprehensive technical reference for Phone OTP authentication, pay-on-success billing, and Supabase integration.
- [Report Module UI Design Instructions](./1-Planning/Report%20Module%20UI%20Design%20Instructions.md) — High-density design specification for clinical reporting and RIS generation.
- [Report Module UI Design Prompt](./1-Planning/Report%20Module%20UI%20Design%20Prompt.md) — Prompt summary and KPI card layout specifications for the reporting module.
- [Report Module Feature Plan](./1-Planning/Report%20Module%20Feature%20Plan.md) — Feature outline and Excel export criteria for daily dispensing and monthly inventory.

---

### 2 - Database

Database design, data dictionaries, schema migrations, and column attributes.

- [Database Tables and Attributes](./2-Database/Database%20Tables%20and%20Attributes.md) — Table schemas, foreign keys, data types, and column documentation for all 21 tables.
- [Database Development Progress Report](./2-Database/Database%20Development%20Progress%20Report.md) — Migration history and schema change log.

---

### 3 - Application

Application folder architecture, component organization, and domain logic.

- [PRDS Application Folder Structure](./3-Application/PRDS%20Application%20Folder%20Structure.md) — Monorepo directory map for `prds-desktop`, `prds-web`, `database`, and `supabase`.
- [PRDS Desktop Folder Placement Conventions](./3-Application/PRDS%20Desktop%20Folder%20Conventions.md) — Guidelines and placement rules for desktop services, UI views, and utility helpers.
- [PRDS Offline and Online Sync Architecture](./3-Application/PRDS%20Offline%20and%20Online%20Sync%20Architecture.md) — Detailed technical architecture of cloud-to-local data ingestion, dual-layer storage (LevelDB + SQLite `prds.db`), physical disk paths, and three-zone session separation.
- [PRDS Offline and Online Sync Framework](./3-Application/PRDS%20Offline%20and%20Online%20Sync%20Framework.md) — Operational guidelines, module boundaries, session lifecycle, and error handling for synchronization.
- [PRDS Input Validation and Security Guidelines](./3-Application/PRDS%20Input%20Validation%20and%20Security%20Guidelines.md) — Field-by-field validation standards, Philippine phone number normalization, password complexity policies, progressive lockout, and OTP throttling.
- [Patient Management Flow](./3-Application/Patient%20Management%20Flow.md) — Patient registration, demographic tracking, and dispensing history flow.

---

### 4 - Logs

Historical development session records, audits, and import reports.

- [WorkLog](./4-Logs/WorkLog.md) — Chronological development task log.
- [PRDS Development Session History](./4-Logs/PRDS%20DEVELOPMENT%20OPENCODE.md) — Extended development session logs.
- [Backend Security Audit - 2026-08-22](./4-Logs/Backend%20Audit%20-%202026-08-22.md) — Security audit of backend functions, RLS, and RPC endpoints.
- [Codebase Organization Audit - 2026-09-20](./4-Logs/PRDS%20Codebase%20Organization%20Audit%20-%202026-09-20.md) — Monorepo cleanup and architectural consolidation audit.
- [Historical Dispensing Import Exception Report - 2026-09-20](./4-Logs/ClientData%20Historical%20Dispensing%20Import%20Exception%20Report%20-%202026-09-20.md) — Data import verification report for legacy client records.
- [Offline Sync Architecture Optimization Recommendations - 2026-09-28](./4-Logs/Offline%20Sync%20Architecture%20Recommendations%20-%202026-09-28.md) — Performance audit and architectural roadmap for delta sync, transaction batching, and conflict handling.

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

## Documentation Conventions

- **Planning & Reference** docs live in `1-Planning/`, `2-Database/`, and `3-Application/`.
- **Logs & Audits** live in `4-Logs/`.
- **Issues** live in `5-IssuesLog/` formatted as `Issue-###-<short-title>.md`, with `Date Reported` and `Date Resolved`.
- **Client Forms** live in `6-ClientData/`.