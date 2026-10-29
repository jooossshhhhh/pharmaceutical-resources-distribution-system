import { Calendar, FileSpreadsheet } from "lucide-react";

/**
 * ReportScopeToggle
 * Segmented toggle control allowing pharmacists to switch seamlessly between
 * Daily Dispensing Operations (RIS) and Monthly Physical Count Reconciliation (Inventory Form).
 */
export default function ReportScopeToggle({ scope = "daily", onScopeChange }) {
  return (
    <div className="inline-flex items-center bg-[#E5EFF1] border border-[#CFDDE0] p-1 rounded-xl shadow-xs">
      <button
        type="button"
        onClick={() => onScopeChange?.("daily")}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
          scope === "daily"
            ? "bg-[#1F4E5A] text-white font-semibold shadow-xs"
            : "text-[#5B7077] hover:text-[#1B2B30] hover:bg-[#F9FBFB] font-medium"
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
            ? "bg-[#1F4E5A] text-white font-semibold shadow-xs"
            : "text-[#5B7077] hover:text-[#1B2B30] hover:bg-[#F9FBFB] font-medium"
        }`}
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        <span>Monthly</span>
      </button>
    </div>
  );
}
