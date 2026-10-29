import { createClient } from "@supabase/supabase-js";

import { getCachedUserSession } from "../database/snapshotStore.js";
import { isCurrentNetworkOnline } from "../sync/networkStatus.js";
import { createAuthenticatedFetch } from "./supabaseFetchGuard.js";

const env =
  typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env
    : typeof process !== "undefined" && process.env
      ? process.env
      : {};

const supabaseUrl =
  env.VITE_SUPABASE_URL || "https://pcktrkqqwykcmgswkjlj.supabase.co";
const supabaseAnonKey =
  env.VITE_SUPABASE_ANON_KEY || "sb_publishable_9ILbw8Bhh_DEZxRPM6WgUw_XXFvlfUh";

const defaultFetch = (...args) => fetch(...args);

const authAwareFetch = createAuthenticatedFetch({
  fetchImpl: defaultFetch,
  getCachedSession: getCachedUserSession,
  isOnline: isCurrentNetworkOnline,
  restoreSession: async () => {
    const { restoreSupabaseSessionIfAvailable } = await import("../services/auth/authSessionRestore.js");
    return restoreSupabaseSessionIfAvailable();
  },
});

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      flowType: "implicit",
      detectSessionInUrl: true,
      autoRefreshToken: true,
      persistSession: true,
    },
    global: {
      fetch: authAwareFetch,
    },
  }
);

export const supabaseAuth = supabase;
