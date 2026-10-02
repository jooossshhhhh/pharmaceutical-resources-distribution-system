/**
 * Unified PRDS Data Client
 * Transparently bridges Supabase and local SQLite:
 * - Reads from local SQLite when offline (or for instant cached display).
 * - Writes to local SQLite optimistically and dispatches to Supabase or offline outbox queue.
 */

import { isCurrentNetworkOnline } from "../sync/networkStatus.js";
import { enqueueMutation } from "../sync/outboxQueue.js";
import { getSqliteDb, isTauriEnvironment } from "../database/sqliteClient.js";
import { getSnapshot, saveSnapshot, STORAGE_KEYS } from "../database/snapshotStore.js";
import { isConnectivityError } from "./networkErrorUtils.js";
import { supabase } from "./supabase.js";

export const dataClient = {
  /**
   * Execute an RPC call (e.g. dispense_walk_in, submit_bhw_medicine_request)
   */
  async rpc(functionName, params = {}, { userId = null, facilityId = null } = {}) {
    const isOnline = isCurrentNetworkOnline();

    if (isOnline) {
      try {
        const { data, error } = await supabase.rpc(functionName, params);
        if (error) {
          if (!isConnectivityError(error)) {
            return { data: null, error };
          }
        } else {
          return { data, error: null };
        }
      } catch (err) {
        if (!isConnectivityError(err)) {
          return { data: null, error: err };
        }

        console.warn(`Online RPC ${functionName} failed, falling back to offline outbox:`, err);
      }
    }

    // Offline mode: Enqueue to outbox queue
    const mutationId = await enqueueMutation({
      userId,
      facilityId,
      mutationType: "RPC",
      target: functionName,
      payload: params,
    });

    return {
      data: { status: "QUEUED_OFFLINE", mutationId },
      error: null,
      isOfflineQueued: true,
    };
  },

  /**
   * Query records from local SQLite (or Supabase fallback)
   */
  async getTable(tableName, query = {}) {
    const isOnline = isCurrentNetworkOnline();

    // In desktop environment, local SQLite provides instantaneous read access
    if (isTauriEnvironment()) {
      try {
        const db = await getSqliteDb();
        const rows = await db.select(`SELECT * FROM ${tableName}`);
        if (rows && rows.length > 0) {
          return { data: rows, error: null };
        }
      } catch (err) {
        console.warn(`Local SQLite query on ${tableName} failed:`, err);
      }
    }

    // If online, fallback to Supabase query
    if (isOnline) {
      const { data, error } = await supabase.from(tableName).select("*");
      return { data, error };
    }

    return { data: [], error: null };
  },

  /**
   * Optimistically upsert a record into local SQLite and update the snapshot cache.
   * Ensures instant local mirroring whenever data is created or modified.
   */
  async upsertLocalRecord(tableName, record) {
    if (!record || !record.id) return false;

    // 1. Update SQLite if in Tauri desktop environment
    if (isTauriEnvironment()) {
      try {
        const db = await getSqliteDb();
        const jsonStr = JSON.stringify(record);

        switch (tableName) {
          case "facilities":
            await db.execute(
              "INSERT OR REPLACE INTO facilities (id, facility_name, facility_code, facility_type, status, data_json) VALUES (?, ?, ?, ?, ?, ?)",
              [record.id, record.facility_name, record.facility_code, record.facility_type, record.status, jsonStr]
            );
            break;
          case "medicines":
            await db.execute(
              "INSERT OR REPLACE INTO medicines (id, generic_name, brand_name, dosage, unit_of_measure, unit_cost, categories_json, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              [record.id, record.generic_name, record.brand_name, record.dosage, record.unit_of_measure, record.unit_cost, JSON.stringify(record.categories || []), jsonStr]
            );
            break;
          case "suppliers":
            await db.execute(
              "INSERT OR REPLACE INTO suppliers (id, supplier_name, status, data_json) VALUES (?, ?, ?, ?)",
              [record.id, record.supplier_name, record.status, jsonStr]
            );
            break;
          case "inventory":
            await db.execute(
              "INSERT OR REPLACE INTO inventory (id, facility_id, medicine_id, supplier_id, quantity, threshold, batch_number, date_received, expiration_date, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [record.id, record.facility_id, record.medicine_id, record.supplier_id, record.quantity, record.threshold, record.batch_number, record.date_received, record.expiration_date, jsonStr]
            );
            break;
          case "patients":
            await db.execute(
              "INSERT OR REPLACE INTO patients (id, facility_id, first_name, last_name, philhealth_id, data_json) VALUES (?, ?, ?, ?, ?, ?)",
              [record.id, record.facility_id, record.first_name, record.last_name, record.philhealth_id || record.patient_code || "", jsonStr]
            );
            break;
          case "dispensing_records":
          case "medicine_dispensing":
            await db.execute(
              "INSERT OR REPLACE INTO dispensing_records (id, facility_id, patient_id, dispensed_by, data_json, created_at, is_synced) VALUES (?, ?, ?, ?, ?, ?, ?)",
              [record.id, record.facility_id, record.patient_id, record.dispensed_by, jsonStr, record.dispense_date || record.created_at || new Date().toISOString(), record.is_synced ?? 1]
            );
            break;
          case "requests":
          case "medicine_requests":
            await db.execute(
              "INSERT OR REPLACE INTO requests (id, request_number, facility_id, status, data_json, updated_at, is_synced) VALUES (?, ?, ?, ?, ?, ?, ?)",
              [record.id, record.request_number || record.id?.slice(0, 8), record.facility_id, record.status, jsonStr, record.updated_at || record.request_date || new Date().toISOString(), record.is_synced ?? 1]
            );
            break;
          case "transfers":
          case "stock_transfers":
            await db.execute(
              "INSERT OR REPLACE INTO transfers (id, transfer_number, source_facility_id, target_facility_id, status, data_json, updated_at, is_synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              [record.id, record.transfer_number || record.id?.slice(0, 8), record.source_facility_id, record.destination_facility_id || record.target_facility_id, record.status, jsonStr, record.updated_at || record.transfer_date || new Date().toISOString(), record.is_synced ?? 1]
            );
            break;
          case "other_programs":
            await db.execute(
              "INSERT OR REPLACE INTO other_programs (id, program_name, program_date, description, data_json) VALUES (?, ?, ?, ?, ?)",
              [record.id, record.program_name, record.program_date, record.description, jsonStr]
            );
            break;
          case "forecasting":
            await db.execute(
              "INSERT OR REPLACE INTO forecasting (id, facility_id, forecast_month, predicted_quantity, data_json) VALUES (?, ?, ?, ?, ?)",
              [record.id, record.facility_id, record.forecast_month, record.predicted_quantity, jsonStr]
            );
            break;
          case "profiles":
            await db.execute(
              "INSERT OR REPLACE INTO profiles (id, first_name, last_name, email, phone_number, role, facility_id, status, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [record.id, record.first_name, record.last_name, record.email, record.phone_number, record.role, record.facility_id, record.status, jsonStr]
            );
            break;
          case "activity_logs":
            await db.execute(
              "INSERT OR REPLACE INTO activity_logs (id, user_id, action, module, details, created_at, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
              [record.id, record.user_id, record.action, record.module, record.details, record.created_at, jsonStr]
            );
            break;
          case "notifications":
            await db.execute(
              "INSERT OR REPLACE INTO notifications (id, user_id, title, message, is_read, created_at, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
              [record.id, record.user_id, record.title, record.message, record.is_read ? 1 : 0, record.created_at, jsonStr]
            );
            break;
          default:
            break;
        }
      } catch (err) {
        console.warn(`Local SQLite upsert on ${tableName} failed:`, err);
      }
    }

    // 2. Also update corresponding localStorage snapshot
    const tableToSnapshotKey = {
      facilities: STORAGE_KEYS.FACILITIES,
      medicines: STORAGE_KEYS.MEDICINES,
      suppliers: STORAGE_KEYS.SUPPLIERS,
      inventory: STORAGE_KEYS.INVENTORY,
      patients: STORAGE_KEYS.PATIENTS,
      dispensing_records: STORAGE_KEYS.DISPENSING,
      medicine_dispensing: STORAGE_KEYS.DISPENSING,
      requests: STORAGE_KEYS.REQUESTS,
      medicine_requests: STORAGE_KEYS.REQUESTS,
      transfers: STORAGE_KEYS.TRANSFERS,
      stock_transfers: STORAGE_KEYS.TRANSFERS,
      other_programs: STORAGE_KEYS.OTHER_PROGRAMS,
      forecasting: STORAGE_KEYS.FORECASTING,
      profiles: STORAGE_KEYS.USERS,
      activity_logs: STORAGE_KEYS.ACTIVITY_LOGS,
      notifications: STORAGE_KEYS.NOTIFICATIONS,
    };

    const snapshotKey = tableToSnapshotKey[tableName];
    if (snapshotKey) {
      try {
        const currentList = getSnapshot(snapshotKey, []);
        const idx = currentList.findIndex((item) => item.id === record.id);
        let updatedList;
        if (idx >= 0) {
          updatedList = [...currentList];
          updatedList[idx] = { ...updatedList[idx], ...record };
        } else {
          updatedList = [record, ...currentList];
        }
        saveSnapshot(snapshotKey, updatedList);
      } catch (err) {
        console.warn(`Snapshot update for ${snapshotKey} failed:`, err);
      }
    }

    return true;
  },
};
