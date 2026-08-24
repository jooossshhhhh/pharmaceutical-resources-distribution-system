import { useMemo, useState } from "react";

import {
  buildDemandQualitySummary,
  buildForecastInterpretation,
  buildMonthlyDemandTrend,
  CHANNEL_META,
  CHANNEL_ORDER,
  computeSuggestedOrderQuantity,
  getTrendDirectionLabel,
} from "../demandUtils";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from "../inventoryUtils";
import { ChevronDownIcon, TrendingUpIcon } from "../inventoryComponents";

const TABS = [
  { id: "overview", label: "Summary" },
  { id: "consumption", label: "Use History" },
  { id: "forecast", label: "Forecast" },
  { id: "history", label: "Activity" },
];

const toneClass = {
  emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
  amber: "border-amber-100 bg-amber-50/70 text-amber-700",
  red: "border-red-100 bg-red-50/70 text-red-700",
  blue: "border-blue-100 bg-blue-50/70 text-blue-700",
  neutral: "border-neutral-100 bg-neutral-50 text-neutral-700",
};

function StatChip({ label, value, sub, valueClass = "text-[#0d1117]", tone = "neutral" }) {
  const className = toneClass[tone] || toneClass.neutral;

  return (
    <div className={`rounded-xl border px-3.5 py-3 ${className}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.14em] opacity-75">
        {label}
      </p>
      <p className={`mt-1 text-lg font-black ${valueClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs font-semibold opacity-75">{sub}</p>}
    </div>
  );
}

function ChartLayerButton({ active, label, color, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 ${
        active
          ? "border-[#6be9c2] bg-emerald-50 text-[#0d1117]"
          : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
      }`}
    >
      <span className="h-2 w-4 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </button>
  );
}

function RegressionTrendChart({ trend, visibleLayers, onToggleLayer }) {
  const rows = trend.rows || [];
  const values = rows.flatMap((row) => [
    visibleLayers.historical ? row.historical : 0,
    visibleLayers.forecast ? row.forecasted : 0,
    visibleLayers.regression ? row.fitted || 0 : 0,
  ]);
  const maxValue = Math.max(...values, 1);
  const hasChartData = rows.some((row) => row.hasHistorical || row.hasForecast);

  if (!hasChartData) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 text-center text-sm font-semibold text-neutral-400">
        Dispensed medicine and forecast values will appear here once records are available.
      </div>
    );
  }

  const chartWidth = 720;
  const chartHeight = 265;
  const padding = { top: 20, right: 24, bottom: 44, left: 44 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const step = rows.length > 1 ? plotWidth / (rows.length - 1) : plotWidth;
  const barWidth = Math.max(14, Math.min(26, plotWidth / Math.max(rows.length, 1) / 2.8));
  const yFor = (value) => padding.top + plotHeight - (Number(value || 0) / maxValue) * plotHeight;
  const xFor = (index) => padding.left + index * step;
  const fitPoints = rows
    .map((row, index) => ({ row, x: xFor(index), y: yFor(row.fitted) }))
    .filter(({ row }) => row.fitted != null);
  const fitPath = fitPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const slopeText =
    trend.observedMonths >= 3 && !trend.regression.reason
      ? `${trend.regression.slope >= 0 ? "+" : ""}${trend.regression.slope.toFixed(1)} units/month`
      : "Needs 3 months";

  return (
    <div className="rounded-xl border border-[#d8dadc] bg-[#fbfaf8] p-4">
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
            Medicine Use Trend
          </p>
          <p className="mt-1 text-sm font-semibold text-neutral-500">
            Dispensed medicine, saved forecast, and the trend line from recent use.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-100 bg-white px-3 py-1 text-xs font-black text-emerald-700">
            {slopeText}
          </span>
          <ChartLayerButton
            active={visibleLayers.historical}
            label="Dispensed"
            color="#0f9f94"
            onClick={() => onToggleLayer("historical")}
          />
          <ChartLayerButton
            active={visibleLayers.forecast}
            label="Forecast"
            color="#60a5fa"
            onClick={() => onToggleLayer("forecast")}
          />
          <ChartLayerButton
            active={visibleLayers.regression}
            label="Trend line"
            color="#0d1117"
            onClick={() => onToggleLayer("regression")}
          />
        </div>
      </div>

      <svg className="h-72 w-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img">
        <title>Medicine use trend with projected demand</title>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = padding.top + plotHeight - plotHeight * tick;
          const value = Math.round(maxValue * tick);

          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={chartWidth - padding.right}
                y1={y}
                y2={y}
                stroke="#e5e7eb"
                strokeDasharray="4 4"
              />
              <text x={8} y={y + 4} className="fill-neutral-400 text-[11px] font-bold">
                {formatNumber(value)}
              </text>
            </g>
          );
        })}

        {rows.map((row, index) => {
          const x = xFor(index);
          const historicalHeight = plotHeight - (yFor(row.historical) - padding.top);
          const forecastHeight = plotHeight - (yFor(row.forecasted) - padding.top);

          return (
            <g key={row.key}>
              {visibleLayers.historical && row.hasHistorical && (
                <rect
                  x={x - barWidth - 2}
                  y={yFor(row.historical)}
                  width={barWidth}
                  height={Math.max(3, historicalHeight)}
                  rx="4"
                  fill="#0f9f94"
                  opacity="0.85"
                />
              )}
              {visibleLayers.forecast && row.hasForecast && (
                <rect
                  x={x + 2}
                  y={yFor(row.forecasted)}
                  width={barWidth}
                  height={Math.max(3, forecastHeight)}
                  rx="4"
                  fill="#60a5fa"
                  opacity="0.75"
                />
              )}
              <text
                x={x}
                y={chartHeight - 16}
                textAnchor="middle"
                className="fill-neutral-500 text-[11px] font-black"
              >
                {row.label}
              </text>
            </g>
          );
        })}

        {visibleLayers.regression && fitPath && (
          <polyline
            fill="none"
            points={fitPath}
            stroke="#0d1117"
            strokeLinecap="round"
            strokeWidth="3"
          />
        )}
        {visibleLayers.regression &&
          fitPoints.map((point) => (
            <circle key={point.row.key} cx={point.x} cy={point.y} r="4" fill="#0d1117" />
          ))}
      </svg>
    </div>
  );
}

function ForecastInterpretationCard({ interpretation }) {
  const className = toneClass[interpretation.tone] || toneClass.neutral;

  return (
    <article className={`rounded-xl border px-4 py-3 ${className}`}>
      <p className="text-xs font-black uppercase tracking-[0.14em] opacity-75">
        What this means
      </p>
      <h4 className="mt-2 text-base font-black text-[#0d1117]">
        {interpretation.title}
      </h4>
      <p className="mt-2 text-sm font-semibold leading-6 text-neutral-700">
        {interpretation.summary}
      </p>
      <dl className="mt-3 grid gap-2">
        {interpretation.reasons.map((reason) => (
          <div
            key={reason.label}
            className="rounded-lg border border-white/70 bg-white/70 px-3 py-2"
          >
            <dt className="text-[11px] font-black uppercase tracking-[0.12em] text-neutral-500">
              {reason.label}
            </dt>
            <dd className="mt-0.5 text-sm font-black text-[#0d1117]">
              {reason.value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function ChannelBars({ series }) {
  const maxValue = Math.max(
    ...series.flatMap((row) => CHANNEL_ORDER.map((channel) => row[channel])),
    1
  );

  return (
    <div className="rounded-xl border border-[#d8dadc] bg-white p-4">
      <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#42474e]">
        Dispensed units by channel
      </p>
      <div className="flex h-36 items-end gap-3 border-b border-l border-dashed border-neutral-200 px-2 pb-3">
        {series.map((row) => (
          <div key={row.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-28 w-full items-end justify-center gap-0.5">
              {CHANNEL_ORDER.map((channel) => (
                <span
                  key={channel}
                  className="w-3.5 rounded-t"
                  style={{
                    backgroundColor: CHANNEL_META[channel].color,
                    height: `${Math.max(3, Math.round((row[channel] / maxValue) * 100))}%`,
                  }}
                  title={`${CHANNEL_META[channel].label}: ${formatNumber(row[channel])}`}
                />
              ))}
            </div>
            <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
              {row.label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold">
        {CHANNEL_ORDER.map((channel) => (
          <span key={channel} className="flex items-center gap-2 text-[#42474e]">
            <span
              className="h-2 w-4 rounded-full"
              style={{ backgroundColor: CHANNEL_META[channel].color }}
            />
            {CHANNEL_META[channel].label}
          </span>
        ))}
      </div>
    </div>
  );
}

function FacilityTypeSplit({ split }) {
  const total = split.cho + split.healthCenter;
  const choPercent = total > 0 ? Math.round((split.cho / total) * 100) : 0;

  if (total === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[#d8dadc] bg-white p-4">
      <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#42474e]">
        Where it is dispensed
      </p>
      <div className="flex h-3 overflow-hidden rounded-full bg-neutral-100">
        <span className="bg-[#0f9f94]" style={{ width: `${choPercent}%` }} />
        <span className="bg-[#b8dce6]" style={{ width: `${100 - choPercent}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatChip label="CHO" value={formatNumber(split.cho)} sub="units dispensed" tone="emerald" />
        <StatChip
          label="Health Centers"
          value={formatNumber(split.healthCenter)}
          sub="units dispensed"
          tone="blue"
        />
      </div>
    </div>
  );
}

function RecentDispensingTable({ rows }) {
  const recentRows = [...rows]
    .sort((first, second) => new Date(second.dispense_date) - new Date(first.dispense_date))
    .slice(0, 8);

  if (recentRows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm font-semibold text-neutral-400">
        No dispensing transactions have been recorded for this medicine yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#d8dadc] bg-white">
      <div className="border-b border-neutral-100 px-4 py-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#42474e]">
          Recent dispensed history
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-[#f7f6f3] text-[11px] font-black uppercase tracking-[0.14em] text-neutral-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Facility</th>
              <th className="px-4 py-3 text-right">Quantity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {recentRows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-bold text-[#0d1117]">
                  {formatDate(row.dispense_date)}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-black text-neutral-600">
                    {CHANNEL_META[row.dispensing_type]?.label || row.dispensing_type || "Record"}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-neutral-500">
                  {row.facility?.facility_name || row.facility?.facility_code || "Facility"}
                </td>
                <td className="px-4 py-3 text-right font-black text-[#0d1117]">
                  {formatNumber(row.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoryList({ history, isHistoryLoading, stockItem }) {
  if (isHistoryLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-12 animate-pulse rounded-lg bg-neutral-100" />
        ))}
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm font-medium text-neutral-400">
        No activity recorded for batch {stockItem?.batch_number || "-"}.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-100 rounded-xl border border-[#d8dadc] bg-white">
      {history.map((entry) => (
        <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-[#0d1117]">
              {entry.action}
              <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-500">
                {entry.user?.role?.replace("_", " ") || "Unknown"}
              </span>
            </p>
            <p className="mt-0.5 truncate text-xs font-medium text-neutral-500">
              {entry.details}
            </p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-neutral-400">
            {formatDateTime(entry.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function DemandPanel({
  title = "Stock Details",
  adc,
  daysOfSupply,
  stockOutDate,
  channelSeries = [],
  split = null,
  forecast = null,
  pendingRequests = [],
  dispensingRows = [],
  forecastRows = [],
  stockItem = null,
  stockStatus = null,
  estimatedValue = null,
  stockHistory = null,
  isHistoryLoading = false,
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [visibleLayers, setVisibleLayers] = useState({
    historical: true,
    forecast: true,
    regression: true,
  });
  const trend = useMemo(
    () => buildMonthlyDemandTrend({ dispensingRows, forecastRows, maxMonths: 8 }),
    [dispensingRows, forecastRows]
  );
  const hasTrendData = trend.rows.some((row) => row.hasHistorical || row.hasForecast);
  const hasDemandData =
    adc != null ||
    channelSeries.length > 0 ||
    forecast != null ||
    pendingRequests.length > 0 ||
    hasTrendData ||
    stockItem;
  const quality = useMemo(
    () =>
      buildDemandQualitySummary({
        observedMonths: trend.observedMonths,
        forecastRows,
        dispensingRows,
        regression: trend.regression,
      }),
    [trend.observedMonths, trend.regression, forecastRows, dispensingRows]
  );
  const forecastInterpretation = useMemo(
    () =>
      buildForecastInterpretation({
        trend,
        forecast,
        quantity: stockItem?.quantity,
      }),
    [trend, forecast, stockItem]
  );
  const suggestedOrderQty = useMemo(() => {
    const currentStock = Number(stockItem?.quantity || 0);
    const projectedUse = trend.regression?.forecast;

    return computeSuggestedOrderQuantity(projectedUse, currentStock);
  }, [stockItem, trend.regression]);

  const daysTone =
    daysOfSupply != null
      ? daysOfSupply <= 7
        ? "text-red-600"
        : daysOfSupply <= 30
          ? "text-amber-600"
          : "text-emerald-600"
      : "text-[#0d1117]";
  const daysCardTone =
    daysOfSupply != null && daysOfSupply <= 7
      ? "red"
      : daysOfSupply != null && daysOfSupply <= 30
        ? "amber"
        : "emerald";
  const trendTone =
    trend.regression.direction === "INCREASING"
      ? "text-amber-700"
      : trend.regression.direction === "DECLINING"
        ? "text-emerald-700"
        : "text-[#0d1117]";

  const toggleLayer = (layer) => {
    setVisibleLayers((current) => ({ ...current, [layer]: !current[layer] }));
  };

  return (
    <section className="overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <TrendingUpIcon />
          </span>
          <span>
            <span className="block text-sm font-black text-[#0d1117]">{title}</span>
            <span className="block text-xs font-semibold text-neutral-500">
              Summary of use history, forecast, and next-month stocking needs.
            </span>
          </span>
        </span>
        <span className={`text-neutral-400 transition ${isOpen ? "rotate-180" : ""}`}>
          <ChevronDownIcon />
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-neutral-100 px-4 py-4">
          {!hasDemandData ? (
            <p className="rounded-lg bg-neutral-50 px-4 py-6 text-center text-sm font-semibold text-neutral-400">
              No dispensing data recorded for this medicine yet. Demand insights will appear
              once dispensing transactions or forecast rows are logged.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 border-b border-neutral-100 pb-3" role="tablist">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`h-8 rounded-lg px-3 text-xs font-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 ${
                      activeTab === tab.id
                        ? "bg-[#6be9c2] text-[#0d1117]"
                        : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === "overview" && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatChip
                      label="Current Stock"
                      value={
                        stockItem
                          ? `${formatNumber(stockItem.quantity)} ${
                              stockItem.medicine?.unit_of_measure || ""
                            }`.trim()
                          : "-"
                      }
                      sub={stockStatus?.label || "batch quantity"}
                      tone={stockStatus?.key === "NORMAL" ? "emerald" : "red"}
                    />
                    <StatChip
                      label="Coverage"
                      value={daysOfSupply != null ? `~${formatNumber(daysOfSupply)} days` : "-"}
                      valueClass={daysTone}
                      tone={daysCardTone}
                      sub={
                        stockOutDate && daysOfSupply != null
                          ? `stock-out est. ${stockOutDate.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}`
                          : "no recent use baseline"
                      }
                    />
                    <StatChip
                      label="Estimated Value"
                      value={estimatedValue != null ? formatCurrency(estimatedValue) : "-"}
                      sub="current stock x unit cost"
                      tone="blue"
                    />
                    <StatChip
                      label="Trend Confidence"
                      value={quality.label}
                      sub={`${trend.observedMonths} month${trend.observedMonths === 1 ? "" : "s"} used`}
                      tone={quality.tone}
                    />
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,0.35fr)]">
                    <ForecastInterpretationCard interpretation={forecastInterpretation} />
                    <StatChip
                      label="Suggested Order"
                      value={
                        suggestedOrderQty != null
                          ? `${formatNumber(suggestedOrderQty)} units`
                          : "-"
                      }
                      sub={
                        suggestedOrderQty > 0
                          ? "for the next month"
                          : suggestedOrderQty === 0
                            ? "current stock may be enough"
                            : "needs at least 3 months"
                      }
                      tone={suggestedOrderQty > 0 ? "amber" : "emerald"}
                    />
                  </div>
                  <p className="rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3 text-sm font-semibold leading-6 text-neutral-600">
                    {quality.message}
                  </p>
                </div>
              )}

              {activeTab === "consumption" && (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
                  <div className="space-y-4">
                    {channelSeries.length > 0 ? (
                      <ChannelBars series={channelSeries} />
                    ) : (
                      <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm font-semibold text-neutral-400">
                        Channel consumption will appear once dispensing records are available.
                      </div>
                    )}
                    <RecentDispensingTable rows={dispensingRows} />
                  </div>
                  <div className="space-y-4">
                    {split && <FacilityTypeSplit split={split} />}
                    <StatChip
                      label="Average Daily Use"
                      value={adc != null ? `${adc.toFixed(1)}/day` : "-"}
                      sub="last 3 complete months"
                    />
                  </div>
                </div>
              )}

              {activeTab === "forecast" && (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)]">
                  <RegressionTrendChart
                    trend={trend}
                    visibleLayers={visibleLayers}
                    onToggleLayer={toggleLayer}
                  />
                  <div className="space-y-3">
                    {trend.regression?.forecast != null ? (
                      <StatChip
                        label="Projected Use Next Month"
                        value={`${formatNumber(trend.regression.forecast)} units`}
                        sub={trend.regression.confidenceLabel}
                        tone="blue"
                      />
                    ) : (
                      <StatChip
                        label="Projected Use Next Month"
                        value="-"
                        sub="needs at least 3 months"
                      />
                    )}
                    <StatChip
                      label="Monthly Change"
                      value={
                        trend.observedMonths >= 3 && !trend.regression.reason
                          ? `${trend.regression.slope >= 0 ? "+" : ""}${trend.regression.slope.toFixed(
                              1
                            )}`
                          : "-"
                      }
                      valueClass={trendTone}
                      sub={
                        trend.observedMonths >= 3 && !trend.regression.reason
                          ? `${getTrendDirectionLabel(
                              trend.regression.direction
                            )} units/month`
                          : "needs 3 months"
                      }
                      tone={trend.regression.direction === "INCREASING" ? "amber" : "neutral"}
                    />
                    <StatChip
                      label="Suggested Order"
                      value={
                        suggestedOrderQty != null
                          ? `${formatNumber(suggestedOrderQty)} units`
                          : "-"
                      }
                      sub="next-month support"
                      tone={suggestedOrderQty > 0 ? "amber" : "emerald"}
                    />
                    <ForecastInterpretationCard interpretation={forecastInterpretation} />
                  </div>
                </div>
              )}

              {activeTab === "history" && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                      Stock Activity
                    </p>
                    <p className="mt-1 text-sm font-semibold text-neutral-500">
                      Stock edits and inventory events tied to this medicine.
                    </p>
                  </div>
                  <HistoryList
                    history={stockHistory}
                    isHistoryLoading={isHistoryLoading}
                    stockItem={stockItem}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
