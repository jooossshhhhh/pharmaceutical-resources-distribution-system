/**
 * Offline Mutation Outbox Queue
 * Dual-layer persistent queue (localStorage + SQLite) for offline operations.
 * Stores mutations locally while offline and pushes seamlessly to Supabase
 * as soon as network connectivity is detected.
 */

import { supabase } from "../client/supabase.js";
import { getSqliteDb, initSqliteSchema, isTauriEnvironment } from "../database/sqliteClient.js";
import { getCachedUserSession, getSnapshot, saveSnapshot, STORAGE_KEYS } from "../database/snapshotStore.js";
import { getMutationFailureStatus } from "../client/networkErrorUtils.js";
import { isCurrentNetworkOnline } from "./networkStatus.js";
import { restoreSupabaseSessionIfAvailable } from "../services/auth/authSessionRestore.js";

const OUTBOX_STORAGE_KEY = "prds_offline_outbox_queue";
const SUPPORTED_MUTATION_TYPES = new Set(["RPC", "INSERT", "UPDATE", "DELETE"]);
const RETIRED_TRANSFER_MUTATION_TARGETS = new Set([
  "stock_transfers",
  "stock_transfer_items",
  "stock_transfer_fulfillments",
  "get_stock_transfer_allocation_batches",
  "submit_bhw_stock_transfer_request",
  "create_cho_stock_transfer",
  "approve_stock_transfer",
  "allocate_stock_transfer_for_pickup",
  "reject_stock_transfer_request",
  "confirm_stock_transfer_received",
]);
const listeners = new Set();
const outboxListeners = new Set();
let cachedPendingCount = 0;

export const filterMutationsForUser = (mutations, userId) =>
  userId ? mutations.filter((item) => item.user_id === userId) : [];

export const isRetiredTransferMutation = (item) => {
  const target = String(item?.target || "").toLowerCase();
  return RETIRED_TRANSFER_MUTATION_TARGETS.has(target) || target.includes("stock_transfer");
};

export const isOrphanedNotificationMutation = (item) => {
  if (String(item?.target || "").toLowerCase() !== "notifications") return false;
  const msg = String(item?.error_message || "").toLowerCase();
  return (
    item.status === "FAILED" ||
    msg.includes("row-level security") ||
    msg.includes("violates row-level") ||
    msg.includes("permission")
  );
};

const mutationStatusPriority = { PENDING: 0, FAILED: 1, SYNCED: 2 };

export function mergeMutationQueues(...queues) {
  const byId = new Map();
  const missingIds = [];

  queues.flat().forEach((item) => {
    if (!item.id) {
      missingIds.push(item);
      return;
    }
    const current = byId.get(item.id);
    if (!current || (mutationStatusPriority[item.status] ?? 0) >= (mutationStatusPriority[current.status] ?? 0)) {
      byId.set(item.id, item);
    }
  });

  return [...byId.values(), ...missingIds].sort((first, second) =>
    (first.created_at || "").localeCompare(second.created_at || "")
  );
}

export const createOfflineInsertPayload = (payload) => ({
  ...payload,
  id: payload.id || globalThis.crypto.randomUUID(),
});

export function assertMutationAffectedRow(mutationType, payload, data, target) {
  if (["UPDATE", "DELETE"].includes(mutationType) && payload.id && !data?.length) {
    throw new Error(`Queued ${mutationType.toLowerCase()} found no ${target} row with id ${payload.id}.`);
  }
}

const getCachedOwnerId = () => getCachedUserSession().user?.id || null;

