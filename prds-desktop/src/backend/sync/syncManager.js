/**
 * PRDS Unified Background Sync Manager
 * Automatically synchronizes all database snapshots to local storage & SQLite
 * and flushes offline outbox mutations when internet connection is active.
 */

import { supabase } from "../client/supabase";
import { isCurrentNetworkOnline, setNetworkOnlineState, subscribeNetworkStatus } from "./networkStatus";
import { compileDashboardSnapshot } from "@shared/utils/dashboardUtils";
import {
  getCachedUserSession,
  getSnapshot,
  getSnapshotRevision,
  saveSnapshot,
  STORAGE_KEYS,
} from "../database/snapshotStore";
import {
  batchDeleteByIds,
  clearDatasetSyncWatermark,
  getDatasetSyncWatermark,
  getSqliteDb,
  initSqliteSchema,
  isTauriEnvironment,
  setDatasetSyncWatermark,
} from "../database/sqliteClient";
import { batchUpsertSqliteRecords } from "../client/tableRepositoryAdapters";
import {
  getFailedMutationCount,
  getPendingMutations,
  processOutboxQueue,
  retryFailedMutations,
} from "./outboxQueue";
import { restoreSupabaseSessionIfAvailable } from "../services/auth/authSessionRestore.js";
import {
  fetchAllRows,
  getSafeWatermarkWindow,
  getSnapshotFailureMessage,
  mergeSnapshotDelta,
} from "./syncUtils";

let isSyncing = false;
let syncStatus = "IDLE"; // "IDLE" | "SYNCING" | "SUCCESS" | "ERROR" | "OFFLINE"
let syncErrorMessage = "";
let lastSyncTime = localStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIME) || null;
const statusListeners = new Set();

const unsupportedUpdatedAtTables = new Set([
  "activity_logs",
]);

export function clearUnsupportedUpdatedAtTables() {
  unsupportedUpdatedAtTables.clear();
}

const unsupportedOptionalTables = new Set([
  "sync_tombstones",
  "stock_deficit_audits",
]);

export function clearUnsupportedOptionalTables() {
  unsupportedOptionalTables.clear();
}

export function subscribeSyncStatus(callback) {
  statusListeners.add(callback);
  callback({ status: syncStatus, isSyncing, lastSyncTime, error: syncErrorMessage });
  return () => statusListeners.delete(callback);
}

function updateSyncStatus(newStatus, error = "") {
  syncStatus = newStatus;
  syncErrorMessage = error;
  isSyncing = newStatus === "SYNCING";
  if (newStatus === "SUCCESS") {
    lastSyncTime = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC_TIME, lastSyncTime);
  }
  statusListeners.forEach((listener) =>
    listener({ status: syncStatus, isSyncing, lastSyncTime, error: syncErrorMessage })
  );
}

