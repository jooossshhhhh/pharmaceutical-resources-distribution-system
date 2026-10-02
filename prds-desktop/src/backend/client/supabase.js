import { createClient } from "@supabase/supabase-js";

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

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      flowType: "pkce",
    },
  }
);

export const supabaseAuth = supabase;
