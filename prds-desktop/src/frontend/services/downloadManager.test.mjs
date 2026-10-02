import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExportPayload,
  clearOpeningExportState,
  clearRecentExports,
  downloadExportFile,
  getDownloadPreferences,
  getNextAvailableFilename,
  getOpeningExportState,
  getRecentExports,
  openWithExport,
  registerExport,
  saveDownloadPreferences,
  setOpeningExportState,
  viewExport,
} from "./downloadManager.js";

// Mock localStorage if in node environment
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

test("returns default download preferences when storage is empty", () => {
  localStorage.clear();
  const prefs = getDownloadPreferences();
  assert.equal(prefs.downloadPath, "Downloads\\PRDS_Exports");
  assert.equal(prefs.defaultFormat, "xlsx");
  assert.equal(prefs.notifyOnExport, true);
});

test("saves and updates download preferences in localStorage", () => {
  localStorage.clear();
  saveDownloadPreferences({
    downloadPath: "D:\\Custom_PRDS_Exports",
  });

  const updated = getDownloadPreferences();
  assert.equal(updated.downloadPath, "D:\\Custom_PRDS_Exports");
  assert.equal(updated.defaultFormat, "xlsx");
  assert.equal(updated.notifyOnExport, true);
});

test("registers exports and detects CSV, Excel, and JSON formats", () => {
  clearRecentExports();

  registerExport({
    filename: "patients_2026.csv",
    size: 2048,
  });

  registerExport({
    filename: "inventory_summary.xlsx",
    size: 5120,
  });

  registerExport({
    filename: "backup_data.json",
    size: 1024,
  });

  const exports = getRecentExports();
  assert.equal(exports.length, 3);
  assert.equal(exports[0].filename, "backup_data.json");
  assert.equal(exports[0].format, "JSON");
  assert.equal(exports[1].filename, "inventory_summary.xlsx");
  assert.equal(exports[1].format, "EXCEL");
  assert.equal(exports[2].filename, "patients_2026.csv");
  assert.equal(exports[2].format, "CSV");
});

test("clears recent exports", () => {
  clearRecentExports();
  registerExport({ filename: "test.xlsx" });
  assert.equal(getRecentExports().length, 1);

  clearRecentExports();
  assert.equal(getRecentExports().length, 0);
});

