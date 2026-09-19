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

test("native snapshot writes serialize without pooled manual transactions", async () => {
  const [managerSource, engineSource, sqliteSource] = await Promise.all([
    readFile(new URL("./syncManager.js", import.meta.url), "utf8"),
    readFile(new URL("./syncEngine.js", import.meta.url), "utf8"),
    readFile(new URL("../database/sqliteClient.js", import.meta.url), "utf8"),
  ]);

  assert.match(managerSource, /await initSqliteSchema\(\)/);
  assert.match(sqliteSource, /if \(initializationPromise\)/);
  assert.doesNotMatch(`${managerSource}\n${engineSource}\n${sqliteSource}`, /db\.execute\("(?:BEGIN|COMMIT|ROLLBACK)"\)/);
});