export async function syncAllData({ retryFailed = false, forceFullSync = false } = {}) {
  if (isSyncing) {
    return false;
  }

  if (retryFailed || forceFullSync) {
    unsupportedUpdatedAtTables.clear();
  }

  const syncUserId = getCachedUserSession().user?.id;
  if (!syncUserId) {
    updateSyncStatus("IDLE");
    return false;
  }
  const syncRevision = getSnapshotRevision();
  const isCurrentSession = () =>
    getSnapshotRevision() === syncRevision &&
    getCachedUserSession().user?.id === syncUserId;

  if (!isCurrentNetworkOnline()) {
    updateSyncStatus("OFFLINE");
    return false;
  }

  try {
    updateSyncStatus("SYNCING");
    let outboxError = "";

    // Proactively verify/refresh Supabase auth token before firing network queries
    if (isCurrentNetworkOnline()) {
      try {
        let activeSession = null;
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          activeSession = sessionData?.session;
        } catch {}

        if (activeSession?.access_token) {
          const expiresAt = activeSession.expires_at ? activeSession.expires_at * 1000 : 0;
          // Refresh if expired or within 2 minutes of expiry
          if (!expiresAt || expiresAt - Date.now() < 120000) {
            const { data: refreshed } = await supabase.auth.refreshSession();
            if (refreshed?.session) activeSession = refreshed.session;
          }
        } else {
          // No active in-memory session (e.g. offline passcode login) - restore session using persisted tokens
          activeSession = await restoreSupabaseSessionIfAvailable();
        }

        // If no authenticated Supabase session is available, skip cloud pull to prevent unauthenticated anon queries
        if (!activeSession?.access_token) {
          updateSyncStatus("IDLE");
          return false;
        }
      } catch (authRefreshErr) {
        console.warn("Proactive auth session check warning during sync:", authRefreshErr);
        updateSyncStatus("IDLE");
        return false;
      }
    }

    if (retryFailed) {
      await retryFailedMutations();
    }

    // 1. Process pending offline mutations first
    try {
      await processOutboxQueue();
    } catch (err) {
      console.warn("Outbox processing error during sync:", err);
      outboxError = err?.message || "Unable to process queued changes.";
    }

    const failedMutationCount = await getFailedMutationCount();
    if (failedMutationCount > 0) {
      outboxError = `${failedMutationCount} local change${failedMutationCount === 1 ? "" : "s"} failed to sync.`;
    }
    const pendingMutationCount = (await getPendingMutations()).length;
    if (pendingMutationCount > 0) {
      outboxError = [
        outboxError,
        `${pendingMutationCount} local change${pendingMutationCount === 1 ? " is" : "s are"} still waiting to sync.`,
      ].filter(Boolean).join(" ");
    }

    // 2. Fetch fresh snapshots / deltas concurrently with generous timeout guards (25s)
    const fetchWithTimeout = async (promise, timeoutMs = 25000) => {
      let timeoutHandle;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("Sync timeout")), timeoutMs);
      });
      try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutHandle);
        return result;
      } catch (e) {
        clearTimeout(timeoutHandle);
        return { data: null, error: e };
      }
    };

    // Safe single-query helper: catches missing columns (e.g. 42703 for updated_at when schema migration is pending)
    // and automatically retries as full dataset query without failing the sync.
    const safeFetchSingle = async (firstArg, secondArg, thirdArg = null, fourthArg = 25000) => {
      const datasetName = typeof firstArg === "string" ? firstArg : "";
      const buildQueryFn = typeof firstArg === "function" ? firstArg : secondArg;
      const watermark = typeof firstArg === "function" ? secondArg : thirdArg;
      const timeoutMs = typeof firstArg === "function" ? (thirdArg || 25000) : fourthArg;

      let activeWatermark = datasetName && unsupportedUpdatedAtTables.has(datasetName) ? null : watermark;
      let res = await fetchWithTimeout(buildQueryFn(activeWatermark), timeoutMs);
      if (
        activeWatermark &&
        res?.error &&
        (res.error.code === "42703" ||
          String(res.error.message || "").toLowerCase().includes("does not exist"))
      ) {
        if (datasetName) unsupportedUpdatedAtTables.add(datasetName);
        activeWatermark = null;
        res = await fetchWithTimeout(buildQueryFn(null), timeoutMs);
      }
      if (res?.error) {
        console.warn(`[syncManager] Query error on ${datasetName || "dataset"}:`, res.error);
      }
      return { ...res, usedWatermark: activeWatermark };
    };

    // Safe optional query helper: treats pending tables (sync_tombstones, stock_deficit_audits) as empty if not migrated
    const safeOptionalFetch = async (tableName, queryFactory, timeoutMs = 15000) => {
      if (tableName && unsupportedOptionalTables.has(tableName)) {
        return { data: [], error: null };
      }
      const queryPromise = typeof queryFactory === "function" ? queryFactory() : queryFactory;
      const res = await fetchWithTimeout(queryPromise, timeoutMs);
      if (res?.error) {
        const msg = String(res.error.message || "").toLowerCase();
        if (
          res.error.code === "42P01" ||
          res.error.code === "PGRST205" ||
          msg.includes("does not exist") ||
          msg.includes("schema cache") ||
          msg.includes("could not find") ||
          msg.includes("permission denied")
        ) {
          if (tableName) {
            unsupportedOptionalTables.add(tableName);
          }
          return { data: [], error: null };
        }
      }
      return res;
    };

    const syncStartTime = new Date().toISOString();

    let medicinesWatermark = null;
    let otherProgramsWatermark = null;
    let facilitiesWatermark = null;
    let inventoryWatermark = null;
    let thresholdsWatermark = null;
    let patientsWatermark = null;
    let requestsWatermark = null;
    let stockReturnsWatermark = null;
    let dispensingWatermark = null;
    let forecastWatermark = null;
    let profilesWatermark = null;
    let activityLogsWatermark = null;
    let deficitAuditsWatermark = null;

    if (!forceFullSync) {
      const [
        medWm,
        progWm,
        facWm,
        invWm,
        threshWm,
        patWm,
        reqWm,
        retWm,
        dispWm,
        fcWm,
        profWm,
        actWm,
        defWm,
      ] = await Promise.all([
        getDatasetSyncWatermark("medicines"),
        getDatasetSyncWatermark("other_programs"),
        getDatasetSyncWatermark("facilities"),
        getDatasetSyncWatermark("inventory"),
        getDatasetSyncWatermark("facility_medicine_thresholds"),
        getDatasetSyncWatermark("patients"),
        getDatasetSyncWatermark("medicine_requests"),
        getDatasetSyncWatermark("stock_returns"),
        getDatasetSyncWatermark("medicine_dispensing"),
        getDatasetSyncWatermark("forecasting"),
        getDatasetSyncWatermark("profiles"),
        getDatasetSyncWatermark("activity_logs"),
        getDatasetSyncWatermark("stock_deficit_audits"),
      ]);

      const hasNonEmptySnapshot = (key) => {
        const snap = getSnapshot(key, []);
        return Array.isArray(snap) && snap.length > 0;
      };
      const hasFacilityInventorySnapshot = () => {
        const invSnap = getSnapshot(STORAGE_KEYS.INVENTORY, []);
        if (!Array.isArray(invSnap) || invSnap.length === 0) return false;
        const activeProfile = getCachedUserSession()?.profile;
        if (!activeProfile) return true;
        const role = String(activeProfile.role || "").toUpperCase();
        const targetFacId =
          role === "BHW"
            ? String(activeProfile.facility_id || "").toLowerCase()
            : "0b7e2eaa-1072-4fb1-8e14-d6fb46097aad";
        if (!targetFacId) return true;
        return invSnap.some(
          (row) => String(row?.facility_id || "").toLowerCase() === targetFacId
        );
      };

      medicinesWatermark = hasNonEmptySnapshot(STORAGE_KEYS.MEDICINES)
        ? getSafeWatermarkWindow(medWm)
        : null;
      otherProgramsWatermark = hasNonEmptySnapshot(STORAGE_KEYS.OTHER_PROGRAMS)
        ? getSafeWatermarkWindow(progWm)
        : null;
      facilitiesWatermark = hasNonEmptySnapshot(STORAGE_KEYS.FACILITIES)
        ? getSafeWatermarkWindow(facWm)
        : null;
      inventoryWatermark = hasFacilityInventorySnapshot()
        ? getSafeWatermarkWindow(invWm)
        : null;
      thresholdsWatermark = hasNonEmptySnapshot(STORAGE_KEYS.THRESHOLDS)
        ? getSafeWatermarkWindow(threshWm)
        : null;
      patientsWatermark = hasNonEmptySnapshot(STORAGE_KEYS.PATIENTS)
        ? getSafeWatermarkWindow(patWm)
        : null;
      requestsWatermark = hasNonEmptySnapshot(STORAGE_KEYS.REQUESTS)
        ? getSafeWatermarkWindow(reqWm)
        : null;
      stockReturnsWatermark = hasNonEmptySnapshot(STORAGE_KEYS.STOCK_RETURNS)
        ? getSafeWatermarkWindow(retWm)
        : null;
      dispensingWatermark = hasNonEmptySnapshot(STORAGE_KEYS.DISPENSING)
        ? getSafeWatermarkWindow(dispWm)
        : null;
      forecastWatermark = hasNonEmptySnapshot(STORAGE_KEYS.FORECASTING)
        ? getSafeWatermarkWindow(fcWm)
        : null;
      profilesWatermark = hasNonEmptySnapshot(STORAGE_KEYS.USERS)
        ? getSafeWatermarkWindow(profWm)
        : null;
      activityLogsWatermark = hasNonEmptySnapshot(STORAGE_KEYS.ACTIVITY_LOGS)
        ? getSafeWatermarkWindow(actWm)
        : null;
      deficitAuditsWatermark = hasNonEmptySnapshot(STORAGE_KEYS.DEFICIT_AUDITS)
        ? getSafeWatermarkWindow(defWm)
        : null;
    }

    const allWatermarks = [
      medicinesWatermark,
      otherProgramsWatermark,
      facilitiesWatermark,
      inventoryWatermark,
      thresholdsWatermark,
      patientsWatermark,
      requestsWatermark,
      stockReturnsWatermark,
      dispensingWatermark,
      forecastWatermark,
      profilesWatermark,
      activityLogsWatermark,
      deficitAuditsWatermark,
    ].filter(Boolean);

    const minSafeWatermark =
      allWatermarks.length > 0
        ? allWatermarks.reduce((min, cur) => (cur < min ? cur : min))
        : null;

    const tombstonesPromise = minSafeWatermark
      ? safeOptionalFetch(
          "sync_tombstones",
          () =>
            supabase
              .from("sync_tombstones")
              .select("id, table_name, record_id, deleted_at")
              .gt("deleted_at", minSafeWatermark)
              .order("deleted_at", { ascending: true })
        )
      : Promise.resolve({ data: [], error: null });

    const deficitAuditsPromise = safeOptionalFetch(
      "stock_deficit_audits",
      () => {
        let q = supabase.from("stock_deficit_audits").select("*");
        if (deficitAuditsWatermark) {
          q = q.gt("updated_at", deficitAuditsWatermark);
        }
        return q.order("created_at", { ascending: false });
      }
    );

    const [
      medicinesRes,
      otherProgramsRes,
      facilitiesRes,
      inventoryRes,
      thresholdsRes,
      patientsRes,
      requestsRes,
      stockReturnsRes,
      dispensingSummaryRes,
      dispensingRes,
      forecastRes,
      usersRes,
      activityLogsRes,
      notificationsRes,
      deficitAuditsRes,
      tombstonesRes,
    ] = await Promise.all([
      // Medicines
      safeFetchSingle(
        "medicines",
        (wm) => {
          let q = supabase
            .from("medicines")
            .select("id, generic_name, unit_of_measure, dosage, categories");
          if (wm) {
            q = q.gt("updated_at", wm);
          }
          return q.order("generic_name", { ascending: true });
        },
        medicinesWatermark
      ),
      // Other Programs
      safeFetchSingle(
        "other_programs",
        (wm) => {
          let q = supabase
            .from("other_programs")
            .select(`
              id,
              facility_id,
              status,
              started_at,
              completed_at,
              cancelled_at,
              created_at,
              updated_at,
              program_name,
              program_date,
              description,
              medicines:program_medicines(
                id,
                medicine_id,
                quantity_allocated,
                quantity_returned,
                quantity_used,
                medicine:medicines(id, generic_name, dosage, unit_of_measure)
              )
            `);
          if (wm) {
            q = q.gt("updated_at", wm);
          }
          return q.order("program_date", { ascending: false });
        },
        otherProgramsWatermark
      ),
      // Facilities
      safeFetchSingle(
        "facilities",
        (wm) => {
          let q = supabase
            .from("facilities")
            .select("id, facility_name, facility_code, facility_type, address, status, latitude, longitude");
          if (wm) {
            q = q.gt("updated_at", wm);
          }
          return q.order("facility_name", { ascending: true });
        },
        facilitiesWatermark
      ),
      // Inventory with relations
      (async () => {
        const fullInventorySelect = `
          id,
          facility_id,
          medicine_id,
          quantity,
          batch_number,
          po_number,
          unit_cost,
          brand_name,
          supplier_name,
          supplier_address,
          supplier_contact,
          date_received,
          expiration_date,
          origin_facility_id,
          intake_type,
          return_reason,
          status,
          medicine:medicines(id, generic_name, dosage, unit_of_measure),
          facility:facilities!inventory_facility_id_fkey(id, facility_name, facility_code)
        `;
        const baseInventorySelect = `
          id,
          facility_id,
          medicine_id,
          quantity,
          batch_number,
          po_number,
          unit_cost,
          brand_name,
          supplier_name,
          supplier_address,
          supplier_contact,
          date_received,
          expiration_date,
          intake_type,
          return_reason,
          status,
          medicine:medicines(id, generic_name, dosage, unit_of_measure),
          facility:facilities!inventory_facility_id_fkey(id, facility_name, facility_code)
        `;

        let res = await safeFetchSingle(
          "inventory",
          (wm) => {
            let q = supabase.from("inventory").select(fullInventorySelect);
            if (wm) {
              q = q.gt("updated_at", wm);
            }
            return q;
          },
          inventoryWatermark
        );

        if (
          res?.error &&
          (res.error.code === "42703" ||
            String(res.error.message || "").toLowerCase().includes("does not exist") ||
            String(res.error.message || "").toLowerCase().includes("could not find the"))
        ) {
          res = await safeFetchSingle(
            "inventory",
            (wm) => {
              let q = supabase.from("inventory").select(baseInventorySelect);
              if (wm) {
                q = q.gt("updated_at", wm);
              }
              return q;
            },
            inventoryWatermark
          );
        }

        return res;
      })(),
      // Facility Medicine Thresholds
      safeFetchSingle(
        "facility_medicine_thresholds",
        (wm) => {
          let q = supabase
            .from("facility_medicine_thresholds")
            .select("id, facility_id, medicine_id, threshold, is_custom, updated_at");
          if (wm) {
            q = q.gt("updated_at", wm);
          }
          return q;
        },
        thresholdsWatermark
      ),
      // Patients
      safeFetchSingle(
        "patients",
        (wm) => {
          let q = supabase
            .from("patients")
            .select(`
              id,
              facility_id,
              first_name,
              middle_name,
              last_name,
              suffix, date_of_birth, gender,
              contact_number,
              address,
              patient_code,
              created_by,
              created_at,
              updated_at,
              archived_at,
              archived_by,
              archive_reason,
              facility:facilities!patients_facility_id_fkey(
                id,
                facility_name,
                facility_code,
                facility_type,
                address
              ),
              registered_by:profiles!patients_created_by_fkey(
                id,
                first_name,
                last_name,
                role
              )
            `);
          if (wm) {
            q = q.gt("updated_at", wm);
          }
          return q.order("last_name", { ascending: true });
        },
        patientsWatermark
      ),
      // Requests
      fetchWithTimeout(
        (async () => {
          let wm = unsupportedUpdatedAtTables.has("medicine_requests") ? null : requestsWatermark;
          try {
            const rows = await fetchAllRows(() => {
              let q = supabase
                .from("medicine_requests")
                .select(`
                  id,
                  facility_id,
                  requested_by,
                  status,
                  request_date,
                  remarks,
                  facility:facilities(id, facility_name, facility_code),
                  items:medicine_request_items(
                    id,
                    medicine_id,
                    quantity,
                    medicine:medicines(generic_name, dosage)
                  )
                `);
              if (wm) {
                q = q.gt("updated_at", wm);
              }
              return q
                .order("request_date", { ascending: false })
                .order("id", { ascending: false });
            }, 250);
            return { data: rows || [], error: null, usedWatermark: wm };
          } catch (err) {
            if (
              wm &&
              (err?.code === "42703" ||
                String(err?.message || "").toLowerCase().includes("does not exist"))
            ) {
              unsupportedUpdatedAtTables.add("medicine_requests");
              wm = null;
              const fallbackBuilder = () =>
                supabase
                  .from("medicine_requests")
                  .select(`
                    id,
                    facility_id,
                    requested_by,
                    status,
                    request_date,
                    remarks,
                    facility:facilities(id, facility_name, facility_code),
                    items:medicine_request_items(
                      id,
                      medicine_id,
                      quantity,
                      medicine:medicines(generic_name, dosage)
                    )
                  `)
                  .order("request_date", { ascending: false })
                  .order("id", { ascending: false });
              const rows = await fetchAllRows(fallbackBuilder, 250);
              return { data: rows || [], error: null, usedWatermark: null };
            }
            return { data: null, error: err, usedWatermark: null };
          }
        })(),
        60000
      ),
      // Stock Returns
      safeFetchSingle(
        "stock_returns",
        (wm) => {
          let q = supabase.from("stock_returns").select(`
            id,
            return_id,
            facility_id,
            source_inventory_id,
            medicine_id,
            medicine_name,
            brand_name,
            dosage,
            unit_of_measure,
            lot_no,
            quantity,
            unit_cost,
            expiration_date,
            reason,
            status,
            remarks,
            submitted_by_id,
            submitted_at,
            confirmed_by_id,
            confirmed_at,
            created_at,
            updated_at,
            facility:facilities!stock_returns_facility_id_fkey(id, facility_name, facility_code),
            medicine:medicines(id, generic_name, dosage, unit_of_measure)
          `);
          if (wm) {
            q = q.gt("updated_at", wm);
          }
          return q
            .order("submitted_at", { ascending: false })
            .order("created_at", { ascending: false });
        },
        stockReturnsWatermark
      ),
      // Dispensing Summary
      fetchWithTimeout(
        supabase
          .from("monthly_dispensing_summary")
          .select("facility_id, medicine_id, month, total_dispensed")
      ),
      // Recent Dispensing records
      fetchWithTimeout(
        (async () => {
          let wm = unsupportedUpdatedAtTables.has("medicine_dispensing") ? null : dispensingWatermark;
          try {
            const rows = await fetchAllRows(() => {
              let q = supabase
                .from("medicine_dispensing")
                .select(`
                  id,
                  dispensing_transaction_id,
                  facility_id,
                  medicine_id,
                  inventory_id,
                  quantity,
                  needed_quantity,
                  unit_cost_at_dispense,
                  total_cost_at_dispense,
                  prescribed_by,
                  follow_up_action,
                  follow_up_date,
                  referred_facility_id,
                  is_manual_record,
                  record_type,
                  manual_dispensed_by,
                  dispensing_type,
                  dispensed_by,
                  dispense_date,
                  voided_at,
                  void_reason,
                  patient_id,
                  medicine:medicines(id, generic_name, dosage, unit_of_measure),
                  patient:patients(
                    id,
                    patient_code,
                    first_name,
                    middle_name,
                    last_name,
                    suffix,
                    gender,
                    date_of_birth,
                    facility:facilities!patients_facility_id_fkey(id, facility_name, facility_code)
                  ),
                  dispenser:profiles!medicine_dispensing_dispensed_by_fkey(id, first_name, last_name, role),
                  dispensing_facility:facilities!medicine_dispensing_facility_id_fkey(id, facility_name, facility_code),
                  referred_facility:facilities!medicine_dispensing_referred_facility_id_fkey(id, facility_name, facility_code),
                  batch:inventory!medicine_dispensing_inventory_id_fkey(id, batch_number, expiration_date, unit_cost)
                `);
              if (wm) {
                q = q.gt("updated_at", wm);
              }
              return q
                .order("dispense_date", { ascending: false })
                .order("id", { ascending: false });
            }, 250);
            return { data: rows || [], error: null, usedWatermark: wm };
          } catch (err) {
            if (
              wm &&
              (err?.code === "42703" ||
                String(err?.message || "").toLowerCase().includes("does not exist"))
            ) {
              unsupportedUpdatedAtTables.add("medicine_dispensing");
              wm = null;
              const fallbackBuilder = () =>
                supabase
                  .from("medicine_dispensing")
                  .select(`
                    id,
                    dispensing_transaction_id,
                    facility_id,
                    medicine_id,
                    inventory_id,
                    quantity,
                    needed_quantity,
                    unit_cost_at_dispense,
                    total_cost_at_dispense,
                    prescribed_by,
                    follow_up_action,
                    follow_up_date,
                    referred_facility_id,
                    is_manual_record,
                    record_type,
                    manual_dispensed_by,
                    dispensing_type,
                    dispensed_by,
                    dispense_date,
                    voided_at,
                    void_reason,
                    patient_id,
                    medicine:medicines(id, generic_name, dosage, unit_of_measure),
                    patient:patients(
                      id,
                      patient_code,
                      first_name,
                      middle_name,
                      last_name,
                      suffix,
                      gender,
                      date_of_birth,
                      facility:facilities!patients_facility_id_fkey(id, facility_name, facility_code)
                    ),
                    dispenser:profiles!medicine_dispensing_dispensed_by_fkey(id, first_name, last_name, role),
                    dispensing_facility:facilities!medicine_dispensing_facility_id_fkey(id, facility_name, facility_code),
                    referred_facility:facilities!medicine_dispensing_referred_facility_id_fkey(id, facility_name, facility_code),
                    batch:inventory!medicine_dispensing_inventory_id_fkey(id, batch_number, expiration_date, unit_cost)
                  `)
                  .order("dispense_date", { ascending: false })
                  .order("id", { ascending: false });
              const rows = await fetchAllRows(fallbackBuilder, 250);
              return { data: rows || [], error: null, usedWatermark: null };
            }
            return { data: null, error: err, usedWatermark: null };
          }
        })(),
        60000
      ),
      // Forecasting
      fetchWithTimeout(
        (async () => {
          let wm = unsupportedUpdatedAtTables.has("forecasting") ? null : forecastWatermark;
          try {
            const rows = await fetchAllRows(() => {
              let q = supabase
                .from("forecasting")
                .select("id, predicted_quantity, forecast_month, facility_id");
              if (wm) {
                q = q.gt("updated_at", wm);
              }
              return q
                .order("forecast_month", { ascending: false })
                .order("id", { ascending: false });
            }, 250);
            return { data: rows || [], error: null, usedWatermark: wm };
          } catch (err) {
            if (
              wm &&
              (err?.code === "42703" ||
                String(err?.message || "").toLowerCase().includes("does not exist"))
            ) {
              unsupportedUpdatedAtTables.add("forecasting");
              wm = null;
              const fallbackBuilder = () =>
                supabase
                  .from("forecasting")
                  .select("id, predicted_quantity, forecast_month, facility_id")
                  .order("forecast_month", { ascending: false })
                  .order("id", { ascending: false });
              const rows = await fetchAllRows(fallbackBuilder, 250);
              return { data: rows || [], error: null, usedWatermark: null };
            }
            return { data: null, error: err, usedWatermark: null };
          }
        })(),
        60000
      ),
      // Users / Profiles for User Management
      safeFetchSingle(
        "profiles",
        (wm) => {
          let q = supabase
            .from("profiles")
            .select(`
              id,
              first_name,
              last_name,
              email,
              phone_number,
              role,
              facility_id,
              status,
              approved_by,
              approved_at,
              created_at,
              updated_at,
              facility:facilities(id, facility_name, facility_code)
            `);
          if (wm) {
            q = q.gt("updated_at", wm);
          }
          return q.order("created_at", { ascending: false });
        },
        profilesWatermark
      ),
      // Activity Logs
      fetchWithTimeout(
        (async () => {
          let wm = activityLogsWatermark;
          try {
            const rows = await fetchAllRows(() => {
              let q = supabase
                .from("activity_logs")
                .select(`
                  id,
                  user_id,
                  action,
                  module,
                  details,
                  created_at,
                  user:profiles!activity_logs_user_id_fkey(
                    id,
                    first_name,
                    last_name,
                    email,
                    phone_number,
                    role,
                    facility_id,
                    facility:facilities(id, facility_name, facility_code)
                  )
                `);
              if (wm) {
                q = q.gt("created_at", wm);
              }
              return q
                .order("created_at", { ascending: false })
                .order("id", { ascending: false });
            }, 250);
            return { data: rows || [], error: null, usedWatermark: wm };
          } catch (err) {
            if (
              wm &&
              (err?.code === "42703" ||
                String(err?.message || "").toLowerCase().includes("does not exist"))
            ) {
              wm = null;
              const fallbackBuilder = () =>
                supabase
                  .from("activity_logs")
                  .select(`
                    id,
                    user_id,
                    action,
                    module,
                    details,
                    created_at,
                    user:profiles!activity_logs_user_id_fkey(
                      id,
                      first_name,
                      last_name,
                      email,
                      phone_number,
                      role,
                      facility_id,
                      facility:facilities(id, facility_name, facility_code)
                    )
                  `)
                  .order("created_at", { ascending: false })
                  .order("id", { ascending: false });
              const rows = await fetchAllRows(fallbackBuilder, 250);
              return { data: rows || [], error: null, usedWatermark: null };
            }
            return { data: null, error: err, usedWatermark: null };
          }
        })(),
        60000
      ),
      // Notifications
      fetchWithTimeout(
        supabase.rpc("get_visible_notifications")
      ),
      // Stock Deficit Audits
      deficitAuditsPromise,
      // Tombstones
      tombstonesPromise,
    ]);

    const tombstonesByTable = new Map();
    if (tombstonesRes?.data && Array.isArray(tombstonesRes.data)) {
      for (const t of tombstonesRes.data) {
        if (!t.table_name || !t.record_id) continue;
        if (!tombstonesByTable.has(t.table_name)) {
          tombstonesByTable.set(t.table_name, new Set());
        }
        tombstonesByTable.get(t.table_name).add(String(t.record_id));
      }
    }

    const snapshotResults = [
      medicinesRes,
      otherProgramsRes,
      facilitiesRes,
      inventoryRes,
      thresholdsRes,
      patientsRes,
      requestsRes,
      stockReturnsRes,
      dispensingSummaryRes,
      dispensingRes,
      forecastRes,
      usersRes,
      activityLogsRes,
      notificationsRes,
    ];

    if (deficitAuditsRes?.error) {
      const msg = (deficitAuditsRes.error.message || "").toLowerCase();
      const isOptionalSchemaIssue =
        msg.includes("does not exist") ||
        msg.includes("schema cache") ||
        msg.includes("permission denied") ||
        msg.includes("could not find");
      if (!isOptionalSchemaIssue) {
        snapshotResults.push(deficitAuditsRes);
      }
    }

    const snapshotError = getSnapshotFailureMessage(snapshotResults, [
      "Medicines",
      "Other Programs",
      "Facilities",
      "Inventory",
      "Thresholds",
      "Patients",
      "Requests",
      "Stock Returns",
      "Dispensing summary",
      "Dispensing",
      "Forecasting",
      "Profiles",
      "Activity logs",
      "Notifications",
      "Deficit audits",
    ]);

    if (snapshotError) {
      console.warn("[syncManager] Snapshot failure:", snapshotError);
    }

    if (!isCurrentSession()) {
      updateSyncStatus("IDLE");
      return false;
    }

    // Save results into snapshot store
    const storageFailures = [];
    const cacheSnapshot = (key, data, label) => {
      if (data && !saveSnapshot(key, data)) storageFailures.push(label);
    };

    const applyDeltaOrFullSnapshot = (key, res, watermark, tableName, label) => {
      if (!res?.data) return;
      let dataToCache = res.data;
      if (watermark && res.usedWatermark !== null && res.usedWatermark !== undefined) {
        const existing = getSnapshot(key) || [];
        const tombstones = Array.from(tombstonesByTable.get(tableName) || []);
        dataToCache = mergeSnapshotDelta(existing, res.data, tombstones);
      }
      if (tableName === "inventory") {
        // Strict architectural segregation: commercial inventory must ONLY contain Supplier procurement stock.
        // Field returns are stored exclusively in stock_returns and stock_return_items.
        dataToCache = dataToCache.filter(
          (item) =>
            item?.intake_type !== "RETURN" &&
            !item?.origin_facility_id &&
            !(typeof item?.po_number === "string" && item.po_number.startsWith("RET-"))
        );
        if (res) {
          res.data = dataToCache;
        }
      }
      cacheSnapshot(key, dataToCache, label);
    };

    applyDeltaOrFullSnapshot(STORAGE_KEYS.MEDICINES, medicinesRes, medicinesWatermark, "medicines", "Medicines");
    applyDeltaOrFullSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, otherProgramsRes, otherProgramsWatermark, "other_programs", "Other Programs");
    applyDeltaOrFullSnapshot(STORAGE_KEYS.FACILITIES, facilitiesRes, facilitiesWatermark, "facilities", "Facilities");
    applyDeltaOrFullSnapshot(STORAGE_KEYS.INVENTORY, inventoryRes, inventoryWatermark, "inventory", "Inventory");
    applyDeltaOrFullSnapshot(STORAGE_KEYS.THRESHOLDS, thresholdsRes, thresholdsWatermark, "facility_medicine_thresholds", "Thresholds");
    applyDeltaOrFullSnapshot(STORAGE_KEYS.PATIENTS, patientsRes, patientsWatermark, "patients", "Patients");
    applyDeltaOrFullSnapshot(STORAGE_KEYS.REQUESTS, requestsRes, requestsWatermark, "medicine_requests", "Requests");
    applyDeltaOrFullSnapshot(STORAGE_KEYS.STOCK_RETURNS, stockReturnsRes, stockReturnsWatermark, "stock_returns", "Stock Returns");
    cacheSnapshot(STORAGE_KEYS.DISPENSING_SUMMARY, dispensingSummaryRes.data, "Dispensing summary");
    applyDeltaOrFullSnapshot(STORAGE_KEYS.DISPENSING, dispensingRes, dispensingWatermark, "medicine_dispensing", "Dispensing");
    applyDeltaOrFullSnapshot(STORAGE_KEYS.FORECASTING, forecastRes, forecastWatermark, "forecasting", "Forecasting");
    applyDeltaOrFullSnapshot(STORAGE_KEYS.USERS, usersRes, profilesWatermark, "profiles", "Profiles");
    applyDeltaOrFullSnapshot(STORAGE_KEYS.ACTIVITY_LOGS, activityLogsRes, activityLogsWatermark, "activity_logs", "Activity logs");
    cacheSnapshot(STORAGE_KEYS.NOTIFICATIONS, notificationsRes?.data, "Notifications");
    applyDeltaOrFullSnapshot(STORAGE_KEYS.DEFICIT_AUDITS, deficitAuditsRes, deficitAuditsWatermark, "stock_deficit_audits", "Deficit audits");

    // Cache precompiled dashboard snapshot for instant offline startup
    try {
      const dashboardSnapshot = compileDashboardSnapshot({
        inventory: getSnapshot(STORAGE_KEYS.INVENTORY) || inventoryRes.data || [],
        facilities: getSnapshot(STORAGE_KEYS.FACILITIES) || facilitiesRes.data || [],
        patients: getSnapshot(STORAGE_KEYS.PATIENTS) || patientsRes.data || [],
        requests: getSnapshot(STORAGE_KEYS.REQUESTS) || requestsRes.data || [],
        dispensing: getSnapshot(STORAGE_KEYS.DISPENSING) || dispensingRes?.data || [],
        forecasting: getSnapshot(STORAGE_KEYS.FORECASTING) || forecastRes.data || [],
        users: getSnapshot(STORAGE_KEYS.USERS) || usersRes?.data || [],
      });
      cacheSnapshot(STORAGE_KEYS.DASHBOARD, dashboardSnapshot, "Dashboard");
    } catch (dashSnapErr) {
      console.warn("Failed to compile dashboard snapshot:", dashSnapErr);
    }

    // Save into native SQLite before releasing the sync lock.
    if (isTauriEnvironment()) {
      try {
        await initSqliteSchema();
        if (!isCurrentSession()) {
          updateSyncStatus("IDLE");
          return false;
        }
        const db = await getSqliteDb();

        const purgeTombstones = async (tableName, altName = null) => {
          const ids = [
            ...Array.from(tombstonesByTable.get(tableName) || []),
            ...(altName ? Array.from(tombstonesByTable.get(altName) || []) : []),
          ];
          if (ids.length > 0) {
            await batchDeleteByIds(db, tableName, ids);
          }
        };

        if (facilitiesRes.data) {
          if (!isCurrentSession()) return false;
          if (facilitiesWatermark && facilitiesRes.usedWatermark !== null) {
            await purgeTombstones("facilities");
          } else {
            await db.execute("DELETE FROM facilities");
          }
          if (facilitiesRes.data.length > 0) {
            await batchUpsertSqliteRecords(db, "facilities", facilitiesRes.data);
          }
        }

        if (medicinesRes.data) {
          if (!isCurrentSession()) return false;
          if (medicinesWatermark && medicinesRes.usedWatermark !== null) {
            await purgeTombstones("medicines");
          } else {
            await db.execute("DELETE FROM medicines");
          }
          if (medicinesRes.data.length > 0) {
            await batchUpsertSqliteRecords(db, "medicines", medicinesRes.data);
          }
        }

        if (inventoryRes.data) {
          if (!isCurrentSession()) return false;

          // Preserve existing SQLite inventory metadata (return records, po_number, origin_facility_id, intake_type, etc.)
          let localMetaMap = new Map();
          try {
            const existingRows = await db.select(
              "SELECT id, facility_id, medicine_id, batch_number, po_number, unit_cost, origin_facility_id, intake_type, return_reason, status, brand_name, supplier_name, supplier_address, supplier_contact FROM inventory"
            );
            if (Array.isArray(existingRows)) {
              for (const row of existingRows) {
                if (row.id) localMetaMap.set(row.id, row);
                const bKey = `${row.facility_id || ""}:${row.medicine_id || ""}:${(row.batch_number || "").toUpperCase().trim()}`;
                localMetaMap.set(bKey, row);
              }
            }
          } catch (metaErr) {
            console.warn("[syncManager] Error fetching local inventory metadata:", metaErr);
          }

          if (inventoryWatermark && inventoryRes.usedWatermark !== null) {
            await purgeTombstones("inventory");
          } else {
            await db.execute("DELETE FROM inventory");
          }

          const rawInventory =
            Array.isArray(inventoryRes?.data) && inventoryRes.usedWatermark === null
              ? inventoryRes.data
              : (getSnapshot(STORAGE_KEYS.INVENTORY) || inventoryRes?.data || []);
          const inventorySourceData = rawInventory.filter(
            (inv) =>
              inv?.intake_type !== "RETURN" &&
              !inv?.origin_facility_id &&
              !(typeof inv?.po_number === "string" && inv.po_number.startsWith("RET-"))
          );
          if (inventorySourceData.length > 0) {
            const enrichedRecords = inventorySourceData.map((inv) => {
              const bKey = `${inv.facility_id || ""}:${inv.medicine_id || ""}:${(inv.batch_number || "").toUpperCase().trim()}`;
              const local = (inv.id && localMetaMap.get(inv.id)) || localMetaMap.get(bKey);

              const poNumber = inv.po_number || local?.po_number || null;
              const unitCost = inv.unit_cost ?? local?.unit_cost ?? null;
              const originFacilityId = inv.origin_facility_id || local?.origin_facility_id || null;
              const intakeType =
                inv.intake_type ||
                local?.intake_type ||
                (poNumber && String(poNumber).startsWith("RET-") ? "RETURN" : "PROCUREMENT");
              const returnReason = inv.return_reason || local?.return_reason || null;
              const status = inv.status || local?.status || "ACTIVE";
              const brandName = inv.brand_name || local?.brand_name || inv.medicine?.brand_name || null;
              const supplierName = inv.supplier_name || local?.supplier_name || inv.supplier?.supplier_name || null;
              const supplierAddress = inv.supplier_address || local?.supplier_address || inv.supplier?.address || null;
              const supplierContact = inv.supplier_contact || local?.supplier_contact || inv.supplier?.contact_number || null;

              return {
                ...inv,
                brand_name: brandName,
                supplier_name: supplierName,
                supplier_address: supplierAddress,
                supplier_contact: supplierContact,
                po_number: poNumber,
                unit_cost: unitCost,
                origin_facility_id: originFacilityId,
                intake_type: intakeType,
                return_reason: returnReason,
                status: status,
              };
            });

            await batchUpsertSqliteRecords(db, "inventory", enrichedRecords);
          }
        }

        if (thresholdsRes?.data) {
          if (!isCurrentSession()) return false;
          if (thresholdsWatermark && thresholdsRes.usedWatermark !== null) {
            await purgeTombstones("facility_medicine_thresholds");
          } else {
            await db.execute("DELETE FROM facility_medicine_thresholds");
          }
          if (thresholdsRes.data.length > 0) {
            await batchUpsertSqliteRecords(db, "facility_medicine_thresholds", thresholdsRes.data);
          }
        }

        if (patientsRes.data) {
          if (!isCurrentSession()) return false;
          if (patientsWatermark && patientsRes.usedWatermark !== null) {
            await purgeTombstones("patients");
          } else {
            await db.execute("DELETE FROM patients");
          }
          if (patientsRes.data.length > 0) {
            await batchUpsertSqliteRecords(db, "patients", patientsRes.data);
          }
        }

        if (requestsRes.data) {
          if (!isCurrentSession()) return false;
          if (requestsWatermark && requestsRes.usedWatermark !== null) {
            await purgeTombstones("requests", "medicine_requests");
          } else {
            await db.execute("DELETE FROM requests");
          }
          if (requestsRes.data.length > 0) {
            await batchUpsertSqliteRecords(db, "requests", requestsRes.data);
          }
        }

        if (stockReturnsRes?.data) {
          if (!isCurrentSession()) return false;
          if (stockReturnsWatermark && stockReturnsRes.usedWatermark !== null) {
            await purgeTombstones("stock_returns");
          } else {
            await db.execute("DELETE FROM stock_returns");
          }
          if (stockReturnsRes.data.length > 0) {
            await batchUpsertSqliteRecords(db, "stock_returns", stockReturnsRes.data);
          }
        }

        if (dispensingSummaryRes.data) {
          if (!isCurrentSession()) return false;
          await db.execute("DELETE FROM monthly_dispensing_summary");
          await batchUpsertSqliteRecords(db, "monthly_dispensing_summary", dispensingSummaryRes.data);
        }

        if (dispensingRes?.data) {
          if (!isCurrentSession()) return false;
          if (dispensingWatermark && dispensingRes.usedWatermark !== null) {
            await purgeTombstones("dispensing_records", "medicine_dispensing");
          } else {
            await db.execute("DELETE FROM dispensing_records");
          }
          if (dispensingRes.data.length > 0) {
            await batchUpsertSqliteRecords(db, "dispensing_records", dispensingRes.data);
          }
        }

        if (otherProgramsRes?.data) {
          if (!isCurrentSession()) return false;
          if (otherProgramsWatermark && otherProgramsRes.usedWatermark !== null) {
            await purgeTombstones("other_programs");
          } else {
            await db.execute("DELETE FROM other_programs");
          }
          if (otherProgramsRes.data.length > 0) {
            await batchUpsertSqliteRecords(db, "other_programs", otherProgramsRes.data);
          }
        }

        if (forecastRes?.data) {
          if (!isCurrentSession()) return false;
          if (forecastWatermark && forecastRes.usedWatermark !== null) {
            await purgeTombstones("forecasting");
          } else {
            await db.execute("DELETE FROM forecasting");
          }
          if (forecastRes.data.length > 0) {
            await batchUpsertSqliteRecords(db, "forecasting", forecastRes.data);
          }
        }

        if (usersRes?.data) {
          if (!isCurrentSession()) return false;
          if (profilesWatermark && usersRes.usedWatermark !== null) {
            await purgeTombstones("profiles");
          } else {
            await db.execute("DELETE FROM profiles");
          }
          if (usersRes.data.length > 0) {
            await batchUpsertSqliteRecords(db, "profiles", usersRes.data);
          }
        }

        if (activityLogsRes?.data) {
          if (!isCurrentSession()) return false;
          if (activityLogsWatermark && activityLogsRes.usedWatermark !== null) {
            await purgeTombstones("activity_logs");
          } else {
            await db.execute("DELETE FROM activity_logs");
          }
          if (activityLogsRes.data.length > 0) {
            await batchUpsertSqliteRecords(db, "activity_logs", activityLogsRes.data);
          }
        }

        if (notificationsRes?.data) {
          if (!isCurrentSession()) return false;
          await db.execute("DELETE FROM notifications");
          await batchUpsertSqliteRecords(db, "notifications", notificationsRes.data);
        }

        if (deficitAuditsRes?.data) {
          if (!isCurrentSession()) return false;
          if (deficitAuditsWatermark && deficitAuditsRes.usedWatermark !== null) {
            await purgeTombstones("stock_deficit_audits");
          } else {
            await db.execute("DELETE FROM stock_deficit_audits");
          }
          if (deficitAuditsRes.data.length > 0) {
            await batchUpsertSqliteRecords(db, "stock_deficit_audits", deficitAuditsRes.data);
          }
        }

        // Flush WAL journal pages into main prds.db file
        try {
          await db.execute("PRAGMA wal_checkpoint(TRUNCATE)");
        } catch (cpError) {
          console.warn("SQLite WAL checkpoint warning:", cpError);
        }
      } catch (error) {
        console.warn("SQLite bulk snapshot write error:", error);
        throw error;
      }
    }

    // 3. Update dataset sync watermarks for all successful queries
    const updateWatermarkIfSuccess = async (datasetName, res) => {
      if (res?.data && !res.error) {
        if (res.usedWatermark !== null && res.usedWatermark !== undefined) {
          await setDatasetSyncWatermark(datasetName, syncStartTime, res.data.length, "SUCCESS");
        } else {
          await clearDatasetSyncWatermark(datasetName);
        }
      }
    };

    await Promise.all([
      updateWatermarkIfSuccess("medicines", medicinesRes),
      updateWatermarkIfSuccess("other_programs", otherProgramsRes),
      updateWatermarkIfSuccess("facilities", facilitiesRes),
      updateWatermarkIfSuccess("inventory", inventoryRes),
      updateWatermarkIfSuccess("facility_medicine_thresholds", thresholdsRes),
      updateWatermarkIfSuccess("patients", patientsRes),
      updateWatermarkIfSuccess("medicine_requests", requestsRes),
      updateWatermarkIfSuccess("stock_returns", stockReturnsRes),
      updateWatermarkIfSuccess("medicine_dispensing", dispensingRes),
      updateWatermarkIfSuccess("forecasting", forecastRes),
      updateWatermarkIfSuccess("profiles", usersRes),
      updateWatermarkIfSuccess("activity_logs", activityLogsRes),
      updateWatermarkIfSuccess("stock_deficit_audits", deficitAuditsRes),
    ]);

    const storageError = storageFailures.length
      ? `Could not cache ${storageFailures.join(", ")} for offline use.`
      : "";
    const syncError = [outboxError, snapshotError, storageError].filter(Boolean).join(" ");
    if (syncError) {
      const isOfflineFailure =
        !isCurrentNetworkOnline() ||
        syncError.toLowerCase().includes("timeout") ||
        syncError.toLowerCase().includes("failed to fetch") ||
        syncError.toLowerCase().includes("network");
      if (isOfflineFailure) {
        setNetworkOnlineState(false);
        updateSyncStatus("OFFLINE");
      } else {
        updateSyncStatus("ERROR", syncError);
      }
      return false;
    }

    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("prds:inventory-changed"));
        window.dispatchEvent(new CustomEvent("prds:patients-changed"));
      } catch {}
    }
    updateSyncStatus("SUCCESS");
    return true;
  } catch (err) {
    console.warn("Global sync encountered error:", err);
    const isConnErr =
      !isCurrentNetworkOnline() ||
      err?.message?.toLowerCase().includes("failed to fetch") ||
      err?.message?.toLowerCase().includes("network") ||
      err?.message?.toLowerCase().includes("timeout");
    if (isConnErr) {
      setNetworkOnlineState(false);
      updateSyncStatus("OFFLINE");
    } else {
      updateSyncStatus("ERROR", err?.message || (typeof err === "string" ? err : "") || String(err || ""));
    }
    return false;
  }
}