// Read memory queue initialized from localStorage
function readLocalStorageQueue() {
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalStorageQueue(queue) {
  try {
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn("Failed to write offline outbox queue to localStorage:", err);
  }
}

let memoryQueue = typeof window !== "undefined" ? readLocalStorageQueue() : [];

async function discardRetiredTransferMutations(userId, entries) {
  const retiredIds = new Set(
    entries
      .filter(isRetiredTransferMutation)
      .map((item) => item.id)
      .filter(Boolean)
  );
  if (retiredIds.size === 0) return false;

  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      for (const id of retiredIds) {
        if (userId) {
          await db.execute(
            "DELETE FROM offline_mutation_queue WHERE id = ? AND user_id = ?",
            [id, userId]
          );
        } else {
          await db.execute(
            "DELETE FROM offline_mutation_queue WHERE id = ?",
            [id]
          );
        }
      }
    } catch (err) {
      console.warn("Failed to discard retired transfer mutations from SQLite:", err);
    }
  }

  memoryQueue = readLocalStorageQueue().filter(
    (item) => !( (!userId || item.user_id === userId) && (retiredIds.has(item.id) || isRetiredTransferMutation(item)))
  );
  writeLocalStorageQueue(memoryQueue);
  return true;
}

async function discardOrphanedNotificationMutations(userId, entries) {
  const orphanedIds = new Set(
    entries
      .filter(isOrphanedNotificationMutation)
      .map((item) => item.id)
      .filter(Boolean)
  );
  if (orphanedIds.size === 0) return false;

  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      for (const id of orphanedIds) {
        if (userId) {
          await db.execute(
            "DELETE FROM offline_mutation_queue WHERE id = ? AND user_id = ?",
            [id, userId]
          );
        } else {
          await db.execute(
            "DELETE FROM offline_mutation_queue WHERE id = ?",
            [id]
          );
        }
      }
    } catch (err) {
      console.warn("Failed to discard orphaned notification mutations from SQLite:", err);
    }
  }

  memoryQueue = readLocalStorageQueue().filter(
    (item) => !( (!userId || item.user_id === userId) && (orphanedIds.has(item.id) || isOrphanedNotificationMutation(item)))
  );
  writeLocalStorageQueue(memoryQueue);
  return true;
}

async function getQueueEntries(userId) {
  if (!userId) return [];

  await initSqliteSchema();
  let sqliteRows = [];
  let sqliteReadSucceeded = false;
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      sqliteRows = await db.select(
        `SELECT * FROM offline_mutation_queue WHERE user_id = ? ORDER BY created_at ASC`,
        [userId]
      );
      sqliteReadSucceeded = true;
    } catch (err) {
      console.warn("Failed to read mutations from SQLite:", err);
    }
  }

  memoryQueue = readLocalStorageQueue();
  const localRows = filterMutationsForUser(memoryQueue, userId);

  // If SQLite read succeeded, backfill missing items and reconcile
  if (sqliteReadSucceeded) {
    const sqliteIds = new Set(sqliteRows.map((item) => item.id));

    if (isTauriEnvironment()) {
      const missingInSqlite = localRows.filter((item) => !sqliteIds.has(item.id));
      if (missingInSqlite.length > 0) {
        try {
          const db = await getSqliteDb();
          for (const item of missingInSqlite) {
            await db.execute(
              `INSERT OR REPLACE INTO offline_mutation_queue (id, user_id, facility_id, mutation_type, target, payload_json, status, retry_count, error_message, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                item.id,
                item.user_id,
                item.facility_id || null,
                item.mutation_type,
                item.target,
                typeof item.payload_json === "string" ? item.payload_json : JSON.stringify(item.payload_json),
                item.status || "PENDING",
                item.retry_count || 0,
                item.error_message || null,
                item.created_at || new Date().toISOString(),
              ]
            );
          }
        } catch (err) {
          console.warn("Failed to backfill missing user mutations to SQLite:", err);
        }
      }
    }

    const reconciledLocalQueue = memoryQueue.filter((item) =>
      item.user_id !== userId || item.status !== "SYNCED" || sqliteIds.has(item.id)
    );
    if (reconciledLocalQueue.length !== memoryQueue.length) {
      memoryQueue = reconciledLocalQueue;
      writeLocalStorageQueue(memoryQueue);
    }
  }

  const mergedQueue = filterMutationsForUser(mergeMutationQueues(sqliteRows, localRows), userId);
  await discardRetiredTransferMutations(userId, mergedQueue);
  await discardOrphanedNotificationMutations(userId, mergedQueue);
  return mergedQueue.filter((item) => !isRetiredTransferMutation(item) && !isOrphanedNotificationMutation(item));
}

export async function getAllQueueEntries() {
  await initSqliteSchema();
  let sqliteRows = [];
  let sqliteReadSucceeded = false;
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      sqliteRows = await db.select(
        `SELECT * FROM offline_mutation_queue ORDER BY created_at ASC`
      );
      sqliteReadSucceeded = true;
    } catch (err) {
      console.warn("Failed to read all mutations from SQLite:", err);
    }
  }

  memoryQueue = readLocalStorageQueue();

  if (sqliteReadSucceeded) {
    const sqliteIds = new Set(sqliteRows.map((item) => item.id));

    if (isTauriEnvironment()) {
      const missingInSqlite = memoryQueue.filter((item) => item.id && !sqliteIds.has(item.id));
      if (missingInSqlite.length > 0) {
        try {
          const db = await getSqliteDb();
          for (const item of missingInSqlite) {
            await db.execute(
              `INSERT OR REPLACE INTO offline_mutation_queue (id, user_id, facility_id, mutation_type, target, payload_json, status, retry_count, error_message, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                item.id,
                item.user_id,
                item.facility_id || null,
                item.mutation_type,
                item.target,
                typeof item.payload_json === "string" ? item.payload_json : JSON.stringify(item.payload_json),
                item.status || "PENDING",
                item.retry_count || 0,
                item.error_message || null,
                item.created_at || new Date().toISOString(),
              ]
            );
          }
        } catch (err) {
          console.warn("Failed to backfill missing global mutations to SQLite:", err);
        }
      }
    }

    const reconciledLocalQueue = memoryQueue.filter((item) =>
      item.status !== "SYNCED" || sqliteIds.has(item.id)
    );
    if (reconciledLocalQueue.length !== memoryQueue.length) {
      memoryQueue = reconciledLocalQueue;
      writeLocalStorageQueue(memoryQueue);
    }
  }

  const mergedQueue = mergeMutationQueues(sqliteRows, memoryQueue);
  await discardRetiredTransferMutations(null, mergedQueue);
  await discardOrphanedNotificationMutations(null, mergedQueue);
  return mergedQueue.filter((item) => !isRetiredTransferMutation(item) && !isOrphanedNotificationMutation(item));
}

