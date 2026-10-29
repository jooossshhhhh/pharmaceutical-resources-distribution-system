import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFacilityRedistributionComparison,
  buildForecastAnalytics,
  buildCategoryForecastRows,
  buildForecastInterpretation,
  buildInventoryCoverageRows,
  buildMedicineActionFindings,
  buildMedicineChartSeries,
  buildMedicineTrendRows,
  buildMonthlyConsumptionRows,
  calculateLinearRegression,
  getInventoryRisk,
  getReliabilityMeta,
} from "./forecastingUtils.js";

const medicineA = {
  id: "med-a",
  brand_name: "ReliefCare",
  dosage: "500mg",
  generic_name: "Paracetamol",
  unit_of_measure: "tablet",
};

const medicineB = {
  id: "med-b",
  brand_name: "PressureGuard",
  dosage: "50mg",
  generic_name: "Losartan",
  unit_of_measure: "tablet",
};

test("aggregates category history, forecasts, and stock", () => {
  const categoryRows = buildCategoryForecastRows({
    category: "Antibiotic",
    dispensingRows: [
      { facility_id: "cho", medicine_id: "med-a", month: "2026-01-01", total_dispensed: 10, medicine: { categories: ["Antibiotic"] } },
      { facility_id: "cho", medicine_id: "med-b", month: "2026-01-01", total_dispensed: 15, medicine: { categories: ["Antibiotic"] } },
      { facility_id: "cho", medicine_id: "med-c", month: "2026-01-01", total_dispensed: 99, medicine: { categories: ["Analgesic"] } },
    ],
    forecastRows: [
      { facility_id: "cho", medicine_id: "med-a", forecast_month: "2026-02-01", predicted_quantity: 20, medicine: { categories: ["Antibiotic"] } },
      { facility_id: "cho", medicine_id: "med-b", forecast_month: "2026-02-01", predicted_quantity: 30, medicine: { categories: ["Antibiotic"] } },
    ],
    inventoryRows: [
      { facility_id: "cho", medicine_id: "med-a", quantity: 40, threshold: 10, medicine: { categories: ["Antibiotic"] } },
      { facility_id: "cho", medicine_id: "med-b", quantity: 60, threshold: 20, medicine: { categories: ["Antibiotic"] } },
    ],
  });

  assert.equal(categoryRows.dispensingRows[0].total_dispensed, 25);
  assert.equal(categoryRows.forecastRows[0].predicted_quantity, 50);
  assert.equal(categoryRows.inventoryRows[0].quantity, 100);
  assert.equal(categoryRows.inventoryRows[0].threshold, 30);
  assert.equal(categoryRows.inventoryRows[0].medicine.generic_name, "Antibiotic");
});

test("calculates simple linear regression slope and fit", () => {
  const result = calculateLinearRegression([10, 20, 30, 40]);

  assert.equal(result.slope, 10);
  assert.equal(result.intercept, 10);
  assert.equal(result.rSquared, 1);
});

test("groups historical dispensing and forecasted quantities by month", () => {
  const rows = buildMonthlyConsumptionRows({
    dispensingRows: [
      { month: "2026-01-01", total_dispensed: 12 },
      { month: "2026-01-01", total_dispensed: 8 },
      { month: "2026-02-01", total_dispensed: 18 },
    ],
    forecastRows: [
      { forecast_month: "2026-02-01", predicted_quantity: 24 },
      { forecast_month: "2026-03-01", predicted_quantity: 30 },
    ],
  });

  assert.deepEqual(rows, [
    { key: "2026-01", label: "Jan", historical: 20, forecasted: 0 },
    { key: "2026-02", label: "Feb", historical: 18, forecasted: 24 },
    { key: "2026-03", label: "Mar", historical: 0, forecasted: 30 },
  ]);
});

