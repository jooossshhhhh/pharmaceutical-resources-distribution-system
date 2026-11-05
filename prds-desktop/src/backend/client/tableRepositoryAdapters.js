/**
 * Modular Table Repository Adapters for PRDS
 * Centralizes schema column mappings, row serialization, and snapshot key bindings
 * across local SQLite (L2), localStorage snapshots (L1), and Supabase (L3).
 */

import { getSnapshot, saveSnapshot, STORAGE_KEYS } from "../database/snapshotStore.js";
import { batchInsertOrReplace } from "../database/sqliteClient.js";

const nowIso = () => new Date().toISOString();

const ADAPTER_DEFINITIONS = {
  facilities: {
    sqliteTable: "facilities",
    supabaseTable: "facilities",
    snapshotKey: STORAGE_KEYS.FACILITIES,
    columns: ["id", "facility_name", "facility_code", "facility_type", "status", "data_json"],
    toRow: (record) => [
      record.id,
      record.facility_name ?? null,
      record.facility_code ?? null,
      record.facility_type ?? null,
      record.status ?? "ACTIVE",
      JSON.stringify(record),
    ],
  },

  medicines: {
    sqliteTable: "medicines",
    supabaseTable: "medicines",
    snapshotKey: STORAGE_KEYS.MEDICINES,
    columns: ["id", "generic_name", "dosage", "unit_of_measure", "categories_json", "data_json"],
    toRow: (record) => [
      record.id,
      record.generic_name ?? null,
      record.dosage ?? null,
      record.unit_of_measure ?? null,
      JSON.stringify(record.categories || []),
      JSON.stringify(record),
    ],
  },

  inventory: {
    sqliteTable: "inventory",
    supabaseTable: "inventory",
    snapshotKey: STORAGE_KEYS.INVENTORY,
    columns: [
      "id",
      "facility_id",
      "medicine_id",
      "quantity",
      "batch_number",
      "po_number",
      "unit_cost",
      "date_received",
      "expiration_date",
      "origin_facility_id",
      "intake_type",
      "return_reason",
      "status",
      "brand_name",
      "supplier_name",
      "supplier_address",
      "supplier_contact",
      "data_json",
      "updated_at",
    ],
    toRow: (record) => [
      record.id,
      record.facility_id ?? null,
      record.medicine_id ?? null,
      record.quantity ?? 0,
      record.batch_number ?? null,
      record.po_number || null,
      record.unit_cost ?? null,
      record.date_received ?? null,
      record.expiration_date ?? null,
      record.origin_facility_id || null,
      record.intake_type || "PROCUREMENT",
      record.return_reason || null,
      record.status || "ACTIVE",
      record.brand_name || null,
      record.supplier_name || null,
      record.supplier_address || null,
      record.supplier_contact || null,
      JSON.stringify(record),
      record.updated_at || nowIso(),
    ],
  },

  facility_medicine_thresholds: {
    sqliteTable: "facility_medicine_thresholds",
    supabaseTable: "facility_medicine_thresholds",
    snapshotKey: STORAGE_KEYS.THRESHOLDS,
    columns: ["id", "facility_id", "medicine_id", "threshold", "is_custom", "updated_at"],
    toRow: (record) => [
      record.id || `${record.facility_id}:${record.medicine_id}`,
      record.facility_id,
      record.medicine_id,
      record.threshold ?? 0,
      record.is_custom ? 1 : 0,
      record.updated_at || nowIso(),
    ],
  },

  patients: {
    sqliteTable: "patients",
    supabaseTable: "patients",
    snapshotKey: STORAGE_KEYS.PATIENTS,
    columns: ["id", "facility_id", "first_name", "last_name", "philhealth_id", "data_json"],
    toRow: (record) => [
      record.id,
      record.facility_id ?? null,
      record.first_name ?? null,
      record.last_name ?? null,
      record.philhealth_id || record.patient_code || "",
      JSON.stringify(record),
    ],
  },

  dispensing_records: {
    sqliteTable: "dispensing_records",
    supabaseTable: "medicine_dispensing",
    snapshotKey: STORAGE_KEYS.DISPENSING,
    columns: ["id", "facility_id", "patient_id", "dispensed_by", "data_json", "created_at", "is_synced"],
    toRow: (record) => [
      record.id,
      record.facility_id ?? null,
      record.patient_id ?? null,
      record.dispensed_by ?? null,
      JSON.stringify(record),
      record.dispense_date || record.created_at || nowIso(),
      record.is_synced ?? 1,
    ],
  },

  requests: {
    sqliteTable: "requests",
    supabaseTable: "medicine_requests",
    snapshotKey: STORAGE_KEYS.REQUESTS,
    columns: ["id", "request_number", "facility_id", "status", "data_json", "updated_at", "is_synced"],
    toRow: (record) => [
      record.id,
      record.request_number || record.id?.slice(0, 8) || null,
      record.facility_id ?? null,
      record.status ?? "PENDING",
      JSON.stringify(record),
      record.updated_at || record.request_date || nowIso(),
      record.is_synced ?? 1,
    ],
  },

  stock_returns: {
    sqliteTable: "stock_returns",
    supabaseTable: "stock_returns",
    snapshotKey: STORAGE_KEYS.STOCK_RETURNS,
    columns: [
      "id",
      "return_id",
      "facility_id",
      "source_inventory_id",
      "medicine_id",
      "medicine_name",
      "brand_name",
      "dosage",
      "unit_of_measure",
      "lot_no",
      "quantity",
      "unit_cost",
      "expiration_date",
      "reason",
      "status",
      "remarks",
      "submitted_by_id",
      "submitted_at",
      "confirmed_by_id",
      "confirmed_at",
      "created_at",
      "updated_at",
      "is_synced",
      "data_json",
    ],
    toRow: (record) => [
      record.id,
      record.return_id || record.id,
      record.facility_id ?? null,
      record.source_inventory_id || null,
      record.medicine_id ?? null,
      record.medicine_name ?? null,
      record.brand_name || null,
      record.dosage || null,
      record.unit_of_measure || null,
      record.lot_no ?? null,
      record.quantity ?? 0,
      record.unit_cost ?? null,
      record.expiration_date ?? null,
      record.reason ?? null,
      record.status || "PENDING",
      record.remarks || null,
      record.submitted_by_id ?? null,
      record.submitted_at ?? null,
      record.confirmed_by_id || null,
      record.confirmed_at || null,
      record.created_at || nowIso(),
      record.updated_at || nowIso(),
      record.is_synced ?? 1,
      JSON.stringify(record),
    ],
  },

  monthly_dispensing_summary: {
    sqliteTable: "monthly_dispensing_summary",
    supabaseTable: "monthly_dispensing_summary",
    snapshotKey: STORAGE_KEYS.DISPENSING_SUMMARY,
    primaryKey: null,
    columns: ["facility_id", "medicine_id", "month", "total_dispensed"],
    toRow: (record) => [
      record.facility_id,
      record.medicine_id,
      record.month,
      record.total_dispensed ?? 0,
    ],
  },

  other_programs: {
    sqliteTable: "other_programs",
    supabaseTable: "other_programs",
    snapshotKey: STORAGE_KEYS.OTHER_PROGRAMS,
    columns: ["id", "program_name", "program_date", "description", "data_json"],
    toRow: (record) => [
      record.id,
      record.program_name ?? null,
      record.program_date ?? null,
      record.description ?? null,
      JSON.stringify(record),
    ],
  },

  forecasting: {
    sqliteTable: "forecasting",
    supabaseTable: "forecasting",
    snapshotKey: STORAGE_KEYS.FORECASTING,
    columns: ["id", "facility_id", "forecast_month", "predicted_quantity", "data_json"],
    toRow: (record) => [
      record.id,
      record.facility_id ?? null,
      record.forecast_month ?? null,
      record.predicted_quantity ?? 0,
      JSON.stringify(record),
    ],
  },

  profiles: {
    sqliteTable: "profiles",
    supabaseTable: "profiles",
    snapshotKey: STORAGE_KEYS.USERS,
    columns: [
      "id",
      "first_name",
      "last_name",
      "email",
      "phone_number",
      "role",
      "facility_id",
      "status",
      "data_json",
    ],
    toRow: (record) => [
      record.id,
      record.first_name ?? null,
      record.last_name ?? null,
      record.email ?? null,
      record.phone_number ?? null,
      record.role ?? null,
      record.facility_id ?? null,
      record.status ?? "ACTIVE",
      JSON.stringify(record),
    ],
  },

  activity_logs: {
    sqliteTable: "activity_logs",
    supabaseTable: "activity_logs",
    snapshotKey: STORAGE_KEYS.ACTIVITY_LOGS,
    columns: ["id", "user_id", "action", "module", "details", "created_at", "data_json"],
    toRow: (record) => [
      record.id,
      record.user_id ?? null,
      record.action ?? null,
      record.module ?? null,
      record.details ?? null,
      record.created_at || nowIso(),
      JSON.stringify(record),
    ],
  },

  notifications: {
    sqliteTable: "notifications",
    supabaseTable: "notifications",
    snapshotKey: STORAGE_KEYS.NOTIFICATIONS,
    columns: ["id", "user_id", "title", "message", "is_read", "created_at", "data_json"],
    toRow: (record) => [
      record.id,
      record.user_id ?? null,
      record.title ?? null,
      record.message ?? null,
      record.is_read ? 1 : 0,
      record.created_at || nowIso(),
      JSON.stringify(record),
    ],
  },

  stock_deficit_audits: {
    sqliteTable: "stock_deficit_audits",
    supabaseTable: "stock_deficit_audits",
    snapshotKey: STORAGE_KEYS.DEFICIT_AUDITS,
    columns: [
      "id",
      "dispensing_id",
      "dispensing_transaction_id",
      "facility_id",
      "medicine_id",
      "inventory_batch_id",
      "batch_number",
      "dispensed_by",
      "dispensed_quantity",
      "available_at_sync",
      "deficit_quantity",
      "status",
      "reconciliation_action",
      "reconciled_by",
      "reconciled_at",
      "notes",
      "created_at",
      "data_json",
      "updated_at",
    ],
    toRow: (record) => [
      record.id,
      record.dispensing_id ?? null,
      record.dispensing_transaction_id ?? null,
      record.facility_id ?? null,
      record.medicine_id ?? null,
      record.inventory_batch_id ?? null,
      record.batch_number ?? null,
      record.dispensed_by ?? null,
      record.dispensed_quantity ?? 0,
      record.available_at_sync ?? 0,
      record.deficit_quantity ?? 0,
      record.status ?? "PENDING_RECONCILIATION",
      record.reconciliation_action ?? null,
      record.reconciled_by ?? null,
      record.reconciled_at ?? null,
      record.notes ?? null,
      record.created_at || nowIso(),
      JSON.stringify(record),
      record.updated_at || record.created_at || nowIso(),
    ],
  },
};

