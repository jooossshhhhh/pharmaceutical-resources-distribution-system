import { formatPeso } from "@shared/utils/reportUtils";

export default function ReportSummaryCards({ kpis, isBhw = false }) {
  const {
    dispensedToday = { totalUnits: 0, walkInUnits: 0, bhwUnits: 0 },
    totalMedicineCost = 0,
    totalRemainingStockValue = 0,
    stockHealth = { hasData: false, totalItems: 0, lowStockCount: 0, lowStockNames: [] },
  } = kpis || {};

  const hasStockData =
    stockHealth?.hasData !== undefined
      ? Boolean(stockHealth.hasData)
      : (stockHealth?.totalItems ?? 0) > 0 || (stockHealth?.lowStockCount ?? 0) > 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 flex-1">
      {/* Card 1: Medicines Dispensed Today (Throughput / Volume) */}
      <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-4 shadow-xs hover:border-[#4C9F80]/50 transition-all flex flex-col justify-between">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-[#5B7077] uppercase">
            Medicines Dispensed Today
          </span>
          <div className="text-2xl sm:text-[28px] font-black text-[#1B2B30] tracking-tight leading-none mt-2">
            {dispensedToday.totalUnits.toLocaleString()}{" "}
            <span className="text-xs font-bold text-[#5B7077] tracking-normal">Units</span>
          </div>
        </div>
        <p className="text-[11.5px] text-[#5B7077] mt-3 pt-2.5 border-t border-[#CFDDE0]/60">
          Walk-in: <strong className="text-[#34769B]">{dispensedToday.walkInUnits.toLocaleString()}</strong>
          <span className="mx-1.5 text-[#CFDDE0]">•</span>
          Barangays: <strong className="text-[#4C9F80]">{dispensedToday.bhwUnits.toLocaleString()}</strong>
        </p>
      </div>

      {/* Card 2: Total Medicine Cost (CHO) / Stocked Medicines (BHW) */}
      {isBhw ? (
        <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-4 shadow-xs hover:border-[#34769B]/50 transition-all flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold tracking-wider text-[#5B7077] uppercase">
              Stocked Medicines
            </span>
            <div className="text-2xl sm:text-[28px] font-black text-[#1B2B30] tracking-tight leading-none mt-2">
              {(stockHealth.totalItems || 0).toLocaleString()}{" "}
              <span className="text-xs font-bold text-[#5B7077] tracking-normal">Items</span>
            </div>
          </div>
          <p className="text-[11.5px] text-[#5B7077] mt-3 pt-2.5 border-t border-[#CFDDE0]/60">
            Active medicines available at station
          </p>
        </div>
      ) : (
        <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-4 shadow-xs hover:border-[#34769B]/50 transition-all flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold tracking-wider text-[#5B7077] uppercase">
              Total Medicine Cost
            </span>
            <div className="text-2xl sm:text-[28px] font-black text-[#1B2B30] tracking-tight leading-none mt-2">
              {formatPeso(totalMedicineCost)}
            </div>
          </div>
          <p className="text-[11.5px] text-[#5B7077] mt-3 pt-2.5 border-t border-[#CFDDE0]/60">
            Value of medicines distributed today
          </p>
        </div>
      )}

      {/* Card 3: Total Remaining Stock (CHO) / Quarantined Batches (BHW) */}
      {isBhw ? (
        <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-4 shadow-xs hover:border-[#1F4E5A]/40 transition-all flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold tracking-wider text-[#5B7077] uppercase">
              Quarantined Batches
            </span>
            <div className="text-2xl sm:text-[28px] font-black text-[#1B2B30] tracking-tight leading-none mt-2">
              {(stockHealth.expiredCount || 0).toLocaleString()}{" "}
              <span className="text-xs font-bold text-[#5B7077] tracking-normal">Lots</span>
            </div>
          </div>
          <p className="text-[11.5px] text-[#5B7077] mt-3 pt-2.5 border-t border-[#CFDDE0]/60">
            {stockHealth.expiredCount > 0 ? "Expired stock pending return to CHO" : "No expired lots quarantined"}
          </p>
        </div>
      ) : (
        <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-4 shadow-xs hover:border-[#1F4E5A]/40 transition-all flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold tracking-wider text-[#5B7077] uppercase">
              Total Remaining Stock
            </span>
            <div className="text-2xl sm:text-[28px] font-black text-[#1B2B30] tracking-tight leading-none mt-2">
              {formatPeso(totalRemainingStockValue)}
            </div>
          </div>
          <p className="text-[11.5px] text-[#5B7077] mt-3 pt-2.5 border-t border-[#CFDDE0]/60">
            Active valuation of warehouse inventory
          </p>
        </div>
      )}

      {/* Card 4: Stock Safety Health */}
      <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-4 shadow-xs hover:border-[#D9826B]/50 transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-[#5B7077] uppercase">
              Stock Safety Health
            </span>
            {hasStockData && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold tracking-wide uppercase border ${
                  stockHealth.lowStockCount > 0
                    ? "bg-[#FDEEE9] text-[#D9826B] border-[#D9826B]/30"
                    : "bg-[#E2F3EC] text-[#4C9F80] border-[#4C9F80]/30"
                }`}
              >
                {stockHealth.lowStockCount > 0 ? "Action Required" : "Optimal"}
              </span>
            )}
          </div>
          <div className="mt-2">
            {!hasStockData ? (
              <span className="text-2xl sm:text-[28px] font-black text-[#5B7077] tracking-tight leading-none">
                No data
              </span>
            ) : stockHealth.lowStockCount > 0 ? (
              <span className="text-2xl sm:text-[28px] font-black text-[#D9826B] tracking-tight leading-none">
                {stockHealth.lowStockCount}{" "}
                <span className="text-xs font-bold text-[#D9826B] tracking-normal">
                  {stockHealth.lowStockCount === 1 ? "Medicine Low" : "Medicines Low"}
                </span>
              </span>
            ) : (
              <span className="text-2xl sm:text-[28px] font-black text-[#4C9F80] tracking-tight leading-none">
                All Healthy
              </span>
            )}
          </div>
        </div>
        <p className="text-[11.5px] text-[#5B7077] mt-3 pt-2.5 border-t border-[#CFDDE0]/60 truncate">
          {!hasStockData
            ? "No inventory records available"
            : stockHealth.lowStockNames?.length > 0
            ? `${stockHealth.lowStockNames.join(", ")} need restocking`
            : "All medicines above safety threshold"}
        </p>
      </div>
    </div>
  );
}
