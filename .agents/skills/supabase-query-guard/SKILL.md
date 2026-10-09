---
name: supabase-query-guard
description: >
  Enforces strict Supabase Free Tier log query quota preservation and database inspection best practices.
  Restricts high-cost ClickHouse/BigQuery analytics queries (query_logs), prioritizes zero-cost direct
  PostgreSQL queries (execute_sql), mandates narrow time bounds, and provides actionable recommendations
  to minimize log query consumption while effectively completing tasks.
---

# Supabase Query Guard & Log Quota Optimization

This skill protects projects on the **Supabase Free Tier (100 GB Monthly Log Query Quota)** from rapid quota exhaustion while ensuring thorough, high-performance database auditing, debugging, and operational tasks.

---

## 1. Understanding the Quota Architecture

Supabase projects maintain two separate query pathways with fundamentally different resource impacts:

| Query Type | Tool / Interface | Backend Engine | Quota Impact |
| :--- | :--- | :--- | :--- |
| **Direct Postgres Query** | `execute_sql`, `psql`, PostgREST API, client SDK | PostgreSQL 15/17 DB instance | **0 GB** (Zero Log Query impact) |
| **Analytical Log Query** | `query_logs`, Supabase Dashboard "Logs Explorer" | Multi-tenant ClickHouse / BigQuery | **10 – 25+ GB per query** scanned across date partitions |

> ⚠️ **Key Takeaway:** Searching or querying logs via `query_logs` or the Dashboard Logs Explorer scans massive compressed columnar blocks. Just 4–5 broad log searches can consume 100% of the monthly free 100 GB allocation. Conversely, standard SQL queries run against PostgreSQL consume **0 GB** of log query quota.

---

## 2. Mandatory Agent Guidelines (Operational Guardrails)

Whenever inspecting, diagnosing, or auditing the Supabase backend:

### Rule 1: NEVER use `query_logs` as a First Resort
Always diagnose database status, connectivity, errors, performance, and restarts using **direct SQL queries** via `execute_sql`.

#### Zero-Cost Direct SQL Equivalents:

* **Checking Server Uptime & Restarts:**
  ```sql
  SELECT 
    now() AT TIME ZONE 'Asia/Manila' AS current_time_pht,
    pg_postmaster_start_time() AT TIME ZONE 'Asia/Manila' AS restarted_at_pht,
    now() - pg_postmaster_start_time() AS uptime;
  ```

* **Checking Connection Pool Health & Active Clients:**
  ```sql
  SELECT 
    count(*) AS total_connections,
    count(*) FILTER (WHERE state = 'active') AS active_connections,
    count(*) FILTER (WHERE state = 'idle') AS idle_connections,
    count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_txn,
    current_setting('max_connections')::int AS max_connections
  FROM pg_stat_activity;
  ```

* **Checking Active Queries & Long-Running Transactions:**
  ```sql
  SELECT 
    pid, 
    usename, 
    client_addr, 
    state, 
    now() - query_start AS duration, 
    query
  FROM pg_stat_activity
  WHERE state != 'idle' AND pid <> pg_backend_pid()
  ORDER BY duration DESC
  LIMIT 10;
  ```

* **Checking Deadlocks & Database Locks:**
  ```sql
  SELECT 
    blocked_locks.pid AS blocked_pid,
    blocking_locks.pid AS blocking_pid,
    blocked_activity.query AS blocked_statement,
    blocking_activity.query AS current_statement_in_blocking_process
  FROM pg_catalog.pg_locks blocked_locks
  JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
  JOIN pg_catalog.pg_locks blocking_locks 
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
  JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
  WHERE NOT blocked_locks.granted;
  ```

* **Checking Table Sizes & Database Growth:**
  ```sql
  SELECT 
    relname AS table_name,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    pg_size_pretty(pg_relation_size(relid)) AS table_size,
    pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size
  FROM pg_catalog.pg_statio_user_tables
  ORDER BY pg_total_relation_size(relid) DESC
  LIMIT 10;
  ```

---

### Rule 2: Protocol for When `query_logs` is Truly Necessary

`query_logs` is ONLY permitted when the target information does **not** exist in PostgreSQL (e.g. Edge Function fatal crashes, Auth email delivery webhooks, or raw HTTP ingress 502/504 edge gateways).

Before calling `query_logs`, the agent MUST:
1. **Confirm with the User:** State that a log query will be executed and warn of potential scan usage.
2. **Apply Tight Time Bounds:** 
   - `iso_timestamp_start` and `iso_timestamp_end` must cover **no more than 5 to 15 minutes**.
   - NEVER query unbound or with windows of 1 hour, 24 hours, or 7 days.
3. **Mandate Strict Filter Clauses:**
   - Always include the exact project filter: `WHERE log_attributes['project'] = '<project_ref>'`
   - Include specific event type or status code filters.
   - Enforce `LIMIT 15` or `LIMIT 25` to prevent huge analytical result buffers.

---

## 3. Recommendations to Minimize Log Query Usage (For Developer & Users)

To keep your Supabase monthly Log Query quota under control:

### 1. In the Supabase Dashboard UI
* **Avoid Default Wide Ranges:** When opening the **Logs** tab, do not leave the dropdown on "Last 24 hours" or "Last 7 days". Immediately switch the time range filter to **"Past 1 hour"** or specify a 15-minute custom window before searching.
* **Pause Live Streaming / Auto-Refresh:** The "Live" toggle in the dashboard logs explorer continually submits queries every few seconds. Keep "Live" toggled off unless actively debugging an ongoing issue.
* **Avoid Rapidly Clicking Between Log Categories:** Each tab click (Postgres → API → Realtime → Auth) triggers a new multi-gigabyte ClickHouse table scan.

### 2. In Application Code (PRDS Client & Desktop)
* **Client-Side Throttling & Debounce:** Ensure polling cycles (e.g., in `syncManager.js`) do not fire high-frequency failing HTTP requests when offline or during transient outages.
* **Offline-First Resilience:** PRDS already utilizes a local SQLite outbox queue. If a request returns an error or times out, back off exponentially (e.g., wait 5s, 15s, 30s) rather than immediately retrying in a tight loop.
* **Targeted Application Audit Logging:** For business-critical operations (like stock returns, batch reconciliations, and inventory deductions), record audit logs directly into a `public.audit_logs` table in PostgreSQL rather than relying on Supabase platform logs. Direct table rows can be queried freely with 0 GB quota impact.

---

## 4. Verification Checklist Before Executing Any Database Task

- [ ] Can this task be completed using `execute_sql`? (If YES, use `execute_sql`).
- [ ] Is `query_logs` being considered? (If YES, verify that time range is $\le 15$ minutes and explicit project filters are set).
- [ ] Has the user been informed if an analytical log scan is about to occur?
- [ ] Are all schema migrations, RLS adjustments, and data repairs performed via PostgreSQL DDL/DML directly?