test("ranks medicine trends by positive monthly forecast slope", () => {
  const analytics = buildForecastAnalytics({
    dispensingRows: [
      { medicine_id: "med-a", month: "2026-01-01", total_dispensed: 30 },
      { medicine_id: "med-a", month: "2026-02-01", total_dispensed: 35 },
      { medicine_id: "med-b", month: "2026-01-01", total_dispensed: 50 },
      { medicine_id: "med-b", month: "2026-02-01", total_dispensed: 45 },
    ],
    forecastRows: [
      { medicine_id: "med-a", forecast_month: "2026-03-01", predicted_quantity: 42, medicine: medicineA },
      { medicine_id: "med-a", forecast_month: "2026-04-01", predicted_quantity: 54, medicine: medicineA },
      { medicine_id: "med-b", forecast_month: "2026-03-01", predicted_quantity: 40, medicine: medicineB },
      { medicine_id: "med-b", forecast_month: "2026-04-01", predicted_quantity: 38, medicine: medicineB },
    ],
    inventoryRows: [
      { medicine_id: "med-a", quantity: 70, threshold: 20, medicine: medicineA },
      { medicine_id: "med-b", quantity: 200, threshold: 50, medicine: medicineB },
    ],
  });

  assert.equal(analytics.trendingMedicines[0].medicineId, "med-a");
  assert.equal(analytics.trendingMedicines[0].direction, "Increasing");
  assert.equal(analytics.trendingMedicines[0].forecastSlope, 12);
  assert.equal(analytics.trendingMedicines[1].direction, "Declining");
});

test("builds inventory coverage from current stock and latest forecast demand", () => {
  const coverageRows = buildInventoryCoverageRows({
    forecastRows: [
      { medicine_id: "med-a", forecast_month: "2026-03-01", predicted_quantity: 60, medicine: medicineA },
      { medicine_id: "med-a", forecast_month: "2026-04-01", predicted_quantity: 120, medicine: medicineA },
    ],
    inventoryRows: [
      { facility_id: "cho", medicine_id: "med-a", quantity: 90, threshold: 30, medicine: medicineA },
    ],
  });

  assert.equal(coverageRows[0].currentStock, 90);
  assert.equal(coverageRows[0].projectedDemand, 120);
  assert.equal(coverageRows[0].coverageMonths, 0.75);
  assert.equal(coverageRows[0].risk.label, "Low Stock");
});

test("labels inventory risk using stock coverage and threshold", () => {
  assert.equal(getInventoryRisk({ coverageMonths: 0, quantity: 0, threshold: 20 }).label, "Critical");
  assert.equal(getInventoryRisk({ coverageMonths: 0.5, quantity: 30, threshold: 20 }).label, "Low Stock");
  assert.equal(getInventoryRisk({ coverageMonths: 1.25, quantity: 40, threshold: 20 }).label, "Monitor Stock");
  assert.equal(getInventoryRisk({ coverageMonths: 2.5, quantity: 80, threshold: 20 }).label, "Enough Stock");
});

test("builds plain-language forecast interpretation", () => {
  assert.equal(
    buildForecastInterpretation({
      increasingCount: 1,
      monthlyRows: [
        { historical: 10, forecasted: 0 },
        { historical: 0, forecasted: 20 },
      ],
      riskRows: [],
    }).sentence,
    "Medicine use is increasing. Review if current stock is enough for next month."
  );

  assert.equal(
    buildForecastInterpretation({
      monthlyRows: [{ historical: 10, forecasted: 0 }],
    }).sentence,
    "There are not enough records yet to estimate next month clearly."
  );
});

test("buildMedicineChartSeries returns empty array when there is no historical or forecast series", () => {
  const result = buildMedicineChartSeries({
    historicalSeries: [],
    forecastSeries: [],
    slope: 0,
    intercept: 0,
    horizon: 6,
  });

  assert.deepEqual(result, []);
});

