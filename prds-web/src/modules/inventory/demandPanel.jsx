import { useState } from "react";

import { CHANNEL_META, CHANNEL_ORDER } from "./demandUtils";
import { formatNumber } from "./inventoryUtils";
import { ChevronDownIcon, TrendingUpIcon } from "./inventoryComponents";

function StatChip({ label, value, sub, valueClass = "text-[#0d1117]" }) {
  return (
    <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2.5">
      <p className="text-xs font-black uppercase tracking-wide text-neutral-400">{label}</p>
      <p className={`mt-1 text-lg font-black ${valueClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs font-semibold text-neutral-400">{sub}</p>}
    </div>
  );
}

function ChannelBars({ series }) {
  const maxValue = Math.max(
    ...series.flatMap((row) => CHANNEL_ORDER.map((channel) => row[channel])),
    1
  );

  return (
    <div>
      <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#42474e]">
        Dispensed units by channel
      </p>
      <div className="flex h-40 items-end gap-3 border-b border-l border-dashed border-neutral-200 px-2 pb-3">
        {series.map((row) => (
          <div key={row.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-32 w-full items-end justify-center gap-0.5">
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
    <div>
      <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#42474e]">
        Where it is dispensed
      </p>
      <div className="flex h-3 overflow-hidden rounded-full bg-neutral-100">
        <span className="bg-[#0f9f94]" style={{ width: `${choPercent}%` }} />
        <span className="bg-[#b8dce6]" style={{ width: `${100 - choPercent}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-teal-100 bg-teal-50/50 px-3 py-2.5">
          <p className="text-xs font-black uppercase tracking-wide text-teal-700">CHO</p>
          <p className="mt-1 text-lg font-black text-[#0d1117]">{formatNumber(split.cho)}</p>
          <p className="text-xs font-semibold text-neutral-400">units dispensed</p>
        </div>
        <div className="rounded-lg border border-sky-100 bg-sky-50/50 px-3 py-2.5">
          <p className="text-xs font-black uppercase tracking-wide text-sky-700">
            Health centers
          </p>
          <p className="mt-1 text-lg font-black text-[#0d1117]">
            {formatNumber(split.healthCenter)}
          </p>
          <p className="text-xs font-semibold text-neutral-400">units dispensed</p>
        </div>
      </div>
    </div>
  );
}

export default function DemandPanel({
  title = "Demand & Forecast",
  adc,
  daysOfSupply,
  stockOutDate,
  channelSeries = [],
  split = null,
  forecast = null,
  pendingRequests = [],
  reorderQty = null,
}) {
  const [isOpen, setIsOpen] = useState(true);
  const hasDemandData =
    adc != null ||
    channelSeries.length > 0 ||
    forecast != null ||
    pendingRequests.length > 0;

  const daysTone =
    daysOfSupply != null
      ? daysOfSupply <= 7
        ? "text-red-600"
        : daysOfSupply <= 30
          ? "text-amber-600"
          : "text-emerald-600"
      : "text-[#0d1117]";

  return (
    <section className="overflow-hidden rounded-xl border border-[#d8dadc] bg-white">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <TrendingUpIcon />
          </span>
          <span className="text-sm font-black text-[#0d1117]">{title}</span>
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
              once dispensing transactions are logged.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatChip
                  label="Avg Daily Consumption"
                  value={adc != null ? `${adc.toFixed(1)}/day` : "—"}
                  sub="trailing 3 months"
                />
                <StatChip
                  label="Days of Supply Left"
                  value={daysOfSupply != null ? `~${formatNumber(daysOfSupply)} days` : "—"}
                  valueClass={daysTone}
                  sub={
                    stockOutDate && daysOfSupply != null
                      ? `stock-out est. ${stockOutDate.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}`
                      : "no consumption data"
                  }
                />
                {forecast ? (
                  <StatChip
                    label={`Forecast · ${forecast.monthLabel}`}
                    value={`${formatNumber(forecast.total)} units`}
                    sub="predicted demand"
                  />
                ) : (
                  <StatChip label="Forecast" value="—" sub="no forecast records" />
                )}
              </div>

              {channelSeries.length > 0 && <ChannelBars series={channelSeries} />}

              {split && <FacilityTypeSplit split={split} />}

              {pendingRequests.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-[#42474e]">
                    Pending health center requests
                  </p>
                  <ul className="space-y-1.5">
                    {pendingRequests.slice(0, 5).map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-orange-100 bg-orange-50/50 px-3 py-2 text-sm"
                      >
                        <span className="font-bold text-neutral-700">
                          {item.request?.facility?.facility_name || "Health center"}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-black text-[#0d1117]">
                            {formatNumber(item.quantity)} units
                          </span>
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
                            {item.request?.status || "PENDING"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {reorderQty != null && (
                <p className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-sm font-bold text-emerald-700">
                  {reorderQty > 0
                    ? `Suggested reorder: ${formatNumber(reorderQty)} units to cover the next 30 days of demand.`
                    : "Stock is sufficient for the next 30 days of demand."}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
