/**
 * PRDS Unified Background Sync Manager
 * Automatically synchronizes all database snapshots to local storage & SQLite
 * and flushes offline outbox mutations when internet connection is active.
 */

import { supabase } from "../client/supabase";
import { isCurrentNetworkOnline } from "./networkStatus";
import { saveSnapshot, STORAGE_KEYS } from "../database/snapshotStore";
import { getSqliteDb, initSqliteSchema, isTauriEnvironment } from "../database/sqliteClient";
import { getFailedMutationCount, processOutboxQueue } from "./outboxQueue";
import { getSnapshotFailureMessage } from "./syncUtils";

let isSyncing = false;
let syncStatus = "IDLE"; // "IDLE" | "SYNCING" | "SUCCESS" | "ERROR" | "OFFLINE"
let syncErrorMessage = "";
let lastSyncTime = localStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIME) || null;
const statusListeners = new Set();

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

export async function syncAllData() {
  if (isSyncing) {
    return false;
  }

  if (!isCurrentNetworkOnline()) {
    updateSyncStatus("OFFLINE");
    return false;
  }

  try {
    updateSyncStatus("SYNCING");
    let outboxError = "";

    // 1. Process pending offline mutations first
    try {
      await processOutboxQueue();
    } catch (err) {
      console.warn("Outbox processing error during sync:", err);
      outboxError = err?.message || "Unable to process queued changes.";
    }

    const failedMutationCount = await getFailedMutationCount();
    if (failedMutationCount > 0) {
      outboxError = `${failedMutationCount} local change${failedMutationCount === 1 ? "" : "s"} could not be synced.`;
    }

    // 2. Fetch fresh snapshots concurrently with timeout guards
    const fetchWithTimeout = async (promise, timeoutMs = 7000) => {
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

    const [
      medicinesRes,
      facilitiesRes,
      suppliersRes,
      inventoryRes,
      patientsRes,
      requestsRes,
      transfersRes,
      dispensingSummaryRes,
      dispensingRes,
      forecastRes,
      usersRes,
      activityLogsRes,
      notificationsRes,
    ] = await Promise.all([
      // Medicines
      fetchWithTimeout(
        supabase
          .from("medicines")
          .select("id, generic_name, brand_name, unit_of_measure, dosage, unit_cost, categories")
          .order("generic_name", { ascending: true })
      ),
      // Facilities
      fetchWithTimeout(
        supabase
          .from("facilities")
          .select("id, facility_name, facility_code, facility_type, address, status, latitude, longitude")
          .order("facility_name", { ascending: true })
      ),
      // Suppliers
      fetchWithTimeout(
        supabase
          .from("suppliers")
          .select("id, supplier_name, contact_person, phone_number, email, address, status")
          .order("supplier_name", { ascending: true })
      ),
      // Inventory with relations
      fetchWithTimeout(
        supabase.from("inventory").select(`
          id,
          facility_id,
          medicine_id,
          supplier_id,
          quantity,
          threshold,
          batch_number,
          date_received,
          expiration_date,
          medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure),
          facility:facilities(id, facility_name, facility_code)
        `)
      ),
      // Patients
      fetchWithTimeout(
        supabase
          .from("patients")
          .select("id, facility_id, first_name, middle_name, last_name, suffix, date_of_birth, gender, contact_number, address, philhealth_id, pwd_id, senior_citizen_id, remarks, created_at, facility:facilities(id, facility_name, facility_code)")
          .order("last_name", { ascending: true })
      ),
      // Requests
      fetchWithTimeout(
        supabase
          .from("medicine_requests")
          .select(`
            id,
            request_number,
            facility_id,
            requested_by,
            status,
            request_date,
            priority,
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
          .limit(100)
      ),
      // Transfers
      fetchWithTimeout(
        supabase
          .from("stock_transfers")
          .select(`
            id,
            transfer_number,
            source_facility_id,
            target_facility_id,
            status,
            transfer_date,
            reason,
            source_facility:facilities!stock_transfers_source_facility_id_fkey(facility_name),
            target_facility:facilities!stock_transfers_target_facility_id_fkey(facility_name),
            items:stock_transfer_items(
              id,
              medicine_id,
              quantity,
              medicine:medicines(generic_name, dosage)
            )
          `)
          .order("transfer_date", { ascending: false })
          .limit(100)
      ),
      // Dispensing Summary
      fetchWithTimeout(
        supabase
          .from("monthly_dispensing_summary")
          .select("facility_id, medicine_id, month, total_dispensed")
      ),
      // Recent Dispensing records
      fetchWithTimeout(
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
          .limit(150)
      ),
      // Forecasting
      fetchWithTimeout(
        supabase
          .from("forecasting")
          .select("id, predicted_quantity, forecast_month, facility_id")
          .order("forecast_month", { ascending: false })
          .limit(48)
      ),
      // Users / Profiles for User Management
      fetchWithTimeout(
        supabase
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
          `)
          .order("created_at", { ascending: false })
      ),
      // Activity Logs
      fetchWithTimeout(
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
          .limit(100)
      ),
      // Notifications
      fetchWithTimeout(
        supabase.rpc("get_visible_notifications")
      ),
    ]);

    const snapshotError = getSnapshotFailureMessage([
      medicinesRes,
      facilitiesRes,
      suppliersRes,
      inventoryRes,
      patientsRes,
      requestsRes,
      transfersRes,
      dispensingSummaryRes,
      dispensingRes,
      forecastRes,
      usersRes,
      activityLogsRes,
      notificationsRes,
    ]);

    // Save results into snapshot store if valid
    if (medicinesRes.data) saveSnapshot(STORAGE_KEYS.MEDICINES, medicinesRes.data);
    if (facilitiesRes.data) saveSnapshot(STORAGE_KEYS.FACILITIES, facilitiesRes.data);
    if (suppliersRes.data) saveSnapshot(STORAGE_KEYS.SUPPLIERS, suppliersRes.data);
    if (inventoryRes.data) saveSnapshot(STORAGE_KEYS.INVENTORY, inventoryRes.data);
    if (patientsRes.data) saveSnapshot(STORAGE_KEYS.PATIENTS, patientsRes.data);
    if (requestsRes.data) saveSnapshot(STORAGE_KEYS.REQUESTS, requestsRes.data);
    if (transfersRes.data) saveSnapshot(STORAGE_KEYS.TRANSFERS, transfersRes.data);
    if (dispensingSummaryRes.data) saveSnapshot(STORAGE_KEYS.DISPENSING_SUMMARY, dispensingSummaryRes.data);
    if (dispensingRes?.data) saveSnapshot(STORAGE_KEYS.DISPENSING, dispensingRes.data);
    if (forecastRes.data) saveSnapshot(STORAGE_KEYS.FORECASTING, forecastRes.data);
    if (usersRes?.data) saveSnapshot(STORAGE_KEYS.USERS, usersRes.data);
    if (activityLogsRes?.data) saveSnapshot(STORAGE_KEYS.ACTIVITY_LOGS, activityLogsRes.data);
    if (notificationsRes?.data) saveSnapshot(STORAGE_KEYS.NOTIFICATIONS, notificationsRes.data);

    // Save into native SQLite before releasing the sync lock.
    if (isTauriEnvironment()) {
      try {
        await initSqliteSchema();
        const db = await getSqliteDb();
        if (facilitiesRes.data) {
          for (const f of facilitiesRes.data) {
            await db.execute(
              "INSERT OR REPLACE INTO facilities (id, facility_name, facility_code, facility_type, status, data_json) VALUES (?, ?, ?, ?, ?, ?)",
              [f.id, f.facility_name, f.facility_code, f.facility_type, f.status, JSON.stringify(f)]
            );
          }
        }
        if (medicinesRes.data) {
          await db.execute("DELETE FROM medicines");
          for (const m of medicinesRes.data) {
            await db.execute(
              "INSERT OR REPLACE INTO medicines (id, generic_name, brand_name, dosage, unit_of_measure, unit_cost, categories_json, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              [m.id, m.generic_name, m.brand_name, m.dosage, m.unit_of_measure, m.unit_cost, JSON.stringify(m.categories || []), JSON.stringify(m)]
            );
          }
        }
        if (inventoryRes.data) {
          await db.execute("DELETE FROM inventory");
          for (const inv of inventoryRes.data) {
            await db.execute(
              "INSERT OR REPLACE INTO inventory (id, facility_id, medicine_id, supplier_id, quantity, threshold, batch_number, date_received, expiration_date, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [inv.id, inv.facility_id, inv.medicine_id, inv.supplier_id, inv.quantity, inv.threshold, inv.batch_number, inv.date_received, inv.expiration_date, JSON.stringify(inv)]
            );
          }
        }
      } catch (error) {
        console.warn("SQLite bulk snapshot write error:", error);
        throw error;
      }
    }

    const syncError = [outboxError, snapshotError].filter(Boolean).join(" ");
    if (syncError) {
      updateSyncStatus("ERROR", syncError);
      return false;
    }

    updateSyncStatus("SUCCESS");
    return true;
  } catch (err) {
    console.warn("Global sync encountered error:", err);
    updateSyncStatus("ERROR");
    return false;
  }
}

// Automatically sync when network comes online
let wasNetworkOnline = isCurrentNetworkOnline();

if (typeof window !== "undefined") {
  import("./networkStatus").then(({ subscribeNetworkStatus }) => {
    subscribeNetworkStatus((isOnline) => {
      if (isOnline && !wasNetworkOnline) {
        console.log("Network online detected, triggering auto-sync...");
        setTimeout(() => {
          syncAllData();
        }, 1200);
      }
      wasNetworkOnline = isOnline;
    });
  }).catch(() => {});

  window.addEventListener("online", () => {
    setTimeout(() => {
      syncAllData();
    }, 1500);
  });

  // Non-blocking initial sync on application boot if online
  setTimeout(() => {
    if (isCurrentNetworkOnline()) {
      syncAllData();
    }
  }, 2000);
}
