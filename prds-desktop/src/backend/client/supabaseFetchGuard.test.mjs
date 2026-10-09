import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_SESSION_REQUIRED_MESSAGE,
  createAuthenticatedFetch,
  shouldRestoreSessionForRequest,
} from "./supabaseFetchGuard.js";

test("shouldRestoreSessionForRequest protects Supabase data API requests only", () => {
  assert.equal(
    shouldRestoreSessionForRequest("https://example.supabase.co/rest/v1/inventory?select=*"),
    true
  );
  assert.equal(
    shouldRestoreSessionForRequest("https://example.supabase.co/rest/v1/rpc/get_visible_notifications"),
    true
  );
  assert.equal(
    shouldRestoreSessionForRequest("https://example.supabase.co/auth/v1/token?grant_type=refresh_token"),
    false
  );
  assert.equal(shouldRestoreSessionForRequest("https://api.example.test/rest/v1/inventory"), false);
});

test("createAuthenticatedFetch restores cached user session before protected request", async () => {
  let restoreCalls = 0;
  let fetchCalls = 0;
  const guardedFetch = createAuthenticatedFetch({
    fetchImpl: async (input) => {
      fetchCalls += 1;
      return { ok: true, url: String(input) };
    },
    restoreSession: async () => {
      restoreCalls += 1;
      return { access_token: "fresh-token" };
    },
    getCachedSession: () => ({ user: { id: "user-1" }, profile: { id: "user-1" } }),
    isOnline: () => true,
  });

  const result = await guardedFetch("https://example.supabase.co/rest/v1/inventory?select=*");

  assert.equal(result.ok, true);
  assert.equal(restoreCalls, 1);
  assert.equal(fetchCalls, 1);
});

test("createAuthenticatedFetch does not restore auth endpoint requests", async () => {
  let restoreCalls = 0;
  const guardedFetch = createAuthenticatedFetch({
    fetchImpl: async () => ({ ok: true }),
    restoreSession: async () => {
      restoreCalls += 1;
      return { access_token: "fresh-token" };
    },
    getCachedSession: () => ({ user: { id: "user-1" } }),
    isOnline: () => true,
  });

  await guardedFetch("https://example.supabase.co/auth/v1/token");

  assert.equal(restoreCalls, 0);
});

test("createAuthenticatedFetch throws clear session error when cached user cannot be restored", async () => {
  const guardedFetch = createAuthenticatedFetch({
    fetchImpl: async () => {
      throw new Error("fetch should not run without a restored session");
    },
    restoreSession: async () => null,
    getCachedSession: () => ({ user: { id: "user-1" } }),
    isOnline: () => true,
  });

  await assert.rejects(
    guardedFetch("https://example.supabase.co/rest/v1/inventory?select=*"),
    (error) => {
      assert.equal(error.code, "AUTH_SESSION_REQUIRED");
      assert.equal(error.message, AUTH_SESSION_REQUIRED_MESSAGE);
      return true;
    }
  );
});
