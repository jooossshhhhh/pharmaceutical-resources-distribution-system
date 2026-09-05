---
name: inventory-demand-forecasting
description: Forecasts medicine consumption trends and predicts next-period stock demand using Simple Linear Regression (SLR), for the Pharmaceutical Distribution Resources System (PDRS) linking the Central Health Office (CHO) and its Health Centers (BHW). Use this skill any time the task involves consumption trend analysis, next-month/next-period demand prediction, stock projection, reorder quantity, or supplier request quantity for medicines — whether the request is about implementing the forecasting feature in code, reviewing/debugging existing forecasting logic, computing a forecast by hand from consumption data, or designing the forecast report/dashboard shown to CHO staff or BHWs. Trigger this even if the user doesn't say "forecast" explicitly — phrases like "how much [medicine] do we need next month", "predict demand", "consumption trend", "stock projection", "reorder quantity", or "supplier request quantity" within this project all call for this skill.
---

# Inventory Demand Forecasting (PDRS)

Forecasting logic for the Pharmaceutical Distribution Resources System (PDRS). PDRS integrates the **Central Health Office (CHO)**, which holds the main inventory, with its **Health Centers**, staffed by **Barangay Health Workers (BHW)**. The forecasting feature helps both sides answer the same question — *"how much of this medicine will we need next month?"* — using **Simple Linear Regression (SLR)** over historical monthly consumption.

There are two forecasting contexts in this system, and it matters which one a task is about:

1. **Health Center → CHO**: a BHW's forecast of their center's own consumption, used to size their monthly stock request to the CHO.
2. **CHO → Supplier**: the CHO's forecast of aggregate consumption across all health centers it serves, used to size its restock order to the supplier.

The math is identical at both levels — only the input data (single-center vs. aggregated) and the audience of the output differ. Confirm which level a task refers to before computing or writing code, if it isn't already clear.

## The core method: Simple Linear Regression

Treat each historical month as a data point: `x` = month index (1, 2, 3, ... in chronological order), `y` = quantity consumed that month. Fit the line `y = a + bx`:

```
b (slope)     = (nΣxy - ΣxΣy) / (nΣx² - (Σx)²)
a (intercept) = (Σy - bΣx) / n
```

Then the forecast for the next month (`x_next` = n + 1) is:

```
y_forecast = a + b * x_next
```

Also compute **R² (coefficient of determination)** to indicate how well the trend line fits the historical data — this is the confidence signal shown alongside the number, not just the number itself:

```
R² = 1 - (SS_res / SS_tot)
SS_res = Σ(y_i - ŷ_i)²         # ŷ_i is the predicted value at each historical x_i
SS_tot = Σ(y_i - ȳ)²           # ȳ is the mean of actual y values
```

### Minimum data requirement

SLR needs at least **3 months** of consumption history to produce a meaningful trend; 2 points will always fit a line perfectly (R² = 1) but that's not a real trend, it's just two dots. When there's fewer than 3 months of data for a medicine:

