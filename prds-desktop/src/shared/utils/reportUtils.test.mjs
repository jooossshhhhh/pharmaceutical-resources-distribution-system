import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateReportKpis,
  aggregateTopMedicines,
  aggregateFacilityDistribution,
  aggregateDailyDispensingTrend,
  formatPeso,
  formatReportDate,
  formatItemDescription,
  toDateKey,
  extractCompletedRequestItems,
} from "./reportUtils.js";

test("formatPeso correctly formats PHP currency", () => {
  assert.equal(formatPeso(18420.5), "₱18,420.50");
  assert.equal(formatPeso(0), "₱0.00");
  assert.equal(formatPeso(null), "₱0.00");
});

test("formatReportDate formats dates reliably", () => {
  const d = new Date(2026, 8, 25); // Sept 25, 2026
  assert.equal(formatReportDate(d), "September 25, 2026");
});

test("calculateReportKpis correctly tallies walk-in and BHW dispensing for target date", () => {
  const selectedDate = new Date(2026, 8, 25); // 2026-09-25

  const dispensingRows = [
    {
      id: "d1",
      quantity: 120,
      dispense_date: "2026-09-25T08:30:00Z",
      medicine: { generic_name: "Losartan", dosage: "50mg", unit_cost: 3.5 },
    },
    {
      id: "d2",
      quantity: 95,
      dispense_date: "2026-09-25T11:15:00Z",
      medicine: { generic_name: "Co-Amoxiclav", dosage: "625mg", unit_cost: 15.0 },
    },
    {
      id: "d3_yesterday",
      quantity: 50,
      dispense_date: "2026-09-24T10:00:00Z",
      medicine: { generic_name: "Paracetamol", unit_cost: 1.0 },
    },
  ];

  const requestRows = [
    {
      id: "r1",
      status: "COMPLETED",
      approved_at: "2026-09-25T14:00:00Z",
      facility: { facility_name: "Barangay Colon Health Center" },
      items: [
        {
          id: "item1",
          quantity: 132,
          medicine: { generic_name: "Amlodipine", dosage: "10mg", unit_cost: 2.0 },
        },
      ],
    },
    {
      id: "r2_pending",
      status: "PENDING", // should be ignored
      approved_at: "2026-09-25T14:00:00Z",
      facility: { facility_name: "Alpaco" },
      items: [{ quantity: 50 }],
    },
  ];

  const inventoryRows = [
    {
      id: "i1",
      quantity: 500,
      threshold: 50,
      medicine: { generic_name: "Paracetamol", unit_cost: 1.2 },
    },
    {
      id: "i2",
      quantity: 5,
      threshold: 20,
      medicine: { generic_name: "Amoxicillin", unit_cost: 5.0 },
    },
  ];

  const kpis = calculateReportKpis({
    dispensingRows,
    requestRows,
    inventoryRows,
    selectedDate,
  });

  // Walk-in = 120 + 95 = 215. BHW = 132. Total = 347.
  assert.equal(kpis.dispensedToday.totalUnits, 347);
  assert.equal(kpis.dispensedToday.walkInUnits, 215);
  assert.equal(kpis.dispensedToday.bhwUnits, 132);

  // Total cost = (120*3.5 + 95*15) + (132*2.0) = 420 + 1425 + 264 = 2109
  assert.equal(kpis.totalMedicineCost, 2109);

  // Remaining stock valuation = (500*1.2) + (5*5.0) = 600 + 25 = 625
  assert.equal(kpis.totalRemainingStockValue, 625);

  // Amoxicillin is <= threshold 20
  assert.equal(kpis.stockHealth.lowStockCount, 1);
  assert.deepEqual(kpis.stockHealth.lowStockNames, ["Amoxicillin"]);
});