export async function getAllPendingMutations() {
  return (await getAllQueueEntries()).filter((item) => item.status === "PENDING");
}

function notifyQueueChange() {
  listeners.forEach((listener) => listener(cachedPendingCount));
  outboxListeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.warn("Outbox queue listener error:", e);
    }
  });
}

export async function enqueueMutation({
  userId = null,
  facilityId = null,
  mutationType, // 'RPC' | 'INSERT' | 'UPDATE' | 'DELETE'
  target,       // function name or table name
  payload,      // parameters or row data
}) {
  if (!mutationType || !target) {
    throw new Error("mutationType and target are required");
  }

  if (!SUPPORTED_MUTATION_TYPES.has(mutationType)) {
    throw new Error(`Unsupported mutation type: ${mutationType}`);
  }

  const activeUserId = getCachedOwnerId();
  if (!activeUserId || (userId && userId !== activeUserId)) {
    throw new Error("An active signed-in user is required to queue this change.");
  }
  userId = activeUserId;

  await initSqliteSchema();
  const id = "mut_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  const payloadJson = JSON.stringify(payload);

  const newEntry = {
    id,
    user_id: userId,
    facility_id: facilityId,
    mutation_type: mutationType,
    target,
    payload_json: payloadJson,
    status: "PENDING",
    retry_count: 0,
    created_at: new Date().toISOString(),
  };

  // 1. Always persist to localStorage for instant web/webview durability
  memoryQueue = readLocalStorageQueue();
  memoryQueue.push(newEntry);
  writeLocalStorageQueue(memoryQueue);

  // 2. Also persist to SQLite if running in desktop environment
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      await db.execute(
        `INSERT INTO offline_mutation_queue (id, user_id, facility_id, mutation_type, target, payload_json, status, retry_count)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0)`,
        [id, userId, facilityId, mutationType, target, payloadJson]
      );
    } catch (err) {
      console.warn("Failed to write mutation to SQLite:", err);
    }
  }

  await refreshPendingCount();
  return id;
}