test("buildExportPayload generates genuine .xlsx file when format is xlsx", () => {
  localStorage.clear();
  saveDownloadPreferences({ defaultFormat: "xlsx" });

  const headers = ["Patient Code", "Name", "Age"];
  const rows = [
    ["P001", "Juan dela Cruz", 34],
    ["P002", "Maria Santos", 29],
  ];

  const payload = buildExportPayload({
    filename: "prds-patients-2026-09-23.csv",
    headers,
    rows,
  });

  assert.equal(payload.filename, "prds-patients-2026-09-23.xlsx");
  assert.equal(payload.format, "EXCEL");
  assert.equal(
    payload.blob.type,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  assert.ok(payload.size > 0, "Excel blob has non-zero size");
});

test("buildExportPayload standardizes on .xlsx even if legacy csv was specified", () => {
  localStorage.clear();

  const headers = ["Patient Code", "Name", "Age"];
  const rows = [
    ["P001", "Juan dela Cruz", 34],
    ["P002", "Maria Santos", 29],
  ];

  const payload = buildExportPayload({
    filename: "prds-patients-2026-09-23.csv",
    headers,
    rows,
    format: "csv",
  });

  assert.equal(payload.filename, "prds-patients-2026-09-23.xlsx");
  assert.equal(payload.format, "EXCEL");
  assert.equal(
    payload.blob.type,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  assert.ok(payload.size > 0, "Excel blob has non-zero size");
});

test("buildExportPayload can convert raw CSV string into .xlsx workbook", () => {
  const csv = "Medicine,Batch,Quantity\r\nParacetamol,B100,50\r\nAmoxicillin,B200,30";

  const payload = buildExportPayload({
    filename: "inventory.csv",
    csv,
    format: "xlsx",
  });

  assert.equal(payload.filename, "inventory.xlsx");
  assert.equal(payload.format, "EXCEL");
  assert.ok(payload.size > 0);
});

test("downloadExportFile generates payload and registers recent export item", () => {
  clearRecentExports();
  localStorage.clear();
  saveDownloadPreferences({ defaultFormat: "xlsx" });

  const item = downloadExportFile({
    filename: "test-patients.csv",
    headers: ["ID", "Name"],
    rows: [["1", "Alice"]],
    recordCount: 1,
  });

  assert.equal(item.filename, "test-patients.xlsx");
  assert.equal(item.format, "EXCEL");
  assert.equal(item.recordCount, 1);

  const recents = getRecentExports();
  assert.equal(recents.length, 1);
  assert.equal(recents[0].filename, "test-patients.xlsx");
});

test("opening export state management tracks progress and lifecycle", () => {
  clearOpeningExportState();
  assert.equal(getOpeningExportState(), null);

  const dummyItem = { id: "exp-1", filename: "medicines.xlsx", format: "EXCEL" };
  setOpeningExportState({
    exportItem: dummyItem,
    status: "preparing",
    progress: 25,
    message: "Preparing export file...",
  });

  const current = getOpeningExportState();
  assert.ok(current);
  assert.equal(current.status, "preparing");
  assert.equal(current.progress, 25);
  assert.equal(current.exportItem.id, "exp-1");

  clearOpeningExportState();
  assert.equal(getOpeningExportState(), null);
});

test("viewExport and openWithExport initiate opening progress state", async () => {
  clearOpeningExportState();
  const dummyItem = { id: "exp-test", filename: "inventory.xlsx", format: "EXCEL" };

  const openingPromise = viewExport(dummyItem);
  const stateDuring = getOpeningExportState();
  assert.ok(stateDuring);
  assert.equal(stateDuring.exportItem.id, "exp-test");
  assert.ok(["preparing", "launching"].includes(stateDuring.status));

  await openingPromise;
  const stateAfter = getOpeningExportState();
  assert.ok(stateAfter);
  assert.equal(stateAfter.status, "success");
  assert.equal(stateAfter.progress, 100);

  clearOpeningExportState();
});

test("getNextAvailableFilename returns original name if no collision exists", () => {
  const result = getNextAvailableFilename("Request_Issuance_Slip_2026-09-26.xlsx", []);
  assert.equal(result, "Request_Issuance_Slip_2026-09-26.xlsx");
});

test("getNextAvailableFilename appends (1) on first collision", () => {
  const existing = ["Request_Issuance_Slip_2026-09-26.xlsx"];
  const result = getNextAvailableFilename("Request_Issuance_Slip_2026-09-26.xlsx", existing);
  assert.equal(result, "Request_Issuance_Slip_2026-09-26 (1).xlsx");
});

test("getNextAvailableFilename appends (2) when (1) already exists", () => {
  const existing = [
    "Request_Issuance_Slip_2026-09-26.xlsx",
    "Request_Issuance_Slip_2026-09-26 (1).xlsx",
  ];
  const result = getNextAvailableFilename("Request_Issuance_Slip_2026-09-26.xlsx", existing);
  assert.equal(result, "Request_Issuance_Slip_2026-09-26 (2).xlsx");
});

test("getNextAvailableFilename correctly advances an already-indexed name without double-nesting", () => {
  const existing = [
    "Request_Issuance_Slip_2026-09-26.xlsx",
    "Request_Issuance_Slip_2026-09-26 (1).xlsx",
  ];
  const result = getNextAvailableFilename("Request_Issuance_Slip_2026-09-26 (1).xlsx", existing);
  assert.equal(result, "Request_Issuance_Slip_2026-09-26 (2).xlsx");
});

test("getNextAvailableFilename handles case-insensitivity on Windows", () => {
  const existing = ["request_issuance_slip_2026-09-26.xlsx"];
  const result = getNextAvailableFilename("Request_Issuance_Slip_2026-09-26.xlsx", existing);
  assert.equal(result, "Request_Issuance_Slip_2026-09-26 (1).xlsx");
});

test("downloadExportFile automatically numbers multiple downloads of the same report", () => {
  clearRecentExports();
  localStorage.clear();
  saveDownloadPreferences({ defaultFormat: "xlsx" });

  // 1st export
  const firstItem = downloadExportFile({
    filename: "Request_Issuance_Slip_2026-09-26.xlsx",
    headers: ["Item", "Qty"],
    rows: [["Amoxicillin", 10]],
  });
  assert.equal(firstItem.filename, "Request_Issuance_Slip_2026-09-26.xlsx");

  // 2nd export with same name on the same day
  const secondItem = downloadExportFile({
    filename: "Request_Issuance_Slip_2026-09-26.xlsx",
    headers: ["Item", "Qty"],
    rows: [["Amoxicillin", 10]],
  });
  assert.equal(secondItem.filename, "Request_Issuance_Slip_2026-09-26 (1).xlsx");

  // 3rd export with same name on the same day
  const thirdItem = downloadExportFile({
    filename: "Request_Issuance_Slip_2026-09-26.xlsx",
    headers: ["Item", "Qty"],
    rows: [["Amoxicillin", 10]],
  });
  assert.equal(thirdItem.filename, "Request_Issuance_Slip_2026-09-26 (2).xlsx");

  // Verify all 3 exports coexist in recent exports queue
  const recent = getRecentExports();
  assert.equal(recent.length, 3);
  assert.equal(recent[0].filename, "Request_Issuance_Slip_2026-09-26 (2).xlsx");
  assert.equal(recent[1].filename, "Request_Issuance_Slip_2026-09-26 (1).xlsx");
  assert.equal(recent[2].filename, "Request_Issuance_Slip_2026-09-26.xlsx");
});

