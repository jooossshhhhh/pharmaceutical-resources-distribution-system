/**
 * PRDS Bidirectional Sync Engine
 * Orchestrates:
 * 1. Push Phase: Replays offline mutations from SQLite to Supabase in FIFO order.
 * 2. Pull Phase: Downloads latest snapshot from Supabase into local SQLite.
 */

import { supabase } from "../client/supabase";
import { isCurrentNetworkOnline, subscribeNetworkStatus } from "./networkStatus";
import {
  getPendingMutations,
  markMutationFailed,
  markMutationSynced,
  refreshPendingCount,
} from "./outboxQueue";
import { getSqliteDb, initSqliteSchema, isTauriEnvironment } from "../database/sqliteClient";

export const SyncStatus = {
  IDLE: "IDLE",
  SYNCING: "SYNCING",
  ERROR: "ERROR",
};

let currentSyncStatus = SyncStatus.IDLE;
let syncErrorMessage = "";
const syncListeners = new Set();

function notifySyncState() {
  syncListeners.forEach((listener) =>
    listener({ status: currentSyncStatus, error: syncErrorMessage })
  );
}

export function subscribeSyncState(callback) {
  syncListeners.add(callback);
  callback({ status: currentSyncStatus, error: syncErrorMessage });

  return () => {
    syncListeners.delete(callback);
  };
}

/**
 * Executes a single queued mutation against Supabase
 */
async function executeMutation(mutation) {
  const payload = JSON.parse(mutation.payload_json);

  if (mutation.mutation_type === "RPC") {
    const { data, error } = await supabase.rpc(mutation.target, payload);
    if (error) {
      throw error;
    }
    return data;
  }

  if (mutation.mutation_type === "INSERT") {
    const { data, error } = await supabase.from(mutation.target).insert(payload);
    if (error) {
      throw error;
    }
    return data;
  }

  if (mutation.mutation_type === "UPDATE") {
    const { id, ...updates } = payload;
    const { data, error } = await supabase.from(mutation.target).update(updates).eq("id", id);
    if (error) {
      throw error;
    }
    return data;
  }

  throw new Error(`Unknown mutation type: ${mutation.mutation_type}`);
}

/**
 * Push Phase: Replays all pending mutations to Supabase in FIFO order
 */
export async function pushPendingMutations() {
  if (!isCurrentNetworkOnline()) {
    return { pushedCount: 0, failedCount: 0 };
  }

  const pending = await getPendingMutations();
  let pushedCount = 0;
  let failedCount = 0;

  for (const mutation of pending) {
    try {
      await executeMutation(mutation);
      await markMutationSynced(mutation.id);
      pushedCount++;
    } catch (err) {
      console.error(`Failed to replay mutation ${mutation.id}:`, err);
      await markMutationFailed(mutation.id, err.message || "Execution error");
      failedCount++;
      // Break on error to preserve strict sequential order
      break;
    }
  }

  return { pushedCount, failedCount };
}

/**
 * Pull Phase: Pulls core snapshot from Supabase into local SQLite
 */
