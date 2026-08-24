import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDispensingCsv,
  buildFefoPreview,
  buildMedicineOptions,
  formatDispensingDayParts,
  formatTransactionNumber,
  getCartLineError,
  getCartSummary,
  getMedicineFullLabel,
  getMedicineLabel,
  getDispensingStepBlocker,
  getMonthRangeIso,
  getTransactionTotalQuantity,
  groupHistoryByTransaction,
  matchesHistoryFilters,
  sortTransactions,
} from "./dispensingUtils.js";

const futureDate = (days) => {
  const date = new Date();

  date.setDate(date.getDate() + days);

  return date.toISOString().slice(0, 10);
};

const inventoryRows = [
  {
    id: "batch-1",
    medicine_id: "med-1",
    quantity: 20,
    batch_number: "BATCH-A",
    expiration_date: futureDate(10),
    date_received: "2026-01-05",
    medicine: { generic_name: "Paracetamol", brand_name: "Biogesic", dosage: "500mg", unit_of_measure: "tablet" },
  },
  {
    id: "batch-2",
    medicine_id: "med-1",
    quantity: 15,
    batch_number: "BATCH-B",
    expiration_date: futureDate(200),
    date_received: "2026-02-01",
    medicine: { generic_name: "Paracetamol", brand_name: "Biogesic", dosage: "500mg", unit_of_measure: "tablet" },
  },
  {
    id: "batch-3",
    medicine_id: "med-1",
    quantity: 99,
    batch_number: "BATCH-X",
    expiration_date: "2020-01-01",
    date_received: "2019-12-01",
    medicine: { generic_name: "Paracetamol", brand_name: "Biogesic", dosage: "500mg", unit_of_measure: "tablet" },
  },
  {
    id: "batch-4",
    medicine_id: "med-2",
    quantity: 40,
    batch_number: "BATCH-C",
    expiration_date: futureDate(90),
    date_received: "2026-03-01",
    medicine: { generic_name: "Amoxicillin", brand_name: null, dosage: "250mg", unit_of_measure: "capsule" },
  },
];

test("buildMedicineOptions aggregates non-expired batches per medicine in FEFO order", () => {
  const options = buildMedicineOptions(inventoryRows, "");
  const paracetamol = options.find((option) => option.medicine_id === "med-1");

  assert.equal(options.length, 2);
  assert.equal(paracetamol.total_quantity, 35);
  assert.deepEqual(
    paracetamol.batches.map((batch) => batch.batch_number),
    ["BATCH-A", "BATCH-B"]
  );
});

test("buildMedicineOptions filters by keyword across name fields", () => {
  assert.equal(buildMedicineOptions(inventoryRows, "paracet").length, 1);
  assert.equal(buildMedicineOptions(inventoryRows, "biogesic").length, 1);
  assert.equal(buildMedicineOptions(inventoryRows, "capsule").length, 1);
  assert.equal(buildMedicineOptions(inventoryRows, "ibuprofen").length, 0);
});

test("buildFefoPreview splits quantity across batches oldest-expiry-first", () => {
  const paracetamol = buildMedicineOptions(inventoryRows, "").find((option) => option.medicine_id === "med-1");
  const preview = buildFefoPreview(paracetamol.batches, 30);

  assert.deepEqual(
    preview.allocations.map((allocation) => [allocation.batch_number, allocation.quantity]),
    [["BATCH-A", 20], ["BATCH-B", 10]]
  );
  assert.equal(preview.shortfall, 0);
});

test("buildFefoPreview reports shortfall when stock is insufficient", () => {
  const amoxicillin = buildMedicineOptions(inventoryRows, "").find((option) => option.medicine_id === "med-2");
  const preview = buildFefoPreview(amoxicillin.batches, 55);

  assert.deepEqual(preview.allocations.map((allocation) => allocation.quantity), [40]);
  assert.equal(preview.shortfall, 15);
});

