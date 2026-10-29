import assert from "node:assert/strict";
import test from "node:test";

import {
  amountToWords,
  buildInventoryImportPayloads,
  buildInventoryMedicineRows,
  calculatePoTotals,
  createEmptyPoItem,
  DISPOSAL_METHODS,
  emptyPoReceiptForm,
  emptyReturnReceiptForm,
  formatDate,
  formatDateTime,
  getExpiredDays,
  getExpiryStatus,
  getLotStatus,
  getReturnReasonLabel,
  getStockStatus,
  isDisposedLot,
  isLotExpired,
  isLotNumberUsed,
  isPoNumberUsed,
  isReturnedLot,
  normalizeLotNumber,
  normalizePoNumber,
  RETURN_REASON_OPTIONS,
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

test("isLotExpired accurately identifies expired vs unexpired lots", () => {
  assert.equal(isLotExpired({ expiration_date: null }), false);
  assert.equal(isLotExpired({ expiration_date: "" }), false);
  assert.equal(isLotExpired({ expiration_date: "2020-01-01" }), true);
  assert.equal(isLotExpired({ expiration_date: "2099-12-31" }), false);
});

test("getExpiredDays calculates positive days past expiry or 0 for unexpired", () => {
  assert.equal(getExpiredDays(null), 0);
  assert.equal(getExpiredDays("2099-12-31"), 0);
  assert.ok(getExpiredDays("2020-01-01") > 1000);
});

test("buildInventoryMedicineRows segregates dispensable vs expired lots cleanly", () => {
  const mixedLots = [
    {
      id: "lot-valid",
      facility_id: "facility-1",
      medicine_id: "medicine-1",
      quantity: 50,
      threshold: 10,
      expiration_date: "2099-12-31",
      medicine: { generic_name: "Amoxicillin", dosage: "500mg" },
    },
    {
      id: "lot-expired",
      facility_id: "facility-1",
      medicine_id: "medicine-1",
      quantity: 20,
      threshold: 10,
      expiration_date: "2020-01-01",
      medicine: { generic_name: "Amoxicillin", dosage: "500mg" },
    },
    {
      id: "lot-only-expired",
      facility_id: "facility-1",
      medicine_id: "medicine-2",
      quantity: 15,
      threshold: 5,
      expiration_date: "2021-05-01",
      medicine: { generic_name: "Paracetamol", dosage: "500mg" },
    },
  ];

  const dispensableLots = mixedLots.filter((lot) => !isLotExpired(lot));
  const expiredLots = mixedLots.filter((lot) => isLotExpired(lot) && Number(lot.quantity || 0) > 0);

  const dispensableGrouped = buildInventoryMedicineRows(dispensableLots);
  const expiredGrouped = buildInventoryMedicineRows(expiredLots);

  assert.equal(dispensableGrouped.length, 1);
  assert.equal(dispensableGrouped[0].medicine.generic_name, "Amoxicillin");
  assert.equal(dispensableGrouped[0].quantity, 50);
  assert.equal(dispensableGrouped[0].expiration_date, "2099-12-31");

  assert.equal(expiredGrouped.length, 2);
  const amoxExpired = expiredGrouped.find((r) => r.medicine.generic_name === "Amoxicillin");
  const paraExpired = expiredGrouped.find((r) => r.medicine.generic_name === "Paracetamol");
  assert.equal(amoxExpired.quantity, 20);
  assert.equal(paraExpired.quantity, 15);
});

test("getLotStatus accurately determines lot viability and shelf-life status", () => {
  // 1. Depleted
  assert.equal(getLotStatus({ quantity: 0, expiration_date: "2099-12-31" }).key, "DEPLETED");

  // 2. Expired
  assert.equal(getLotStatus({ quantity: 50, expiration_date: "2020-01-01" }).key, "EXPIRED");

  // 3. Active (Good shelf life)
  assert.equal(getLotStatus({ quantity: 50, expiration_date: "2099-12-31" }).key, "ACTIVE");

  // 4. Expiring soon
  const inTenDays = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  assert.equal(getLotStatus({ quantity: 50, expiration_date: inTenDays }).key, "EXPIRING");
});

test("normalizePoNumber cleans invalid punctuation while retaining hyphens and spaces", () => {
  assert.equal(normalizePoNumber("08-92-26"), "08-92-26");
  assert.equal(normalizePoNumber("  PO #04-21-26!  "), "PO 04-21-26");
  assert.equal(normalizePoNumber(""), "");
  assert.equal(normalizePoNumber(null), "");
});

test("createEmptyPoItem and emptyPoReceiptForm initialize correct structures", () => {
  const item = createEmptyPoItem("test-1");
  assert.equal(item.id, "test-1");
  assert.equal(item.medicine_id, "");
  assert.equal(item.batch_number, "");
  assert.equal(item.quantity, "");
  assert.equal(item.unit_cost, "");
  assert.equal(item.threshold, "100");

  assert.equal(typeof emptyPoReceiptForm.facility_id, "string");
  assert.equal(emptyPoReceiptForm.po_number, "");
  assert.equal(Array.isArray(emptyPoReceiptForm.items), true);
  assert.equal(emptyPoReceiptForm.items.length, 1);
});

test("calculatePoTotals aggregates line item units and valuation across PO items", () => {
  // Test case based on Naga City PO receipt:
  // Item 1: Ascorbic Acid: 10,000 units @ ₱1.05 = ₱10,500.00
  // Item 2: Multivitamins: 5,000 units @ ₱1.81 = ₱9,050.00
  // Item 3: Calcium Carbonate: 2,000 units @ ₱6.19 = ₱12,380.00
  const items = [
    {
      medicine_id: "med-1",
      batch_number: "FGOLSA23",
      quantity: "10000",
      unit_cost: "1.05",
    },
    {
      medicine_id: "med-2",
      batch_number: "LLASD03A",
      quantity: "5000",
      unit_cost: "1.81",
    },
    {
      medicine_id: "med-3",
      batch_number: "FALKDO23",
      quantity: "2000",
      unit_cost: "6.19",
    },
    {
      // Incomplete row
      medicine_id: "",
      batch_number: "",
      quantity: "",
      unit_cost: "",
    },
  ];

  const totals = calculatePoTotals(items);
  assert.equal(totals.totalQuantity, 17000);
  assert.equal(totals.totalAmount, 31930);
  assert.equal(totals.validItemCount, 3);
});

test("calculatePoTotals handles empty and invalid item inputs gracefully", () => {
  assert.deepEqual(calculatePoTotals([]), {
    totalQuantity: 0,
    totalAmount: 0,
    validItemCount: 0,
  });

  const totals = calculatePoTotals([
    { quantity: "invalid", unit_cost: "bad" },
    { quantity: -50, unit_cost: 10 },
  ]);
  assert.equal(totals.totalQuantity, -50);
  assert.equal(totals.totalAmount, -500);
});

test("amountToWords accurately converts currency amounts to standard legal receipt words", () => {
  // Exact City of Naga PO receipt amount from client image:
  assert.equal(
    amountToWords(330575),
    "Three Hundred Thirty Thousand Five Hundred Seventy-Five Pesos Only"
  );

  // Exact centavos support
  assert.equal(
    amountToWords(10500.5),
    "Ten Thousand Five Hundred Pesos and 50/100 Only"
  );

  assert.equal(amountToWords(0), "Zero Pesos Only");
  assert.equal(amountToWords(-50), "Zero Pesos Only");
});

test("isReturnedLot identifies returned medicine batches accurately", () => {
  assert.equal(isReturnedLot({ intake_type: "RETURN" }), true);
  assert.equal(isReturnedLot({ origin_facility_id: "fac-123" }), true);
  assert.equal(isReturnedLot({ po_number: "RET-BHS-20261008" }), true);
  assert.equal(isReturnedLot({ origin_facility: { facility_name: "Inoaburan BHS" } }), true);
  assert.equal(isReturnedLot({ intake_type: "PO", po_number: "PO-99221" }), false);
  assert.equal(isReturnedLot(null), false);
});

test("getReturnReasonLabel formats return reasons with readable labels", () => {
  assert.equal(getReturnReasonLabel("EXCESS"), "Excess / Overstocked");
  assert.equal(getReturnReasonLabel("NEAR_EXPIRY"), "Near-Expiry Consolidation");
  assert.equal(getReturnReasonLabel("PROGRAM_ENDED"), "Program Terminated / Surrendered");
  assert.equal(getReturnReasonLabel(null), "Routine Return");
  assert.equal(getReturnReasonLabel("CUSTOM_REASON"), "CUSTOM_REASON");
});

test("isDisposedLot and buildInventoryMedicineRows exclude disposed stock cleanly", () => {
  const activeLot = { id: "1", medicine_id: "m1", quantity: 100, status: "ACTIVE" };
  const disposedLot = { id: "2", medicine_id: "m1", quantity: 50, status: "DISPOSED" };
  const timestampDisposedLot = { id: "3", medicine_id: "m2", quantity: 20, disposed_at: "2026-10-08T00:00:00Z" };

  assert.equal(isDisposedLot(activeLot), false);
  assert.equal(isDisposedLot(disposedLot), true);
  assert.equal(isDisposedLot(timestampDisposedLot), true);

  const grouped = buildInventoryMedicineRows([activeLot, disposedLot, timestampDisposedLot]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].quantity, 100);
});

