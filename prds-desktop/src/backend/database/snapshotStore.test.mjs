import assert from "node:assert/strict";
import test from "node:test";

import {
  clearUserSession,
  getSnapshotRevision,
  saveSnapshot,
  STORAGE_KEYS,
} from "./snapshotStore.js";

test("clearing a user session removes snapshots but preserves the outbox and preferences", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map([
    ...Object.values(STORAGE_KEYS).map((key) => [key, "cached"]),
    ["prds_offline_outbox_queue", "queued mutations"],
    ["prds-titlebar-pinned", "true"],
    ["prds_medicine_catalog_version", "cho-2026-09-20"],
    ["sb-prds-auth-token", "auth token"],
  ]);
  const previousRevision = getSnapshotRevision();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
  };

  try {
    await clearUserSession();

    assert.equal(getSnapshotRevision(), previousRevision + 1);
    for (const key of Object.values(STORAGE_KEYS)) {
      assert.equal(values.has(key), false, `${key} should be cleared`);
    }
    assert.equal(values.get("sb-prds-auth-token"), undefined);
    assert.equal(values.get("prds_offline_outbox_queue"), "queued mutations");
    assert.equal(values.get("prds-titlebar-pinned"), "true");
    assert.equal(values.get("prds_medicine_catalog_version"), "cho-2026-09-20");
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test("snapshot writes are refused after the user session is cleared", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
  };

  try {
    await clearUserSession();
    assert.equal(saveSnapshot(STORAGE_KEYS.PATIENTS, [{ id: "private-row" }]), false);
    assert.equal(values.has(STORAGE_KEYS.PATIENTS), false);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test("first lifecycle upgrade clears legacy shared snapshots but preserves identity and queued work", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map([
    ...Object.values(STORAGE_KEYS).map((key) => [key, "legacy-cache"]),
    ["prds_desktop_user_session", JSON.stringify({ id: "user-1" })],
    ["prds_desktop_user_profile", JSON.stringify({ id: "user-1" })],
    ["prds_medicine_catalog_version", "cho-2026-09-20"],
    ["prds_offline_outbox_queue", "queued mutations"],
    ["prds-titlebar-pinned", "true"],
  ]);
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
  };

  try {
    await import(`./snapshotStore.js?lifecycle-test=${Date.now()}`);
    for (const key of Object.values(STORAGE_KEYS)) {
      if (![STORAGE_KEYS.USER_SESSION, STORAGE_KEYS.USER_PROFILE].includes(key)) {
        assert.equal(values.has(key), false, `${key} should be invalidated once`);
      }
    }
    assert.equal(values.has("prds_desktop_user_session"), true);
    assert.equal(values.has("prds_desktop_user_profile"), true);
    assert.equal(values.get("prds_offline_outbox_queue"), "queued mutations");
    assert.equal(values.get("prds-titlebar-pinned"), "true");
  } finally {
    globalThis.localStorage = previousStorage;
  }
});
