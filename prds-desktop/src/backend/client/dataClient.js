/**
 * Unified PRDS Data Client
 * Transparently bridges Supabase and local SQLite:
 * - Reads from local SQLite when offline (or for instant cached display).
 * - Writes to local SQLite optimistically and dispatches to Supabase or offline outbox queue.
 */

import { isCurrentNetworkOnline } from "../sync/networkStatus";
import { enqueueMutation } from "../sync/outboxQueue";
import { getSqliteDb, isTauriEnvironment } from "../database/sqliteClient";
import { isConnectivityError } from "./networkErrorUtils";
import { supabase } from "./supabase";

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
};
