import assert from "node:assert/strict";
import test from "node:test";

import {
  buildForecastAnalytics,
  buildCategoryForecastRows,
  buildForecastInterpretation,
  buildInventoryCoverageRows,
  buildMonthlyConsumptionRows,
  calculateLinearRegression,
  getInventoryRisk,
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
