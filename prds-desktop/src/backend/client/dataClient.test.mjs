import assert from "node:assert/strict";
import test from "node:test";

import {
  batchUpsertSqliteRecords,
  dataClient,
  getRepositoryAdapter,
  hydrateSqliteRow,
  upsertSqliteRecord,
} from "./dataClient.js";
import { executeRpcWithFallback } from "./rpcAdapter.js";
import { getSnapshot, saveUserSession, STORAGE_KEYS } from "../database/snapshotStore.js";

test("upsertLocalRecord validates record existence, id, and known table adapter", async () => {
  assert.equal(await dataClient.upsertLocalRecord("medicines", null), false);
  assert.equal(await dataClient.upsertLocalRecord("medicines", {}), false);
  assert.equal(await dataClient.upsertLocalRecord("non_existent_table", { id: "1" }), false);
});

test("getRepositoryAdapter resolves canonical tables and aliases while rejecting unknown tables", () => {
  const dispAdapter = getRepositoryAdapter("medicine_dispensing");
  assert.equal(dispAdapter?.sqliteTable, "dispensing_records");
  assert.equal(dispAdapter?.supabaseTable, "medicine_dispensing");
  assert.equal(dispAdapter?.snapshotKey, STORAGE_KEYS.DISPENSING);

  const reqAdapter = getRepositoryAdapter("medicine_requests");
  assert.equal(reqAdapter?.sqliteTable, "requests");
  assert.equal(reqAdapter?.supabaseTable, "medicine_requests");
  assert.equal(reqAdapter?.snapshotKey, STORAGE_KEYS.REQUESTS);

  const usersAdapter = getRepositoryAdapter("users");
  assert.equal(usersAdapter?.sqliteTable, "profiles");
  assert.equal(usersAdapter?.supabaseTable, "profiles");

  assert.equal(getRepositoryAdapter("unknown_table; DROP TABLE inventory;"), null);
  assert.equal(getRepositoryAdapter(""), null);
});

test("upsertSqliteRecord and batchUpsertSqliteRecords serialize columns consistently via adapters", async () => {
  const executed = [];
  const mockDb = {
    execute: async (sql, params) => {
      executed.push({ sql, params });
      return { rowsAffected: 1 };
    },
  };

  const stockReturn = {
    id: "ret-1",
    return_id: "RET-20261105-001",
    facility_id: "fac-1",
    source_inventory_id: "inv-1",
    medicine_id: "med-1",
    medicine_name: "Amoxicillin",
    brand_name: "Amoxil",
    dosage: "500mg",
    unit_of_measure: "capsule",
    lot_no: "LOT-01",
    quantity: 25,
    unit_cost: 5.5,
    expiration_date: "2027-05-01",
    reason: "NEAR_EXPIRY",
    status: "PENDING",
    submitted_by_id: "user-1",
    submitted_at: "2026-11-05T00:00:00.000Z",
  };

  const singleOk = await upsertSqliteRecord(mockDb, "stock_returns", stockReturn);
  assert.equal(singleOk, true);
  assert.equal(executed.length, 1);
  assert.match(executed[0].sql, /INSERT OR REPLACE INTO stock_returns/);
  assert.ok(executed[0].sql.includes("dosage, unit_of_measure"));
  assert.equal(executed[0].params[0], "ret-1");
  assert.equal(executed[0].params[7], "500mg");
  assert.equal(executed[0].params[8], "capsule");

  const batchOk = await batchUpsertSqliteRecords(mockDb, "medicine_requests", [
    { id: "req-1", request_number: "REQ-001", facility_id: "fac-1", status: "PENDING" },
    { id: "req-2", request_number: "REQ-002", facility_id: "fac-1", status: "APPROVED" },
  ]);
  assert.equal(batchOk, true);
  assert.equal(executed.length, 2);
  assert.match(executed[1].sql, /INSERT OR REPLACE INTO requests/);
});

test("hydrateSqliteRow unpacks data_json payload cleanly", () => {
  const hydrated = hydrateSqliteRow({
    id: "med-1",
    generic_name: "Lagundi",
    data_json: JSON.stringify({
      id: "med-1",
      generic_name: "Lagundi",
      dosage: "300mg",
      categories: ["Respiratory"],
    }),
  });
  assert.equal(hydrated.id, "med-1");
  assert.equal(hydrated.dosage, "300mg");
  assert.deepEqual(hydrated.categories, ["Respiratory"]);
  assert.equal("data_json" in hydrated, false);
});

test("executeRpcWithFallback returns server validation errors directly and only queues on connectivity errors", async () => {
  let queuedCount = 0;
  const enqueueMock = async () => {
    queuedCount += 1;
    return "mut-1";
  };

  // 1. Server validation error (e.g. 22023 / P0001) should NOT queue offline
  const validationRes = await executeRpcWithFallback(
    "submit_bhw_medicine_request",
    { p_items: [] },
    {
      isOnlineFn: () => true,
      enqueueFn: enqueueMock,
      supabaseClient: {
        rpc: async () => ({
          data: null,
          error: { code: "22023", message: "Add at least one medicine to the request." },
        }),
      },
    }
  );
  assert.equal(validationRes.data, null);
  assert.equal(validationRes.error?.code, "22023");
  assert.equal(queuedCount, 0);

  // 2. Connectivity failure (TypeError: Failed to fetch) SHOULD queue offline
  const offlineRes = await executeRpcWithFallback(
    "submit_bhw_medicine_request",
    { p_items: [{ medicine_id: "med-1", quantity: 10 }] },
    {
      isOnlineFn: () => true,
      enqueueFn: enqueueMock,
      supabaseClient: {
        rpc: async () => {
          throw new TypeError("Failed to fetch");
        },
      },
    }
  );
  assert.equal(offlineRes.isOfflineQueued, true);
  assert.equal(offlineRes.data?.status, "QUEUED_OFFLINE");
  assert.equal(queuedCount, 1);
});

test("upsertLocalRecord adds and updates records in local snapshot cache", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    get length() {
      return values.size;
    },
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