test("getCartLineError validates quantities against availability", () => {
  const options = buildMedicineOptions(inventoryRows, "");

  assert.equal(getCartLineError({ line: { medicine_id: "med-1", quantity: 30 }, medicineOptions: options }), "");
  assert.match(
    getCartLineError({ line: { medicine_id: "med-1", quantity: 36 }, medicineOptions: options }),
    /Only 35 units/
  );
  assert.match(
    getCartLineError({ line: { medicine_id: "med-1", quantity: 5.5 }, medicineOptions: options }),
    /whole number/
  );
  assert.equal(
    getCartLineError({ line: { medicine_id: "missing", quantity: 1 }, medicineOptions: options }),
    "This medicine is no longer in stock."
  );
});

test("getCartSummary totals lines and units", () => {
  assert.deepEqual(
    getCartSummary([
      { medicine_id: "med-1", quantity: 30 },
      { medicine_id: "med-2", quantity: 12 },
    ]),
    { lineCount: 2, totalUnits: 42 }
  );
  assert.deepEqual(getCartSummary([]), { lineCount: 0, totalUnits: 0 });
});

test("formatTransactionNumber renders a short uppercase label", () => {
  assert.equal(formatTransactionNumber("a61c01dc-fd6c-4bd4-984e-77f3dfc44c96"), "TXN-A61C01DC");
  assert.equal(formatTransactionNumber(null), "TXN-UNKNOWN");
});

test("getMonthRangeIso returns the first day of this and next month", () => {
  const range = getMonthRangeIso();
  const now = new Date();

  assert.equal(new Date(range.start).getDate(), 1);
  assert.equal(new Date(range.start).getMonth(), now.getMonth());
  assert.equal(new Date(range.end).getDate(), 1);
  assert.equal(new Date(range.end).getMonth(), (now.getMonth() + 1) % 12);
});

const historyRows = [
  {
    id: "row-1",
    dispensing_transaction_id: "txn-aaa",
    quantity: 20,
    dispense_date: "2026-08-10T08:00:00.000Z",
    voided_at: null,
    void_reason: null,
    patient: { patient_code: "PRD-0001", first_name: "Juan", last_name: "Dela Cruz", facility: { facility_name: "Tinaan Health Center" } },
    dispenser: { first_name: "Maria", last_name: "Santos", role: "BHW" },
    medicine: { generic_name: "Paracetamol", dosage: "500mg" },
    batch: { batch_number: "BATCH-A" },
  },
  {
    id: "row-2",
    dispensing_transaction_id: "txn-aaa",
    quantity: 10,
    dispense_date: "2026-08-10T08:00:00.000Z",
    voided_at: null,
    void_reason: null,
    patient: { patient_code: "PRD-0001", first_name: "Juan", last_name: "Dela Cruz", facility: { facility_name: "Tinaan Health Center" } },
    dispenser: { first_name: "Maria", last_name: "Santos", role: "BHW" },
    medicine: { generic_name: "Amoxicillin", dosage: "250mg" },
    batch: { batch_number: "BATCH-C" },
  },
  {
    id: "row-3",
    dispensing_transaction_id: "txn-bbb",
    quantity: 5,
    dispense_date: "2026-08-11T09:00:00.000Z",
    voided_at: "2026-08-12T10:00:00.000Z",
    void_reason: "Wrong patient selected.",
    patient: { patient_code: "PRD-0002", first_name: "Ana", last_name: "Lopez", facility: { facility_name: "LUTAC" } },
    dispenser: { first_name: "Maria", last_name: "Santos", role: "BHW" },
    medicine: { generic_name: "Vitamin C", dosage: null },
    batch: { batch_number: "BATCH-D" },
  },
];

test("groupHistoryByTransaction groups rows and computes totals", () => {
  const transactions = groupHistoryByTransaction(historyRows);

  assert.equal(transactions.length, 2);

  const grouped = transactions.find((transaction) => transaction.transactionId === "txn-aaa");

  assert.equal(grouped.rows.length, 2);
  assert.equal(grouped.totalQuantity, 30);
  assert.equal(grouped.voidedAt, null);
});

