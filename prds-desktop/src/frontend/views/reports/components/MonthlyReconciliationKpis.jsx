import { formatPeso } from "@shared/utils/reportUtils";
import { CheckCircle2, TrendingUp, TrendingDown, Package, ShieldAlert, Award } from "lucide-react";

/**
 * MonthlyReconciliationKpis
 * Renders the 6-stage conservation-of-inventory accounting flow matching inventory-form.xlsx:
 * 1. Beginning Balance (Cols I-K)
 * 2. Additional Stocks / Inflows (Cols L-N)
 * 3. Less Issuances (Cols T-V)
 * 4. Transferred to Other Programs (Cols X-AA)
 * 5. Expired Stocks (Cols AC-AE)
 * 6. Remaining Ending Balance (Cols AG-AI)
 */
export default function MonthlyReconciliationKpis({ monthlyData }) {
  const { totals = {}, items = [], activeProgramCount = 0 } = monthlyData || {};

  const {
    totalBegVal = 0,
    totalAddVal = 0,
    totalIssuedVal = 0,
    totalProgVal = 0,
    totalExpiredVal = 0,
    totalRemVal = 0,
    totalBegQty = 0,
    totalAddQty = 0,
    totalIssuedQty = 0,
    totalProgQty = 0,
    totalExpiredQty = 0,
    totalRemQty = 0,
  } = totals;

  // Verify mathematical balance: Ending = Beginning + Additions - (Issued + Programs + Expired)
  const calculatedRemaining = totalBegVal + totalAddVal - (totalIssuedVal + totalProgVal + totalExpiredVal);
  const isBalanced = Math.abs(calculatedRemaining - totalRemVal) < 0.01;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {/* 1. Beginning Balance */}
      <div className="bg-white border border-[#d8dadc] rounded-xl p-3.5 shadow-xs hover:border-slate-400 transition-colors flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-[#42474e] uppercase">
              Beginning Balance
            </span>
            <Package className="h-3.5 w-3.5 text-slate-500" />
          </div>
          <div className="text-xl font-bold text-[#0d1117] mt-1.5 truncate" title={formatPeso(totalBegVal)}>
            {formatPeso(totalBegVal)}
          </div>
        </div>
        <div className="mt-2.5 pt-2 border-t border-[#d8dadc]/60 flex items-center justify-between text-[11px] text-[#42474e]">
          <span>Opening Stock:</span>
          <strong className="text-[#0d1117]">{totalBegQty.toLocaleString()} units</strong>
        </div>
      </div>

      {/* 2. Additional Stocks / Inflows */}
      <div className="bg-white border border-[#d8dadc] rounded-xl p-3.5 shadow-xs hover:border-blue-300 transition-colors flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-blue-700 uppercase">
              Additions (Inflows)
            </span>
            <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-[#0d1117] mt-1.5 truncate" title={formatPeso(totalAddVal)}>
            {formatPeso(totalAddVal)}
          </div>
        </div>
        <div className="mt-2.5 pt-2 border-t border-[#d8dadc]/60 flex items-center justify-between text-[11px] text-[#42474e]">
          <span>Procured / DOH:</span>
          <strong className="text-blue-700 font-semibold">{totalAddQty.toLocaleString()} units</strong>
        </div>
      </div>

      {/* 3. Regular Issuances */}
      <div className="bg-white border border-[#d8dadc] rounded-xl p-3.5 shadow-xs hover:border-emerald-300 transition-colors flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-[#00a36c] uppercase">
              Regular Issuances
            </span>
            <TrendingDown className="h-3.5 w-3.5 text-[#00a36c]" />
          </div>
          <div className="text-xl font-bold text-[#0d1117] mt-1.5 truncate" title={formatPeso(totalIssuedVal)}>
            {formatPeso(totalIssuedVal)}
          </div>
        </div>
        <div className="mt-2.5 pt-2 border-t border-[#d8dadc]/60 flex items-center justify-between text-[11px] text-[#42474e]">
          <span>Walk-in + BHW:</span>
          <strong className="text-[#00a36c] font-semibold">{totalIssuedQty.toLocaleString()} units</strong>
        </div>
      </div>

      {/* 4. Area / Programs Transfer */}
      <div className="bg-white border border-[#d8dadc] rounded-xl p-3.5 shadow-xs hover:border-purple-300 transition-colors flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-purple-700 uppercase">
              Area / Programs
            </span>
            <Award className="h-3.5 w-3.5 text-purple-600" />
          </div>
          <div className="text-xl font-bold text-[#0d1117] mt-1.5 truncate" title={formatPeso(totalProgVal)}>
            {formatPeso(totalProgVal)}
          </div>
        </div>
        <div className="mt-2.5 pt-2 border-t border-[#d8dadc]/60 flex items-center justify-between text-[11px] text-[#42474e]">
          <span>Outreach Campaigns:</span>
          <strong className="text-purple-700 font-semibold">{totalProgQty.toLocaleString()} units</strong>
        </div>
      </div>

      {/* 5. Expired Stocks */}
      <div className="bg-white border border-[#d8dadc] rounded-xl p-3.5 shadow-xs hover:border-red-300 transition-colors flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-red-600 uppercase">
              Expired Losses
            </span>
            <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
          </div>
          <div className="text-xl font-bold text-[#0d1117] mt-1.5 truncate" title={formatPeso(totalExpiredVal)}>
            {formatPeso(totalExpiredVal)}
          </div>
        </div>
        <div className="mt-2.5 pt-2 border-t border-[#d8dadc]/60 flex items-center justify-between text-[11px] text-[#42474e]">
          <span>Condemned:</span>
          <strong className={totalExpiredQty > 0 ? "text-red-600 font-semibold" : "text-[#42474e]"}>
            {totalExpiredQty.toLocaleString()} units
          </strong>
        </div>
      </div>

      {/* 6. Remaining Balance (Physical Count on Hand) */}
      <div className="bg-[#f0fdf4] border-2 border-emerald-400 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-emerald-800 uppercase">
              Remaining Balance
            </span>
            <CheckCircle2 className="h-3.5 w-3.5 text-[#00a36c]" />
          </div>
          <div className="text-xl font-bold text-emerald-950 mt-1.5 truncate" title={formatPeso(totalRemVal)}>
            {formatPeso(totalRemVal)}
          </div>
        </div>
        <div className="mt-2.5 pt-2 border-t border-emerald-200 flex items-center justify-between text-[11px] text-emerald-900">
          <span>Physical on Hand:</span>
          <strong className="font-semibold text-emerald-950">{totalRemQty.toLocaleString()} units</strong>
        </div>
      </div>
    </div>
  );
}
