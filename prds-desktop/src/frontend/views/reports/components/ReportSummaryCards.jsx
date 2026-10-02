import { formatPeso } from "@shared/utils/reportUtils";

export default function ReportSummaryCards({ kpis }) {
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
      {/* Card 1: Medicines Dispensed Today */}
      <div className="bg-white border border-[#d8dadc] rounded-xl p-4 shadow-xs hover:border-emerald-300 transition-colors flex flex-col justify-between">
        <div>
          <span className="text-[11.5px] font-semibold tracking-wide text-[#42474e] uppercase">
            Medicines Dispensed Today
          </span>
          <div className="text-2xl font-bold text-[#0d1117] mt-1.5">
            {dispensedToday.totalUnits.toLocaleString()}{" "}
            <span className="text-sm font-medium text-[#42474e]">Units</span>
          </div>
        </div>
        <p className="text-[11.5px] text-[#42474e] mt-2.5">
          Walk-in Patients: <span className="font-semibold text-[#0d1117]">{dispensedToday.walkInUnits}</span> | Barangay Centers:{" "}
          <span className="font-semibold text-[#0d1117]">{dispensedToday.bhwUnits}</span>
        </p>
      </div>

      {/* Card 2: Total Medicine Cost */}
      <div className="bg-white border border-[#d8dadc] rounded-xl p-4 shadow-xs hover:border-emerald-300 transition-colors flex flex-col justify-between">
        <div>
          <span className="text-[11.5px] font-semibold tracking-wide text-[#42474e] uppercase">
            Total Medicine Cost
          </span>
          <div className="text-2xl font-bold text-[#0d1117] mt-1.5">
            {formatPeso(totalMedicineCost)}
          </div>
        </div>
        <p className="text-[11.5px] text-[#42474e] mt-2.5">
          Cost of medicines given out today
        </p>
      </div>

      {/* Card 3: Total Remaining Stock */}
      <div className="bg-white border border-[#d8dadc] rounded-xl p-4 shadow-xs hover:border-emerald-300 transition-colors flex flex-col justify-between">
        <div>
          <span className="text-[11.5px] font-semibold tracking-wide text-[#42474e] uppercase">
            Total Remaining Stock
          </span>
          <div className="text-2xl font-bold text-[#0d1117] mt-1.5">
            {formatPeso(totalRemainingStockValue)}
          </div>
        </div>
        <p className="text-[11.5px] text-[#42474e] mt-2.5">
          Total value of available medicines in stock
        </p>
      </div>

      {/* Card 4: Low Stock Warning */}
      <div className="bg-white border border-[#d8dadc] rounded-xl p-4 shadow-xs hover:border-emerald-300 transition-colors flex flex-col justify-between">
        <div>
          <span className="text-[11.5px] font-semibold tracking-wide text-[#42474e] uppercase">
            Low Stock Warning
          </span>
          <div className="mt-1.5">
            {!hasStockData ? (
              <span className="text-2xl font-bold text-[#42474e]">
                No data
              </span>
            ) : stockHealth.lowStockCount > 0 ? (
              <span className="text-2xl font-bold text-amber-600">
                {stockHealth.lowStockCount}{" "}
                <span className="text-base font-semibold">
                  {stockHealth.lowStockCount === 1 ? "Medicine Low" : "Medicines Low"}
                </span>
              </span>
            ) : (
              <span className="text-2xl font-bold text-[#00a36c]">
                All Stocks Healthy
              </span>
            )}
          </div>
        </div>
        <p className="text-[11.5px] text-[#42474e] mt-2.5 truncate">
          {!hasStockData
            ? "No inventory records available"
            : stockHealth.lowStockNames?.length > 0
            ? `${stockHealth.lowStockNames.join(", ")} need restocking`
            : "No items below threshold"}
        </p>
      </div>
    </div>
  );
}
