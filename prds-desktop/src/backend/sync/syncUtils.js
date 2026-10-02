const getErrorMessage = (error) => {
  if (!error) {
    return "Unknown error";
  }

  return error.message || String(error);
};

export const getSnapshotFailureMessage = (results, sourceNames = []) => {
  const failures = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => result?.error);

  if (failures.length === 0) {
    return "";
  }

  const failureDetails = failures.map(({ result, index }) => {
    const sourceName = sourceNames[index] || `Source ${index + 1}`;
    return `${sourceName}: ${getErrorMessage(result.error)}`;
  });

  return `${failures.length} data source${failures.length === 1 ? "" : "s"} could not be refreshed. ${failureDetails.join("; ")}`;
};

export async function fetchAllRows(buildQuery, pageSize = 250) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

/**
 * Formats an ISO date/time string into a human-readable 12-hour time string (e.g. "1:28 AM").
 */
export function formatFriendlySyncTime(isoString) {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Converts technical sync error strings (e.g. PostgREST codes, network timeouts,
 * SQL faults, schema errors, Supabase internal details) into clear, non-technical
 * messages suitable for clinic and pharmacy staff.
 */
export function getFriendlySyncErrorMessage(rawError, pendingCount = 0) {
  const errStr = String(rawError || "").toLowerCase();

  // 1. Snapshot / download refresh issues (specific to data sync download)
  if (
    errStr.includes("could not be refreshed") ||
    errStr.includes("data source") ||
    errStr.includes("snapshot")
  ) {
    return "Could not download the latest updates from the central server. Your local records remain accessible. Click to retry.";
  }

  // 2. Local updates waiting or queued (specific to outbox upload)
  if (
    errStr.includes("waiting to sync") ||
    errStr.includes("failed to sync") ||
    errStr.includes("local change") ||
    errStr.includes("queued") ||
    errStr.includes("outbox")
  ) {
    if (pendingCount > 0) {
      return `${pendingCount} update${pendingCount === 1 ? " is" : "s are"} saved locally and waiting to sync. Click to retry.`;
    }
    return "Some updates could not be sent to the central server yet. They remain safe on this computer. Click to retry.";
  }

  // 3. Cache / storage issues
  if (errStr.includes("could not cache") || errStr.includes("storage")) {
    return "Some records could not be cached for offline use. Click to retry.";
  }

  // 4. Network / connectivity / timeout issues
  if (
    errStr.includes("timeout") ||
    errStr.includes("failed to fetch") ||
    errStr.includes("network") ||
    errStr.includes("connection") ||
    errStr.includes("econnrefused") ||
    errStr.includes("offline") ||
    errStr.includes("abort")
  ) {
    return "Unable to connect to the central server. Your data is safely saved on this computer. Click to try again.";
  }

  // 5. Database, Supabase, SQL, Auth, or server internal errors
  if (
    errStr.includes("supabase") ||
    errStr.includes("postgres") ||
    errStr.includes("pgrst") ||
    errStr.includes("relation") ||
    errStr.includes("column") ||
    errStr.includes("foreign key") ||
    errStr.includes("jwt") ||
    errStr.includes("auth") ||
    errStr.includes("permission") ||
    errStr.includes("sqlite") ||
    errStr.includes("database")
  ) {
    return "The central server is temporarily busy or unreachable. Your local data is safe. Click to retry.";
  }

  // Default friendly fallback
  return "Unable to sync with the central server right now. Your local changes are safe. Click to retry.";
}

/**
 * Returns a human-friendly tooltip text for the sync status indicator.
 * Avoids all developer jargon (Supabase, SQLite, schema names, error codes).
 */
export function getFriendlySyncTooltip({
  isOnline = true,
  isSyncing = false,
  syncStatus = "IDLE",
  error = "",
  pendingCount = 0,
  lastSyncTime = null,
} = {}) {
  if (!isOnline) {
    if (pendingCount > 0) {
      return `Working offline. ${pendingCount} saved change${pendingCount === 1 ? " will" : "s will"} sync automatically once connected to the internet.`;
    }
    return "Working offline. Any changes you make are safely saved on this computer and will sync automatically when back online.";
  }

  if (isSyncing) {
    if (pendingCount > 0) {
      return `Uploading ${pendingCount} local update${pendingCount === 1 ? "" : "s"} to the central server...`;
    }
    return "Updating records with the central server. Please wait...";
  }

  if (syncStatus === "ERROR") {
    return getFriendlySyncErrorMessage(error, pendingCount);
  }

  // Online and Synced
  if (pendingCount > 0) {
    return `Connected. ${pendingCount} local update${pendingCount === 1 ? " is" : "s are"} syncing to the central server...`;
  }

  const timeStr = formatFriendlySyncTime(lastSyncTime);
  const timeSuffix = timeStr ? ` (Last synced at ${timeStr})` : "";

  return `Connected to central server. All records are up to date${timeSuffix}. Click to check for updates.`;
}

/**
 * Formats dashboard refresh and loading errors into clear, non-technical messages.
 * Replaces raw errors like "TypeError: Failed to fetch" or PostgREST error codes
 * with friendly, reassuring language.
 */
export function getFriendlyDashboardErrorMessage(error, hasFallback = true) {
  const errStr = String(error?.message || error || "").toLowerCase();

  const isNetworkIssue =
    errStr.includes("failed to fetch") ||
    errStr.includes("timeout") ||
    errStr.includes("network") ||
    errStr.includes("connection") ||
    errStr.includes("offline") ||
    errStr.includes("abort") ||
    errStr.includes("econnrefused");

  const isServerIssue =
    errStr.includes("supabase") ||
    errStr.includes("postgres") ||
    errStr.includes("pgrst") ||
    errStr.includes("relation") ||
    errStr.includes("column") ||
    errStr.includes("foreign key") ||
    errStr.includes("jwt") ||
    errStr.includes("auth") ||
    errStr.includes("permission") ||
    errStr.includes("sqlite") ||
    errStr.includes("database");

  if (hasFallback) {
    if (isNetworkIssue) {
      return "Could not connect to the central server. Showing your saved dashboard records. Click Refresh to try again.";
    }
    if (isServerIssue) {
      return "The central server is temporarily unreachable. Showing your saved dashboard records. Click Refresh to try again.";
    }
    return "Could not refresh data from the central server. Showing your saved dashboard records. Click Refresh to try again.";
  }

  if (isNetworkIssue) {
    return "Unable to connect to the central server. Please check your internet connection and click Refresh.";
  }
  if (isServerIssue) {
    return "The central server is temporarily unreachable. Please click Refresh to try again.";
  }

  return "Unable to load dashboard data right now. Click Refresh to try again.";
}

/**
 * General error message cleaner that catches JavaScript runtime errors (TypeError, etc.)
 * or raw database errors, translating them into friendly user messages.
 */
export function formatUserFacingError(error, defaultMessage = "An unexpected error occurred. Please try again.") {
  if (!error) return defaultMessage;
  const isJsError =
    error instanceof TypeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError ||
    error?.name === "TypeError" ||
    error?.name === "ReferenceError" ||
    error?.name === "SyntaxError";

  const msg = typeof error === "string" ? error : error?.message || String(error);
  const lower = `${String(error)} ${msg}`.toLowerCase();

  if (
    lower.includes("failed to fetch") ||
    lower.includes("timeout") ||
    lower.includes("network") ||
    lower.includes("connection") ||
    lower.includes("econnrefused") ||
    lower.includes("offline") ||
    lower.includes("abort")
  ) {
    return "Unable to connect to the central server. Please check your internet connection and try again.";
  }

  if (
    lower.includes("supabase") ||
    lower.includes("postgres") ||
    lower.includes("pgrst") ||
    lower.includes("relation") ||
    lower.includes("column") ||
    lower.includes("foreign key") ||
    lower.includes("jwt") ||
    lower.includes("token") ||
    lower.includes("sqlite") ||
    lower.includes("database")
  ) {
    return "The central server is temporarily busy or unreachable. Your local data is safe. Please try again.";
  }

  if (
    isJsError ||
    lower.includes("typeerror") ||
    lower.includes("referenceerror") ||
    lower.includes("syntaxerror") ||
    lower.includes("cannot read properties") ||
    lower.includes("is not a function") ||
    lower.includes("uncaught")
  ) {
    return defaultMessage;
  }

  return msg;
}

/**
 * Generates human-readable descriptions and action labels for outbox mutations.
 */
export function describeMutation(item = {}) {
  const { mutation_type, target, payload_json } = item;
  let payload = {};
  try {
    payload = typeof payload_json === "string" ? JSON.parse(payload_json) : (payload_json || {});
  } catch {}

  let label = "Local Update";
  let description = `${mutation_type || "CHANGE"} on ${target || "records"}`;

  if (target === "medicine_dispensing" || target === "dispense_medicine") {
    label = "Walk-in Dispensing";
    const qty = payload.quantity || payload.needed_quantity || "";
    description = qty ? `Dispensed ${qty} units` : "Medicine dispensing transaction";
  } else if (target === "patients") {
    label = mutation_type === "INSERT" ? "New Patient Profile" : "Update Patient";
    const name = [payload.first_name, payload.last_name].filter(Boolean).join(" ");
    description = name ? `Patient: ${name}` : "Patient demographic record";
  } else if (target === "inventory") {
    label = mutation_type === "INSERT" ? "Receive Stock" : "Adjust Inventory";
    const batch = payload.batch_number ? `Batch #${payload.batch_number}` : "";
    const qty = payload.quantity != null ? `${payload.quantity} units` : "";
    description = [batch, qty].filter(Boolean).join(" - ") || "Stock balance update";
  } else if (target === "medicine_requests") {
    label = "Medicine Request";
    const num = payload.request_number || payload.id?.slice(0, 8) || "";
    description = num ? `Request #${num}` : "Barangay health station request";
  } else if (target === "stock_transfers") {
    label = "Stock Transfer";
    const num = payload.transfer_number || payload.id?.slice(0, 8) || "";
    description = num ? `Transfer #${num}` : "Inter-facility transfer";
  } else if (target === "other_programs") {
    label = "Special Program";
    description = payload.program_name || "Community health program";
  }

  return { label, description };
}

/**
 * Calculates a safe watermark by rewinding the timestamp by an overlap window (default 5000ms)
 * to guard against database clock skew and concurrent transactions committing out of order.
 * @param {string|number|Date|null} watermark
 * @param {number} overlapMs
 * @returns {string|null} ISO 8601 string or null if watermark is invalid/absent
 */
export function getSafeWatermarkWindow(watermark, overlapMs = 5000) {
  if (!watermark) return null;
  const ts = new Date(watermark).getTime();
  if (Number.isNaN(ts)) return null;
  return new Date(Math.max(0, ts - overlapMs)).toISOString();
}

/**
 * Merges delta rows into an existing array of records by matching primary keys (default 'id').
 * Updates matching records, appends new records, and purges any records whose IDs are in tombstoneIds.
 * @param {Array} existingRows
 * @param {Array} deltaRows
 * @param {Array<string|number>} tombstoneIds
 * @param {string} idKey
 * @returns {Array}
 */
export function mergeSnapshotDelta(existingRows = [], deltaRows = [], tombstoneIds = [], idKey = "id") {
  const tombstoneSet = new Set((tombstoneIds || []).map((id) => String(id)));
  const map = new Map();

  for (const row of existingRows || []) {
    if (!row) continue;
    const key = String(row[idKey] ?? "");
    if (key && !tombstoneSet.has(key)) {
      map.set(key, row);
    }
  }

  for (const row of deltaRows || []) {
    if (!row) continue;
    const key = String(row[idKey] ?? "");
    if (key && !tombstoneSet.has(key)) {
      map.set(key, row);
    }
  }

  return Array.from(map.values());
}

