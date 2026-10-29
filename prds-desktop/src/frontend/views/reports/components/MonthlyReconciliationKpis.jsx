import { formatPeso } from "@shared/utils/reportUtils";

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
      <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-3.5 shadow-xs hover:border-[#34769B]/40 transition-colors flex flex-col justify-between">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-[#5B7077] uppercase">
            Beginning Balance
          </span>
          <div className="text-xl font-bold text-[#1B2B30] mt-1.5 truncate" title={formatPeso(totalBegVal)}>
            {formatPeso(totalBegVal)}
          </div>
        </div>
        <div className="mt-2.5 pt-2 border-t border-[#CFDDE0]/60 flex items-center justify-between text-[11px] text-[#5B7077]">
          <span>Opening Stock:</span>
          <strong className="text-[#1B2B30]">{totalBegQty.toLocaleString()} units</strong>
        </div>
      </div>

      {/* 2. Additional Stocks / Inflows */}
      <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-3.5 shadow-xs hover:border-[#34769B]/40 transition-colors flex flex-col justify-between">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-[#34769B] uppercase">
            Additions (Inflows)
          </span>
          <div className="text-xl font-bold text-[#1B2B30] mt-1.5 truncate" title={formatPeso(totalAddVal)}>
            {formatPeso(totalAddVal)}
          </div>
        </div>
        <div className="mt-2.5 pt-2 border-t border-[#CFDDE0]/60 flex items-center justify-between text-[11px] text-[#5B7077]">
          <span>Procured / DOH:</span>
          <strong className="text-[#34769B] font-semibold">{totalAddQty.toLocaleString()} units</strong>
        </div>
      </div>

      {/* 3. Regular Issuances */}
      <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-3.5 shadow-xs hover:border-[#1F4E5A]/40 transition-colors flex flex-col justify-between">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-[#1F4E5A] uppercase">
            Regular Issuances
          </span>
          <div className="text-xl font-bold text-[#1B2B30] mt-1.5 truncate" title={formatPeso(totalIssuedVal)}>
            {formatPeso(totalIssuedVal)}
          </div>
        </div>
        <div className="mt-2.5 pt-2 border-t border-[#CFDDE0]/60 flex items-center justify-between text-[11px] text-[#5B7077]">
          <span>Walk-in + BHW:</span>
          <strong className="text-[#1F4E5A] font-semibold">{totalIssuedQty.toLocaleString()} units</strong>
        </div>
      </div>

      {/* 4. Area / Programs Transfer */}
      <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-3.5 shadow-xs hover:border-[#1F4E5A]/30 transition-colors flex flex-col justify-between">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-[#5B7077] uppercase">
            Area / Programs
          </span>
          <div className="text-xl font-bold text-[#1B2B30] mt-1.5 truncate" title={formatPeso(totalProgVal)}>
            {formatPeso(totalProgVal)}
          </div>
        </div>
        <div className="mt-2.5 pt-2 border-t border-[#CFDDE0]/60 flex items-center justify-between text-[11px] text-[#5B7077]">
          <span>Outreach Campaigns:</span>
          <strong className="text-[#1B2B30] font-semibold">{totalProgQty.toLocaleString()} units</strong>
        </div>
      </div>

      {/* 5. Expired Stocks */}
      <div className="bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl p-3.5 shadow-xs hover:border-[#D9826B]/40 transition-colors flex flex-col justify-between">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-[#D9826B] uppercase">
            Expired Losses
          </span>
          <div className="text-xl font-bold text-[#1B2B30] mt-1.5 truncate" title={formatPeso(totalExpiredVal)}>
            {formatPeso(totalExpiredVal)}
          </div>
        </div>
        <div className="mt-2.5 pt-2 border-t border-[#CFDDE0]/60 flex items-center justify-between text-[11px] text-[#5B7077]">
          <span>Condemned:</span>
          <strong className={totalExpiredQty > 0 ? "text-[#D9826B] font-semibold" : "text-[#5B7077]"}>
            {totalExpiredQty.toLocaleString()} units
          </strong>
        </div>
      </div>

      {/* 6. Remaining Balance (Physical Count on Hand) */}
      <div className="bg-[#E2F3EC] border border-[#4C9F80]/60 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-[#1F4E5A] uppercase">
            Remaining Balance
          </span>
          <div className="text-xl font-bold text-[#1F4E5A] mt-1.5 truncate" title={formatPeso(totalRemVal)}>
            {formatPeso(totalRemVal)}
          </div>
        </div>
        <div className="mt-2.5 pt-2 border-t border-[#4C9F80]/30 flex items-center justify-between text-[11px] text-[#1F4E5A]">
          <span>Physical on Hand:</span>
          <strong className="font-semibold text-[#1F4E5A]">{totalRemQty.toLocaleString()} units</strong>
        </div>
      </div>
    </div>
  );
}
