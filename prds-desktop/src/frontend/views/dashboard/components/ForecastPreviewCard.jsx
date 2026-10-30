import { ArrowRight, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatNumber } from "@shared/utils/dashboardUtils";

/**
 * ForecastPreviewCard
 * 
 * Provides an easy-to-understand, organized preview of upcoming medicine demand
 * compared to physical inventory on hand (Stock Runway).
 */
export default function ForecastPreviewCard({
  items = [],
  totalProjectedDemand = 0,
  riskCount = 0,
  onNavigate,
  title = "Demand Forecast Preview",
  subtitle = "Next 30 days · Need vs. physical stock",
}) {
  // Display the top 3 medicines with highest projected demand or risk
  const displayItems = (items || []).slice(0, 3);

  const getRunwayBadge = (coverageMonths, stock) => {
    if (stock === 0) {
      return {
        label: "Out of Stock",
        sublabel: "0 mo",
        bg: "bg-[#FBE9E3]",
        text: "text-[#8F3F2B]",
        border: "border-[#D9826B]/30",
        barColor: "bg-[#8F3F2B]",
      };
    }
    if (coverageMonths === null || coverageMonths === undefined) {
      return {
        label: "Ample Stock",
        sublabel: ">12 mo",
        bg: "bg-[#E5EFF1]",
        text: "text-[#1F4E5A]",
        border: "border-[#CFDDE0]",
        barColor: "bg-[#34769B]",
      };
    }
    if (coverageMonths < 1.0) {
      return {
        label: "Low Buffer",
        sublabel: `${coverageMonths.toFixed(1)} mo`,
        bg: "bg-[#FBE9E3]",
        text: "text-[#8F3F2B]",
        border: "border-[#D9826B]/30",
        barColor: "bg-[#D9826B]",
      };
    }
    if (coverageMonths <= 2.5) {
      return {
        label: "Optimal",
        sublabel: `${coverageMonths.toFixed(1)} mo`,
        bg: "bg-[#E8F5F1]",
        text: "text-[#2D7A5D]",
        border: "border-[#4C9F80]/30",
        barColor: "bg-[#4C9F80]",
      };
    }
    return {
      label: "Ample",
      sublabel: `${coverageMonths.toFixed(1)} mo`,
      bg: "bg-[#E5EFF1]",
      text: "text-[#1F4E5A]",
      border: "border-[#CFDDE0]",
      barColor: "bg-[#34769B]",
    };
  };

  return (
    <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-4.5 shadow-xs flex flex-col justify-between">
      {/* Card Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="min-w-0 pr-2">
          <h3 className="text-sm font-bold text-[#1B2B30] truncate">{title}</h3>
          <p className="text-[11px] font-medium text-[#5B7077] truncate">{subtitle}</p>
        </div>
        {onNavigate && (
          <button
            type="button"
            onClick={onNavigate}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#34769B] hover:text-[#1F4A66] transition shrink-0 group"
            title="Open full Forecasting module"
          >
            <span>View Forecast</span>
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </button>
        )}
      </div>

      {/* Main Content Area (Matches 210px height of sibling analytics cards) */}
      <div className="h-[210px] w-full flex flex-col justify-between">
        {displayItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-3">
            <div className="h-10 w-10 rounded-full bg-[#E5EFF1] flex items-center justify-center text-[#34769B] mb-2">
              <TrendingUp className="h-5 w-5" />
            </div>
            <p className="text-xs font-bold text-[#1B2B30]">Demand Forecast Ready</p>
            <p className="text-[11px] text-[#5B7077] max-w-xs mt-0.5">
              Projections compute continuously from dispensing logs and active inventory.
            </p>
            {onNavigate && (
              <button
                type="button"
                onClick={onNavigate}
                className="mt-3 rounded-lg border border-[#CFDDE0] bg-white px-3 py-1 text-xs font-bold text-[#1B2B30] hover:bg-[#E5EFF1] transition shadow-2xs"
              >
                Open Forecasting Module
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Top Summary Banner */}
            <div className="flex items-center justify-between rounded-lg bg-white border border-[#CFDDE0]/80 px-2.5 py-1.5 text-xs shadow-2xs">
              <div className="flex items-center gap-1.5">
                <span className="text-[10.5px] font-medium text-[#5B7077]">Projected Need:</span>
                <span className="font-extrabold text-[#1B2B30]">
                  {formatNumber(totalProjectedDemand)} units
                </span>
              </div>
              <div className="flex items-center gap-1">
                {riskCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[#8F3F2B]">
                    <AlertTriangle className="h-3 w-3 text-[#D9826B]" />
                    {riskCount} low buffer {riskCount === 1 ? "alert" : "alerts"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[#2D7A5D]">
                    <CheckCircle2 className="h-3 w-3 text-[#4C9F80]" />
                    Safe stock runway
                  </span>
                )}
              </div>
            </div>

            {/* List of Top Medicines */}
            <div className="flex flex-col justify-between flex-1 py-1 gap-1.5">
              {displayItems.map((item, idx) => {
                const stock = Number(item.stockQuantity || 0);
                const need = Number(item.nextMonthDemand || item.projectedDemand || 0);
                const coveragePct = need > 0 ? Math.round((stock / need) * 100) : 100;
                const badge = getRunwayBadge(item.coverageMonths, stock);
                const barWidth = Math.min(100, coveragePct);

                return (
                  <div
                    key={item.medicineId || idx}
                    className="group rounded-lg p-1.5 transition hover:bg-white hover:shadow-2xs"
                  >
                    {/* Medicine Header & Runway Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-[#1B2B30]" title={item.genericName}>
                          {item.genericName}
                          {item.dosage && (
                            <span className="ml-1 text-[10.5px] font-normal text-[#5B7077]">
                              {item.dosage}
                            </span>
                          )}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold border shrink-0 ${badge.bg} ${badge.text} ${badge.border}`}
                        title={`Stock Runway: ${badge.sublabel} of projected demand on shelf`}
                      >
                        <span>{badge.sublabel}</span>
                        <span className="opacity-75 font-normal">· {badge.label}</span>
                      </span>
                    </div>

                    {/* Numbers: Need vs In Stock */}
                    <div className="mt-1 flex items-center justify-between text-[10.5px]">
                      <span className="text-[#5B7077]">
                        Need: <strong className="font-semibold text-[#1B2B30]">{formatNumber(need)}</strong>/mo
                      </span>
                      <span className="text-[#5B7077]">
                        Stock: <strong className="font-semibold text-[#1B2B30]">{formatNumber(stock)}</strong>
                      </span>
                    </div>

                    {/* Visual Coverage Progress Bar */}
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#CFDDE0]/50">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${badge.barColor}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Micro Helper Footer */}
            <div className="pt-0.5 border-t border-[#CFDDE0]/50 flex items-center justify-between text-[10px] text-[#5B7077]">
              <span>Runway = physical stock ÷ next month demand</span>
              {onNavigate && (
                <button
                  type="button"
                  onClick={onNavigate}
                  className="font-semibold text-[#34769B] hover:underline"
                >
                  Full Projections →
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
