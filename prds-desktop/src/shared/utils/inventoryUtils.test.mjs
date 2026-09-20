import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInventoryImportPayloads,
  buildInventoryMedicineRows,
  formatDate,
  formatDateTime,
  getExpiryStatus,
  getStockStatus,
  normalizeLotNumber,
  sortInventoryRows,
} from "./inventoryUtils.js";

test("formatDateTime renders a valid date", () => {
  assert.equal(formatDateTime(new Date(2026, 7, 9, 10, 30)).includes("2026"), true);
  assert.equal(formatDateTime("2026-08-09T10:30:00").includes("Aug"), true);
});

test("formatDateTime returns a placeholder for invalid dates", () => {
  assert.equal(formatDateTime(null), "—");
  assert.equal(formatDateTime(undefined), "—");
  assert.equal(formatDateTime("not-a-date"), "—");
  assert.equal(formatDateTime("2026-13-45"), "—");
});

test("formatDate renders a valid date", () => {
  assert.equal(formatDate(new Date(2026, 7, 9).toDateString()), "08/09/2026");
});

test("formatDate returns a placeholder for invalid dates", () => {
  assert.equal(formatDate(""), "-");
  assert.equal(formatDate("not-a-date"), "-");
  assert.equal(formatDate("2026-13-45"), "-");
});

test("getStockStatus tiers quantities against thresholds", () => {
  assert.equal(getStockStatus({ quantity: 0, threshold: 100 }).key, "CRITICAL");
  assert.equal(getStockStatus({ quantity: 20, threshold: 100 }).key, "CRITICAL");
  assert.equal(getStockStatus({ quantity: 80, threshold: 100 }).key, "LOW");
  assert.equal(getStockStatus({ quantity: 200, threshold: 100 }).key, "NORMAL");
});

test("getExpiryStatus treats missing or invalid dates as no date", () => {
  assert.equal(getExpiryStatus({ expiration_date: null }).key, "NO_DATE");
  assert.equal(getExpiryStatus({ expiration_date: "not-a-date" }).key, "NO_DATE");
  assert.equal(getExpiryStatus({ expiration_date: "2026-13-45" }).key, "NO_DATE");
});

test("buildInventoryMedicineRows groups stock by facility and medicine", () => {
  const rows = buildInventoryMedicineRows([
    {
      id: "lot-1",
      facility_id: "facility-1",
      medicine_id: "medicine-1",
      quantity: 20,
      threshold: 5,
      expiration_date: "2026-12-31",
      medicine: { generic_name: "Losartan", dosage: "50mg" },
    },
    {
      id: "lot-2",
      facility_id: "facility-1",
      medicine_id: "medicine-1",
      quantity: 30,
      threshold: 10,
      expiration_date: "2026-10-01",
      medicine: { generic_name: "Losartan", dosage: "50mg" },
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 50);
  assert.equal(rows[0].threshold, 10);
  assert.equal(rows[0].expiration_date, "2026-10-01");
  assert.equal(rows[0].lotCount, 2);
});

test("sortInventoryRows orders grouped medicine rows alphabetically", () => {
  const rows = [
    { medicine: { generic_name: "Paracetamol", dosage: "500mg" } },
    { medicine: { generic_name: "Amoxicillin", dosage: "500mg" } },
  ];

  assert.equal(sortInventoryRows(rows, { key: "medicine", direction: "ASC" })[0].medicine.generic_name, "Amoxicillin");
  assert.equal(sortInventoryRows(rows, { key: "medicine", direction: "DESC" })[0].medicine.generic_name, "Paracetamol");
});

test("buildInventoryImportPayloads accepts lot_number header", () => {
  const { payloads, errors } = buildInventoryImportPayloads(
    [
      {
        rowNumber: 2,
        medicine: "Amoxicillin",
        lot_number: "1023124",
        supplier: "MediSource",
        quantity: "500",
        threshold: "100",
        date_received: "2026-01-05",
        expiration_date: "2026-12-31",
      },
    ],
    {
      facilityId: "facility-1",
      medicines: [{ id: "medicine-1", generic_name: "Amoxicillin" }],
      suppliers: [{ id: "supplier-1", supplier_name: "MediSource" }],
    }
  );

  assert.deepEqual(errors, []);
  assert.equal(payloads[0].batch_number, "1023124");
});

test("normalizeLotNumber keeps letters and digits without special characters", () => {
  assert.equal(normalizeLotNumber("PRDS-SEED-102321"), "PRDSSEED102321");
  assert.equal(normalizeLotNumber("102321"), "102321");
  assert.equal(normalizeLotNumber("F98VAF5"), "F98VAF5");
  assert.equal(normalizeLotNumber("lot-abc-123!"), "LOTABC123");
  assert.equal(normalizeLotNumber("@#$%^&*"), "");
});
