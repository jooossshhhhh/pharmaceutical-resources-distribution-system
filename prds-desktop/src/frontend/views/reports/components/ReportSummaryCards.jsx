import { formatPeso } from "@shared/utils/reportUtils";
import { Pill, CircleDollarSign, Boxes, AlertTriangle, CheckCircle2 } from "lucide-react";

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
      {/* Card 1: Medicines Dispensed Today */}
      <div className="bg-white border border-[#d8dadc] rounded-xl p-4 shadow-xs hover:border-emerald-300 transition-all flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11.5px] font-semibold tracking-wide text-[#5f6673] uppercase">
              Medicines Dispensed Today
            </span>
            <div className="text-2xl font-black text-[#0d1117] mt-1.5">
              {dispensedToday.totalUnits.toLocaleString()}{" "}
              <span className="text-xs font-semibold text-[#5f6673]">Units</span>
            </div>
          </div>
          <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100">
            <Pill className="h-4 w-4" />
          </div>
        </div>
        <p className="text-[11.5px] text-[#5f6673] mt-2.5 pt-2 border-t border-[#f1f3f5]">
          Walk-in: <span className="font-bold text-blue-700">{dispensedToday.walkInUnits.toLocaleString()}</span> | Barangays:{" "}
          <span className="font-bold text-emerald-700">{dispensedToday.bhwUnits.toLocaleString()}</span>
        </p>
      </div>

      {/* Card 2: Total Medicine Cost (CHO) / Stocked Medicines (BHW) */}
      {isBhw ? (
        <div className="bg-white border border-[#d8dadc] rounded-xl p-4 shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11.5px] font-semibold tracking-wide text-[#5f6673] uppercase">
                Stocked Medicines
              </span>
              <div className="text-2xl font-black text-[#0d1117] mt-1.5">
                {(stockHealth.totalItems || 0).toLocaleString()}{" "}
                <span className="text-xs font-semibold text-[#5f6673]">Items</span>
              </div>
            </div>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 border border-blue-100">
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          <p className="text-[11.5px] text-[#5f6673] mt-2.5 pt-2 border-t border-[#f1f3f5]">
            Active medicines available at station
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#d8dadc] rounded-xl p-4 shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11.5px] font-semibold tracking-wide text-[#5f6673] uppercase">
                Total Medicine Cost
              </span>
              <div className="text-2xl font-black text-[#0d1117] mt-1.5">
                {formatPeso(totalMedicineCost)}
              </div>
            </div>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 border border-blue-100">
              <CircleDollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="text-[11.5px] text-[#5f6673] mt-2.5 pt-2 border-t border-[#f1f3f5]">
            Value of medicines distributed today
          </p>
        </div>
      )}

      {/* Card 3: Total Remaining Stock (CHO) / Quarantined Batches (BHW) */}
      {isBhw ? (
        <div className="bg-white border border-[#d8dadc] rounded-xl p-4 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11.5px] font-semibold tracking-wide text-[#5f6673] uppercase">
                Quarantined Batches
              </span>
              <div className="text-2xl font-black text-[#0d1117] mt-1.5">
                {(stockHealth.expiredCount || 0).toLocaleString()}{" "}
                <span className="text-xs font-semibold text-[#5f6673]">Lots</span>
              </div>
            </div>
            <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 border border-indigo-100">
              <Pill className="h-4 w-4" />
            </div>
          </div>
          <p className="text-[11.5px] text-[#5f6673] mt-2.5 pt-2 border-t border-[#f1f3f5]">
            {stockHealth.expiredCount > 0 ? "Expired stock pending return to CHO" : "No expired lots quarantined"}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#d8dadc] rounded-xl p-4 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11.5px] font-semibold tracking-wide text-[#5f6673] uppercase">
                Total Remaining Stock
              </span>
              <div className="text-2xl font-black text-[#0d1117] mt-1.5">
                {formatPeso(totalRemainingStockValue)}
              </div>
            </div>
            <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 border border-indigo-100">
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          <p className="text-[11.5px] text-[#5f6673] mt-2.5 pt-2 border-t border-[#f1f3f5]">
            Active valuation of warehouse inventory
          </p>
        </div>
      )}

      {/* Card 4: Low Stock Warning */}
      <div className="bg-white border border-[#d8dadc] rounded-xl p-4 shadow-xs hover:border-amber-300 transition-all flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11.5px] font-semibold tracking-wide text-[#5f6673] uppercase">
              Stock Safety Health
            </span>
            <div className="mt-1.5">
              {!hasStockData ? (
                <span className="text-2xl font-black text-[#5f6673]">
                  No data
                </span>
              ) : stockHealth.lowStockCount > 0 ? (
                <span className="text-2xl font-black text-amber-600">
                  {stockHealth.lowStockCount}{" "}
                  <span className="text-sm font-bold text-amber-700">
                    {stockHealth.lowStockCount === 1 ? "Medicine Low" : "Medicines Low"}
                  </span>
                </span>
              ) : (
                <span className="text-2xl font-black text-[#00a36c]">
                  All Healthy
                </span>
              )}
            </div>
          </div>
          <div
            className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${
              stockHealth.lowStockCount > 0
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            {stockHealth.lowStockCount > 0 ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
          </div>
        </div>
        <p className="text-[11.5px] text-[#5f6673] mt-2.5 pt-2 border-t border-[#f1f3f5] truncate">
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