test("emptyReturnReceiptForm initializes with RETURN intake type and reason", () => {
  const form = emptyReturnReceiptForm;
  assert.equal(form.intake_type, "RETURN");
  assert.equal(form.return_reason, "EXCESS");
  assert.equal(Array.isArray(form.items), true);
  assert.equal(form.items.length, 1);
  assert.equal(Array.isArray(DISPOSAL_METHODS), true);
  assert.ok(DISPOSAL_METHODS.length >= 3);
});

test("isLotNumberUsed respects excludeId and facilityId scoping", () => {
  const inventory = [
    { id: "lot-1", facility_id: "cho-1", batch_number: "4324FA4" },
    { id: "lot-2", facility_id: "bhw-carolina", batch_number: "4324FA4" },
    { id: "lot-3", facility_id: "cho-1", batch_number: "98BBD12" },
  ];

  // Same lot in same facility without excludeId -> true
  assert.equal(isLotNumberUsed("4324FA4", inventory, null, "cho-1"), true);

  // Same lot when editing lot-1 (excludeId matches) in cho-1 -> false
  assert.equal(isLotNumberUsed("4324FA4", inventory, "lot-1", "cho-1"), false);

  // Same lot when checking in bhw-triangulo where it is not yet registered -> false
  assert.equal(isLotNumberUsed("4324FA4", inventory, null, "bhw-triangulo"), false);

  // Different lot number -> false
  assert.equal(isLotNumberUsed("NEWLOT999", inventory, null, "cho-1"), false);

  // Normalization works (spaces and hyphens stripped, case insensitive)
  assert.equal(isLotNumberUsed("4324-fa4", inventory, null, "cho-1"), true);
});