export async function getPendingMutations(userId = getCachedOwnerId()) {
  if (!userId) return [];
  return (await getQueueEntries(userId)).filter((item) => item.status === "PENDING");
}

export async function markMutationSynced(id) {
  let sqliteDeleted = !isTauriEnvironment();
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      await db.execute(
        `DELETE FROM offline_mutation_queue WHERE id = ?`,
        [id]
      );
      sqliteDeleted = true;
    } catch (err) {
      console.warn("Failed to delete synced mutation from SQLite:", err);
    }
  }

  memoryQueue = readLocalStorageQueue();
  if (sqliteDeleted) {
    memoryQueue = memoryQueue.filter((item) => item.id !== id);
  } else {
    const item = memoryQueue.find((entry) => entry.id === id);
    if (item) {
      item.status = "SYNCED";
    } else {
      memoryQueue.push({ id, user_id: getCachedOwnerId(), status: "SYNCED" });
    }
  }
  writeLocalStorageQueue(memoryQueue);

  await refreshPendingCount();
}

export async function markMutationFailed(id, errorMessage, status = "FAILED") {
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      await db.execute(
        `UPDATE offline_mutation_queue
         SET status = ?, retry_count = retry_count + 1, error_message = ?
         WHERE id = ?`,
        [status, errorMessage, id]
      );
    } catch (err) {
      console.warn("Failed to update failed mutation in SQLite:", err);
    }
  }

  memoryQueue = readLocalStorageQueue();
  const item = memoryQueue.find((entry) => entry.id === id);
  if (item) {
    item.status = status;
    item.retry_count = (item.retry_count || 0) + 1;
    item.error_message = errorMessage;
    writeLocalStorageQueue(memoryQueue);
  } else if (status === "FAILED") {
    memoryQueue.push({ id, user_id: getCachedOwnerId(), status, error_message: errorMessage });
    writeLocalStorageQueue(memoryQueue);
  }

  await refreshPendingCount();
}

export async function refreshPendingCount() {
  const userId = getCachedOwnerId();
  if (!userId) {
    cachedPendingCount = 0;
    notifyQueueChange();
    return cachedPendingCount;
  }

  cachedPendingCount = (await getQueueEntries(userId)).filter((item) => item.status === "PENDING").length;
  notifyQueueChange();
  return cachedPendingCount;
}

export async function getFailedMutationCount() {
  const userId = getCachedOwnerId();
  if (!userId) return 0;
  return (await getQueueEntries(userId)).filter((item) => item.status === "FAILED").length;
}

export async function retryFailedMutations(userId = getCachedOwnerId()) {
  if (!userId) return 0;

  const failed = (await getQueueEntries(userId)).filter((item) => item.status === "FAILED");
  if (failed.length === 0) return 0;

  if (isTauriEnvironment()) {
    const db = await getSqliteDb();
    for (const item of failed) {
      await db.execute(
        "UPDATE offline_mutation_queue SET status = 'PENDING', error_message = NULL WHERE id = ? AND user_id = ? AND status = 'FAILED'",
        [item.id, userId]
      );
    }
  }

  const failedIds = new Set(failed.map((item) => item.id));
  memoryQueue = readLocalStorageQueue().map((item) =>
    item.user_id === userId && failedIds.has(item.id)
      ? { ...item, status: "PENDING", error_message: null }
      : item
  );
  writeLocalStorageQueue(memoryQueue);
  await refreshPendingCount();
  return failed.length;
}

export function subscribeQueueCount(callback) {
  listeners.add(callback);
  callback(cachedPendingCount);

  return () => {
    listeners.delete(callback);
  };
}

export function subscribeOutboxQueue(callback) {
  outboxListeners.add(callback);
  return () => {
    outboxListeners.delete(callback);
  };
}

