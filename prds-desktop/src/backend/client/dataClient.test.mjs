import assert from "node:assert/strict";
import test from "node:test";

import { dataClient } from "./dataClient.js";
import { getSnapshot, saveSnapshot, saveUserSession, STORAGE_KEYS } from "../database/snapshotStore.js";

test("upsertLocalRecord validates record existence and id", async () => {
  assert.equal(await dataClient.upsertLocalRecord("medicines", null), false);
  assert.equal(await dataClient.upsertLocalRecord("medicines", {}), false);
});

test("upsertLocalRecord adds and updates records in local snapshot cache", async () => {
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
    saveUserSession({ id: "test-user-1" }, { id: "test-user-1" });

    // Initial upsert (insert)
    const record1 = { id: "med-1", generic_name: "Amoxicillin", brand_name: "Amoxil" };
    const result1 = await dataClient.upsertLocalRecord("medicines", record1);
    assert.equal(result1, true);

    const snapshotAfterInsert = getSnapshot(STORAGE_KEYS.MEDICINES, []);
    assert.equal(snapshotAfterInsert.length, 1);
    assert.equal(snapshotAfterInsert[0].generic_name, "Amoxicillin");

    // Second upsert (update existing)
    const record1Updated = { id: "med-1", generic_name: "Amoxicillin Trihydrate", brand_name: "Amoxil" };
    const result2 = await dataClient.upsertLocalRecord("medicines", record1Updated);
    assert.equal(result2, true);

    const snapshotAfterUpdate = getSnapshot(STORAGE_KEYS.MEDICINES, []);
    assert.equal(snapshotAfterUpdate.length, 1);
    assert.equal(snapshotAfterUpdate[0].generic_name, "Amoxicillin Trihydrate");

    // Third upsert (insert new item)
    const record2 = { id: "med-2", generic_name: "Paracetamol", brand_name: "Biogesic" };
    await dataClient.upsertLocalRecord("medicines", record2);

    const snapshotAfterSecondInsert = getSnapshot(STORAGE_KEYS.MEDICINES, []);
    assert.equal(snapshotAfterSecondInsert.length, 2);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});