- Don't compute or display a forecast number.
- Fall back to the historical average (or the most recent month's figure) and clearly label it as **"insufficient history for a trend forecast"** rather than presenting an SLR result with false confidence.

## Reference implementation

```javascript
function forecastSLR(history) {
  // history: array of { month: number, quantity: number }, chronologically ordered
  const n = history.length;
  if (n < 3) {
    return { forecast: null, confidence: null, reason: "insufficient_history" };
  }

  const xs = history.map((_, i) => i + 1);
  const ys = history.map(h => h.quantity);

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((sum, x, i) => sum + x * ys[i], 0);
  const sumX2 = xs.reduce((sum, x) => sum + x * x, 0);

  const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const a = (sumY - b * sumX) / n;

  const yMean = sumY / n;
  const predicted = xs.map(x => a + b * x);
  const ssRes = ys.reduce((sum, y, i) => sum + (y - predicted[i]) ** 2, 0);
  const ssTot = ys.reduce((sum, y) => sum + (y - yMean) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  const nextX = n + 1;
  const forecast = a + b * nextX;

  return {
    forecast: Math.max(0, Math.round(forecast)), // consumption can't be negative
    slope: b,
    intercept: a,
    r2: Number(r2.toFixed(3)),
    reason: null,
  };
}
```

This project uses **React + Vite**, so `forecastSLR` above is the actual utility function to use — keep it as a plain, framework-free function (e.g. in `src/utils/forecasting.js` or `src/lib/forecasting.js`), not tied to any component, so it stays independently testable and reusable wherever a forecast is needed (dashboard cards, request forms, reports).

### React integration pattern

Wrap the utility in a small hook when a component needs a live forecast from consumption history already in state/props:

```javascript
// src/hooks/useForecast.js
import { useMemo } from "react";
import { forecastSLR } from "../utils/forecasting";

export function useForecast(consumptionHistory) {
  return useMemo(() => forecastSLR(consumptionHistory), [consumptionHistory]);
}
```

```jsx
// usage in a component
function MedicineForecastCard({ medicine, consumptionHistory }) {
  const { forecast, r2, reason } = useForecast(consumptionHistory);

  if (reason === "insufficient_history") {
    return <ForecastPlaceholder label="Not enough data yet" />;
  }

  return (
    <ForecastCard
      name={medicine.name}
      predictedQuantity={forecast}
      confidenceLabel={r2 >= 0.7 ? "Reliable trend" : r2 >= 0.4 ? "Moderate — noisy trend" : "Weak — rough estimate"}
    />
  );
}
```

If consumption history is fetched from an API rather than computed client-side, keep `forecastSLR` as the single source of truth and call it wherever the raw monthly quantities are available — don't duplicate the regression math in multiple components. If the backend ends up computing forecasts instead (e.g. to keep the calculation consistent across all clients), port the same function server-side and treat the client-side version here as the reference implementation to match.

## Turning a forecast into a recommended order quantity

The forecast number (`y_forecast`) is *predicted consumption*, not automatically the *quantity to request*. When the task is to recommend how much to order/request (rather than just show the trend), account for:

- **Current stock on hand** — subtract what's already available: `recommended_order = max(0, forecast - current_stock)`.
- **Lead time** — if the supplier or CHO takes longer than the forecast period to fulfill, the forecast window should cover the lead time, not just one month.
- **Safety stock / buffer** — many pharmaceutical systems add a buffer (e.g., a fixed % or a set number of days of supply) to guard against stockouts from demand spikes or supply delays. Ask the user what buffer policy they want rather than inventing a percentage — this is a business/clinical decision, not a statistical one.
- **Expiry constraints** — don't recommend ordering more than can reasonably be consumed before expiration, especially for medicines with shorter shelf lives.

Keep the raw trend forecast and the final recommended order quantity as two distinct, clearly labeled values wherever both are shown — conflating them hides the reasoning from the CHO/BHW user who needs to trust the number.

## Presenting forecasts to CHO / BHW users

The audience is health workers, not statisticians. When designing or writing the output (report, dashboard card, or table row), prioritize clarity over statistical detail:

- Lead with the plain answer: medicine name, predicted quantity, and the period it covers (e.g., "Amoxicillin 500mg — projected need next month: 1,240 capsules").
- Show the trend direction in plain language ("consumption has been rising ~8% per month over the last 6 months"), not just the raw slope value.
- Surface R² as a confidence indicator using a simple label rather than the raw statistic — e.g., roughly R² ≥ 0.7 → "reliable trend", 0.4–0.7 → "moderate — trend is noisy", below 0.4 → "weak — treat as a rough estimate". Adjust these cut-offs if the user has their own convention, but don't just print "R² = 0.62" with no interpretation.
- Flag the "insufficient history" case visibly rather than silently omitting the medicine from a report — a missing forecast should read as "not enough data yet," not look like an oversight.
- If consumption dropped to zero in a recent month because of a **stockout** (not because demand actually vanished), that month will distort the trend line. Note this as a known limitation when it's relevant, and prefer flagging it over silently "fixing" the data by guessing what true demand would have been.

## Common pitfalls to avoid

- **Don't** apply SLR forecasting to medicines with highly seasonal or erratic demand (e.g., a sudden outbreak) without flagging that a straight-line trend is a poor fit for that pattern — R² will usually already signal this, but call it out explicitly if asked to interpret results.
- **Don't** silently round or clip the forecast without saying so; state clearly when negative slope predictions are floored at zero.
- **Don't** mix data from different medicines, units of measure, or health centers into a single regression unless the task explicitly asks for an aggregate (e.g., CHO-wide total). Forecast per medicine, per site, unless aggregation is the point.
- **Don't** invent a safety-stock percentage, lead time, or reorder policy — ask, since these are operational decisions specific to this CHO's workflow.
