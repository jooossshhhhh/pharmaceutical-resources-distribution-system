import { Calendar, FileSpreadsheet } from "lucide-react";

/**
 * ReportScopeToggle
 * Segmented toggle control allowing pharmacists to switch seamlessly between
 * Daily Dispensing Operations (RIS) and Monthly Physical Count Reconciliation (Inventory Form).
 */
export default function ReportScopeToggle({ scope = "daily", onScopeChange }) {
  return (
    <div className="inline-flex items-center bg-[#f7f6f3] border border-[#d8dadc] p-1 rounded-xl shadow-xs">
      <button
        type="button"
        onClick={() => onScopeChange?.("daily")}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
          scope === "daily"
            ? "bg-[#00a36c] text-white font-semibold shadow-xs"
            : "text-[#42474e] hover:text-[#0d1117] hover:bg-white/70 font-medium"
        }`}
      >
        <Calendar className="h-3.5 w-3.5" />
        <span>Daily</span>
      </button>

      <button
        type="button"
        onClick={() => onScopeChange?.("monthly")}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
          scope === "monthly"
            ? "bg-[#00a36c] text-white font-semibold shadow-xs"
            : "text-[#42474e] hover:text-[#0d1117] hover:bg-white/70 font-medium"
        }`}
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        <span>Monthly</span>
      </button>
    </div>
  );
}
