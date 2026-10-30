import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStockReturnPayload,
  flattenStockReturnRows,
  calculateStockReturnKpis,
  generateReturnId,
  generateReturnSlipNo,
  getReturnReasonLabel,
  getReturnReasonTone,
  getReturnStatusBadge,
  formatBrandName,
  reconcileConfirmedReturnsIntoInventory,
  resolveStockReturnMedicineInfo,
  RETURN_REASON_OPTIONS,
  RETURN_STATUS_OPTIONS,
} from "./stockReturnsService.js";

test("buildStockReturnPayload creates one returned-stock ledger row scoped to the returner facility", () => {
  const result = buildStockReturnPayload({
    formValues: {
      lot_no: " lot-4021 ",
      medicine_id: "med-1",
      quantity: "12",
      unit_cost: "4.50",
      expiration_date: "2026-12-31",
      reason: "EXCESS_STOCK",
      facility_id: "wrong-facility",
    },
    medicine: {
      id: "med-1",
      generic_name: "Paracetamol",
      brand_name: "Biogesic",
    },
    userProfile: {
      id: "user-1",
      role: "BHW",
      facility_id: "bhw-facility",
    },
    nowIso: "2026-10-09T10:00:00.000Z",
  });

  assert.equal(result.lot_no, "LOT-4021");
  assert.equal(result.medicine_name, "Paracetamol");
  assert.equal(result.brand_name, "Biogesic");
  assert.equal(result.quantity, 12);
  assert.equal(result.unit_cost, 4.5);
  assert.equal(result.expiration_date, "2026-12-31");
  assert.equal(result.reason, "EXCESS_STOCK");
  assert.equal(result.facility_id, "bhw-facility");
  assert.equal(result.status, "PENDING");
  assert.equal(result.submitted_by_id, "user-1");
});