export async function pullSnapshotFromSupabase() {
  if (!isCurrentNetworkOnline()) {
    return;
  }

  await initSqliteSchema();
  const db = await getSqliteDb();

  try {
    // 1. Facilities
    const { data: facilities } = await supabase
      .from("facilities")
      .select("id, facility_name, facility_code, facility_type, status, updated_at")
      .eq("status", "ACTIVE");

    if (facilities && isTauriEnvironment()) {
      for (const f of facilities) {
        await db.execute(
          `INSERT INTO facilities (id, facility_name, facility_code, facility_type, status, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT(id) DO UPDATE SET
             facility_name=excluded.facility_name,
             facility_code=excluded.facility_code,
             facility_type=excluded.facility_type,
             status=excluded.status,
             updated_at=excluded.updated_at`,
          [f.id, f.facility_name, f.facility_code, f.facility_type, f.status, f.updated_at]
        );
      }
    }

    // 2. Medicines Catalog
    const { data: medicines, error: medicinesError } = await supabase
      .from("medicines")
      .select("id, generic_name, brand_name, dosage, unit_of_measure, unit_cost, categories");

    if (medicinesError) {
      throw medicinesError;
    }

    if (Array.isArray(medicines) && isTauriEnvironment()) {
      await db.execute("DELETE FROM medicines");
      for (const m of medicines) {
        await db.execute(
          `INSERT INTO medicines (id, generic_name, brand_name, dosage, unit_of_measure, unit_cost, categories_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT(id) DO UPDATE SET
             generic_name=excluded.generic_name,
             brand_name=excluded.brand_name,
             dosage=excluded.dosage,
             unit_of_measure=excluded.unit_of_measure,
             unit_cost=excluded.unit_cost,
             categories_json=excluded.categories_json`,
          [
            m.id,
            m.generic_name,
            m.brand_name,
            m.dosage,
            m.unit_of_measure,
            m.unit_cost,
            JSON.stringify(m.categories || []),
          ]
        );
      }
    }

    // 3. Suppliers
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, supplier_name, status, updated_at")
      .eq("status", "ACTIVE");

    if (suppliers && isTauriEnvironment()) {
      for (const s of suppliers) {
        await db.execute(
          `INSERT INTO suppliers (id, supplier_name, status, updated_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT(id) DO UPDATE SET
             supplier_name=excluded.supplier_name,
             status=excluded.status,
             updated_at=excluded.updated_at`,
          [s.id, s.supplier_name, s.status, s.updated_at]
        );
      }
    }

    // 4. Inventory
    const { data: inventory, error: inventoryError } = await supabase
      .from("inventory")
      .select("id, facility_id, medicine_id, supplier_id, quantity, threshold, batch_number, date_received, expiration_date, updated_at");

    if (inventoryError) {
      throw inventoryError;
    }

    if (Array.isArray(inventory) && isTauriEnvironment()) {
      await db.execute("DELETE FROM inventory");
      for (const item of inventory) {
        await db.execute(
          `INSERT INTO inventory (id, facility_id, medicine_id, supplier_id, quantity, threshold, batch_number, date_received, expiration_date, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT(id) DO UPDATE SET
             quantity=excluded.quantity,
             threshold=excluded.threshold,
             batch_number=excluded.batch_number,
             date_received=excluded.date_received,
             expiration_date=excluded.expiration_date,
             updated_at=excluded.updated_at`,
          [
            item.id,
            item.facility_id,
            item.medicine_id,
            item.supplier_id,
            item.quantity,
            item.threshold,
            item.batch_number,
            item.date_received,
            item.expiration_date,
            item.updated_at,
          ]
        );
      }
    }

    // Record snapshot timestamp
    if (isTauriEnvironment()) {
      await db.execute(
        `INSERT INTO sync_metadata (key, value, updated_at)
         VALUES ('last_snapshot_time', $1, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        [new Date().toISOString()]
      );
    }
  } catch (err) {
    console.error("Error pulling snapshot from Supabase:", err);
  }
}

/**
 * Triggers full bidirectional sync cycle (Push mutations then Pull latest snapshot)
 */
export async function triggerSync() {
  if (!isCurrentNetworkOnline()) {
    currentSyncStatus = SyncStatus.IDLE;
    notifySyncState();
    return;
  }

  currentSyncStatus = SyncStatus.SYNCING;
  syncErrorMessage = "";
  notifySyncState();

  try {
    // 1. Push pending offline changes first
    await pushPendingMutations();

    // 2. Pull down fresh snapshot
    await pullSnapshotFromSupabase();

    currentSyncStatus = SyncStatus.IDLE;
  } catch (err) {
    console.error("Sync error:", err);
    currentSyncStatus = SyncStatus.ERROR;
    syncErrorMessage = err.message || "Failed to sync";
  } finally {
    await refreshPendingCount();
    notifySyncState();
  }
}

// Auto-trigger sync on reconnection
if (typeof window !== "undefined") {
  subscribeNetworkStatus((isOnline) => {
    if (isOnline) {
      triggerSync();
    }
  });
}