// Automatically sync when network comes online
let wasNetworkOnline = isCurrentNetworkOnline();

if (typeof window !== "undefined") {
  try {
    subscribeNetworkStatus((isOnline) => {
      if (isOnline && !wasNetworkOnline) {
        console.log("Network online detected, triggering auto-sync...");
        restoreSupabaseSessionIfAvailable().catch(() => {});
        setTimeout(() => {
          syncAllData();
        }, 1200);
      }
      wasNetworkOnline = isOnline;
    });
  } catch {}

  window.addEventListener("online", () => {
    restoreSupabaseSessionIfAvailable().catch(() => {});
    setTimeout(() => {
      syncAllData();
    }, 1500);
  });

  setInterval(async () => {
    if (!isCurrentNetworkOnline() || isSyncing) return;
    try {
      const pendingCount = (await getPendingMutations()).length;
      // Auto-retry if there are pending offline changes OR if the sync status is stuck in ERROR
      if (pendingCount > 0 || syncStatus === "ERROR") {
        syncAllData();
      }
    } catch (err) {
      console.warn("Unable to check for queued changes:", err);
    }
  }, 30000);

  // Non-blocking initial sync on application boot if online
  setTimeout(() => {
    if (isCurrentNetworkOnline()) {
      syncAllData();
    }
  }, 2000);
}
