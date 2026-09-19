/**
 * PRDS Local Snapshot Store
 * Caches user session, profiles, and data snapshots locally in SQLite and localStorage.
 * Ensures instant startup, persistent offline sessions, and full offline operations.
 */

import { getSqliteDb, isTauriEnvironment } from "./sqliteClient.js";

const STORAGE_KEYS = {
  USER_SESSION: "prds_desktop_user_session",
  USER_PROFILE: "prds_desktop_user_profile",
  DASHBOARD: "prds_snapshot_dashboard",
  INVENTORY: "prds_snapshot_inventory",
  FACILITIES: "prds_snapshot_facilities",
  MEDICINES: "prds_snapshot_medicines",
  SUPPLIERS: "prds_snapshot_suppliers",
  PATIENTS: "prds_snapshot_patients",
  DISPENSING: "prds_snapshot_dispensing",
  REQUESTS: "prds_snapshot_requests",
  TRANSFERS: "prds_snapshot_transfers",
  DISPENSING_SUMMARY: "prds_snapshot_dispensing_summary",
  FORECASTING: "prds_snapshot_forecasting",
  ACTIVITY_LOGS: "prds_snapshot_activity_logs",
  NOTIFICATIONS: "prds_snapshot_notifications",
  USERS: "prds_snapshot_users",
  LAST_SYNC_TIME: "prds_last_sync_timestamp",
};

const MEDICINE_CATALOG_VERSION_KEY = "prds_medicine_catalog_version";
const MEDICINE_CATALOG_VERSION = "cho-2026-09-20";

function invalidateRetiredMedicineSnapshots() {
  if (
    typeof localStorage === "undefined" ||
    localStorage.getItem(MEDICINE_CATALOG_VERSION_KEY) === MEDICINE_CATALOG_VERSION
  ) {
    return;
  }

  [
    STORAGE_KEYS.DASHBOARD,
    STORAGE_KEYS.INVENTORY,
    STORAGE_KEYS.MEDICINES,
    STORAGE_KEYS.DISPENSING,
    STORAGE_KEYS.REQUESTS,
    STORAGE_KEYS.TRANSFERS,
    STORAGE_KEYS.DISPENSING_SUMMARY,
    STORAGE_KEYS.FORECASTING,
    STORAGE_KEYS.ACTIVITY_LOGS,
    STORAGE_KEYS.NOTIFICATIONS,
    STORAGE_KEYS.LAST_SYNC_TIME,
  ].forEach((key) => localStorage.removeItem(key));

  localStorage.setItem(MEDICINE_CATALOG_VERSION_KEY, MEDICINE_CATALOG_VERSION);
}

invalidateRetiredMedicineSnapshots();

// --- Session & Profile Persistence ---

export function saveUserSession(supabaseUser, profile) {
  try {
    if (supabaseUser) {
      localStorage.setItem(STORAGE_KEYS.USER_SESSION, JSON.stringify(supabaseUser));
    }
    if (profile) {
      localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
    }

    // Also persist to SQLite if running in Tauri
    if (isTauriEnvironment()) {
      getSqliteDb()
        .then(async (db) => {
          if (supabaseUser) {
            await db.execute(
              "INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)",
              ["cached_user", JSON.stringify(supabaseUser)]
            );
          }
          if (profile) {
            await db.execute(
              "INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)",
              ["cached_profile", JSON.stringify(profile)]
            );
          }
        })
        .catch((err) => console.warn("SQLite session backup error:", err));
    }
  } catch (err) {
    console.warn("Failed to persist user session locally:", err);
  }
}

/**
 * Scan for Supabase session stored in localStorage (e.g. sb-<ref>-auth-token)
 */
function findSupabaseStoredAuth() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.user) {
            return parsed.user;
          }
        }
      }
    }
  } catch {
    // Ignore storage parse issues
  }
  return null;
}

export function getCachedUserSession() {
  try {
    let rawUser = localStorage.getItem(STORAGE_KEYS.USER_SESSION);
    let rawProfile = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);

    let user = rawUser ? JSON.parse(rawUser) : null;
    let profile = rawProfile ? JSON.parse(rawProfile) : null;

    // Fallback: recover user from Supabase's internal auth token storage if missing
    if (!user) {
      const recoveredUser = findSupabaseStoredAuth();
      if (recoveredUser) {
        user = recoveredUser;
        localStorage.setItem(STORAGE_KEYS.USER_SESSION, JSON.stringify(user));
      }
    }

    if (!user || profile?.id !== user.id) {
      profile = null;
    }

    return { user, profile };
  } catch (err) {
    console.warn("Failed to read cached user session:", err);
    return { user: null, profile: null };
  }
}

export function clearUserSession() {
  try {
    localStorage.removeItem(STORAGE_KEYS.USER_SESSION);
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);

    // Also clear Supabase auth token keys from localStorage
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    // Clear from SQLite
    if (isTauriEnvironment()) {
      getSqliteDb()
        .then(async (db) => {
          await db.execute("DELETE FROM sync_metadata WHERE key IN ('cached_user', 'cached_profile')");
        })
        .catch((err) => console.warn("SQLite session clear error:", err));
    }
  } catch (err) {
    console.warn("Failed to clear cached user session:", err);
  }
}

// --- Data Snapshot Persistence ---

export function saveSnapshot(key, data) {
  try {
    if (data !== undefined && data !== null) {
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch (err) {
    console.warn(`Failed to save snapshot for ${key}:`, err);
  }
}

export function getSnapshot(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`Failed to read snapshot for ${key}:`, err);
    return fallback;
  }
}

export { STORAGE_KEYS };