export async function getOutboxEntries(userId = getCachedOwnerId()) {
  if (!userId) return [];
  const entries = await getQueueEntries(userId);
  return entries
    .filter((item) => item.status === "PENDING" || item.status === "FAILED")
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

export async function retryMutation(id, userId = getCachedOwnerId()) {
  if (!userId || !id) return false;

  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      await db.execute(
        "UPDATE offline_mutation_queue SET status = 'PENDING', error_message = NULL WHERE id = ? AND user_id = ?",
        [id, userId]
      );
    } catch (err) {
      console.warn("Failed to retry mutation in SQLite:", err);
    }
  }

  memoryQueue = readLocalStorageQueue().map((item) =>
    item.user_id === userId && item.id === id
      ? { ...item, status: "PENDING", error_message: null }
      : item
  );
  writeLocalStorageQueue(memoryQueue);
  await refreshPendingCount();
  return true;
}

export async function dismissMutation(id, userId = getCachedOwnerId()) {
  if (!userId || !id) return false;

  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      await db.execute(
        "DELETE FROM offline_mutation_queue WHERE id = ? AND user_id = ?",
        [id, userId]
      );
    } catch (err) {
      console.warn("Failed to delete mutation in SQLite:", err);
    }
  }

  memoryQueue = readLocalStorageQueue().filter(
    (item) => !(item.user_id === userId && item.id === id)
  );
  writeLocalStorageQueue(memoryQueue);
  await refreshPendingCount();
  return true;
}

export async function reconcileOfflineProgramId(oldId, newId) {
  if (!oldId || !newId || oldId === newId) return;

  // 1. Update in-memory / localStorage outbox queue
  memoryQueue = readLocalStorageQueue().map((entry) => {
    if (
      entry.target === "complete_other_program" ||
      entry.target === "cancel_other_program" ||
      entry.target === "save_other_program"
    ) {
      try {
        const p = typeof entry.payload_json === "string" ? JSON.parse(entry.payload_json) : entry.payload_json;
        if (p?.p_program_id === oldId) {
          p.p_program_id = newId;
          return { ...entry, payload_json: JSON.stringify(p) };
        }
      } catch {}
    }
    return entry;
  });
  writeLocalStorageQueue(memoryQueue);

  // 2. Update local SQLite in Tauri desktop environment
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      const existingRows = await db.select(
        "SELECT id, data_json FROM other_programs WHERE id = ?",
        [oldId]
      );
      if (existingRows?.length > 0) {
        let updatedDataJson = existingRows[0].data_json;
        try {
          const parsed = JSON.parse(updatedDataJson);
          parsed.id = newId;
          parsed.is_offline_pending = false;
          updatedDataJson = JSON.stringify(parsed);
        } catch {}
        await db.execute(
          "UPDATE other_programs SET id = ?, data_json = ? WHERE id = ?",
          [newId, updatedDataJson, oldId]
        );
      } else {
        await db.execute(
          "UPDATE other_programs SET id = ? WHERE id = ?",
          [newId, oldId]
        );
      }

      const queueRows = await db.select(
        "SELECT id, payload_json FROM offline_mutation_queue WHERE target IN ('complete_other_program', 'cancel_other_program', 'save_other_program')"
      );
      for (const row of queueRows || []) {
        try {
          const p = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json;
          if (p?.p_program_id === oldId) {
            p.p_program_id = newId;
            await db.execute(
              "UPDATE offline_mutation_queue SET payload_json = ? WHERE id = ?",
              [JSON.stringify(p), row.id]
            );
          }
        } catch {}
      }
    } catch (e) {
      console.warn("Failed to reconcile offline program ID in SQLite:", e);
    }
  }

  // 3. Update snapshot store
  try {
    const cachedPrograms = getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []);
    const updatedPrograms = cachedPrograms.map((p) =>
      p.id === oldId ? { ...p, id: newId, is_offline_pending: false } : p
    );
    saveSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, updatedPrograms);
  } catch (e) {
    console.warn("Failed to reconcile offline program ID in snapshot store:", e);
  }
}

