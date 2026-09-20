/**
 * Offline Mutation Outbox Queue
 * Dual-layer persistent queue (localStorage + SQLite) for offline operations.
 * Stores mutations locally while offline and pushes seamlessly to Supabase
 * as soon as network connectivity is detected.
 */

import { getSqliteDb, initSqliteSchema, isTauriEnvironment } from "../database/sqliteClient.js";
import { getCachedUserSession } from "../database/snapshotStore.js";
import { getMutationFailureStatus } from "../client/networkErrorUtils.js";

const OUTBOX_STORAGE_KEY = "prds_offline_outbox_queue";
const SUPPORTED_MUTATION_TYPES = new Set(["RPC", "INSERT", "UPDATE", "DELETE"]);
const listeners = new Set();
let cachedPendingCount = 0;

export const filterMutationsForUser = (mutations, userId) =>
  userId ? mutations.filter((item) => item.user_id === userId) : [];

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

async function getQueueEntries(userId) {
  if (!userId) return [];

  await initSqliteSchema();
  let sqliteRows = [];
  let sqliteReadSucceeded = false;
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      sqliteRows = await db.select(
        `SELECT * FROM offline_mutation_queue WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId]
      );
      sqliteReadSucceeded = true;
    } catch (err) {
      console.warn("Failed to read mutations from SQLite:", err);
    }
  }

  memoryQueue = readLocalStorageQueue();
  const localRows = filterMutationsForUser(memoryQueue, userId);
  if (sqliteReadSucceeded) {
    const sqliteIds = new Set(sqliteRows.map((item) => item.id));
    const reconciledLocalQueue = memoryQueue.filter((item) =>
      item.user_id !== userId || item.status !== "SYNCED" || sqliteIds.has(item.id)
    );
    if (reconciledLocalQueue.length !== memoryQueue.length) {
      memoryQueue = reconciledLocalQueue;
      writeLocalStorageQueue(memoryQueue);
    }
  }

  return filterMutationsForUser(mergeMutationQueues(sqliteRows, localRows), userId);
}

function notifyQueueChange() {
  listeners.forEach((listener) => listener(cachedPendingCount));
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
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 0)`,
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
        `DELETE FROM offline_mutation_queue WHERE id = $1`,
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
         SET status = $3, retry_count = retry_count + 1, error_message = $2
         WHERE id = $1`,
        [id, errorMessage, status]
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
        "UPDATE offline_mutation_queue SET status = 'PENDING', error_message = NULL WHERE id = $1 AND user_id = $2 AND status = 'FAILED'",
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

export async function processOutboxQueue() {
  const { supabase } = await import("../client/supabase");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const userId = data.session?.user?.id;
  if (!userId) return;

  const pending = await getPendingMutations(userId);
  if (!pending || pending.length === 0) {
    return;
  }

  for (const item of pending) {
    try {
      const payload = typeof item.payload_json === "string" ? JSON.parse(item.payload_json) : item.payload_json;
      let res;
      if (item.mutation_type === "RPC") {
        res = await supabase.rpc(item.target, payload);
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
        throw res.error;
      }
      assertMutationAffectedRow(item.mutation_type, payload, res?.data, item.target);
      await markMutationSynced(item.id);
    } catch (err) {
      console.warn(`Outbox replay failed for mutation ${item.id}:`, err);
      const failureStatus = getMutationFailureStatus(err);
      await markMutationFailed(item.id, err?.message || String(err), failureStatus);
      if (failureStatus === "PENDING") {
        break;
      }
    }
  }
}