test("aggregateTopMedicines returns descending sorted list of top items", () => {
  const selectedDate = new Date(2026, 8, 25);
  const dispensingRows = [
    {
      quantity: 100,
      dispense_date: "2026-09-25T08:00:00Z",
      medicine: { generic_name: "Losartan", dosage: "50mg", unit_cost: 3.5 },
    },
  ];
  const requestRows = [
    {
      status: "COMPLETED",
      approved_at: "2026-09-25T09:00:00Z",
      facility: { facility_name: "Balirong" },
      items: [
        {
          quantity: 250,
          medicine: { generic_name: "Amlodipine", dosage: "10mg", unit_cost: 2.0 },
        },
      ],
    },
  ];

  const top = aggregateTopMedicines({ dispensingRows, requestRows, selectedDate, limit: 5 });
  assert.equal(top.length, 2);
  assert.equal(top[0].name, "Amlodipine 10mg");
  assert.equal(top[0].quantity, 250);
  assert.equal(top[1].name, "Losartan 50mg");
  assert.equal(top[1].quantity, 100);
});

test("aggregateFacilityDistribution splits CHO and Barangay stations", () => {
  const selectedDate = new Date(2026, 8, 25);
  const dispensingRows = [
    { quantity: 80, dispense_date: "2026-09-25T08:00:00Z" },
  ];
  const requestRows = [
    {
      status: "COMPLETED",
      approved_at: "2026-09-25T09:00:00Z",
      facility: { facility_name: "Barangay Colon Health Center" },
      items: [{ quantity: 120 }],
    },
  ];

  const dist = aggregateFacilityDistribution({ dispensingRows, requestRows, selectedDate });
  assert.equal(dist.length, 2);
  assert.equal(dist[0].name, "BARANGAY COLON HEALTH CENTER");
  assert.equal(dist[0].value, 120);
  assert.equal(dist[1].name, "Pharmacy Dispensing (CHO)");
  assert.equal(dist[1].value, 80);
});

test("aggregateDailyDispensingTrend returns all days in month", () => {
  const dispensingRows = [
    { quantity: 15, dispense_date: "2026-09-02T10:00:00Z" },
    { quantity: 25, dispense_date: "2026-09-02T14:00:00Z" },
  ];
  const requestRows = [
    {
      status: "COMPLETED",
      approved_at: "2026-09-03T11:00:00Z",
      items: [{ quantity: 50 }],
    },
  ];

  const trend = aggregateDailyDispensingTrend({
    dispensingRows,
    requestRows,
    year: 2026,
    month: 9, // September (30 days)
  });

  assert.equal(trend.length, 30);
  assert.equal(trend[1].day, 2);
  assert.equal(trend[1].units, 40); // 15 + 25 on day 2
  assert.equal(trend[2].day, 3);
  assert.equal(trend[2].units, 50); // 50 on day 3
});

test("formatItemDescription correctly combines generic name and dosage without duplicate repetition", () => {
  // 1. Separate generic and dosage
  assert.equal(formatItemDescription("Paracetamol", "500 mg"), "Paracetamol 500 mg");
  assert.equal(formatItemDescription("Losartan", "50mg"), "Losartan 50mg");

  // 2. Generic already contains dosage
  assert.equal(formatItemDescription("Paracetamol 500 mg", "500 mg"), "Paracetamol 500 mg");
  assert.equal(formatItemDescription("Paracetamol 500mg Tablet", "500mg"), "Paracetamol 500mg Tablet");
  assert.equal(formatItemDescription("Amoxicillin 250mg/5mL", "250mg/5mL"), "Amoxicillin 250mg/5mL");

  // 3. Missing dosage
  assert.equal(formatItemDescription("Mefenamic Acid", ""), "Mefenamic Acid");
  assert.equal(formatItemDescription("Mefenamic Acid", null), "Mefenamic Acid");

  // 4. Missing generic
  assert.equal(formatItemDescription("", "500 mg"), "500 mg");

  // 5. Both empty
  assert.equal(formatItemDescription("", ""), "Medicine");
});