test("buildMedicineChartSeries plots real historical series and projects forward", () => {
  const result = buildMedicineChartSeries({
    historicalSeries: [
      { key: "2026-01", value: 100 },
      { key: "2026-02", value: 120 },
    ],
    forecastSeries: [],
    slope: 20,
    intercept: 100,
    horizon: 3,
  });

  assert.equal(result.length, 5); // 2 historical + 3 projected
  assert.equal(result[0].historical, 100);
  assert.equal(result[1].historical, 120);
  assert.equal(result[1].projected, 120); // Bridge point
  assert.equal(result[2].month, "+1mo");
  assert.equal(result[2].projected, 140);
  assert.equal(result[3].month, "+2mo");
  assert.equal(result[3].projected, 160);
  assert.equal(result[4].month, "+3mo");
  assert.equal(result[4].projected, 180);
});

test("buildForecastAnalytics returns 0 avgRSquared when there are no valid regression fits", () => {
  const analytics = buildForecastAnalytics({
    dispensingRows: [],
    forecastRows: [],
    inventoryRows: [
      { medicine_id: "med-a", quantity: 60, threshold: 10, medicine: medicineA },
    ],
  });

  assert.equal(analytics.avgRSquared, 0);
  assert.equal(analytics.totalProjectedDemand, 0);
  assert.equal(analytics.increasingCount, 0);
});

test("getReliabilityMeta returns plain-language confidence labels", () => {
  assert.equal(getReliabilityMeta(0.85, 4).label, "High");
  assert.equal(getReliabilityMeta(0.5, 3).label, "Moderate");
  assert.equal(getReliabilityMeta(0.2, 3).label, "Limited");
  assert.equal(getReliabilityMeta(0.9, 1).label, "Needs Data");
  assert.equal(getReliabilityMeta(null, 3).label, "Needs Data");
});

test("buildMedicineActionFindings calculates plain runout, reorder recommendation, and pace", () => {
  const criticalFindings = buildMedicineActionFindings({
    stockQuantity: 10,
    threshold: 50,
    nextMonthDemand: 60,
    slope: 15,
    historicalSeries: [{ key: "2026-01", value: 45 }, { key: "2026-02", value: 60 }],
  });

  assert.equal(criticalFindings.runout.severity, "critical");
  assert.match(criticalFindings.runout.label, /Days of Supply Left/);
  assert.equal(criticalFindings.action.type, "reorder");
  assert.match(criticalFindings.action.label, /Request \+/);
  assert.match(criticalFindings.pace.label, /Rising/);

  const ampleFindings = buildMedicineActionFindings({
    stockQuantity: 500,
    threshold: 50,
    nextMonthDemand: 0,
    slope: 0,
    historicalSeries: [{ key: "2026-01", value: 0 }],
  });

  assert.equal(ampleFindings.runout.severity, "normal");
  assert.match(ampleFindings.runout.label, /Ample Stock/);
  assert.equal(ampleFindings.action.type, "neutral");

  // CHO Near-Expiry: Prioritize FEFO Dispensing (central stock does not return to CHO)
  const choExpiryFindings = buildMedicineActionFindings(
    {
      stockQuantity: 200,
      threshold: 10,
      nextMonthDemand: 10,
      slope: 0,
      atRiskExpiryUnits: 150,
      daysToNearestExpiry: 30,
      circularRisk: { type: "expiry_risk" },
      historicalSeries: [{ key: "2026-01", value: 10 }],
    },
    { isCho: true }
  );

  assert.equal(choExpiryFindings.action.type, "dispense_fefo");
  assert.equal(choExpiryFindings.actionQuantity, 150);
  assert.match(choExpiryFindings.action.label, /Prioritize FEFO Dispensing/);
  assert.match(choExpiryFindings.action.subtext, /prioritize walk-in dispensing/);

  // BHW Near-Expiry: Dual Action (Dispense Locally or Return to CHO)
  const bhwExpiryFindings = buildMedicineActionFindings(
    {
      stockQuantity: 200,
      threshold: 10,
      nextMonthDemand: 10,
      slope: 0,
      atRiskExpiryUnits: 150,
      daysToNearestExpiry: 30,
      circularRisk: { type: "expiry_risk" },
      historicalSeries: [{ key: "2026-01", value: 10 }],
    },
    { isCho: false }
  );

  assert.equal(bhwExpiryFindings.action.type, "near_expiry_bhw");
  assert.equal(bhwExpiryFindings.actionQuantity, 150);
  assert.match(bhwExpiryFindings.action.label, /Near-Expiry Action/);
  assert.match(bhwExpiryFindings.action.subtext, /dispense locally to patients or return to CHO/);
});

