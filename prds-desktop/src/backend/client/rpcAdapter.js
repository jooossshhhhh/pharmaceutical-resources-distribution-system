/**
 * RPC Execution Adapter
 * Dispatches PL/pgSQL RPC calls to Supabase when online and falls back to the
 * durable offline outbox queue only on genuine connectivity failures.
 */

import { isCurrentNetworkOnline } from "../sync/networkStatus.js";
import { enqueueMutation } from "../sync/outboxQueue.js";
import { isConnectivityError } from "./networkErrorUtils.js";
import { supabase } from "./supabase.js";

/**
 * Executes a Supabase RPC call with automatic offline outbox fallback on connectivity errors.
 */
export async function executeRpcWithFallback(
  functionName,
  params = {},
  { userId = null, facilityId = null, supabaseClient = supabase, isOnlineFn = isCurrentNetworkOnline, enqueueFn = enqueueMutation } = {}
) {
  const isOnline = isOnlineFn();

  if (isOnline) {
    try {
      const { data, error } = await supabaseClient.rpc(functionName, params);
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

  const mutationId = await enqueueFn({
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
}

