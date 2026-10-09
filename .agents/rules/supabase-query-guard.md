# Supabase Log Query Guardrail Rule

Whenever working with Supabase or investigating database issues:

1. **Zero-Quota SQL First:** ALWAYS use direct SQL queries (`execute_sql`) against PostgreSQL catalogs (`pg_stat_activity`, `pg_postmaster_start_time()`, `pg_locks`, etc.) to diagnose uptime, connections, performance, or errors. Direct SQL consumes **0 GB** of Log Query quota.
2. **Strict Limit on `query_logs`:** NEVER call `query_logs` unless explicitly requested by the user and confirmed to be the only way to obtain the needed diagnostic data.
3. **Narrow Time Bounds:** If `query_logs` must be run, restrict `iso_timestamp_start` and `iso_timestamp_end` to a strict window $\le 15$ minutes with explicit project filters (`WHERE log_attributes['project'] = ... LIMIT 15`).
4. **Follow Skill:** For detailed zero-cost diagnostic queries and best practices, consult the `supabase-query-guard` skill.
