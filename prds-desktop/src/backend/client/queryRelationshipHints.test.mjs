import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

const readSource = (relativePath) => readFileSync(join(root, relativePath), "utf8");

const readSelectBlock = (source, tableName) => {
  const tableIndex = source.indexOf(`.from("${tableName}")`);
  assert.notEqual(tableIndex, -1, `expected ${tableName} query to exist`);
  const selectIndex = source.indexOf(".select(`", tableIndex);
  assert.notEqual(selectIndex, -1, `expected ${tableName} query to have a template select`);
  const start = selectIndex + ".select(`".length;
  const end = source.indexOf("`)", start);
  assert.notEqual(end, -1, `expected ${tableName} select template to close`);
  return source.slice(start, end);
};

test("inventory queries disambiguate the primary facility foreign key", () => {
  const files = [
    "src/backend/services/inventoryData.js",
    "src/backend/sync/syncManager.js",
    "src/frontend/views/dashboard/DashboardModule.jsx",
    "src/frontend/views/forecasting/ForecastingModule.jsx",
  ];

  for (const file of files) {
    const source = readSource(file);
    assert.match(
      source,
      /facility:facilities!inventory_facility_id_fkey/,
      `${file} must use the inventory facility FK hint`
    );
  }

  const forecastingSource = readSource("src/frontend/views/forecasting/ForecastingModule.jsx");
  assert.match(
    readSelectBlock(forecastingSource, "inventory"),
    /facility:facilities!inventory_facility_id_fkey/,
    "forecasting inventory query must use the inventory facility FK hint"
  );
  assert.doesNotMatch(
    readSelectBlock(forecastingSource, "forecasting"),
    /inventory_facility_id_fkey/,
    "non-inventory forecasting query should not use the inventory FK hint"
  );
});

test("retired transfer loading code does not query removed transfer tables", () => {
  const serviceSource = readSource("src/backend/services/transfersService.js");
  const syncSource = readSource("src/backend/sync/syncManager.js");

  assert.match(syncSource, /safeOptionalFetch/);
  assert.doesNotMatch(serviceSource, /\.from\("stock_transfers"\)/);
  assert.doesNotMatch(syncSource, /\.from\("stock_transfers"\)/);
});

test("retired transfer availability does not call removed transfer RPCs", () => {
  const serviceSource = readSource("src/backend/services/transfersService.js");
  const availabilityStart = serviceSource.indexOf("export const getTransferSourceAvailability");
  assert.notEqual(availabilityStart, -1, "expected transfer availability helper to exist");
  const nextExport = serviceSource.indexOf("\nexport const ", availabilityStart + 1);
  const availabilitySource = serviceSource.slice(
    availabilityStart,
    nextExport === -1 ? serviceSource.length : nextExport
  );

  assert.doesNotMatch(
    availabilitySource,
    /supabase\.rpc/,
    "retired transfer availability must not call a DB RPC"
  );
});

test("inventory detail components import every displayed inventory helper", () => {
  const source = readSource("src/frontend/views/inventory/inventoryComponents.jsx");
  assert.match(source, /normalizePoNumber/, "inventory components display PO numbers");
  assert.match(
    source,
    /import\s*\{[\s\S]*normalizePoNumber[\s\S]*\}\s*from\s*"@shared\/utils\/inventoryUtils"/,
    "normalizePoNumber must be imported before rendering inventory details"
  );
});

test("retired transfer tables are not queried by active sync or service code", () => {
  const activeFiles = [
    "src/backend/sync/syncManager.js",
    "src/backend/services/transfersService.js",
    "src/backend/client/dataClient.js",
  ];

  for (const file of activeFiles) {
    const source = readSource(file);
    assert.doesNotMatch(source, /\.from\("stock_transfers"\)/, `${file} must not query stock_transfers`);
    assert.doesNotMatch(source, /stock_transfer_items\(/, `${file} must not embed stock_transfer_items`);
    assert.doesNotMatch(source, /stock_transfer_fulfillments\(/, `${file} must not embed stock_transfer_fulfillments`);
  }
});