test("getReliabilityMeta protects against n=2 false certainty", () => {
  // With n=2, R² is mathematically 1.0, but sample size is too small for statistical certainty
  assert.equal(getReliabilityMeta(1.0, 2).label, "Needs Data");
  assert.match(getReliabilityMeta(1.0, 2).desc, /Less than 3 months/);
});

test("buildMedicineChartSeries includes continuous olsFit and prediction bounds", () => {
  const result = buildMedicineChartSeries({
    historicalSeries: [
      { key: "2026-01", value: 100 },
      { key: "2026-02", value: 120 },
      { key: "2026-03", value: 140 },
    ],
    forecastSeries: [],
    slope: 20,
    intercept: 100,
    horizon: 3,
  });

  assert.equal(result.length, 6);
  // Future months have olsFit populated
  assert.equal(result[3].month, "+1mo");
  assert.equal(result[3].olsFit, 160);
  assert.equal(result[3].projected, 160);
  assert.equal(result[4].olsFit, 180);
});

test("buildMedicineTrendRows correctly identifies threshold breaches and FEFO expiry risk", () => {
  const rows = buildMedicineTrendRows({
    dispensingRows: [
      { medicine_id: "med-a", month: "2026-01-01", total_dispensed: 50 },
    ],
    forecastRows: [
      { medicine_id: "med-a", forecast_month: "2026-02-01", predicted_quantity: 50, medicine: medicineA },
      { medicine_id: "med-b", forecast_month: "2026-02-01", predicted_quantity: 10, medicine: medicineB },
    ],
    inventoryRows: [
      // Med A: threshold breach (stock <= threshold)
      { medicine_id: "med-a", quantity: 15, threshold: 30, medicine: medicineA },
      // Med B: Overstock with near expiration (expiry in 30 days, 200 units on shelf but only 10 needed/mo)
      {
        medicine_id: "med-b",
        quantity: 200,
        threshold: 10,
        medicine: medicineB,
        expiration_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      },
    ],
  });

  const medARow = rows.find((r) => r.medicineId === "med-a");
  const medBRow = rows.find((r) => r.medicineId === "med-b");

  assert.equal(medARow.circularRisk.type, "stockout");
  assert.equal(medBRow.circularRisk.type, "expiry_risk");
  assert.equal(medBRow.circularRisk.label, "Expiry Risk (FEFO)");
});

test("buildFacilityRedistributionComparison identifies deficit vs surplus facilities", () => {
  const comparison = buildFacilityRedistributionComparison({
    medicineId: "med-a",
    dispensingRows: [
      { facility_id: "fac-1", medicine_id: "med-a", month: "2026-01-01", total_dispensed: 100 },
      { facility_id: "fac-2", medicine_id: "med-a", month: "2026-01-01", total_dispensed: 20 },
    ],
    inventoryRows: [
      { facility_id: "fac-1", medicine_id: "med-a", quantity: 50, threshold: 20 }, // Deficit (has 50, needs 220 target)
      { facility_id: "fac-2", medicine_id: "med-a", quantity: 300, threshold: 10 }, // Surplus (has 300, needs 50 target)
    ],
    facilities: [
      { id: "fac-1", facility_name: "Tinaan Health Station" },
      { id: "fac-2", facility_name: "CHO Central Warehouse" },
    ],
  });

  assert.equal(comparison.length, 2);
  assert.equal(comparison[0].facilityId, "fac-1");
  assert.equal(comparison[0].status, "deficit");
  assert.equal(comparison[1].facilityId, "fac-2");
  assert.equal(comparison[1].status, "surplus");
});
