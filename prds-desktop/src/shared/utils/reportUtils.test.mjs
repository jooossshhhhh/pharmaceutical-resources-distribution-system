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
  aggregateMonthlyDispensingDistribution,
  aggregateHourlyDispensingFlow,
  getDailyDispensingTransactions,
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

test("aggregateMonthlyDispensingDistribution accurately tallies 3 workflows and calculates percentages", () => {
  const dispensingRows = [
    {
      id: "d1",
      quantity: 100,
      dispense_date: "2026-10-05T08:30:00Z",
      medicine: { generic_name: "Amoxicillin", unit_cost: 5.0 },
    },
    {
      id: "d2_september",
      quantity: 50,
      dispense_date: "2026-09-25T08:30:00Z",
      medicine: { generic_name: "Amoxicillin", unit_cost: 5.0 },
    },
  ];

  const requestRows = [
    {
      id: "req1",
      status: "COMPLETED",
      approved_at: "2026-10-12T10:00:00Z",
      items: [
        {
          quantity: 200,
          medicine: { generic_name: "Paracetamol", unit_cost: 2.0 },
        },
      ],
    },
    {
      id: "req2_pending",
      status: "PENDING",
      approved_at: "2026-10-12T10:00:00Z",
      items: [{ quantity: 999, medicine: { unit_cost: 2.0 } }],
    },
  ];

  const otherProgramsRows = [
    {
      id: "prog1",
      status: "ACTIVE",
      program_date: "2026-10-18T09:00:00Z",
      medicines: [
        {
          quantity_used: 100,
          unit_cost: 10.0,
        },
      ],
    },
    {
      id: "prog2_cancelled",
      status: "CANCELLED",
      program_date: "2026-10-18T09:00:00Z",
      medicines: [{ quantity_used: 500, unit_cost: 10.0 }],
    },
  ];

  const result = aggregateMonthlyDispensingDistribution({
    dispensingRows,
    requestRows,
    otherProgramsRows,
    year: 2026,
    month: 10,
  });

  // Total: 100 (walk-in) + 200 (requests) + 100 (programs) = 400
  assert.equal(result.totalUnits, 400);
  // Total Cost: 100*5 (500) + 200*2 (400) + 100*10 (1000) = 1900
  assert.equal(result.totalCost, 1900);

  const reqChannel = result.channels.find((c) => c.id === "requests");
  assert.equal(reqChannel.units, 200);
  assert.equal(reqChannel.percentage, 50.0); // 200 / 400 = 50%

  const walkInChannel = result.channels.find((c) => c.id === "walk_in");
  assert.equal(walkInChannel.name, "Walk-in");
  assert.equal(walkInChannel.description, "CHO Pharmacy Dispensing");
  assert.equal(walkInChannel.units, 100);
  assert.equal(walkInChannel.percentage, 25.0); // 100 / 400 = 25%

  const progChannel = result.channels.find((c) => c.id === "other_programs");
  assert.equal(progChannel.units, 100);
  assert.equal(progChannel.percentage, 25.0); // 100 / 400 = 25%
});

test("aggregateHourlyDispensingFlow aggregates dispensing volume by hour and pinpoints peak rush hour", () => {
  const selectedDate = new Date(2026, 9, 5); // 2026-10-05

  const dispensingRows = [
    {
      id: "d1",
      quantity: 30,
      dispense_date: "2026-10-05T09:15:00",
      medicine: { unit_cost: 10 },
    },
    {
      id: "d2",
      quantity: 45,
      dispense_date: "2026-10-05T09:45:00",
      medicine: { unit_cost: 10 },
    },
    {
      id: "d3",
      quantity: 20,
      dispense_date: "2026-10-05T14:10:00",
      medicine: { unit_cost: 5 },
    },
  ];

  const requestRows = [
    {
      id: "req1",
      status: "COMPLETED",
      approved_at: "2026-10-05T10:30:00",
      items: [{ quantity: 100, medicine: { unit_cost: 4 } }],
    },
  ];

  const flow = aggregateHourlyDispensingFlow({
    dispensingRows,
    requestRows,
    selectedDate,
  });

  // Total units: (30 + 45) + 100 + 20 = 195
  assert.equal(flow.totalUnits, 195);
  // Total cost: 75*10 (750) + 100*4 (400) + 20*5 (100) = 1250
  assert.equal(flow.totalCost, 1250);

  // 9 AM should have 75 units (30 + 45)
  const nineAm = flow.hours.find((h) => h.hour === 9);
  assert.equal(nineAm.units, 75);
  assert.equal(nineAm.walkInUnits, 75);

  // 10 AM should have 100 units from BHW completed request
  const tenAm = flow.hours.find((h) => h.hour === 10);
  assert.equal(tenAm.units, 100);
  assert.equal(tenAm.bhwUnits, 100);

  // 2 PM (14:00) should have 20 units
  const twoPm = flow.hours.find((h) => h.hour === 14);
  assert.equal(twoPm.units, 20);

  // Peak hour should be 10 AM (100 units)
  assert.equal(flow.peakHour.hour, 10);
  assert.equal(flow.peakHour.units, 100);
});

test("getDailyDispensingTransactions extracts sorted table rows for selected date", () => {
  const selectedDate = new Date(2026, 9, 5); // 2026-10-05

  const dispensingRows = [
    {
      id: "d1",
      quantity: 20,
      dispense_date: "2026-10-05T09:15:00",
      patient: { first_name: "Maria", last_name: "Santos", patient_code: "NAGA-101" },
      medicine: { generic_name: "Amoxicillin", dosage: "500 mg", unit_cost: 5 },
      prescribed_by: "Dr. Reyes",
    },
    {
      id: "d2_other_day",
      quantity: 50,
      dispense_date: "2026-10-06T09:15:00",
      patient: { first_name: "Pedro", last_name: "Cruz" },
      medicine: { generic_name: "Losartan", dosage: "50 mg" },
    },
  ];

  const requestRows = [
    {
      id: "req1",
      status: "COMPLETED",
      approved_at: "2026-10-05T11:00:00",
      facility: { facility_name: "Barangay Colon" },
      request_number: "RIS-002",
      items: [
        {
          id: "it1",
          quantity: 200,
          generic_name: "Paracetamol",
          dosage: "500 mg",
          unit_cost: 2,
        },
      ],
    },
  ];

  const list = getDailyDispensingTransactions({
    dispensingRows,
    requestRows,
    selectedDate,
  });

  // Only 2 items belong to 2026-10-05
  assert.equal(list.length, 2);

  // Sorted newest first: 11:00 AM (BHW) comes before 09:15 AM (Walk-in)
  assert.equal(list[0].channel, "Barangay Request");
  assert.equal(list[0].recipient, "BARANGAY COLON");
  assert.equal(list[0].quantity, 200);

  assert.equal(list[1].channel, "Walk-in");
  assert.equal(list[1].recipient, "Maria Santos");
  assert.equal(list[1].medicineName, "Amoxicillin 500 mg");
  assert.equal(list[1].quantity, 20);
  assert.equal(list[1].prescribedBy, "Dr. Reyes");
});
