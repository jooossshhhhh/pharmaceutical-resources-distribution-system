import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("patient snapshot uses the database date_of_birth column", async () => {
  const source = await readFile(new URL("./syncManager.js", import.meta.url), "utf8");

  assert.match(source, /suffix, date_of_birth, gender/);
  assert.doesNotMatch(source, /suffix, birth_date, gender/);
});

test("dispensing snapshot keeps the actual facility and dispenser", async () => {
  const source = await readFile(new URL("./syncManager.js", import.meta.url), "utf8");

  assert.match(source, /dispenser:profiles!medicine_dispensing_dispensed_by_fkey/);
  assert.match(source, /dispensing_facility:facilities!medicine_dispensing_facility_id_fkey/);
  assert.match(source, /referred_facility:facilities!medicine_dispensing_referred_facility_id_fkey/);
});

test("history snapshots paginate without fixed row caps", async () => {
  const source = await readFile(new URL("./syncManager.js", import.meta.url), "utf8");
  const historySources = [
    'from("medicine_requests")',
    'from("stock_transfers")',
    'from("medicine_dispensing")',
    'from("forecasting")',
    'from("activity_logs")',
  ];

  for (const table of historySources) {
    const start = source.indexOf(table);
    const end = source.indexOf("// ", start + table.length);
    const query = source.slice(start, end === -1 ? undefined : end);
    assert.ok(query.includes(".order(\"id\""), `${table} should have a stable tie-breaker`);
    assert.ok(!query.includes(".limit("), `${table} should not have a hard row cap`);
  }
  assert.equal((source.match(/fetchAllRows\(\(\) =>/g) || []).length, 5);
});

test("sync reports remaining pending work and retries terminal failures only on manual sync", async () => {
  const source = await readFile(new URL("./syncManager.js", import.meta.url), "utf8");
  const badge = await readFile(new URL("../../frontend/components/common/SyncStatusBadge.jsx", import.meta.url), "utf8");

  assert.match(source, /getPendingMutations/);
  assert.match(source, /still waiting to sync/);
  assert.match(source, /retryFailedMutations/);
  assert.match(source, /setInterval/);
  assert.match(badge, /syncAllData\(\{ retryFailed: true \}\)/);
});

test("sync requires a cached owner and rejects results after a session change", async () => {
  const source = await readFile(new URL("./syncManager.js", import.meta.url), "utf8");

  assert.match(source, /const syncUserId = getCachedUserSession\(\)\.user\?\.id/);
  assert.match(source, /if \(!syncUserId\)/);
  assert.match(source, /const syncRevision = getSnapshotRevision\(\)/);
  assert.match(source, /if \(!isCurrentSession\(\)\)/);
});

test("native snapshot writes serialize without pooled manual transactions", async () => {
  const [managerSource, sqliteSource] = await Promise.all([
    readFile(new URL("./syncManager.js", import.meta.url), "utf8"),
    readFile(new URL("../database/sqliteClient.js", import.meta.url), "utf8"),
  ]);

  assert.match(managerSource, /await initSqliteSchema\(\)/);
  assert.match(sqliteSource, /if \(initializationPromise\)/);
  assert.doesNotMatch(`${managerSource}\n${sqliteSource}`, /db\.execute\("(?:BEGIN|COMMIT|ROLLBACK)"\)/);
});

test("batchInsertOrReplace batches rows into chunked multi-row statements", async () => {
  const { batchInsertOrReplace } = await import("../database/sqliteClient.js");

  const executions = [];
  const mockDb = {
    execute: async (sql, params) => {
      executions.push({ sql, params });
      return { rowsAffected: params.length / 2 };
    },
  };

  const columns = ["id", "name"];
  const rows = [
    ["1", "Item 1"],
    ["2", "Item 2"],
    ["3", "Item 3"],
    ["4", "Item 4"],
    ["5", "Item 5"],
  ];

  // Batch with chunkSize = 2 (produces 3 chunks: 2, 2, 1)
  await batchInsertOrReplace(mockDb, "test_table", columns, rows, 2);

  assert.equal(executions.length, 3);
  assert.equal(executions[0].sql, "INSERT OR REPLACE INTO test_table (id, name) VALUES (?, ?), (?, ?)");
  assert.deepEqual(executions[0].params, ["1", "Item 1", "2", "Item 2"]);
  assert.equal(executions[1].sql, "INSERT OR REPLACE INTO test_table (id, name) VALUES (?, ?), (?, ?)");
  assert.deepEqual(executions[1].params, ["3", "Item 3", "4", "Item 4"]);
  assert.equal(executions[2].sql, "INSERT OR REPLACE INTO test_table (id, name) VALUES (?, ?)");
  assert.deepEqual(executions[2].params, ["5", "Item 5"]);
});

test("batchDeleteByIds chunks deletions by ID within parameter limits", async () => {
  const { batchDeleteByIds } = await import("../database/sqliteClient.js");

  const executions = [];
  const mockDb = {
    execute: async (sql, params) => {
      executions.push({ sql, params });
      return { rowsAffected: params.length };
    },
  };

  const ids = ["id-1", "id-2", "id-3", "id-4", "id-5"];

  // Batch with chunkSize = 2 (produces 3 chunks: 2, 2, 1)
  await batchDeleteByIds(mockDb, "medicines", ids, 2);

  assert.equal(executions.length, 3);
  assert.equal(executions[0].sql, "DELETE FROM medicines WHERE id IN (?, ?)");
  assert.deepEqual(executions[0].params, ["id-1", "id-2"]);
  assert.equal(executions[1].sql, "DELETE FROM medicines WHERE id IN (?, ?)");
  assert.deepEqual(executions[1].params, ["id-3", "id-4"]);
  assert.equal(executions[2].sql, "DELETE FROM medicines WHERE id IN (?)");
  assert.deepEqual(executions[2].params, ["id-5"]);
});

test("syncManager includes delta watermark query, sync_tombstones, and stock deficit audits", async () => {
  const source = await readFile(new URL("./syncManager.js", import.meta.url), "utf8");

  assert.match(source, /getSafeWatermarkWindow/);
  assert.match(source, /getDatasetSyncWatermark/);
  assert.match(source, /setDatasetSyncWatermark/);
  assert.match(source, /sync_tombstones/);
  assert.match(source, /stock_deficit_audits/);
  assert.match(source, /forceFullSync/);
  assert.match(source, /mergeSnapshotDelta/);
});

test("sqliteClient exports watermark functions and defines stock_deficit_audits schema", async () => {
  const sqlite = await import("../database/sqliteClient.js");

  assert.equal(typeof sqlite.getDatasetSyncWatermark, "function");
  assert.equal(typeof sqlite.setDatasetSyncWatermark, "function");
  assert.equal(typeof sqlite.clearAllSyncWatermarks, "function");
  assert.equal(typeof sqlite.batchDeleteByIds, "function");

  const source = await readFile(new URL("../database/sqliteClient.js", import.meta.url), "utf8");
  assert.match(source, /CREATE TABLE IF NOT EXISTS stock_deficit_audits/);
  assert.match(source, /idx_stock_deficit_facility/);
  assert.match(source, /idx_stock_deficit_status/);
});

