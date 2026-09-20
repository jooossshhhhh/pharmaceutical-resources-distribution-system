import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDemandQualitySummary,
  buildForecastInterpretation,
  buildMonthlyDemandTrend,
  calculateLinearRegression,
  computeSuggestedOrderQuantity,
  forecastSLR,
} from "./demandUtils.js";

test("calculateLinearRegression detects increasing monthly demand", () => {
  const regression = calculateLinearRegression([10, 20, 30, 40]);

  assert.equal(regression.direction, "INCREASING");
  assert.equal(regression.slope, 10);
  assert.equal(Math.round(regression.intercept), 10);
});

test("forecastSLR requires at least three monthly records", () => {
  const result = forecastSLR([
    { month: "2026-01", quantity: 40 },
    { month: "2026-02", quantity: 60 },
  ]);

  assert.equal(result.forecast, null);
  assert.equal(result.reason, "insufficient_history");
  assert.equal(result.confidenceLabel, "Not enough history");
});

test("forecastSLR forecasts next month and assigns confidence from R squared", () => {
  const result = forecastSLR([
    { month: "2026-01", quantity: 20 },
    { month: "2026-02", quantity: 40 },
    { month: "2026-03", quantity: 60 },
    { month: "2026-04", quantity: 80 },
  ]);

  assert.equal(result.forecast, 100);
  assert.equal(result.slope, 20);
  assert.equal(result.confidenceLabel, "Reliable trend");
  assert.equal(result.reason, null);
});

test("forecastSLR floors negative forecast at zero", () => {
  const result = forecastSLR([
    { month: "2026-01", quantity: 30 },
    { month: "2026-02", quantity: 20 },
    { month: "2026-03", quantity: 10 },
  ]);

  assert.equal(result.forecast, 0);
});

test("computeSuggestedOrderQuantity keeps projected use separate from current stock", () => {
  assert.equal(computeSuggestedOrderQuantity(130, 80), 50);
  assert.equal(computeSuggestedOrderQuantity(80, 130), 0);
  assert.equal(computeSuggestedOrderQuantity(null, 80), null);
});

test("buildMonthlyDemandTrend combines dispensing history and stored forecast rows", () => {
  const trend = buildMonthlyDemandTrend({
    dispensingRows: [
      { dispense_date: "2026-01-15", quantity: 20 },
      { dispense_date: "2026-01-20", quantity: 10 },
      { dispense_date: "2026-02-15", quantity: 40 },
    ],
    forecastRows: [
      { forecast_month: "2026-03-01", predicted_quantity: 55 },
      { forecast_month: "2026-04-01", predicted_quantity: 65 },
    ],
    maxMonths: 6,
  });

  assert.equal(trend.observedMonths, 2);
  assert.equal(trend.rows.length, 4);
  assert.deepEqual(
    trend.rows.map((row) => [row.label, row.historical, row.forecasted]),
    [
      ["Jan", 30, 0],
      ["Feb", 40, 0],
      ["Mar", 0, 55],
      ["Apr", 0, 65],
    ]
  );
  assert.equal(trend.regression.reason, "insufficient_history");
  assert.equal(trend.regression.forecast, null);
});

test("buildDemandQualitySummary labels strong regression evidence as good", () => {
  const quality = buildDemandQualitySummary({
    observedMonths: 3,
    forecastRows: [{ predicted_quantity: 25 }],
    dispensingRows: [{ quantity: 5 }],
  });

  assert.equal(quality.key, "GOOD");
  assert.equal(quality.label, "Good");
});

test("buildDemandQualitySummary labels sparse history as insufficient", () => {
  const quality = buildDemandQualitySummary({
    observedMonths: 0,
    forecastRows: [],
    dispensingRows: [],
  });

  assert.equal(quality.key, "INSUFFICIENT");
  assert.equal(quality.label, "Not enough data");
});

test("buildForecastInterpretation explains increasing demand in plain language", () => {
  const interpretation = buildForecastInterpretation({
    trend: {
      observedMonths: 4,
      regression: {
        direction: "INCREASING",
        slope: 12.25,
        forecast: 130,
        confidenceLabel: "Reliable trend",
      },
    },
    forecast: { total: 130, monthLabel: "Sep" },
    quantity: 80,
  });

  assert.equal(interpretation.title, "Medicine use is increasing");
  assert.equal(
    interpretation.summary,
    "Medicine use is increasing. Consider preparing more stock for next month."
  );
  assert.ok(interpretation.reasons.some((reason) => reason.label === "Monthly change"));
  assert.ok(interpretation.reasons.some((reason) => reason.label === "Trend confidence"));
});

test("buildForecastInterpretation warns when history is too sparse", () => {
  const interpretation = buildForecastInterpretation({
    trend: {
      observedMonths: 2,
      regression: {
        direction: "STABLE",
        slope: 0,
        forecast: null,
        confidenceLabel: "Not enough history",
        reason: "insufficient_history",
      },
    },
    forecast: null,
    quantity: 50,
  });

  assert.equal(interpretation.title, "Not enough history for a trend estimate");
  assert.equal(interpretation.tone, "red");
});
