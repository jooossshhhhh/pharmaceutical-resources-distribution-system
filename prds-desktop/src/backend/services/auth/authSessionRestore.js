/**
 * Supabase Auth Session Restoration Service
 * Re-activates in-memory Supabase authentication session when transitioning from
 * offline to online mode using credentials stored in terminal passcode accounts,
 * SQLite sync_metadata, or localStorage.
 */

import { supabaseAuth } from "../../client/supabase.js";
import {
  getCachedUserSession,
  getTerminalPasscodeAccount,
  getTerminalPasscodeAccounts,
  saveTerminalPasscodeAccount,
} from "../../database/snapshotStore.js";
import { getSqliteDb, isTauriEnvironment } from "../../database/sqliteClient.js";
import { isCurrentNetworkOnline } from "../../sync/networkStatus.js";

export const restoreSupabaseSessionIfAvailable = async () => {
  try {
    if (!isCurrentNetworkOnline()) {
      return null;
    }

    // 1. Check if Supabase client already has an active valid session
    try {
      const { data: existingData } = await supabaseAuth.auth.getSession();
      const activeSession = existingData?.session;
      if (activeSession?.access_token) {
        const expiresAt = activeSession.expires_at ? activeSession.expires_at * 1000 : 0;
        if (expiresAt && expiresAt - Date.now() > 60000) {
          return activeSession;
        }
        if (activeSession.refresh_token) {
          const { data: refreshed, error: refErr } = await supabaseAuth.auth.refreshSession();
          if (!refErr && refreshed?.session) {
            return refreshed.session;
          }
        }
      }
    } catch (err) {
      console.warn("Supabase active session check warning:", err?.message || err);
    }

    // 2. Identify candidate user and candidate session tokens from local caches
    const cached = getCachedUserSession();
    const cachedUserId = cached?.user?.id || null;
    let candidateSession = null;
    let candidateAccount = null;

    if (cachedUserId) {
      candidateAccount = getTerminalPasscodeAccount(cachedUserId);
      if (candidateAccount?.session?.refresh_token) {
        candidateSession = candidateAccount.session;
      }
    }

      if (!candidateSession?.refresh_token) {
        const allAccounts = getTerminalPasscodeAccounts();
        const matching = allAccounts.find(
          (acc) =>
            (cachedUserId && acc.userId === cachedUserId && acc.session?.refresh_token) ||
            (cached?.profile?.email &&
              acc.email?.toLowerCase() === cached.profile.email.toLowerCase() &&
              acc.session?.refresh_token)
        );
        if (matching?.session?.refresh_token) {
          candidateAccount = matching;
          candidateSession = matching.session;
        } else {
          const fallbackAccount = allAccounts.find((acc) => acc.session?.refresh_token);
          if (fallbackAccount && (!cachedUserId || fallbackAccount.userId === cachedUserId)) {
            candidateAccount = fallbackAccount;
            candidateSession = fallbackAccount.session;
          }
        }
      }

      // Check SQLite sync_metadata for passcode account if in Tauri
      if (!candidateSession?.refresh_token && isTauriEnvironment() && cachedUserId) {
        try {
          const db = await getSqliteDb();
          const rows = await db.select(
            "SELECT value FROM sync_metadata WHERE key = ?",
            [`passcode_${cachedUserId}`]
          );
          if (rows?.[0]?.value) {
            const parsed = JSON.parse(rows[0].value);
            if (parsed?.session?.refresh_token) {
              candidateAccount = parsed;
              candidateSession = parsed.session;
            }
          }
        } catch (e) {
          console.warn("SQLite passcode session recovery warning:", e);
        }
      }

      // Check localStorage for Supabase stored auth token (sb-*-auth-token)
      if (!candidateSession?.refresh_token && typeof localStorage !== "undefined") {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
              const raw = localStorage.getItem(key);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed?.refresh_token) {
                  candidateSession = {
                    access_token: parsed.access_token || "",
                    refresh_token: parsed.refresh_token,
                    expires_at: parsed.expires_at,
                  };
                  break;
                }
              }
            }
          }
        } catch (e) {
          console.warn("localStorage Supabase auth token scan warning:", e);
        }
      }

      // 3. If a candidate session with refresh_token was found, restore it into Supabase Auth
      if (candidateSession?.refresh_token) {
        try {
          const { data: restoredData, error: restoreError } =
            await supabaseAuth.auth.setSession({
              access_token: candidateSession.access_token || "",
              refresh_token: candidateSession.refresh_token,
            });

          if (!restoreError && restoredData?.session) {
            const targetUserId = candidateAccount?.userId || cachedUserId || restoredData.session.user?.id;
            if (targetUserId) {
              const existingAcc = getTerminalPasscodeAccount(targetUserId) || candidateAccount;
              if (existingAcc) {
                saveTerminalPasscodeAccount({
                  user: existingAcc.user || restoredData.session.user,
                  profile: existingAcc.profile,
                  passcodeHash: existingAcc.passcodeHash,
                  session: restoredData.session,
                });
              }
            }
            return restoredData.session;
          } else if (restoreError) {
            console.warn("supabaseAuth.setSession error during restore:", restoreError?.message || restoreError);
          }
        } catch (setErr) {
          console.warn("Supabase session restore attempt failed:", setErr?.message || setErr);
        }
      }

      return null;
    } catch (err) {
      console.warn("restoreSupabaseSessionIfAvailable error:", err);
      return null;
    }
  };
