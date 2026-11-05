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

let inFlightRestorePromise = null;
let isRestoringSession = false;
let lastRestoredSession = null;
let lastRestoredUserId = null;

function withAuthTimeout(promise, ms = 2000) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Auth session operation timed out")), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function isSessionTokenFresh(session, minValidityMs = 60000) {
  if (!session?.access_token) return false;
  const expiresAtMs = session.expires_at ? Number(session.expires_at) * 1000 : 0;
  if (expiresAtMs > 0) {
    return expiresAtMs - Date.now() > minValidityMs;
  }
  return true;
}

async function performSessionRestore() {
  try {
    if (!isCurrentNetworkOnline()) {
      return null;
    }

    // 1. Identify candidate user from local session cache first
    const cached = getCachedUserSession();
    const cachedUserId = cached?.user?.id || null;

    // Fast path: if we already have a verified fresh session in memory for this user, return it immediately
    if (
      lastRestoredSession?.access_token &&
      (!cachedUserId || !lastRestoredUserId || lastRestoredUserId === cachedUserId) &&
      isSessionTokenFresh(lastRestoredSession)
    ) {
      return lastRestoredSession;
    }

    // 2. Gather candidate session tokens from local caches (synchronous/SQLite, no auth lock)
    let candidateSession = null;
    let candidateAccount = null;

    if (cachedUserId) {
      candidateAccount = getTerminalPasscodeAccount(cachedUserId);
      if (candidateAccount?.session?.refresh_token || candidateAccount?.session?.access_token) {
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
          if (parsed?.session?.refresh_token || parsed?.session?.access_token) {
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
              const parsedUserId = parsed?.user?.id || null;
              if (
                (parsed?.refresh_token || parsed?.access_token) &&
                (!cachedUserId || !parsedUserId || parsedUserId === cachedUserId)
              ) {
                candidateSession = {
                  access_token: parsed.access_token || "",
                  refresh_token: parsed.refresh_token || "",
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

    // 3. Check if Supabase client already has an active valid session for the current user
    try {
      const { data: existingData } = await withAuthTimeout(supabaseAuth.auth.getSession(), 2000);
      const activeSession = existingData?.session;
      const activeUserId = activeSession?.user?.id || null;
      const isMatchingUser = !cachedUserId || !activeUserId || activeUserId === cachedUserId;

      if (activeSession?.access_token && isMatchingUser) {
        if (isSessionTokenFresh(activeSession)) {
          lastRestoredSession = activeSession;
          lastRestoredUserId = activeUserId || cachedUserId;
          return activeSession;
        }
        if (activeSession.refresh_token) {
          const { data: refreshed, error: refErr } = await withAuthTimeout(
            supabaseAuth.auth.refreshSession(),
            2500
          );
          if (!refErr && refreshed?.session) {
            lastRestoredSession = refreshed.session;
            lastRestoredUserId = refreshed.session.user?.id || cachedUserId;
            return refreshed.session;
          }
        }
      }
    } catch (err) {
      console.warn("Supabase active session check warning:", err?.message || err);
      if (isSessionTokenFresh(candidateSession)) {
        lastRestoredSession = candidateSession;
        lastRestoredUserId = cachedUserId;
        return candidateSession;
      }
    }

    // 4. If a candidate session with refresh_token was found, restore it into Supabase Auth
    if (candidateSession?.refresh_token) {
      try {
        const { data: restoredData, error: restoreError } = await withAuthTimeout(
          supabaseAuth.auth.setSession({
            access_token: candidateSession.access_token || "",
            refresh_token: candidateSession.refresh_token,
          }),
          2500
        );

        if (!restoreError && restoredData?.session) {
          const targetUserId =
            candidateAccount?.userId || cachedUserId || restoredData.session.user?.id;
          lastRestoredSession = restoredData.session;
          lastRestoredUserId = targetUserId || null;
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

    if (isSessionTokenFresh(candidateSession)) {
      lastRestoredSession = candidateSession;
      lastRestoredUserId = cachedUserId;
      return candidateSession;
    }

    return null;
  } catch (err) {
    console.warn("restoreSupabaseSessionIfAvailable error:", err);
    return null;
  }
}

export const restoreSupabaseSessionIfAvailable = async () => {
  // Re-entrancy guard: if called from inside onAuthStateChange while setSession/refreshSession is active
  if (isRestoringSession) {
    if (lastRestoredSession?.access_token) {
      return lastRestoredSession;
    }
    const cached = getCachedUserSession();
    const cachedUserId = cached?.user?.id || null;
    if (cachedUserId) {
      const acc = getTerminalPasscodeAccount(cachedUserId);
      if (acc?.session?.access_token) {
        return acc.session;
      }
    }
    return null;
  }

  if (inFlightRestorePromise) {
    return inFlightRestorePromise;
  }

  isRestoringSession = true;
  inFlightRestorePromise = performSessionRestore().finally(() => {
    isRestoringSession = false;
    inFlightRestorePromise = null;
  });

  return inFlightRestorePromise;
};