test("isPoNumberUsed respects excludeId and facilityId scoping", () => {
  const inventory = [
    { id: "rec-1", facility_id: "cho-1", po_number: "09-21-32" },
    { id: "rec-2", facility_id: "bhw-carolina", po_number: "09-21-32" },
  ];

  // PO in same facility -> true
  assert.equal(isPoNumberUsed("09-21-32", inventory, null, "cho-1"), true);

  // PO when editing rec-1 in cho-1 -> false
  assert.equal(isPoNumberUsed("09-21-32", inventory, "rec-1", "cho-1"), false);

  // PO in other facility -> false
  assert.equal(isPoNumberUsed("09-21-32", inventory, null, "bhw-triangulo"), false);

  // Brand new PO -> false
  assert.equal(isPoNumberUsed("PO-NEW-1234", inventory, null, "cho-1"), false);
});

test("buildInventoryMedicineRows resolves brand_name from lots onto grouped row", () => {
  const lot1 = {
    id: "lot-1",
    facility_id: "cho-1",
    medicine_id: "med-1",
    quantity: 100,
    expiration_date: "2027-01-27",
    brand_name: "Ritemed",
    medicine: { id: "med-1", generic_name: "Ascorbic acid" },
    status: "ACTIVE",
  };
  const lot2 = {
    id: "lot-2",
    facility_id: "cho-1",
    medicine_id: "med-1",
    quantity: 90,
    expiration_date: "2027-03-31",
    brand_name: "Ceelin",
    medicine: { id: "med-1", generic_name: "Ascorbic acid" },
    status: "ACTIVE",
  };

  const grouped = buildInventoryMedicineRows([lot1, lot2]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].quantity, 190);
  assert.equal(grouped[0].brand_name, "Ritemed, Ceelin");
  assert.equal(grouped[0].medicine.brand_name, "Ritemed, Ceelin");
});

test("emptyInventoryForm and emptyPoReceiptForm contain supplier fields", () => {
  assert.ok("supplier_name" in emptyPoReceiptForm);
  assert.ok("supplier_address" in emptyPoReceiptForm);
  assert.ok("supplier_contact" in emptyPoReceiptForm);
});
