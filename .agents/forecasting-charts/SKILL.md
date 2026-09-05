---
name: forecast-charts
description: Builds simple, interactive charts and bar graphs for the PRDS forecasting module — line charts for consumption trends and bar charts for actual-vs-forecasted quantity comparisons, using Recharts in the React + Vite app. Use this skill whenever the task involves visualizing forecast data, plotting consumption history, charting predicted vs actual stock, or adding any graph/chart to the forecasting screens (dashboard, medicine detail, facility reports). Trigger this alongside the inventory-demand-forecasting skill whenever a UI needs to *display* a forecast rather than just compute one — e.g. "add a chart showing the trend", "show this as a bar graph", "visualize the prediction", "make this graph interactive".
---

# Forecast Charts (PRDS)

Renders the output of the `inventory-demand-forecasting` skill (historical consumption + the SLR-predicted next value) as charts that a CHO staffer or BHW can read at a glance — not a statistics dashboard. Two chart types cover essentially every forecasting screen in this app:

- **Line chart** — consumption over time, with the forecasted month shown as a continuation of the trend. Use this for "how has this medicine's usage been trending."
- **Bar chart** — actual vs. forecasted quantity, month by month or medicine by medicine. Use this for "how much do we expect to need" comparisons, especially side-by-side across several medicines or facilities.

Default to whichever one matches the question being asked. If it's about trend/direction, line chart. If it's about comparing discrete quantities, bar chart. Don't force a line chart onto a comparison question or vice versa.

## Library: Recharts

Use **Recharts** — it's built for React, has simple, interactive tooltips and legends out of the box, is easy to keep visually simple, and doesn't require canvas/imperative setup like Chart.js. Install it once for the project:

```bash
npm install recharts
```

If the project already has a different charting library in use elsewhere (check `prds-web/package.json` and existing chart components before adding a new dependency), match that library instead and adapt the patterns below rather than introducing a second charting library into the codebase.

## Simplicity rules

These charts are read by health workers making a stocking decision, not analysts. Every chart should follow these defaults unless a screen specifically calls for more:

- **One idea per chart.** Don't cram consumption history, forecast, safety stock, and reorder point onto a single chart unless it's explicitly a detailed drill-down view. The default dashboard card should show one clear thing.
- **Plain axis labels.** "Quantity (units)" and month names, not variable names like `qty` or `x`.
- **No unexplained jargon on the chart itself.** R² or slope values, if shown at all, belong in a tooltip or a small caption below the chart — never as a bare number on the chart face.
- **Forecast must look visually distinct from actuals** — a dashed line, a lighter shade, or a different bar pattern/color, plus a legend entry labeled "Predicted" or "Forecast." A user should never mistake a prediction for a recorded fact at a glance.
- **Limit color count.** Two colors (actual vs. forecast) is usually enough. Reserve a third only for a genuine third series (e.g. a facility comparison), and use a consistent color per series across all charts in the app rather than re-randomizing colors per chart.
- **Round numbers in tooltips/labels** to whole units (medicine quantities aren't fractional) unless the underlying unit genuinely needs a decimal (e.g. liters).

## Interactivity

"Interactive" here means useful on hover/tap, not flashy. Include, by default:

- **Tooltip on hover/tap** showing the exact month and quantity (Recharts' `<Tooltip />` does this with minimal setup).
- **Legend toggle** to show/hide the actual vs. forecast series (Recharts legends support this natively via `onClick`).
- **Responsive sizing** so charts don't overflow on smaller screens — wrap every chart in `<ResponsiveContainer>`.

Optional, add only if the screen calls for it:
- Clicking a bar/point to drill into that medicine's detail view (use `onClick` on the `<Bar>`/`<Line>` element, not the whole chart, so only meaningful areas are clickable).
- A period toggle (e.g. "Last 6 months" / "Last 12 months") above the chart, re-slicing the same data rather than refetching.

## Reference implementation

### Trend line chart (actual + forecast)

```jsx
// src/modules/forecasting/components/ConsumptionTrendChart.jsx
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// data: [{ month: "Jan", quantity: 120, isForecast: false }, ..., { month: "Jul", quantity: 145, isForecast: true }]
export function ConsumptionTrendChart({ data, medicineName }) {
  return (
    <div>
      <h3>{medicineName} — Consumption Trend</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis label={{ value: "Quantity (units)", angle: -90, position: "insideLeft" }} />
          <Tooltip formatter={(value, name, props) =>
            [`${Math.round(value)} units`, props.payload.isForecast ? "Predicted" : "Actual"]
          } />
          <Legend />
          <Line
            type="monotone"
            dataKey="quantity"
            name="Consumption"
            stroke="#2563eb"
            strokeWidth={2}
            dot={(props) => {
              const isForecast = props.payload.isForecast;
              return <circle cx={props.cx} cy={props.cy} r={4}
                fill={isForecast ? "#f59e0b" : "#2563eb"} />;
            }}
            strokeDasharray={undefined} // segment styling below covers the forecast dash
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

For a genuinely dashed *forecast segment* (not just a differently-colored dot), split the series into two overlapping `<Line>`s — one for actual months (solid), one for the last-actual-to-forecast segment (dashed) — sharing the same axes. This is the standard Recharts pattern for "part of the line is predicted."

### Actual vs. forecast bar chart

```jsx
// src/modules/forecasting/components/ForecastComparisonChart.jsx
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

// data: [{ medicine: "Amoxicillin", actual: 1180, forecast: 1240 }, ...]
export function ForecastComparisonChart({ data, onSelectMedicine }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="medicine" />
        <YAxis label={{ value: "Quantity (units)", angle: -90, position: "insideLeft" }} />
        <Tooltip formatter={(value) => `${Math.round(value)} units`} />
        <Legend />
        <Bar dataKey="actual" name="Last Month (Actual)" fill="#2563eb"
          onClick={(entry) => onSelectMedicine?.(entry.medicine)} />
        <Bar dataKey="forecast" name="Next Month (Predicted)" fill="#f59e0b"
          onClick={(entry) => onSelectMedicine?.(entry.medicine)} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

Both components take pre-shaped data — they don't compute the forecast themselves. Feed them the output of `forecastSLR` (from the `inventory-demand-forecasting` skill) mapped into the `{ month, quantity, isForecast }` or `{ medicine, actual, forecast }` shapes shown above. Keep chart components purely presentational so they're reusable across the dashboard, medicine detail, and facility report screens without duplicating regression logic.

## When data is missing or weak

Mirror the forecasting skill's own edge-case handling in the chart, don't paper over it:

- If `forecastSLR` returned `reason: "insufficient_history"`, don't render a forecast bar/point at all — show the actual-only chart with a small caption like "Forecast available after 3 months of data."
- If R² is low (see the confidence-label thresholds in the forecasting skill), add a small caption under the chart such as "Trend is noisy — treat this as a rough estimate" rather than omitting the signal entirely.

## Placement in the codebase

Chart components live in `prds-web/src/modules/forecasting/components/`, alongside `ForecastCard.jsx` from the forecasting skill. Import and compose them into the actual screens (dashboard summary, medicine detail page) rather than duplicating chart markup per screen.
