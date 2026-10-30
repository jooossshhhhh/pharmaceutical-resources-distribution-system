import { useMemo } from "react";
import {
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Minus,
} from "lucide-react";
import Panel from "./Panel";
import { formatNumber } from "@shared/utils/dashboardUtils";

/**
 * ForecastPreviewPanel
 *
 * Full-width preview of upcoming medicine demand and stock supply in simple,
 * easy-to-understand terms for pharmacists and health workers.
 */
export default function ForecastPreviewPanel({
  items = [],
  totalProjectedDemand = 0,
  riskCount = 0,
  onNavigate,
  isBhw = false,
}) {
  // Sort items: prioritize medicines running low or out of stock, then by highest need
  const rankedItems = useMemo(() => {
    return [...(items || [])]
      .sort((a, b) => {
        const aRisk =
          a.circularRisk?.type === "stockout" ||
          (a.coverageMonths !== null && a.coverageMonths < 1.0);
        const bRisk =
          b.circularRisk?.type === "stockout" ||
          (b.coverageMonths !== null && b.coverageMonths < 1.0);
        if (aRisk && !bRisk) return -1;
        if (!aRisk && bRisk) return 1;
        return (
          Number(b.projectedDemand || b.nextMonthDemand || 0) -
          Number(a.projectedDemand || a.nextMonthDemand || 0)
        );
      })
      .slice(0, 5);
  }, [items]);

  const healthyCount = useMemo(() => {
    return (items || []).filter(
      (item) => item.coverageMonths !== null && item.coverageMonths >= 1.0
    ).length;
  }, [items]);

  // Convert math metrics into simple, friendly labels
  const getSupplyDuration = (coverageMonths, stock) => {
    if (stock === 0) {
      return {
        label: "Out of stock",
        sublabel: "0 days left",
        statusLabel: "Out of Stock",
        badgeBg: "bg-[#FBE9E3]",
        badgeText: "text-[#8F3F2B]",
        badgeBorder: "border-[#D9826B]/30",
        barColor: "bg-[#8F3F2B]",
        barWidth: 0,
      };
    }
    if (coverageMonths === null || coverageMonths === undefined || coverageMonths > 12) {
      return {
        label: "> 1 year",
        sublabel: "Plenty in stock",
        statusLabel: "Good Stock",
        badgeBg: "bg-[#E8F5F1]",
        badgeText: "text-[#2D7A5D]",
        badgeBorder: "border-[#4C9F80]/30",
        barColor: "bg-[#4C9F80]",
        barWidth: 100,
      };
    }
    if (coverageMonths < 1.0) {
      const days = Math.max(1, Math.round(coverageMonths * 30));
      const pct = Math.round(coverageMonths * 100);
      return {
        label: `~${days} days`,
        sublabel: `${pct}% of monthly need`,
        statusLabel: "Running Low",
        badgeBg: "bg-[#FBE9E3]",
        badgeText: "text-[#8F3F2B]",
        badgeBorder: "border-[#D9826B]/30",
        barColor: "bg-[#D9826B]",
        barWidth: Math.min(100, pct),
      };
    }
    const months = coverageMonths.toFixed(1);
    return {
      label: `~${months} months`,
      sublabel: "Healthy supply",
      statusLabel: "Good Stock",
      badgeBg: "bg-[#E8F5F1]",
      badgeText: "text-[#2D7A5D]",
      badgeBorder: "border-[#4C9F80]/30",
      barColor: "bg-[#4C9F80]",
      barWidth: 100,
    };
  };

  // Convert technical action rules into clear, plain-English advice
  const getSimpleAction = (item) => {
    const stock = Number(item.stockQuantity || 0);
    const threshold = Number(item.threshold || 0);
    const need = Number(item.nextMonthDemand || item.projectedDemand || 0);
    const daysExpiry = item.daysToNearestExpiry;

    // 1. Batch near expiration
    if (daysExpiry != null && daysExpiry <= 90 && stock > 0) {
      return {
        title: "Dispense Soon",
        detail: `Batch expires in ~${daysExpiry} days; dispense first`,
        tone: "amber",
      };
    }

    // 2. Out of stock
    if (stock === 0) {
      const qty = Math.max(threshold, Math.round(need * 2)) || 100;
      return {
        title: `Order Needed (+${formatNumber(qty)})`,
        detail: "Out of stock; request replenishment",
        tone: "red",
      };
    }

    // 3. Running low (below 1-month need or below safety limit)
    const targetBuffer = Math.round(need * 2) + threshold;
    const shortage = targetBuffer - stock;
    if (shortage > 0 && (stock <= threshold || (need > 0 && stock < need))) {
      return {
        title: `Order +${formatNumber(shortage)} units`,
        detail: "Stock is low; order more to stay safe",
        tone: "orange",
      };
    }

    // 4. Plenty of stock
    if (need > 0 && stock > need * 3) {
      return {
        title: "Plenty in Stock",
        detail: "Current stock is enough; no order needed",
        tone: "teal",
      };
    }

    // 5. Normal
    return {
      title: "No Action Needed",
      detail: "Stock is enough for expected patient visits",
      tone: "neutral",
    };
  };

  const renderTrendIcon = (direction, slope) => {
    if (slope > 0.5 || direction === "Increasing") {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[#D9826B]" title="Patient visits/need rising">
          <TrendingUp className="h-3 w-3" />
          <span>Demand rising</span>
        </span>
      );
    }
    if (slope < -0.5 || direction === "Declining") {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[#4C9F80]" title="Patient visits/need declining">
          <TrendingDown className="h-3 w-3" />
          <span>Demand falling</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[#5B7077]" title="Demand is steady">
        <Minus className="h-3 w-3" />
        <span>Steady demand</span>
      </span>
    );
  };

  return (
    <Panel
      title={isBhw ? "Facility Medicine Supply & Upcoming Needs" : "Medicine Supply & Upcoming Demand"}
      action={
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-block text-xs font-semibold text-[#5B7077]">
            Estimated needs for next month vs. stock on hand
          </span>
          {onNavigate && (
            <button
              type="button"
              onClick={onNavigate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-3 py-1.5 text-xs font-bold text-[#1F4E5A] shadow-xs transition hover:bg-[#E5EFF1] hover:border-[#34769B]/40 active:scale-[0.98]"
            >
              <span>View Full Forecast</span>
              <ArrowRight className="h-3.5 w-3.5 text-[#34769B]" />
            </button>
          )}
        </div>
      }
    >
      {/* 3 Summary Counters (Simple Terms) */}
      <div className="mb-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="flex items-center gap-3 rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-2.5 shadow-2xs">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E5EFF1] text-[#1F4E5A]">
            <TrendingUp className="h-4.5 w-4.5 text-[#1F4E5A]" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#5B7077]">
              Expected Need Next Month
            </p>
            <p className="text-base font-black text-[#1B2B30]">
              {formatNumber(totalProjectedDemand)}{" "}
              <span className="text-xs font-medium text-[#5B7077]">units</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-2.5 shadow-2xs">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E8F5F1] text-[#2D7A5D]">
            <CheckCircle2 className="h-4.5 w-4.5 text-[#4C9F80]" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#5B7077]">
              Medicines with Enough Stock
            </p>
            <p className="text-base font-black text-[#1B2B30]">
              {healthyCount}{" "}
              <span className="text-xs font-medium text-[#5B7077]">
                {healthyCount === 1 ? "medicine safe" : "medicines safe"}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-2.5 shadow-2xs">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${riskCount > 0 ? "bg-[#FBE9E3] text-[#8F3F2B]" : "bg-[#E5EFF1] text-[#1F4E5A]"}`}>
            <AlertTriangle className={`h-4.5 w-4.5 ${riskCount > 0 ? "text-[#D9826B]" : "text-[#5B7077]"}`} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#5B7077]">
              Low Stock Warnings
            </p>
            <p className="text-base font-black text-[#1B2B30]">
              {riskCount > 0 ? (
                <span className="text-[#8F3F2B]">{riskCount} running low</span>
              ) : (
                <span className="text-[#2D7A5D]">0 running low</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Main Table with Plain-English Columns */}
      {rankedItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#CFDDE0] p-6 text-center">
          <p className="text-xs font-semibold text-[#1B2B30]">No Estimates Available Yet</p>
          <p className="mt-1 text-[11.5px] text-[#5B7077]">
            Estimates will appear automatically as medicines are dispensed to patients.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="border-b border-[#CFDDE0]/80 bg-[#F9FBFB] text-[10px] font-bold uppercase tracking-wider text-[#5B7077]">
              <tr>
                <th className="py-2.5 pr-3">Medicine</th>
                <th className="px-3 py-2.5 text-right">Stock on Hand</th>
                <th className="px-3 py-2.5 text-right">Needed Next Month</th>
                <th className="px-3 py-2.5">How Long It Will Last</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="py-2.5 pl-3">Suggested Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#CFDDE0]/40">
              {rankedItems.map((item, idx) => {
                const stock = Number(item.stockQuantity || 0);
                const need = Number(item.nextMonthDemand || item.projectedDemand || 0);
                const supply = getSupplyDuration(item.coverageMonths, stock);
                const action = getSimpleAction(item);

                return (
                  <tr key={item.medicineId || idx} className="hover:bg-[#F9FBFB]/80 transition">
                    {/* Medicine */}
                    <td className="py-2.5 pr-3 font-semibold text-[#1B2B30]">
                      <div className="flex flex-col">
                        <span>
                          {item.genericName}
                          {item.dosage && <span className="font-normal text-[#5B7077] ml-1">{item.dosage}</span>}
                        </span>
                        {item.category && (
                          <span className="text-[10px] font-normal text-[#5B7077]">
                            {item.category}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Stock on Hand */}
                    <td className="px-3 py-2.5 text-right font-bold text-[#1B2B30]">
                      {formatNumber(stock)} units
                      <span className="block text-[10px] font-normal text-[#5B7077]">
                        Safe limit: {formatNumber(item.threshold || 0)}
                      </span>
                    </td>

                    {/* Needed Next Month */}
                    <td className="px-3 py-2.5 text-right font-bold text-[#1B2B30]">
                      <div className="flex flex-col items-end">
                        <span>~{formatNumber(need)} units</span>
                        {renderTrendIcon(item.direction, item.slope)}
                      </div>
                    </td>

                    {/* How Long It Will Last (Clean Supply Duration) */}
                    <td className="px-3 py-2.5 min-w-[140px]">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-[#1B2B30]">{supply.label}</span>
                          <span className="text-[10px] text-[#5B7077]">{supply.sublabel}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#CFDDE0]/50">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${supply.barColor}`}
                            style={{ width: `${supply.barWidth}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${supply.badgeBg} ${supply.badgeText} ${supply.badgeBorder}`}
                      >
                        {supply.statusLabel}
                      </span>
                    </td>

                    {/* Suggested Action */}
                    <td className="py-2.5 pl-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-[#1B2B30]">
                          {action.title}
                        </span>
                        <span className="text-[10px] text-[#5B7077] max-w-xs truncate">
                          {action.detail}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Simple Explanatory Footer */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#CFDDE0]/60 pt-2 text-[10.5px] text-[#5B7077]">
        <p>
          <strong className="font-semibold text-[#1B2B30]">How this works:</strong> PRDS estimates how many medicine units patients will need next month based on recent visits. A supply of <span className="font-semibold text-[#2D7A5D]">1 to 3 months</span> is ideal.
        </p>
        {onNavigate && (
          <button
            type="button"
            onClick={onNavigate}
            className="font-bold text-[#34769B] hover:text-[#1F4A66] hover:underline transition"
          >
            Open Full Forecasting Module →
          </button>
        )}
      </div>
    </Panel>
  );
}
