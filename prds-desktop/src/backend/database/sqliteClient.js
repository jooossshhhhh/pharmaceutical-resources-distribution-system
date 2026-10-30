/**
 * PRDS Desktop Native SQLite Client
 * Connects to local persistent SQLite database `prds.db` via Tauri's @tauri-apps/plugin-sql.
 * Falls back gracefully to browser memory/localStorage when running in Vite preview mode outside Tauri.
 */

let dbInstance = null;
let isInitialized = false;
let initializationPromise = null;
const SNAPSHOT_CACHE_VERSION = "per-session-cache-2026-10-17-operational-reset";

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
      dosage TEXT,
      unit_of_measure TEXT,
      categories_json TEXT,
      data_json TEXT,
      updated_at DATETIME
    );`,

    `DROP TABLE IF EXISTS suppliers;`,

    `CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      facility_id TEXT,
      medicine_id TEXT,
      quantity INTEGER DEFAULT 0,
      batch_number TEXT,
      po_number TEXT,
      unit_cost REAL,
      date_received TEXT,
      expiration_date TEXT,
      origin_facility_id TEXT,
      intake_type TEXT DEFAULT 'PROCUREMENT',
      return_reason TEXT,
      status TEXT DEFAULT 'ACTIVE',
      brand_name TEXT,
      supplier_name TEXT,
      supplier_address TEXT,
      supplier_contact TEXT,
      disposed_at DATETIME,
      disposal_method TEXT,
      disposed_by TEXT,
      data_json TEXT,
      updated_at DATETIME
    );`,

    `CREATE TABLE IF NOT EXISTS facility_medicine_thresholds (
      id TEXT PRIMARY KEY,
      facility_id TEXT,
      medicine_id TEXT,
      threshold INTEGER DEFAULT 0,
      is_custom INTEGER DEFAULT 0,
      updated_at DATETIME,
      UNIQUE(facility_id, medicine_id)
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

    `CREATE TABLE IF NOT EXISTS stock_returns (
      id TEXT PRIMARY KEY,
      return_id TEXT UNIQUE,
      facility_id TEXT,
      source_inventory_id TEXT,
      medicine_id TEXT,
      medicine_name TEXT,
      brand_name TEXT,
      dosage TEXT,
      unit_of_measure TEXT,
      lot_no TEXT,
      quantity INTEGER,
      unit_cost REAL,
      expiration_date TEXT,
      reason TEXT,
      status TEXT DEFAULT 'PENDING',
      remarks TEXT,
      submitted_by_id TEXT,
      submitted_at DATETIME,
      confirmed_by_id TEXT,
      confirmed_at DATETIME,
      created_at DATETIME,
      updated_at DATETIME,
      is_synced INTEGER DEFAULT 1,
      data_json TEXT
    );`,

    `CREATE TABLE IF NOT EXISTS monthly_dispensing_summary (
      facility_id TEXT,
      medicine_id TEXT,
      month TEXT,
      total_dispensed INTEGER,
      PRIMARY KEY (facility_id, medicine_id, month)
    );`,

    `CREATE TABLE IF NOT EXISTS other_programs (
      id TEXT PRIMARY KEY,
      program_name TEXT,
      program_date TEXT,
      description TEXT,
      data_json TEXT,
      updated_at DATETIME
    );`,

    `CREATE TABLE IF NOT EXISTS forecasting (
      id TEXT PRIMARY KEY,
      facility_id TEXT,
      forecast_month TEXT,
      predicted_quantity REAL,
      data_json TEXT,
      updated_at DATETIME
    );`,

    `CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT,
      module TEXT,
      details TEXT,
      created_at DATETIME,
      data_json TEXT
    );`,

    `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT,
      message TEXT,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME,
      data_json TEXT
    );`,

    `CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone_number TEXT,
      role TEXT,
      facility_id TEXT,
      status TEXT,
      data_json TEXT,
      updated_at DATETIME
    );`,

    `CREATE TABLE IF NOT EXISTS stock_deficit_audits (
      id TEXT PRIMARY KEY,
      dispensing_id TEXT,
      dispensing_transaction_id TEXT,
      facility_id TEXT,
      medicine_id TEXT,
      inventory_batch_id TEXT,
      batch_number TEXT,
      dispensed_by TEXT,
      dispensed_quantity INTEGER,
      available_at_sync INTEGER,
      deficit_quantity INTEGER,
      status TEXT DEFAULT 'PENDING_RECONCILIATION',
      reconciliation_action TEXT,
      reconciled_by TEXT,
      reconciled_at TEXT,
      notes TEXT,
      created_at TEXT,
      data_json TEXT,
      updated_at DATETIME
    );`,

    // Indices for ultra-fast local lookups
    `CREATE INDEX IF NOT EXISTS idx_inventory_facility ON inventory(facility_id);`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_medicine ON inventory(medicine_id);`,
    `CREATE INDEX IF NOT EXISTS idx_patients_facility ON patients(facility_id);`,
    `CREATE INDEX IF NOT EXISTS idx_dispensing_facility ON dispensing_records(facility_id);`,
    `CREATE INDEX IF NOT EXISTS idx_dispensing_patient ON dispensing_records(patient_id);`,
    `CREATE INDEX IF NOT EXISTS idx_requests_facility ON requests(facility_id);`,
    `CREATE INDEX IF NOT EXISTS idx_transfers_source ON transfers(source_facility_id);`,
    `CREATE INDEX IF NOT EXISTS idx_transfers_target ON transfers(target_facility_id);`,
    `CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_stock_deficit_facility ON stock_deficit_audits(facility_id);`,
    `CREATE INDEX IF NOT EXISTS idx_stock_deficit_status ON stock_deficit_audits(status);`,
  ];

  for (const query of queries) {
    await db.execute(query);
  }

  const stockReturnColumns = await db.select("PRAGMA table_info(stock_returns)");
  const stockReturnColumnNames = new Set(stockReturnColumns.map((column) => column.name));
  const ensureStockReturnColumn = async (name, definition) => {
    if (!stockReturnColumnNames.has(name)) {
      await db.execute(`ALTER TABLE stock_returns ADD COLUMN ${name} ${definition}`);
      stockReturnColumnNames.add(name);
    }
  };
  await ensureStockReturnColumn("return_id", "TEXT");
  await ensureStockReturnColumn("lot_no", "TEXT");
  await ensureStockReturnColumn("medicine_id", "TEXT");
  await ensureStockReturnColumn("medicine_name", "TEXT");
  await ensureStockReturnColumn("brand_name", "TEXT");
  await ensureStockReturnColumn("dosage", "TEXT");
  await ensureStockReturnColumn("unit_of_measure", "TEXT");
  await ensureStockReturnColumn("quantity", "INTEGER");
  await ensureStockReturnColumn("unit_cost", "REAL");
  await ensureStockReturnColumn("expiration_date", "TEXT");
  await ensureStockReturnColumn("reason", "TEXT");
  await ensureStockReturnColumn("facility_id", "TEXT");
  await ensureStockReturnColumn("source_inventory_id", "TEXT");
  await ensureStockReturnColumn("status", "TEXT");
  await ensureStockReturnColumn("remarks", "TEXT");
  await ensureStockReturnColumn("submitted_by_id", "TEXT");
  await ensureStockReturnColumn("submitted_at", "DATETIME");
  await ensureStockReturnColumn("confirmed_by_id", "TEXT");
  await ensureStockReturnColumn("confirmed_at", "DATETIME");

  // Create stock_returns indices after columns are guaranteed to exist
  await db.execute("CREATE INDEX IF NOT EXISTS idx_stock_returns_facility ON stock_returns(facility_id);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_stock_returns_medicine ON stock_returns(medicine_id);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_stock_returns_lot ON stock_returns(lot_no);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_stock_returns_status ON stock_returns(status);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_stock_returns_date ON stock_returns(submitted_at);");

  // Automatic backfill: populate finalized stock_returns rows from legacy inventory return rows
  try {
    const existingReturns = await db.select(
      "SELECT id, facility_id, medicine_id, quantity, batch_number, po_number, unit_cost, date_received, expiration_date, origin_facility_id, return_reason, updated_at FROM inventory WHERE intake_type = 'RETURN' OR (po_number LIKE 'RET-%' AND origin_facility_id IS NOT NULL)"
    );
    if (Array.isArray(existingReturns) && existingReturns.length > 0) {
      for (const ret of existingReturns) {
        const returnId = `ret_${ret.id}`;
        await db.execute(
          `INSERT OR IGNORE INTO stock_returns (
            id, return_id, lot_no, medicine_id, quantity, unit_cost, expiration_date, reason, facility_id, status, submitted_at, created_at, updated_at, is_synced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, 1)`,
          [
            returnId,
            ret.po_number || `RET-${ret.id.slice(0, 8)}`,
            ret.batch_number,
            ret.medicine_id,
            ret.quantity,
            ret.unit_cost || null,
            ret.expiration_date,
            ret.return_reason || "PROGRAM_ENDED",
            ret.origin_facility_id || ret.facility_id,
            ret.updated_at || new Date().toISOString(),
            ret.updated_at || new Date().toISOString(),
            ret.updated_at || new Date().toISOString()
          ]
        );
      }
    }
  } catch (backfillErr) {
    console.warn("[sqliteClient] Stock returns backfill skipped:", backfillErr);
  }

  const metadataColumns = await db.select("PRAGMA table_info(sync_metadata)");
  const colNames = new Set(metadataColumns.map((c) => c.name));
  if (!colNames.has("last_synced_at")) {
    await db.execute("ALTER TABLE sync_metadata ADD COLUMN last_synced_at TEXT");
  }
  if (!colNames.has("records_synced")) {
    await db.execute("ALTER TABLE sync_metadata ADD COLUMN records_synced INTEGER DEFAULT 0");
  }
  if (!colNames.has("sync_status")) {
    await db.execute("ALTER TABLE sync_metadata ADD COLUMN sync_status TEXT DEFAULT 'SUCCESS'");
  }

  const medicineColumns = await db.select("PRAGMA table_info(medicines)");
  if (!medicineColumns.some((column) => column.name === "categories_json")) {
    await db.execute("ALTER TABLE medicines ADD COLUMN categories_json TEXT");
  }

  const inventoryColumns = await db.select("PRAGMA table_info(inventory)");
  if (!inventoryColumns.some((column) => column.name === "po_number")) {
    await db.execute("ALTER TABLE inventory ADD COLUMN po_number TEXT");
  }
  if (!inventoryColumns.some((column) => column.name === "unit_cost")) {
    await db.execute("ALTER TABLE inventory ADD COLUMN unit_cost REAL");
  }
  if (!inventoryColumns.some((column) => column.name === "origin_facility_id")) {
    await db.execute("ALTER TABLE inventory ADD COLUMN origin_facility_id TEXT");
  }
  if (!inventoryColumns.some((column) => column.name === "intake_type")) {
    await db.execute("ALTER TABLE inventory ADD COLUMN intake_type TEXT DEFAULT 'PROCUREMENT'");
  }
  if (!inventoryColumns.some((column) => column.name === "return_reason")) {
    await db.execute("ALTER TABLE inventory ADD COLUMN return_reason TEXT");
  }
  if (!inventoryColumns.some((column) => column.name === "status")) {
    await db.execute("ALTER TABLE inventory ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
  }
  if (!inventoryColumns.some((column) => column.name === "disposed_at")) {
    await db.execute("ALTER TABLE inventory ADD COLUMN disposed_at DATETIME");
  }
  if (!inventoryColumns.some((column) => column.name === "disposal_method")) {
    await db.execute("ALTER TABLE inventory ADD COLUMN disposal_method TEXT");
  }
  if (!inventoryColumns.some((column) => column.name === "disposed_by")) {
    await db.execute("ALTER TABLE inventory ADD COLUMN disposed_by TEXT");
  }
  if (!inventoryColumns.some((column) => column.name === "brand_name")) {
    await db.execute("ALTER TABLE inventory ADD COLUMN brand_name TEXT");
  }
  if (!inventoryColumns.some((column) => column.name === "supplier_name")) {
    await db.execute("ALTER TABLE inventory ADD COLUMN supplier_name TEXT");
  }
  if (!inventoryColumns.some((column) => column.name === "supplier_address")) {
    await db.execute("ALTER TABLE inventory ADD COLUMN supplier_address TEXT");
  }
  if (!inventoryColumns.some((column) => column.name === "supplier_contact")) {
    await db.execute("ALTER TABLE inventory ADD COLUMN supplier_contact TEXT");
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
    try {
      await db.execute("DROP TABLE IF EXISTS suppliers");
    } catch (_e) {}
    for (const table of [
      "facilities",
      "medicines",
      "inventory",
      "patients",
      "dispensing_records",
      "requests",
      "transfers",
      "stock_returns",
      "monthly_dispensing_summary",
      "other_programs",
      "forecasting",
      "activity_logs",
      "notifications",
      "profiles",
    ]) {
      try {
        await db.execute(`DELETE FROM ${table}`);
      } catch (_e) {}
    }
    await db.execute(
      "INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES ('snapshot_cache_version', $1, CURRENT_TIMESTAMP)",
      [SNAPSHOT_CACHE_VERSION]
    );
  }

  // Rehydrate terminal passcodes into localStorage if present in SQLite
  try {
    const passcodeRows = await db.select(
      "SELECT value FROM sync_metadata WHERE key LIKE 'passcode_%'"
    );
    if (passcodeRows && passcodeRows.length > 0) {
      const rawLocal = localStorage.getItem("prds_terminal_passcodes");
      let localAccounts = [];
      try {
        localAccounts = rawLocal ? JSON.parse(rawLocal) : [];
      } catch {}
      const accountMap = new Map();
      for (const acc of Array.isArray(localAccounts) ? localAccounts : []) {
        if (acc.userId) accountMap.set(acc.userId, acc);
      }
      for (const row of passcodeRows) {
        try {
          const acc = JSON.parse(row.value);
          if (acc?.userId && !accountMap.has(acc.userId)) {
            accountMap.set(acc.userId, acc);
          }
        } catch {}
      }
      localStorage.setItem(
        "prds_terminal_passcodes",
        JSON.stringify(Array.from(accountMap.values()))
      );
    }
  } catch (rehydrateErr) {
    console.warn("SQLite passcode rehydration error:", rehydrateErr);
  }
}


/**
 * Flush SQLite WAL log frames into the main database file.
 */
export async function checkpointSqliteDb() {
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      await db.execute("PRAGMA wal_checkpoint(TRUNCATE)");
      return true;
    } catch (err) {
      console.warn("SQLite checkpoint failed:", err);
      return false;
    }
  }
  return false;
}

/**
 * Compact and defragment the SQLite database file on disk.
 */
export async function vacuumSqliteDb() {
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      await db.execute("VACUUM");
      return true;
    } catch (err) {
      console.warn("SQLite VACUUM failed:", err);
      return false;
    }
  }
  return false;
}

/**
 * Execute batched multi-row INSERT OR REPLACE statements within SQLite parameter limits.
 * Avoids single-row disk journal thrashing and provides atomic statement execution without
 * manual transaction pool lock conflicts.
 */
export async function batchInsertOrReplace(db, tableName, columns, rows, chunkSize = 50) {
  if (!db || !tableName || !Array.isArray(columns) || columns.length === 0) return;
  if (!Array.isArray(rows) || rows.length === 0) return;

  const colList = columns.join(", ");
  const colCount = columns.length;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const placeholders = chunk
      .map(() => `(${new Array(colCount).fill("?").join(", ")})`)
      .join(", ");
    const sql = `INSERT OR REPLACE INTO ${tableName} (${colList}) VALUES ${placeholders}`;
    const bindValues = chunk.flat();
    await db.execute(sql, bindValues);
  }
}

/**
 * Deletes rows in chunks by primary key to prevent parameter limit overflows.
 */
export async function batchDeleteByIds(db, tableName, ids, chunkSize = 100) {
  if (!db || !tableName || !Array.isArray(ids) || ids.length === 0) return;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(", ");
    await db.execute(`DELETE FROM ${tableName} WHERE id IN (${placeholders})`, chunk);
  }
}

/**
 * Retrieves the last synchronization timestamp for a specific dataset.
 */
export async function getDatasetSyncWatermark(datasetName) {
  if (!datasetName) return null;
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      const rows = await db.select(
        "SELECT last_synced_at FROM sync_metadata WHERE key = $1",
        [`watermark_${datasetName}`]
      );
      return rows[0]?.last_synced_at || null;
    } catch (err) {
      console.warn(`Failed to get sync watermark for ${datasetName}:`, err);
    }
  }
  try {
    return localStorage.getItem(`prds_watermark_${datasetName}`) || null;
  } catch {
    return null;
  }
}

/**
 * Stores the synchronization watermark timestamp for a specific dataset.
 */
export async function setDatasetSyncWatermark(datasetName, lastSyncedAt, recordsSynced = 0, status = "SUCCESS") {
  if (!datasetName || !lastSyncedAt) return;
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      await db.execute(
        `INSERT OR REPLACE INTO sync_metadata (key, value, last_synced_at, records_synced, sync_status, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [`watermark_${datasetName}`, lastSyncedAt, lastSyncedAt, recordsSynced, status]
      );
    } catch (err) {
      console.warn(`Failed to set sync watermark for ${datasetName}:`, err);
    }
  }
  try {
    localStorage.setItem(`prds_watermark_${datasetName}`, lastSyncedAt);
  } catch {}
}

/**
 * Clears the synchronization watermark for a specific dataset.
 */
export async function clearDatasetSyncWatermark(datasetName) {
  if (!datasetName) return;
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      await db.execute("DELETE FROM sync_metadata WHERE key = $1", [`watermark_${datasetName}`]);
    } catch (err) {
      console.warn(`Failed to clear sync watermark for ${datasetName} in SQLite:`, err);
    }
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(`prds_watermark_${datasetName}`);
    }
  } catch {}
}

/**
 * Clears all dataset synchronization watermarks to trigger a full initial replication.
 */
export async function clearAllSyncWatermarks() {
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      await db.execute("DELETE FROM sync_metadata WHERE key LIKE 'watermark_%'");
    } catch (err) {
      console.warn("Failed to clear sync watermarks in SQLite:", err);
    }
  }
  try {
    if (typeof localStorage !== "undefined") {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith("prds_watermark_")) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch {}
}


