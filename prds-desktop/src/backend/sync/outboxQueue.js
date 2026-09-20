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

  await initSqliteSchema();

  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      const rows = await db.select(
        `SELECT * FROM offline_mutation_queue
         WHERE status = 'PENDING' AND user_id = $1
         ORDER BY created_at ASC`,
        [userId]
      );
      if (rows && rows.length > 0) {
        return rows;
      }
    } catch (err) {
      console.warn("Failed to read mutations from SQLite, falling back to localStorage:", err);
    }
  }

  memoryQueue = readLocalStorageQueue();
  return filterMutationsForUser(
    memoryQueue.filter((item) => item.status === "PENDING"),
    userId
  );
}

export async function markMutationSynced(id) {
  // Remove from SQLite
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      await db.execute(
        `DELETE FROM offline_mutation_queue WHERE id = $1`,
        [id]
      );
    } catch (err) {
      console.warn("Failed to delete synced mutation from SQLite:", err);
    }
  }

  // Remove from localStorage
  memoryQueue = readLocalStorageQueue().filter((item) => item.id !== id);
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

  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      const result = await db.select(
        `SELECT COUNT(*) as count FROM offline_mutation_queue WHERE status = 'PENDING' AND user_id = $1`,
        [userId]
      );
      const count = result[0]?.count || 0;
      if (count > 0) {
        cachedPendingCount = count;
        notifyQueueChange();
        return cachedPendingCount;
      }
    } catch (err) {
      console.warn("Failed to count SQLite pending mutations:", err);
    }
  }

  memoryQueue = readLocalStorageQueue();
  cachedPendingCount = filterMutationsForUser(
    memoryQueue.filter((item) => item.status === "PENDING"),
    userId
  ).length;
  notifyQueueChange();
  return cachedPendingCount;
}

export async function getFailedMutationCount() {
  const userId = getCachedOwnerId();
  if (!userId) return 0;

  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      const result = await db.select(
        `SELECT COUNT(*) as count FROM offline_mutation_queue WHERE status = 'FAILED' AND user_id = $1`,
        [userId]
      );
      const count = result[0]?.count || 0;
      if (count > 0) {
        return count;
      }
    } catch (err) {
      console.warn("Failed to count SQLite failed mutations:", err);
    }
  }

  return filterMutationsForUser(
    readLocalStorageQueue().filter((item) => item.status === "FAILED"),
    userId
  ).length;
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
          res = await supabase.from(item.target).update(payload.values).eq("id", payload.id);
        } else if (payload.id) {
          const { id, ...values } = payload;
          res = await supabase.from(item.target).update(values).eq("id", id);
        } else {
          res = await supabase.from(item.target).update(payload);
        }
      } else if (item.mutation_type === "DELETE") {
        res = await supabase.from(item.target).delete().eq("id", payload.id || payload);
      } else {
        throw new Error(`Unsupported mutation type: ${item.mutation_type}`);
      }

      if (res?.error) {
        throw res.error;
      }
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