const TABLE_ALIASES = {
  medicine_dispensing: "dispensing_records",
  medicine_requests: "requests",
  users: "profiles",
  thresholds: "facility_medicine_thresholds",
};

/**
 * Resolves a table name (or alias such as `medicine_dispensing` / `medicine_requests`)
 * to its repository adapter definition. Returns null if unrecognized.
 */
export function getRepositoryAdapter(tableName) {
  if (!tableName || typeof tableName !== "string") return null;
  const normalized = tableName.trim().toLowerCase();
  const canonicalKey = TABLE_ALIASES[normalized] || normalized;
  return ADAPTER_DEFINITIONS[canonicalKey] || null;
}

/**
 * Hydrates a raw SQLite row into a domain record by parsing `data_json` when present.
 */
export function hydrateSqliteRow(row) {
  if (!row || typeof row !== "object") return row;
  if (typeof row.data_json === "string" && row.data_json.trim()) {
    try {
      const parsed = JSON.parse(row.data_json);
      if (parsed && typeof parsed === "object") {
        const { data_json: _ignored, ...restColumns } = row;
        return { ...parsed, ...restColumns, ...parsed };
      }
    } catch {
      // Fall through to raw row if JSON parsing fails
    }
  }
  return row;
}

/**
 * Executes a single-record INSERT OR REPLACE in SQLite using the table's repository adapter.
 */
