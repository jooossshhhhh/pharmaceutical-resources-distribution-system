/**
 * PRDS Local Snapshot Store
 * Caches user session, profiles, and data snapshots locally in SQLite and localStorage.
 * Ensures instant startup, persistent offline sessions, and full offline operations.
 */

import { getSqliteDb, initSqliteSchema, isTauriEnvironment } from "./sqliteClient.js";
import { compileDashboardSnapshot } from "../../shared/utils/dashboardUtils.js";

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
  OTHER_PROGRAMS: "prds_snapshot_other_programs",
  DEFICIT_AUDITS: "prds_snapshot_deficit_audits",
  LAST_SYNC_TIME: "prds_last_sync_timestamp",
  TERMINAL_PASSCODES: "prds_terminal_passcodes",
  LAST_LOGIN_AT: "prds_desktop_last_login_at",
};

const MEDICINE_CATALOG_VERSION_KEY = "prds_medicine_catalog_version";
const MEDICINE_CATALOG_VERSION = "cho-2026-09-20";
const SNAPSHOT_LIFECYCLE_VERSION_KEY = "prds_snapshot_lifecycle_version";
const SNAPSHOT_LIFECYCLE_VERSION = "per-session-cache-2026-09-20";
let snapshotRevision = 0;

export const getSnapshotRevision = () => snapshotRevision;

export function recordLoginTimestamp(timestamp = new Date().toISOString(), userId = "") {
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_LOGIN_AT, timestamp);
    if (userId) {
      localStorage.setItem(`${STORAGE_KEYS.LAST_LOGIN_AT}_${userId}`, timestamp);
    }
    if (isTauriEnvironment()) {
      getSqliteDb()
        .then((db) =>
          db.execute(
            "INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)",
            [userId ? `last_login_at_${userId}` : "last_login_at", timestamp]
          )
        )
        .catch(() => {});
    }
  } catch {}
}

export function getLastLoginTimestamp(userId = "") {
  try {
    if (userId) {
      const userSpecific = localStorage.getItem(`${STORAGE_KEYS.LAST_LOGIN_AT}_${userId}`);
      if (userSpecific) return userSpecific;
    }
    return localStorage.getItem(STORAGE_KEYS.LAST_LOGIN_AT) || null;
  } catch {
    return null;
  }
}

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

function invalidateLegacySharedSnapshots() {
  if (
    typeof localStorage === "undefined" ||
    localStorage.getItem(SNAPSHOT_LIFECYCLE_VERSION_KEY) === SNAPSHOT_LIFECYCLE_VERSION
  ) {
    return;
  }

  Object.values(STORAGE_KEYS)
    .filter(
      (key) =>
        key !== STORAGE_KEYS.USER_SESSION &&
        key !== STORAGE_KEYS.USER_PROFILE &&
        key !== STORAGE_KEYS.TERMINAL_PASSCODES
    )
    .forEach((key) => localStorage.removeItem(key));
  localStorage.setItem(SNAPSHOT_LIFECYCLE_VERSION_KEY, SNAPSHOT_LIFECYCLE_VERSION);
}

invalidateLegacySharedSnapshots();

// --- Session & Profile Persistence ---