test("matchesHistoryFilters searches across transaction fields and honours status", () => {
  const transactions = groupHistoryByTransaction(historyRows);
  const juan = transactions[0];
  const ana = transactions[1];

  assert.equal(matchesHistoryFilters({ keyword: "juan", transaction: juan }), true);
  assert.equal(matchesHistoryFilters({ keyword: "PRD-0002", transaction: ana }), true);
  assert.equal(matchesHistoryFilters({ keyword: "batch-d", transaction: ana }), true);
  assert.equal(matchesHistoryFilters({ keyword: "nobody", transaction: juan }), false);
  assert.equal(matchesHistoryFilters({ keyword: "", status: "VOIDED", transaction: juan }), false);
  assert.equal(matchesHistoryFilters({ keyword: "", status: "VOIDED", transaction: ana }), true);
  assert.equal(matchesHistoryFilters({ keyword: "", status: "ACTIVE", transaction: ana }), false);
});

test("sortTransactions orders newest or oldest first", () => {
  const transactions = groupHistoryByTransaction(historyRows);

  assert.deepEqual(
    sortTransactions(transactions, "newest").map((transaction) => transaction.transactionId),
    ["txn-bbb", "txn-aaa"]
  );
  assert.deepEqual(
    sortTransactions(transactions, "oldest").map((transaction) => transaction.transactionId),
    ["txn-aaa", "txn-bbb"]
  );
});

test("buildDispensingCsv exports one row per batch record with headers", () => {
  const csv = buildDispensingCsv(groupHistoryByTransaction(historyRows));
  const lines = csv.split("\n");

  assert.equal(lines.length, 4);
  assert.match(lines[0], /^date,transaction_id,status/);
  assert.match(csv, /VOIDED/);
  assert.match(csv, /Wrong patient selected\./);
  assert.match(csv, /Tinaan Health Center/);
});

test("medicine labels compose generic, dosage, brand and unit", () => {
  const medicine = inventoryRows[0].medicine;

  assert.equal(getMedicineLabel(medicine), "Paracetamol 500mg");
  assert.equal(getMedicineFullLabel(medicine), "Biogesic · tablet");
  assert.equal(getMedicineLabel({ generic_name: null }), "No generic name");
});

test("getTransactionTotalQuantity sums row quantities", () => {
  assert.equal(getTransactionTotalQuantity(historyRows.slice(0, 2)), 30);
});

test("formatDispensingDayParts splits a date into card parts", () => {
  const parts = formatDispensingDayParts("2026-08-10T08:05:00.000Z");

  assert.equal(parts.day, "10");
  assert.equal(parts.month, "AUG");
  assert.match(parts.time, /\d{1,2}:\d{2}/);
});

test("formatDispensingDayParts falls back on missing or invalid values", () => {
  assert.deepEqual(formatDispensingDayParts(null), { day: "—", month: "", time: "—" });
  assert.deepEqual(formatDispensingDayParts("not-a-date"), { day: "—", month: "", time: "—" });
});

test("getDispensingStepBlocker gates each wizard step", () => {
  const base = { claimed: false, hasLineErrors: false, hasPatient: true, lineCount: 2 };

  assert.equal(getDispensingStepBlocker({ ...base, step: 1 }), "");
  assert.equal(getDispensingStepBlocker({ ...base, step: 2 }), "");
  assert.match(getDispensingStepBlocker({ ...base, hasPatient: false, step: 2 }), /patient/i);
  assert.match(getDispensingStepBlocker({ ...base, claimed: true, lineCount: 1, step: 3 }), /month/i);
  assert.match(getDispensingStepBlocker({ ...base, lineCount: 0, step: 3 }), /medicine/i);
  assert.match(
    getDispensingStepBlocker({ ...base, hasLineErrors: true, lineCount: 1, step: 3 }),
    /quantit/i
  );
  assert.equal(getDispensingStepBlocker({ ...base, lineCount: 1, step: 3 }), "");
});