export async function upsertSqliteRecord(db, tableName, record) {
  if (!db || !record || !record.id) return false;
  const adapter = getRepositoryAdapter(tableName);
  if (!adapter) return false;

  const placeholders = adapter.columns.map(() => "?").join(", ");
  const sql = `INSERT OR REPLACE INTO ${adapter.sqliteTable} (${adapter.columns.join(", ")}) VALUES (${placeholders})`;
  const values = adapter.toRow(record);
  await db.execute(sql, values);
  return true;
}

/**
 * Executes a chunked multi-row INSERT OR REPLACE in SQLite using the table's repository adapter.
 */
export async function batchUpsertSqliteRecords(db, tableName, records, chunkSize = 50) {
  if (!db || !Array.isArray(records) || records.length === 0) return false;
  const adapter = getRepositoryAdapter(tableName);
  if (!adapter) return false;

  const rows = records.map((record) => adapter.toRow(record));
  await batchInsertOrReplace(db, adapter.sqliteTable, adapter.columns, rows, chunkSize);
  return true;
}

/**
 * Optimistically inserts or merges a record into the L1 localStorage snapshot cache.
 */
export function upsertSnapshotRecord(tableName, record) {
  if (!record || !record.id) return false;
  const adapter = getRepositoryAdapter(tableName);
  if (!adapter?.snapshotKey) return false;

  try {
    const currentList = getSnapshot(adapter.snapshotKey, []);
    const idx = currentList.findIndex((item) => item?.id === record.id);
    let updatedList;
    if (idx >= 0) {
      updatedList = [...currentList];
      updatedList[idx] = { ...updatedList[idx], ...record };
    } else {
      updatedList = [record, ...currentList];
    }
    return saveSnapshot(adapter.snapshotKey, updatedList);
  } catch (err) {
    console.warn(`Snapshot update for ${adapter.snapshotKey} failed:`, err);
    return false;
  }
}