test("flattenStockReturnRows converts legacy slip item data into finalized stock return rows", () => {
  const rows = flattenStockReturnRows([
    {
      id: "ret-1",
      source_facility_id: "facility-1",
      source_facility: { id: "facility-1", facility_name: "Alpaco Health Center" },
      return_reason: "NEARING_EXPIRY",
      status: "RECEIVED",
      items: [
        {
          id: "item-1",
          batch_number: "A-100",
          quantity: 5,
          unit_cost: "3.25",
          expiration_date: "2026-11-30",
          medicine: { generic_name: "Amoxicillin", brand_name: "Amoxil" },
        },
      ],
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "item-1");
  assert.equal(rows[0].return_id, "ret-1");
  assert.equal(rows[0].lot_no, "A-100");
  assert.equal(rows[0].medicine_name, "Amoxicillin");
  assert.equal(rows[0].brand_name, "Amoxil");
  assert.equal(rows[0].quantity, 5);
  assert.equal(rows[0].unit_cost, 3.25);
  assert.equal(rows[0].expiration_date, "2026-11-30");
  assert.equal(rows[0].reason, "NEARING_EXPIRY");
  assert.equal(rows[0].facility_id, "facility-1");
  assert.equal(rows[0].status, "RECEIVED");
});

test("generateReturnId and generateReturnSlipNo format return IDs accurately with compact format", () => {
  const returnId = generateReturnId("BHW-ALPACO");
  assert.match(returnId, /^RET-[A-Z0-9]{8}$/);

  const slipNo = generateReturnSlipNo("BHW-ALPACO");
  assert.match(slipNo, /^RET-[A-Z0-9]{8}$/);

  const fallbackReturnId = generateReturnId();
  assert.match(fallbackReturnId, /^RET-[A-Z0-9]{8}$/);
});

test("return reason and status helpers return proper labels and tone badges", () => {
  assert.equal(getReturnReasonLabel("EXCESS_STOCK"), "Excess Stock / Overstocked");
  assert.equal(getReturnReasonLabel("NON_EXISTENT_REASON"), "NON_EXISTENT_REASON");

  assert.equal(getReturnReasonTone("COLD_CHAIN_ALERT"), "bg-rose-100 text-rose-700");

  const confirmedBadge = getReturnStatusBadge("CONFIRMED");
  assert.equal(confirmedBadge.label, "Confirmed");

  const verifiedBadge = getReturnStatusBadge("VERIFIED");
  assert.equal(verifiedBadge.label, "Confirmed");

  const pendingBadge = getReturnStatusBadge("PENDING");
  assert.equal(pendingBadge.label, "Pending");

  const unknownBadge = getReturnStatusBadge("CUSTOM_STATUS");
  assert.equal(unknownBadge.label, "CUSTOM_STATUS");
});

test("calculateStockReturnKpis accurately computes finalized row totals, verification counts, units, and station breakdowns", () => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const sampleReturns = [
    {
      id: "ret-1",
      submitted_at: `${currentMonth}-05T08:00:00Z`,
      status: "VERIFIED",
      facility: { facility_name: "Alpaco Health Center" },
      quantity: 75,
    },
    {
      id: "ret-2",
      submitted_at: `${currentMonth}-08T08:00:00Z`,
      status: "PENDING",
      facility: { facility_name: "Alpaco Health Center" },
      quantity: 30,
    },
    {
      id: "ret-3",
      submitted_at: "2025-01-15T08:00:00Z",
      status: "PENDING",
      facility: { facility_name: "Cantabaco Health Center" },
      quantity: 15,
    },
  ];

  const kpis = calculateStockReturnKpis(sampleReturns);

  assert.equal(kpis.totalReturns, 3);
  assert.equal(kpis.totalUnitsReturned, 120); // 50+25 + 30 + 15
  assert.equal(kpis.verifiedCount, 1);
  assert.equal(kpis.pendingVerificationCount, 2);
  assert.equal(kpis.activeThisMonth, 2);

  assert.equal(kpis.topStations.length, 2);
  assert.equal(kpis.topStations[0].name, "Alpaco Health Center");
  assert.equal(kpis.topStations[0].count, 2);
  assert.equal(kpis.topStations[1].name, "Cantabaco Health Center");
  assert.equal(kpis.topStations[1].count, 1);
});

test("buildStockReturnPayload defaults unit_cost to 0 when omitted by BHW submission", () => {
  const result = buildStockReturnPayload({
    formValues: {
      lot_no: "LOT-9999",
      medicine_id: "med-1",
      quantity: "25",
      expiration_date: "2027-01-01",
      reason: "EXCESS_STOCK",
      facility_id: "bhw-facility",
    },
    medicine: {
      id: "med-1",
      generic_name: "Amoxicillin",
      brand_name: "Amoxil",
    },
    userProfile: {
      id: "user-bhw",
      role: "BHW",
      facility_id: "bhw-facility",
    },
  });

  assert.equal(result.unit_cost, 0);
  assert.equal(result.status, "PENDING");
  assert.equal(result.quantity, 25);
});

test("buildStockReturnPayload captures complete medicine information including dosage and unit_of_measure", () => {
  const result = buildStockReturnPayload({
    formValues: {
      lot_no: "LOT-8821",
      medicine_id: "med-500",
      quantity: "15",
      unit_cost: "12.75",
      expiration_date: "2027-06-30",
      reason: "REALLOCATION",
      dosage: "500 mg",
      unit_of_measure: "capsule",
      brand_name: "Amoxil Extra",
      facility_id: "bhw-alpaco",
    },
    medicine: {
      id: "med-500",
      generic_name: "Amoxicillin",
      brand_name: "Amoxil",
      dosage: "250 mg",
      unit_of_measure: "tablet",
    },
    userProfile: {
      id: "user-bhw",
      role: "BHW",
      facility_id: "bhw-alpaco",
    },
  });

  assert.equal(result.medicine_name, "Amoxicillin");
  assert.equal(result.dosage, "500 mg");
  assert.equal(result.brand_name, "Amoxil Extra");
  assert.equal(result.unit_of_measure, "capsule");
  assert.equal(result.lot_no, "LOT-8821");
  assert.equal(result.quantity, 15);
  assert.equal(result.unit_cost, 12.75);
});

test("flattenStockReturnRows preserves dosage and unit_of_measure from items and medicine relation", () => {
  const rows = flattenStockReturnRows([
    {
      id: "ret-200",
      source_facility_id: "facility-bhw",
      source_facility: { id: "facility-bhw", facility_name: "BHS Poblacion" },
      return_reason: "EXCESS_STOCK",
      status: "CONFIRMED",
      items: [
        {
          id: "item-201",
          batch_number: "BATCH-441",
          quantity: 20,
          unit_cost: "5.00",
          dosage: "10 mg",
          unit_of_measure: "bottle",
          expiration_date: "2028-01-01",
          medicine: { generic_name: "Cetirizine", brand_name: "Alnix", dosage: "5 mg", unit_of_measure: "tablet" },
        },
      ],
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].dosage, "10 mg");
  assert.equal(rows[0].unit_of_measure, "bottle");
  assert.equal(rows[0].medicine_name, "Cetirizine");
  assert.equal(rows[0].brand_name, "Alnix");
  assert.equal(rows[0].lot_no, "BATCH-441");
});

test("formatBrandName strips generic placeholders and preserves valid brand names", () => {
  assert.equal(formatBrandName("Ritemed"), "Ritemed");
  assert.equal(formatBrandName("  Biogesic  "), "Biogesic");
  assert.equal(formatBrandName("Generic"), "");
  assert.equal(formatBrandName("Generic (No Brand)"), "");
  assert.equal(formatBrandName("none"), "");
  assert.equal(formatBrandName("N/A"), "");
  assert.equal(formatBrandName("—"), "");
  assert.equal(formatBrandName(null), "");
});

test("resolveStockReturnMedicineInfo resolves full medicine details including dosage via partial match and lot lookup", () => {
  const medicines = [
    {
      id: "med-ascorbic",
      generic_name: "Ascorbic Acid",
      dosage: "500 mg",
      unit_of_measure: "tablet",
      unit_cost: "2.50",
    },
  ];

  const medicinesMap = new Map();
  medicinesMap.set("med-ascorbic", medicines[0]);
  medicinesMap.set("ascorbic acid", medicines[0]);

  const inventory = [
    {
      id: "inv-1",
      lot_no: "0827023",
      medicine_id: "med-ascorbic",
      brand_name: "Ritemed",
      dosage: "500 mg",
      unit_of_measure: "tablet",
      unit_cost: 2.5,
    },
  ];

  // 1. Test item having only "Ascorbic" as medicine_name (user's exact scenario from screenshot)
  const resolved = resolveStockReturnMedicineInfo(
    {
      medicine_name: "Ascorbic",
      brand_name: "Ritemed",
      lot_no: "0827023",
      quantity: 20,
    },
    { medicinesMap, medicines, inventory }
  );

  assert.equal(resolved.genericName, "Ascorbic");
  assert.equal(resolved.brand, "Ritemed");
  assert.equal(resolved.dosage, "500 mg");
  assert.equal(resolved.unit, "tablet");
  assert.equal(resolved.itemQty, 20);
  assert.equal(resolved.itemCost, 2.5);
  assert.equal(resolved.itemTotal, 50);

  // 2. Test fallback when dosage is embedded in medicine name
  const regexResolved = resolveStockReturnMedicineInfo(
    {
      medicine_name: "Paracetamol 500mg",
      brand_name: "Biogesic",
      quantity: 10,
    },
    { medicinesMap: new Map(), medicines: [], inventory: [] }
  );

  assert.equal(regexResolved.dosage, "500mg");
  assert.equal(regexResolved.brand, "Biogesic");
  assert.equal(regexResolved.itemQty, 10);
});

test("reconcileConfirmedReturnsIntoInventory correctly generates returned lots and attaches them to CHO inventory", async () => {
  const choFacility = {
    id: "cho-id",
    facility_name: "City Health Office - City of Naga",
    facility_code: "CHO-NAGA",
  };
  const bCenter = {
    id: "inayagan-id",
    facility_name: "Inayagan Barangay Health Center",
    facility_code: "HC-INAYAGAN",
  };

  const facilities = [choFacility, bCenter];
  const medicines = [
    {
      id: "med-ascorbic",
      generic_name: "Ascorbic",
      dosage: "100 mg/mL, 15 mL oral drops",
      unit_of_measure: "bottle",
      unit_cost: 45,
    },
  ];

  const currentInventory = [
    {
      id: "proc-1",
      facility_id: "cho-id",
      medicine_id: "med-ascorbic",
      batch_number: "0827023",
      po_number: "PO-2026-001",
      intake_type: "PROCUREMENT",
      quantity: 140,
      unit_cost: 45,
      expiration_date: "2027-01-27",
    },
  ];

  // Save confirmed return into snapshot
  const { saveSnapshot, saveUserSession, STORAGE_KEYS } = await import("../database/snapshotStore.js");
  saveUserSession({ id: "user-test" }, { id: "user-test", role: "CHO_PHARMACIST" });

  const testReturn = {
    id: "ret-user-test-1",
    return_id: "RET-HCINAYAGAN-20261029-HGKO",
    facility_id: "inayagan-id",
    medicine_id: "med-ascorbic",
    medicine_name: "Ascorbic",
    brand_name: "Ritemed",
    lot_no: "0827023",
    quantity: 20,
    unit_cost: 0,
    expiration_date: "2027-01-27",
    reason: "REALLOCATION",
    status: "CONFIRMED",
  };
  saveSnapshot(STORAGE_KEYS.STOCK_RETURNS, [testReturn]);

  const reconciled = await reconcileConfirmedReturnsIntoInventory(currentInventory, {
    facilities,
    medicines,
    stockReturns: [testReturn],
  });

  // Reconciled inventory should now contain both procurement and returned lots
  assert.equal(reconciled.length, 2);

  const returnLot = reconciled.find((it) => it.id === "inv_ret_ret-user-test-1");
  assert.ok(returnLot, "Returned lot must be present in reconciled inventory");
  assert.equal(returnLot.facility_id, "cho-id");
  assert.equal(returnLot.medicine_id, "med-ascorbic");
  assert.equal(returnLot.batch_number, "0827023");
  assert.equal(returnLot.po_number, "RET-HGKO1029");
  assert.equal(returnLot.quantity, 20);
  assert.equal(returnLot.unit_cost, 45, "Unit cost should resolve from existing batch when 0");
  assert.equal(returnLot.intake_type, "RETURN");
  assert.equal(returnLot.status, "ACTIVE");
  assert.equal(returnLot.supplier_name, "Returned from Inayagan Barangay Health Center");
});