test("toDateKey reliably parses date strings, ISO timestamps, and Date objects without timezone shift", () => {
  // Pure date string YYYY-MM-DD
  assert.equal(toDateKey("2026-09-26"), "2026-09-26");
  assert.equal(toDateKey("2026-01-01"), "2026-01-01");

  // ISO timestamp
  assert.equal(toDateKey("2026-09-26T08:30:00Z").startsWith("2026-09-2"), true);

  // Date object
  const d = new Date(2026, 8, 26);
  assert.equal(toDateKey(d), "2026-09-26");

  // Empty / null
  assert.equal(toDateKey(null), "");
  assert.equal(toDateKey(""), "");
});

test("extractCompletedRequestItems extracts completed requests and enriches descriptions", () => {
  const requestRows = [
    {
      id: "req-1",
      status: "COMPLETED",
      approved_at: "2026-09-26",
      facility: { facility_name: "Barangay Colon" },
      items: [
        {
          id: "it-1",
          medicine_id: "m-1",
          quantity: 100,
          generic_name: "Metformin",
          dosage: "500 mg",
        },
      ],
    },
    {
      id: "req-2",
      status: "PENDING", // Ignored
      approved_at: "2026-09-26",
      items: [{ quantity: 50 }],
    },
  ];

  const items = extractCompletedRequestItems(requestRows, "2026-09-26");
  assert.equal(items.length, 1);
  assert.equal(items[0].description, "Metformin 500 mg");
  assert.equal(items[0].quantity, 100);
  assert.equal(items[0].facilityName, "BARANGAY COLON");
});

test("calculateReportKpis accurately calculates remaining stock valuation when unit_cost is in medicinesMap", () => {
  const medicinesMap = new Map([
    ["med-1", { id: "med-1", generic_name: "Amoxicillin", unit_cost: 50 }],
    ["med-2", { id: "med-2", generic_name: "Irbesartan", unit_cost: 30 }],
  ]);

  const rawInventoryRows = [
    { id: "inv-1", facility_id: "fac-cho", medicine_id: "med-1", quantity: 479, threshold: 10 },
    { id: "inv-2", facility_id: "fac-cho", medicine_id: "med-2", quantity: 200, threshold: 20 },
    { id: "inv-3", facility_id: "fac-alpaco", medicine_id: "med-2", quantity: 10, threshold: 5 },
  ];

  // All facilities: 479*50 + 200*30 + 10*30 = 23950 + 6000 + 300 = 30250
  const allKpis = calculateReportKpis({
    inventoryRows: rawInventoryRows,
    medicinesMap,
  });
  assert.equal(allKpis.totalRemainingStockValue, 30250);

  // Scoped to specific health center (fac-alpaco): 10*30 = 300
  const alpacoInventory = rawInventoryRows.filter((r) => r.facility_id === "fac-alpaco");
  const alpacoKpis = calculateReportKpis({
    inventoryRows: alpacoInventory,
    medicinesMap,
  });
  assert.equal(alpacoKpis.totalRemainingStockValue, 300);

  // Scoped to CHO: 479*50 + 200*30 = 29950
  const choInventory = rawInventoryRows.filter((r) => r.facility_id === "fac-cho");
  const choKpis = calculateReportKpis({
    inventoryRows: choInventory,
    medicinesMap,
  });
  assert.equal(choKpis.totalRemainingStockValue, 29950);
  assert.equal(choKpis.stockHealth.hasData, true);
  assert.equal(choKpis.stockHealth.totalItems, 2);

  // Scoped to facility with zero inventory records
  const emptyKpis = calculateReportKpis({
    inventoryRows: [],
    medicinesMap,
  });
  assert.equal(emptyKpis.totalRemainingStockValue, 0);
  assert.equal(emptyKpis.stockHealth.hasData, false);
  assert.equal(emptyKpis.stockHealth.totalItems, 0);
});