export function saveUserSession(supabaseUser, profile) {
  try {
    if (supabaseUser) {
      const userLoginTime = getLastLoginTimestamp(supabaseUser.id);
      if (userLoginTime) {
        supabaseUser.last_sign_in_at = userLoginTime;
      }
      localStorage.setItem(STORAGE_KEYS.USER_SESSION, JSON.stringify(supabaseUser));
    }
    if (profile) {
      localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
    }

    const passcodeHash =
      supabaseUser?.user_metadata?.passcode_hash || profile?.passcode_hash;
    if (supabaseUser?.id && passcodeHash) {
      saveTerminalPasscodeAccount({
        user: supabaseUser,
        profile,
        passcodeHash,
      });
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

export async function clearUserSession() {
  snapshotRevision += 1;
  try {
    Object.values(STORAGE_KEYS)
      .filter((key) => key !== STORAGE_KEYS.TERMINAL_PASSCODES)
      .forEach((key) => localStorage.removeItem(key));

    // Clear active Supabase auth token keys from localStorage
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

  } catch (err) {
    console.warn("Failed to clear cached user session:", err);
  }

  if (isTauriEnvironment()) {
    try {
      await initSqliteSchema();
      const db = await getSqliteDb();
      // Only clear user credentials from metadata, preserving offline mirrored data
      await db.execute("DELETE FROM sync_metadata WHERE key IN ('cached_user', 'cached_profile')");
    } catch (err) {
      console.warn("SQLite user snapshot clear error:", err);
    }
  }
}

/**
 * Re-populates localStorage cache from SQLite database tables upon offline session restore.
 */
export async function restoreSnapshotsFromSqlite(facilityId = null, role = null) {
  if (!isTauriEnvironment()) return false;
  try {
    await initSqliteSchema();
    const db = await getSqliteDb();

    const tableMapping = [
      { table: "facilities", key: STORAGE_KEYS.FACILITIES },
      { table: "medicines", key: STORAGE_KEYS.MEDICINES },
      { table: "suppliers", key: STORAGE_KEYS.SUPPLIERS },
      { table: "inventory", key: STORAGE_KEYS.INVENTORY },
      { table: "patients", key: STORAGE_KEYS.PATIENTS },
      { table: "dispensing_records", key: STORAGE_KEYS.DISPENSING },
      { table: "requests", key: STORAGE_KEYS.REQUESTS },
      { table: "transfers", key: STORAGE_KEYS.TRANSFERS },
      { table: "other_programs", key: STORAGE_KEYS.OTHER_PROGRAMS },
      { table: "forecasting", key: STORAGE_KEYS.FORECASTING },
      { table: "profiles", key: STORAGE_KEYS.USERS },
      { table: "activity_logs", key: STORAGE_KEYS.ACTIVITY_LOGS },
      { table: "notifications", key: STORAGE_KEYS.NOTIFICATIONS },
      { table: "stock_deficit_audits", key: STORAGE_KEYS.DEFICIT_AUDITS },
    ];

    const cachedData = {};
    for (const { table, key } of tableMapping) {
      try {
        const rows = await db.select(`SELECT data_json FROM ${table}`);
        if (rows && rows.length > 0) {
          const parsed = rows.map((r) => (r.data_json ? JSON.parse(r.data_json) : null)).filter(Boolean);
          if (parsed.length > 0) {
            localStorage.setItem(key, JSON.stringify(parsed));
            cachedData[table] = parsed;
          }
        }
      } catch (tableErr) {
        console.warn(`Failed to restore ${table} from SQLite:`, tableErr);
      }
    }

    if (cachedData.inventory?.length || cachedData.facilities?.length) {
      const dashboard = compileDashboardSnapshot({
        inventory: cachedData.inventory || [],
        facilities: cachedData.facilities || [],
        patients: cachedData.patients || [],
        requests: cachedData.requests || [],
        dispensing: cachedData.dispensing_records || [],
        forecasting: cachedData.forecasting || [],
        users: cachedData.profiles || [],
        facilityId,
        role,
      });
      localStorage.setItem(STORAGE_KEYS.DASHBOARD, JSON.stringify(dashboard));
    }

    return true;
  } catch (err) {
    console.warn("restoreSnapshotsFromSqlite error:", err);
    return false;
  }
}

// --- Terminal Passcode Registry ---

export function getTerminalPasscodeAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TERMINAL_PASSCODES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Failed to read terminal passcodes registry:", err);
    return [];
  }
}

export function saveTerminalPasscodeAccount({ user, profile, passcodeHash, session = null }) {
  if (!user?.id || !passcodeHash) return;

  try {
    const accounts = getTerminalPasscodeAccounts();

    // Gather all candidate emails across user, profile, metadata, and OAuth identities
    const candidateEmails = [
      user.email,
      profile?.email,
      user.user_metadata?.email,
      ...(user.identities?.map((id) => id?.identity_data?.email) || []),
    ]
      .filter(Boolean)
      .map((e) => String(e).trim().toLowerCase());

    const userPhone = user.phone || profile?.phone_number || "";
    const userPhoneDigits = userPhone.replace(/\D/g, "");
    const userPhoneSuffix = userPhoneDigits.length >= 10 ? userPhoneDigits.slice(-10) : "";

    const existingAccount = accounts.find(
      (acc) =>
        acc.userId === user.id ||
        (candidateEmails.length > 0 &&
          (candidateEmails.includes((acc.email || "").toLowerCase()) ||
            acc.emails?.some((e) => candidateEmails.includes(e.toLowerCase())))) ||
        (userPhoneSuffix && acc.phoneNumber && acc.phoneNumber.replace(/\D/g, "").slice(-10) === userPhoneSuffix)
    );

    const mergedProfile = profile || existingAccount?.profile || null;
    const mergedSession = session
      ? {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
        }
      : existingAccount?.session || null;

    const allEmails = Array.from(
      new Set([
        ...candidateEmails,
        ...(existingAccount?.emails || []),
        existingAccount?.email,
      ].filter(Boolean).map((e) => e.trim().toLowerCase()))
    );

    const primaryEmail = allEmails[0] || (user.email || profile?.email || "").toLowerCase();

    const fullName =
      mergedProfile?.full_name ||
      [mergedProfile?.first_name, mergedProfile?.last_name].filter(Boolean).join(" ") ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      existingAccount?.fullName ||
      "";

    const facilityName =
      mergedProfile?.facility_name ||
      mergedProfile?.facility?.facility_name ||
      existingAccount?.facilityName ||
      "";

    const role = mergedProfile?.role || existingAccount?.role || "";

    const updatedAccount = {
      userId: user.id,
      email: primaryEmail,
      emails: allEmails,
      phoneNumber: userPhone || existingAccount?.phoneNumber || "",
      fullName,
      facilityName,
      role,
      passcodeHash,
      user,
      profile: mergedProfile,
      session: mergedSession,
      updatedAt: new Date().toISOString(),
    };

    const filtered = accounts.filter(
      (acc) =>
        acc.userId !== user.id &&
        (!primaryEmail || acc.email?.toLowerCase() !== primaryEmail) &&
        (!userPhoneSuffix || !acc.phoneNumber || acc.phoneNumber.replace(/\D/g, "").slice(-10) !== userPhoneSuffix)
    );

    filtered.push(updatedAccount);
    localStorage.setItem(STORAGE_KEYS.TERMINAL_PASSCODES, JSON.stringify(filtered));

    if (isTauriEnvironment()) {
      getSqliteDb()
        .then(async (db) => {
          await db.execute(
            "INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)",
            [`passcode_${user.id}`, JSON.stringify(updatedAccount)]
          );
        })
        .catch((err) => console.warn("SQLite terminal passcode save error:", err));
    }
  } catch (err) {
    console.warn("Failed to save terminal passcode account:", err);
  }
}

export function getTerminalPasscodeAccount(identifier) {
  if (!identifier) return null;
  const clean = identifier.trim().toLowerCase();
  const cleanDigits = clean.replace(/\D/g, "");
  const cleanSuffix = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : "";
  const accounts = getTerminalPasscodeAccounts();

  return (
    accounts.find((acc) => {
      if (acc.userId && acc.userId.toLowerCase() === clean) return true;
      if (acc.email && acc.email.toLowerCase() === clean) return true;
      if (Array.isArray(acc.emails) && acc.emails.some((e) => e.toLowerCase() === clean)) return true;
      if (acc.profile?.email && acc.profile.email.toLowerCase() === clean) return true;
      if (acc.user?.email && acc.user.email.toLowerCase() === clean) return true;
      if (acc.user?.user_metadata?.email && acc.user.user_metadata.email.toLowerCase() === clean) return true;
      if (acc.phoneNumber) {
        const normAccountPhone = acc.phoneNumber.replace(/\D/g, "");
        if (cleanDigits && normAccountPhone) {
          if (normAccountPhone === cleanDigits) return true;
          const accountSuffix = normAccountPhone.length >= 10 ? normAccountPhone.slice(-10) : "";
          if (cleanSuffix && accountSuffix && cleanSuffix === accountSuffix) {
            return true;
          }
        }
      }
      return false;
    }) || null
  );
}

export function removeTerminalPasscodeAccount(userIdOrIdentifier) {
  if (!userIdOrIdentifier) return;
  try {
    const clean = userIdOrIdentifier.trim().toLowerCase();
    const cleanDigits = clean.replace(/\D/g, "");
    const cleanSuffix = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : "";
    const accounts = getTerminalPasscodeAccounts();
    const filtered = accounts.filter((acc) => {
      if (acc.userId && (acc.userId === userIdOrIdentifier || acc.userId.toLowerCase() === clean)) {
        return false;
      }
      if (acc.email && acc.email.toLowerCase() === clean) {
        return false;
      }
      if (acc.phoneNumber && cleanDigits) {
        const accDigits = acc.phoneNumber.replace(/\D/g, "");
        if (accDigits === cleanDigits) return false;
        const accSuffix = accDigits.length >= 10 ? accDigits.slice(-10) : "";
        if (cleanSuffix && accSuffix && cleanSuffix === accSuffix) return false;
      }
      return true;
    });
    localStorage.setItem(STORAGE_KEYS.TERMINAL_PASSCODES, JSON.stringify(filtered));

    if (isTauriEnvironment()) {
      getSqliteDb()
        .then(async (db) => {
          await db.execute("DELETE FROM sync_metadata WHERE key = ?", [
            `passcode_${userIdOrIdentifier}`,
          ]);
        })
        .catch((err) => console.warn("SQLite terminal passcode removal error:", err));
    }
  } catch (err) {
    console.warn("Failed to remove terminal passcode account:", err);
  }
}

// --- Data Snapshot Persistence ---

export function saveSnapshot(key, data) {
  if (typeof localStorage === "undefined") return false;
  if (!getCachedUserSession().user) return false;

  try {
    if (data !== undefined && data !== null) {
      localStorage.setItem(key, JSON.stringify(data));
    }
    return true;
  } catch (err) {
    console.warn(`Failed to save snapshot for ${key}:`, err);
    return false;
  }
}

export function getSnapshot(key, fallback = []) {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`Failed to read snapshot for ${key}:`, err);
    return fallback;
  }
}

export { STORAGE_KEYS };
