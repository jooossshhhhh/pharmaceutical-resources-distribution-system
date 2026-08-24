# PRDS Documentation

Home for the Pharmaceutical Resource Distribution System (PRDS) — a web application for managing pharmacy inventory, medicine requests, and stock transfers across the City Health Office (CHO) of Naga, Cebu and its barangay health stations.

## Map of Content

### 1 - Planning

Architecture and planning references.

- [System Features Planning](./1-Planning/System%20Features%20Planning.md) — per-role feature planning (Pharma II, Pharma I, BHW).
- [Supabase Architecture Plan](./1-Planning/Supabase%20Architecture%20Plan.md) — Supabase authentication and backend plan.
- [PRDS System Architecture](./1-Planning/PRDS%20System%20Architecture.md) — three-tier system overview and architecture.
- [Backend Logic Design](./1-Planning/Backend%20Logic%20Design.md) — draft notes on authentication logic.

### 2 - Database

Database design and progress.

- [Database Tables and Attributes](./2-Database/Database%20Tables%20and%20Attributes.md) — table and column documentation.
- [Database Development Progress Report](./2-Database/Database%20Development%20Progress%20Report.md) — database development progress.

### 3 - Application

Application structure and feature notes.

- [PRDS Web + Mobile Application Folder Structure](./3-Application/PRDS%20Web%20+%20Mobile%20Application%20Folder%20Structure.md) — repository folder structure.
- [Patient](./3-Application/Patient.md) — patients module logic and flow.

### 4 - Logs

Historical development records.

- [WorkLog](./4-Logs/WorkLog.md) — development work log.
- [PRDS DEVELOPMENT OPENCODE](./4-Logs/PRDS%20DEVELOPMENT%20OPENCODE.md) — OpenCode session log.

### 5 - IssuesLog

Issue tracking, one file per issue with time tracking.

- [IssuesLog Index](./5-IssuesLog/README.md)
- [Issue 001 - `confirm_stock_transfer_received` RPC returns 400 Bad Request](./5-IssuesLog/Issue-001-confirm-stock-transfer-received-400-bad-request.md)

---

## Conventions

- **Reference** docs live in `1-Planning`, `2-Database`, `3-Application`.
- **Logs** (historical records) live in `4-Logs`.
- **Issues** live in `5-IssuesLog` as `Issue-###-<short-title>.md` files, each with `Date Reported` / `Date Resolved`.
- Add new documents under the matching numbered folder and link them here.