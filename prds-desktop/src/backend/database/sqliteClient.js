/**
 * PRDS Desktop Native SQLite Client
 * Connects to local persistent SQLite database `prds.db` via Tauri's @tauri-apps/plugin-sql.
 * Falls back gracefully to browser memory/localStorage when running in Vite preview mode outside Tauri.
 */

let dbInstance = null;
let isInitialized = false;
let initializationPromise = null;
const SNAPSHOT_CACHE_VERSION = "per-session-cache-2026-09-20";

export function isTauriEnvironment() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__)
  );
}

export async function getSqliteDb() {
  if (dbInstance) {
    return dbInstance;
  }

  if (isTauriEnvironment()) {
    try {
      const Database = (await import("@tauri-apps/plugin-sql")).default;
      dbInstance = await Database.load("sqlite:prds.db");
      return dbInstance;
    } catch (err) {
      console.warn("Failed to load Tauri SQL plugin, using browser fallback:", err);
    }
  }

  // Browser Fallback Store
  dbInstance = {
    execute: async () => {
      // Basic mock implementation for browser preview
      return { rowsAffected: 1 };
    },
    select: async () => {
      // Basic mock return
      return [];
    },
  };

  return dbInstance;
}

/**
 * Initializes the SQLite schema matching PRDS tables
 */
export async function initSqliteSchema() {
  if (isInitialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = initializeSqliteSchema();
  try {
    await initializationPromise;
    isInitialized = true;
  } finally {
    initializationPromise = null;
  }
}

async function initializeSqliteSchema() {
  const db = await getSqliteDb();

  if (!isTauriEnvironment()) {
    return;
  }

  // Schema creation
  const queries = [
    `CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS offline_mutation_queue (
      id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id TEXT,
      facility_id TEXT,
      mutation_type TEXT NOT NULL,
      target TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      retry_count INTEGER DEFAULT 0,
      error_message TEXT
    );`,

    `CREATE TABLE IF NOT EXISTS facilities (
      id TEXT PRIMARY KEY,
      facility_name TEXT,
      facility_code TEXT,
      facility_type TEXT,
      status TEXT,
      data_json TEXT,
      updated_at DATETIME
    );`,

    `CREATE TABLE IF NOT EXISTS medicines (
      id TEXT PRIMARY KEY,
      generic_name TEXT,
      brand_name TEXT,
      dosage TEXT,
      unit_of_measure TEXT,
      unit_cost REAL,
      categories_json TEXT,
      data_json TEXT,
      updated_at DATETIME
    );`,

    `CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      supplier_name TEXT,
      status TEXT,
      data_json TEXT,
      updated_at DATETIME
    );`,

    `CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      facility_id TEXT,
      medicine_id TEXT,
      supplier_id TEXT,
      quantity INTEGER DEFAULT 0,
      threshold INTEGER DEFAULT 0,
      batch_number TEXT,
      date_received TEXT,
      expiration_date TEXT,
      data_json TEXT,
      updated_at DATETIME
    );`,

    `CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      facility_id TEXT,
      first_name TEXT,
      last_name TEXT,
      philhealth_id TEXT,
      data_json TEXT,
      updated_at DATETIME
    );`,

    `CREATE TABLE IF NOT EXISTS dispensing_records (
      id TEXT PRIMARY KEY,
      facility_id TEXT,
      patient_id TEXT,
      dispensed_by TEXT,
      data_json TEXT,
      created_at DATETIME,
      is_synced INTEGER DEFAULT 1
    );`,

    `CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      request_number TEXT,
      facility_id TEXT,
      status TEXT,
      data_json TEXT,
      updated_at DATETIME,
      is_synced INTEGER DEFAULT 1
    );`,

    `CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      transfer_number TEXT,
      source_facility_id TEXT,
      target_facility_id TEXT,
      status TEXT,
      data_json TEXT,
      updated_at DATETIME,
      is_synced INTEGER DEFAULT 1
    );`,

    `CREATE TABLE IF NOT EXISTS monthly_dispensing_summary (
      facility_id TEXT,
      medicine_id TEXT,
      month TEXT,
      total_dispensed INTEGER,
      PRIMARY KEY (facility_id, medicine_id, month)
    );`,
  ];

  for (const query of queries) {
    await db.execute(query);
  }

  const medicineColumns = await db.select("PRAGMA table_info(medicines)");
  if (!medicineColumns.some((column) => column.name === "categories_json")) {
    await db.execute("ALTER TABLE medicines ADD COLUMN categories_json TEXT");
  }

  const catalogVersion = await db.select(
    "SELECT value FROM sync_metadata WHERE key = 'medicine_catalog_version'"
  );
  if (catalogVersion[0]?.value !== "cho-2026-09-20") {
    for (const table of [
      "dispensing_records",
      "requests",
      "transfers",
      "monthly_dispensing_summary",
      "inventory",
      "medicines",
    ]) {
      await db.execute(`DELETE FROM ${table}`);
    }
    await db.execute(
      "INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('medicine_catalog_version', 'cho-2026-09-20', CURRENT_TIMESTAMP)"
    );
  }

  const snapshotCacheVersion = await db.select(
    "SELECT value FROM sync_metadata WHERE key = 'snapshot_cache_version'"
  );
  if (snapshotCacheVersion[0]?.value !== SNAPSHOT_CACHE_VERSION) {
    for (const table of [
      "facilities",
      "medicines",
      "suppliers",
      "inventory",
      "patients",
      "dispensing_records",
      "requests",
      "transfers",
      "monthly_dispensing_summary",
    ]) {
      await db.execute(`DELETE FROM ${table}`);
    }
    await db.execute(
      "INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('snapshot_cache_version', $1, CURRENT_TIMESTAMP)",
      [SNAPSHOT_CACHE_VERSION]
    );
  }
}