export async function processOutboxQueue() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  let session = data?.session;
  if (!session?.user?.id && isCurrentNetworkOnline()) {
    try {
      session = await restoreSupabaseSessionIfAvailable();
    } catch (e) {
      console.warn("Outbox queue session restore warning:", e);
    }
  }

  const userId = session?.user?.id;
  if (!userId) return;

  // Option 1: Only process mutations for the active signed-in user (or unassigned items).
  // This guarantees that all RPCs and mutations are executed using the author's credentials,
  // preventing permission rejections and audit log corruption on shared devices
  // (e.g. BHW session rejecting CHO Pharmacist actions).
  const allPending = await getAllPendingMutations();
  const pending = allPending.filter((item) => !item.user_id || item.user_id === userId);
  if (!pending || pending.length === 0) {
    return;
  }

  for (const item of pending) {
    try {
      const payload = typeof item.payload_json === "string" ? JSON.parse(item.payload_json) : item.payload_json;
      let res;
      if (item.mutation_type === "RPC") {
        res = await supabase.rpc(item.target, payload);

        // Fallback for offline-created programs whose client-generated UUID was not found on server
        if (
          res?.error &&
          item.target === "save_other_program" &&
          (res.error.code === "P0002" || String(res.error.message || "").toLowerCase().includes("not found")) &&
          payload?.p_program_id
        ) {
          const insertPayload = { ...payload, p_program_id: null };
          const insertRes = await supabase.rpc(item.target, insertPayload);
          if (!insertRes.error) {
            res = insertRes;
            const newServerId = typeof res.data === "string" ? res.data : res.data?.program_id;
            if (newServerId && payload.p_program_id) {
              await reconcileOfflineProgramId(payload.p_program_id, newServerId);
            }
          }
        }
      } else if (item.mutation_type === "INSERT") {
        res = await supabase.from(item.target).insert(payload);
      } else if (item.mutation_type === "UPDATE") {
        if (payload.id && payload.values) {
          res = await supabase.from(item.target).update(payload.values).eq("id", payload.id).select("id");
        } else if (payload.id) {
          const { id, ...values } = payload;
          res = await supabase.from(item.target).update(values).eq("id", id).select("id");
        } else {
          res = await supabase.from(item.target).update(payload);
        }
      } else if (item.mutation_type === "DELETE") {
        res = await supabase.from(item.target).delete().eq("id", payload.id || payload).select("id");
      } else {
        throw new Error(`Unsupported mutation type: ${item.mutation_type}`);
      }

      if (res?.error) {
        if (item.mutation_type === "INSERT" && (res.error.code === "23505" || String(res.error.message || "").toLowerCase().includes("duplicate key"))) {
          await markMutationSynced(item.id);
          continue;
        }
        if (item.target === "notifications" && (res.error.code === "42501" || String(res.error.message || "").toLowerCase().includes("row-level security") || String(res.error.message || "").toLowerCase().includes("permission"))) {
          console.warn(`Notifications insert skipped due to RLS permissions for user ${userId}, auto-dismissing.`);
          await dismissMutation(item.id, item.user_id || userId);
          continue;
        }
        throw res.error;
      }
      assertMutationAffectedRow(item.mutation_type, payload, res?.data, item.target);
      await markMutationSynced(item.id);
    } catch (err) {
      if (item.mutation_type === "INSERT" && (err?.code === "23505" || String(err?.message || "").toLowerCase().includes("duplicate key"))) {
        await markMutationSynced(item.id);
        continue;
      }
      if (item.target === "notifications" && (err?.code === "42501" || String(err?.message || "").toLowerCase().includes("row-level security") || String(err?.message || "").toLowerCase().includes("permission"))) {
        console.warn(`Notifications insert skipped due to RLS permissions, auto-dismissing.`);
        await dismissMutation(item.id, item.user_id || userId);
        continue;
      }
      console.warn(`Outbox replay failed for mutation ${item.id}:`, err);
      const failureStatus = getMutationFailureStatus(err);
      await markMutationFailed(item.id, err?.message || String(err), failureStatus);
      if (failureStatus === "PENDING") {
        break;
      }
    }
  }
}
