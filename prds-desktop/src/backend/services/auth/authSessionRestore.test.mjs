import assert from "node:assert/strict";
import test from "node:test";
import { restoreSupabaseSessionIfAvailable } from "./authSessionRestore.js";
import { setNetworkOnlineState } from "../../sync/networkStatus.js";
import { supabaseAuth } from "../../client/supabase.js";

test("restoreSupabaseSessionIfAvailable returns null when network is offline", async () => {
  setNetworkOnlineState(false);
  try {
    const session = await restoreSupabaseSessionIfAvailable();
    assert.equal(session, null);
  } finally {
    setNetworkOnlineState(true);
  }
});

test("restoreSupabaseSessionIfAvailable recovers session from terminal passcode account when online", async () => {
  setNetworkOnlineState(true);
  const originalStorage = globalThis.localStorage;
  const stored = new Map();

  const mockUser = { id: "user-offline-1", email: "nurse@example.com" };
  const mockAccount = {
    userId: "user-offline-1",
    email: "nurse@example.com",
    passcodeHash: "hash123",
    session: {
      access_token: "old-stale-token",
      refresh_token: "valid-offline-refresh-token",
      expires_at: 1000,
    },
    user: mockUser,
  };

  stored.set("prds_desktop_user_session", JSON.stringify(mockUser));
  stored.set("prds_terminal_passcodes", JSON.stringify([mockAccount]));

  let setSessionCalledWith = null;
  const originalGetSession = supabaseAuth.auth.getSession;
  const originalSetSession = supabaseAuth.auth.setSession;

  try {
    globalThis.localStorage = {
      getItem: (key) => stored.get(key) || null,
      setItem: (key, value) => stored.set(key, value),
      removeItem: (key) => stored.delete(key),
      get length() { return stored.size; },
      key: (index) => [...stored.keys()][index] || null,
    };

    // Mock supabase auth: no current session in memory
    supabaseAuth.auth.getSession = async () => ({ data: { session: null }, error: null });
    supabaseAuth.auth.setSession = async (creds) => {
      setSessionCalledWith = creds;
      return {
        data: {
          session: {
            access_token: "fresh-new-jwt",
            refresh_token: "new-refresh-token-456",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: mockUser,
          },
        },
        error: null,
      };
    };

    const session = await restoreSupabaseSessionIfAvailable();
    assert.ok(session);
    assert.equal(session.access_token, "fresh-new-jwt");
    assert.deepEqual(setSessionCalledWith, {
      access_token: "old-stale-token",
      refresh_token: "valid-offline-refresh-token",
    });

    // Check that terminal account was updated with the fresh session
    const updatedAccounts = JSON.parse(stored.get("prds_terminal_passcodes"));
    assert.equal(updatedAccounts[0].session.access_token, "fresh-new-jwt");
    assert.equal(updatedAccounts[0].session.refresh_token, "new-refresh-token-456");
  } finally {
    globalThis.localStorage = originalStorage;
    supabaseAuth.auth.getSession = originalGetSession;
    supabaseAuth.auth.setSession = originalSetSession;
  }
});
