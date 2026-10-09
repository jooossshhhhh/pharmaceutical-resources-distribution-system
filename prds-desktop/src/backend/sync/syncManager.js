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
  batchInsertOrReplace,
  clearDatasetSyncWatermark,
  getDatasetSyncWatermark,
  getSqliteDb,
  initSqliteSchema,
  isTauriEnvironment,
  setDatasetSyncWatermark,
} from "../database/sqliteClient";
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
  "medicines",
  "facilities",
  "suppliers",
  "other_programs",
  "medicine_requests",
  "medicine_dispensing",
  "forecasting",
  "activity_logs",
]);

export function clearUnsupportedUpdatedAtTables() {
  unsupportedUpdatedAtTables.clear();
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
            await supabase.auth.refreshSession();
          }
        } else {
          // No active in-memory session (e.g. offline passcode login) - restore session using persisted tokens
          await restoreSupabaseSessionIfAvailable();
        }
      } catch (authRefreshErr) {
        console.warn("Proactive auth session check warning during sync:", authRefreshErr);
        try {
          await restoreSupabaseSessionIfAvailable();
        } catch {}
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
      return { ...res, usedWatermark: activeWatermark };
    };

    // Safe optional query helper: treats pending tables (sync_tombstones, stock_deficit_audits) as empty if not migrated
    const safeOptionalFetch = async (queryPromise, timeoutMs = 15000) => {
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
          return { data: [], error: null };
        }
      }
      return res;
    };

    const syncStartTime = new Date().toISOString();

    let medicinesWatermark = null;
    let otherProgramsWatermark = null;
    let facilitiesWatermark = null;
    let suppliersWatermark = null;
    let inventoryWatermark = null;
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
        supWm,
        invWm,
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
        getDatasetSyncWatermark("suppliers"),
        getDatasetSyncWatermark("inventory"),
        getDatasetSyncWatermark("patients"),
        getDatasetSyncWatermark("medicine_requests"),
        getDatasetSyncWatermark("stock_returns"),
        getDatasetSyncWatermark("medicine_dispensing"),
        getDatasetSyncWatermark("forecasting"),
        getDatasetSyncWatermark("profiles"),
        getDatasetSyncWatermark("activity_logs"),
        getDatasetSyncWatermark("stock_deficit_audits"),
      ]);

      medicinesWatermark = getSafeWatermarkWindow(medWm);
      otherProgramsWatermark = getSafeWatermarkWindow(progWm);
      facilitiesWatermark = getSafeWatermarkWindow(facWm);
      suppliersWatermark = getSafeWatermarkWindow(supWm);
      inventoryWatermark = getSafeWatermarkWindow(invWm);
      patientsWatermark = getSafeWatermarkWindow(patWm);
      requestsWatermark = getSafeWatermarkWindow(reqWm);
      stockReturnsWatermark = getSafeWatermarkWindow(retWm);
      dispensingWatermark = getSafeWatermarkWindow(dispWm);
      forecastWatermark = getSafeWatermarkWindow(fcWm);
      profilesWatermark = getSafeWatermarkWindow(profWm);
      activityLogsWatermark = getSafeWatermarkWindow(actWm);
      deficitAuditsWatermark = getSafeWatermarkWindow(defWm);
    }

    const allWatermarks = [
      medicinesWatermark,
      otherProgramsWatermark,
      facilitiesWatermark,
      suppliersWatermark,
      inventoryWatermark,
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
          supabase
            .from("sync_tombstones")
            .select("id, table_name, record_id, deleted_at")
            .gt("deleted_at", minSafeWatermark)
            .order("deleted_at", { ascending: true })
        )
      : Promise.resolve({ data: [], error: null });

    const deficitAuditsPromise = safeOptionalFetch(
      (() => {
        let q = supabase.from("stock_deficit_audits").select("*");
        if (deficitAuditsWatermark) {
          q = q.gt("updated_at", deficitAuditsWatermark);
        }
        return q.order("created_at", { ascending: false });
      })()
    );

    const [
      medicinesRes,
      otherProgramsRes,
      facilitiesRes,
      suppliersRes,
      inventoryRes,
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
            .select("id, generic_name, brand_name, unit_of_measure, dosage, unit_cost, categories");
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
              program_name,
              program_date,
              description,
              medicines:program_medicines(
                id,
                medicine_id,
                quantity_used,
                medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure, unit_cost)
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
      // Suppliers
      safeFetchSingle(
        "suppliers",
        (wm) => {
          let q = supabase
            .from("suppliers")
            .select("id, supplier_name, contact_number, address, status");
          if (wm) {
            q = q.gt("updated_at", wm);
          }
          return q.order("supplier_name", { ascending: true });
        },
        suppliersWatermark
      ),
      // Inventory with relations
      (async () => {
        const fullInventorySelect = `
          id,
          facility_id,
          medicine_id,
          supplier_id,
          quantity,
          threshold,
          batch_number,
          po_number,
          unit_cost,
          date_received,
          expiration_date,
          origin_facility_id,
          intake_type,
          return_reason,
          status,
          medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure, unit_cost),
          facility:facilities!inventory_facility_id_fkey(id, facility_name, facility_code)
        `;
        const baseInventorySelect = `
          id,
          facility_id,
          medicine_id,
          supplier_id,
          quantity,
          threshold,
          batch_number,
          date_received,
          expiration_date,
          medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure, unit_cost),
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
            lot_no,
            medicine_id,
            medicine_name,
            brand_name,
            quantity,
            unit_cost,
            expiration_date,
            reason,
            facility_id,
            status,
            submitted_by_id,
            verified_by_id,
            submitted_at,
            verified_at,
            created_at,
            updated_at,
            facility:facilities!stock_returns_facility_id_fkey(id, facility_name, facility_code)
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
                  medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure),
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
                  batch:inventory!medicine_dispensing_inventory_id_fkey(id, batch_number, expiration_date)
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
                    medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure),
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
                    batch:inventory!medicine_dispensing_inventory_id_fkey(id, batch_number, expiration_date)
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
      suppliersRes,
      inventoryRes,
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
      "Suppliers",
      "Inventory",
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
    applyDeltaOrFullSnapshot(STORAGE_KEYS.SUPPLIERS, suppliersRes, suppliersWatermark, "suppliers", "Suppliers");
    applyDeltaOrFullSnapshot(STORAGE_KEYS.INVENTORY, inventoryRes, inventoryWatermark, "inventory", "Inventory");
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
            const rows = facilitiesRes.data.map((f) => [
              f.id,
              f.facility_name,
              f.facility_code,
              f.facility_type,
              f.status,
              JSON.stringify(f),
            ]);
            await batchInsertOrReplace(
              db,
              "facilities",
              ["id", "facility_name", "facility_code", "facility_type", "status", "data_json"],
              rows
            );
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
            const rows = medicinesRes.data.map((m) => [
              m.id,
              m.generic_name,
              m.brand_name,
              m.dosage,
              m.unit_of_measure,
              m.unit_cost,
              JSON.stringify(m.categories || []),
              JSON.stringify(m),
            ]);
            await batchInsertOrReplace(
              db,
              "medicines",
              ["id", "generic_name", "brand_name", "dosage", "unit_of_measure", "unit_cost", "categories_json", "data_json"],
              rows
            );
          }
        }

        if (suppliersRes.data) {
          if (!isCurrentSession()) return false;
          if (suppliersWatermark && suppliersRes.usedWatermark !== null) {
            await purgeTombstones("suppliers");
          } else {
            await db.execute("DELETE FROM suppliers");
          }
          if (suppliersRes.data.length > 0) {
            const rows = suppliersRes.data.map((s) => [
              s.id,
              s.supplier_name,
              s.status,
              JSON.stringify(s),
            ]);
            await batchInsertOrReplace(
              db,
              "suppliers",
              ["id", "supplier_name", "status", "data_json"],
              rows
            );
          }
        }

        if (inventoryRes.data) {
          if (!isCurrentSession()) return false;

          // Preserve existing SQLite inventory metadata (return records, po_number, origin_facility_id, intake_type, etc.)
          let localMetaMap = new Map();
          try {
            const existingRows = await db.query(
              "SELECT id, facility_id, medicine_id, batch_number, po_number, unit_cost, origin_facility_id, intake_type, return_reason, status FROM inventory"
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

          const rawInventory = getSnapshot(STORAGE_KEYS.INVENTORY) || inventoryRes.data || [];
          const inventorySourceData = rawInventory.filter(
            (inv) =>
              inv?.intake_type !== "RETURN" &&
              !inv?.origin_facility_id &&
              !(typeof inv?.po_number === "string" && inv.po_number.startsWith("RET-"))
          );
          if (inventorySourceData.length > 0) {
            const rows = inventorySourceData.map((inv) => {
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

              const enrichedInv = {
                ...inv,
                po_number: poNumber,
                unit_cost: unitCost,
                origin_facility_id: originFacilityId,
                intake_type: intakeType,
                return_reason: returnReason,
                status: status,
              };

              return [
                inv.id,
                inv.facility_id,
                inv.medicine_id,
                inv.supplier_id,
                inv.quantity,
                inv.threshold,
                inv.batch_number,
                poNumber,
                unitCost,
                inv.date_received,
                inv.expiration_date,
                originFacilityId,
                intakeType,
                returnReason,
                status,
                JSON.stringify(enrichedInv),
              ];
            });

            await batchInsertOrReplace(
              db,
              "inventory",
              [
                "id",
                "facility_id",
                "medicine_id",
                "supplier_id",
                "quantity",
                "threshold",
                "batch_number",
                "po_number",
                "unit_cost",
                "date_received",
                "expiration_date",
                "origin_facility_id",
                "intake_type",
                "return_reason",
                "status",
                "data_json",
              ],
              rows
            );
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
            const rows = patientsRes.data.map((p) => [
              p.id,
              p.facility_id,
              p.first_name,
              p.last_name,
              p.philhealth_id || p.patient_code || "",
              JSON.stringify(p),
            ]);
            await batchInsertOrReplace(
              db,
              "patients",
              ["id", "facility_id", "first_name", "last_name", "philhealth_id", "data_json"],
              rows
            );
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
            const rows = requestsRes.data.map((r) => [
              r.id,
              r.request_number || r.id?.slice(0, 8),
              r.facility_id,
              r.status,
              JSON.stringify(r),
              r.updated_at || r.request_date || new Date().toISOString(),
              1,
            ]);
            await batchInsertOrReplace(
              db,
              "requests",
              ["id", "request_number", "facility_id", "status", "data_json", "updated_at", "is_synced"],
              rows
            );
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
            const returnRows = stockReturnsRes.data.map((r) => [
              r.id,
              r.lot_no,
              r.medicine_id,
              r.medicine_name,
              r.brand_name,
              r.quantity,
              r.unit_cost,
              r.expiration_date,
              r.reason,
              r.facility_id,
              r.status || "PENDING",
              r.submitted_by_id,
              r.verified_by_id,
              r.submitted_at,
              r.verified_at,
              JSON.stringify(r),
              r.created_at || new Date().toISOString(),
              r.updated_at || new Date().toISOString(),
              1,
            ]);
            await batchInsertOrReplace(
              db,
              "stock_returns",
              [
                "id",
                "lot_no",
                "medicine_id",
                "medicine_name",
                "brand_name",
                "quantity",
                "unit_cost",
                "expiration_date",
                "reason",
                "facility_id",
                "status",
                "submitted_by_id",
                "verified_by_id",
                "submitted_at",
                "verified_at",
                "data_json",
                "created_at",
                "updated_at",
                "is_synced",
              ],
              returnRows
            );
          }
        }

        if (dispensingSummaryRes.data) {
          if (!isCurrentSession()) return false;
          await db.execute("DELETE FROM monthly_dispensing_summary");
          const rows = dispensingSummaryRes.data.map((s) => [
            s.facility_id,
            s.medicine_id,
            s.month,
            s.total_dispensed,
          ]);
          await batchInsertOrReplace(
            db,
            "monthly_dispensing_summary",
            ["facility_id", "medicine_id", "month", "total_dispensed"],
            rows
          );
        }

        if (dispensingRes?.data) {
          if (!isCurrentSession()) return false;
          if (dispensingWatermark && dispensingRes.usedWatermark !== null) {
            await purgeTombstones("dispensing_records", "medicine_dispensing");
          } else {
            await db.execute("DELETE FROM dispensing_records");
          }
          if (dispensingRes.data.length > 0) {
            const rows = dispensingRes.data.map((d) => [
              d.id,
              d.facility_id,
              d.patient_id,
              d.dispensed_by,
              JSON.stringify(d),
              d.dispense_date || d.created_at || new Date().toISOString(),
              1,
            ]);
            await batchInsertOrReplace(
              db,
              "dispensing_records",
              ["id", "facility_id", "patient_id", "dispensed_by", "data_json", "created_at", "is_synced"],
              rows
            );
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
            const rows = otherProgramsRes.data.map((op) => [
              op.id,
              op.program_name,
              op.program_date,
              op.description,
              JSON.stringify(op),
            ]);
            await batchInsertOrReplace(
              db,
              "other_programs",
              ["id", "program_name", "program_date", "description", "data_json"],
              rows
            );
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
            const rows = forecastRes.data.map((fc) => [
              fc.id,
              fc.facility_id,
              fc.forecast_month,
              fc.predicted_quantity,
              JSON.stringify(fc),
            ]);
            await batchInsertOrReplace(
              db,
              "forecasting",
              ["id", "facility_id", "forecast_month", "predicted_quantity", "data_json"],
              rows
            );
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
            const rows = usersRes.data.map((pr) => [
              pr.id,
              pr.first_name,
              pr.last_name,
              pr.email,
              pr.phone_number,
              pr.role,
              pr.facility_id,
              pr.status,
              JSON.stringify(pr),
            ]);
            await batchInsertOrReplace(
              db,
              "profiles",
              ["id", "first_name", "last_name", "email", "phone_number", "role", "facility_id", "status", "data_json"],
              rows
            );
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
            const rows = activityLogsRes.data.map((al) => [
              al.id,
              al.user_id,
              al.action,
              al.module,
              al.details,
              al.created_at,
              JSON.stringify(al),
            ]);
            await batchInsertOrReplace(
              db,
              "activity_logs",
              ["id", "user_id", "action", "module", "details", "created_at", "data_json"],
              rows
            );
          }
        }

        if (notificationsRes?.data) {
          if (!isCurrentSession()) return false;
          await db.execute("DELETE FROM notifications");
          const rows = notificationsRes.data.map((n) => [
            n.id,
            n.user_id,
            n.title,
            n.message,
            n.is_read ? 1 : 0,
            n.created_at,
            JSON.stringify(n),
          ]);
          await batchInsertOrReplace(
            db,
            "notifications",
            ["id", "user_id", "title", "message", "is_read", "created_at", "data_json"],
            rows
          );
        }

        if (deficitAuditsRes?.data) {
          if (!isCurrentSession()) return false;
          if (deficitAuditsWatermark && deficitAuditsRes.usedWatermark !== null) {
            await purgeTombstones("stock_deficit_audits");
          } else {
            await db.execute("DELETE FROM stock_deficit_audits");
          }
          if (deficitAuditsRes.data.length > 0) {
            const rows = deficitAuditsRes.data.map((da) => [
              da.id,
              da.dispensing_id,
              da.dispensing_transaction_id,
              da.facility_id,
              da.medicine_id,
              da.inventory_batch_id,
              da.batch_number,
              da.dispensed_by,
              da.dispensed_quantity,
              da.available_at_sync,
              da.deficit_quantity,
              da.status,
              da.reconciliation_action,
              da.reconciled_by,
              da.reconciled_at,
              da.notes,
              da.created_at,
              JSON.stringify(da),
              da.updated_at || da.created_at || new Date().toISOString(),
            ]);
            await batchInsertOrReplace(
              db,
              "stock_deficit_audits",
              [
                "id",
                "dispensing_id",
                "dispensing_transaction_id",
                "facility_id",
                "medicine_id",
                "inventory_batch_id",
                "batch_number",
                "dispensed_by",
                "dispensed_quantity",
                "available_at_sync",
                "deficit_quantity",
                "status",
                "reconciliation_action",
                "reconciled_by",
                "reconciled_at",
                "notes",
                "created_at",
                "data_json",
                "updated_at",
              ],
              rows
            );
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
      updateWatermarkIfSuccess("suppliers", suppliersRes),
      updateWatermarkIfSuccess("inventory", inventoryRes),
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
