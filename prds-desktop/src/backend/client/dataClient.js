/**
 * Unified PRDS Data Client
 * Transparently bridges Supabase (L3), local SQLite (L2), and in-memory/localStorage snapshots (L1)
 * via modular table repository adapters and the RPC execution adapter.
 */

import { isCurrentNetworkOnline } from "../sync/networkStatus.js";
import { getSqliteDb, isTauriEnvironment } from "../database/sqliteClient.js";
import { getSnapshot } from "../database/snapshotStore.js";
import { supabase } from "./supabase.js";
import { executeRpcWithFallback } from "./rpcAdapter.js";
import {
  batchUpsertSqliteRecords,
  getRepositoryAdapter,
  hydrateSqliteRow,
  upsertSnapshotRecord,
  upsertSqliteRecord,
} from "./tableRepositoryAdapters.js";

export {
  batchUpsertSqliteRecords,
  getRepositoryAdapter,
  hydrateSqliteRow,
  upsertSnapshotRecord,
  upsertSqliteRecord,
};

export const dataClient = {
  /**
   * Resolves a table name or alias to its repository adapter.
   */
  getRepositoryAdapter(tableName) {
    return getRepositoryAdapter(tableName);
  },

  /**
   * Execute an RPC call (e.g. process_walk_in_dispensing, submit_bhw_medicine_request)
   */
  async rpc(functionName, params = {}, options = {}) {
    return executeRpcWithFallback(functionName, params, options);
  },

  /**
   * Query records from local SQLite, Supabase, or local snapshot fallback using the table's repository adapter.
   */
  async getTable(tableName, query = {}) {
    const adapter = getRepositoryAdapter(tableName);
    if (!adapter) {
      return {
        data: [],
        error: new Error(`Unknown repository table: ${String(tableName)}`),
      };
    }

    const facilityId = query?.facilityId || query?.facility_id || null;
    const limit = Number.isInteger(query?.limit) && query.limit > 0 ? query.limit : null;
    const hasFacilityColumn = adapter.columns.includes("facility_id");
    const isOnline = isCurrentNetworkOnline();

    // 1. In Tauri desktop environment, local SQLite provides instantaneous read access
    if (isTauriEnvironment()) {
      try {
        const db = await getSqliteDb();
        const clauses = [];
        const params = [];
        if (facilityId && hasFacilityColumn) {
          clauses.push("facility_id = ?");
          params.push(facilityId);
        }
        const whereSql = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
        const limitSql = limit ? ` LIMIT ${limit}` : "";
        const rows = await db.select(`SELECT * FROM ${adapter.sqliteTable}${whereSql}${limitSql}`, params);
        if (Array.isArray(rows) && rows.length > 0) {
          return { data: rows.map(hydrateSqliteRow), error: null };
        }
      } catch (err) {
        console.warn(`Local SQLite query on ${adapter.sqliteTable} failed:`, err);
      }
    }

    // 2. If online, query Supabase using the canonical Supabase table name
    if (isOnline) {
      let req = supabase.from(adapter.supabaseTable).select("*");
      if (facilityId && hasFacilityColumn) {
        req = req.eq("facility_id", facilityId);
      }
      if (limit) {
        req = req.limit(limit);
      }
      const { data, error } = await req;
      return { data, error };
    }

    // 3. Offline fallback to L1 snapshot store if available
    if (adapter.snapshotKey) {
      let rows = getSnapshot(adapter.snapshotKey, []);
      if (facilityId && hasFacilityColumn) {
        rows = rows.filter((r) => r?.facility_id === facilityId);
      }
      if (limit) {
        rows = rows.slice(0, limit);
      }
      return { data: rows, error: null };
    }

    return { data: [], error: null };
  },

  /**
   * Optimistically upsert a record into local SQLite (L2) and update the snapshot cache (L1).
   * Ensures instant local mirroring whenever data is created or modified.
   */
  async upsertLocalRecord(tableName, record) {
    if (!record || !record.id) return false;
    const adapter = getRepositoryAdapter(tableName);
    if (!adapter) return false;

    // 1. Update SQLite if in Tauri desktop environment
    if (isTauriEnvironment()) {
      try {
        const db = await getSqliteDb();
        await upsertSqliteRecord(db, tableName, record);
      } catch (err) {
        console.warn(`Local SQLite upsert on ${adapter.sqliteTable} failed:`, err);
      }
    }

    // 2. Update corresponding L1 localStorage snapshot
    upsertSnapshotRecord(tableName, record);

    return true;
  },
};
