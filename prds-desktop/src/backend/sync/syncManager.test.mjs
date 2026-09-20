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
