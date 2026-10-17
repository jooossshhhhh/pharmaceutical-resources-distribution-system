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

test("generateReturnId and generateReturnSlipNo format return IDs accurately with facility code and date", () => {
  const returnId = generateReturnId("BHW-ALPACO");
  assert.match(returnId, /^RET-BHWALPACO-\d{8}-[A-Z0-9]{4}$/);

  const slipNo = generateReturnSlipNo("BHW-ALPACO");
  assert.match(slipNo, /^RET-BHWALPACO-\d{8}-[A-Z0-9]{4}$/);

  const fallbackReturnId = generateReturnId();
  assert.match(fallbackReturnId, /^RET-BHW-\d{8}-[A-Z0-9]{4}$/);
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

