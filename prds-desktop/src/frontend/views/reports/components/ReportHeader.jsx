import { useState, useRef, useEffect, useMemo } from "react";
import { Download, ChevronDown, Calendar as CalendarIcon, Building2, Check, FileSpreadsheet } from "lucide-react";
import { formatReportDate } from "@shared/utils/reportUtils";

export default function ReportHeader({
  facilities = [],
  selectedFacilityId = "ALL",
  onSelectFacility,
  selectedDate = new Date(),
  reportScope = "daily",
  selectedPeriod = null,
  isBhw = false,
  facilityName = "Vicente Mendiola Center for Health (City Health Office)",
  onExportRis,
  onExportInventory,
  isExporting = false,
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const periodLabel = useMemo(() => {
    if (reportScope === "monthly" && selectedPeriod) {
      const monthDate = new Date(selectedPeriod.year, selectedPeriod.month - 1, 1);
      return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(monthDate);
    }
    return formatReportDate(selectedDate);
  }, [reportScope, selectedPeriod, selectedDate]);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-[#CFDDE0]">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1B2B30]">Reports</h1>
        <p className="text-xs text-[#5B7077] mt-0.5">{facilityName}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {/* Facility Filter (CHO only in Daily scope) */}
        {!isBhw && reportScope === "daily" && (
          <div className="relative">
            <select
              value={selectedFacilityId}
              onChange={(e) => onSelectFacility(e.target.value)}
              className="appearance-none bg-[#F9FBFB] border border-[#CFDDE0] text-xs font-medium text-[#1B2B30] rounded-lg pl-3 pr-8 py-2 hover:border-[#34769B] focus:outline-none focus:ring-1 focus:ring-[#34769B] shadow-xs cursor-pointer transition-colors"
            >
              <option value="ALL">All Health Centers</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.facility_name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#5B7077] pointer-events-none" />
          </div>
        )}

        {/* Selected Date Badge (Daily scope only) */}
        {reportScope === "daily" && (
          <div className="flex items-center gap-1.5 bg-[#F9FBFB] border border-[#CFDDE0] text-xs font-medium text-[#1B2B30] rounded-lg px-3 py-2 shadow-xs">
            <CalendarIcon className="h-3.5 w-3.5 text-[#1F4E5A]" />
            <span className="font-semibold">{periodLabel}</span>
          </div>
        )}

        {/* Export to Excel: Direct RIS button for BHW, Dropdown for CHO */}
        {isBhw || !onExportInventory ? (
          <button
            type="button"
            disabled={isExporting}
            onClick={() => onExportRis?.()}
            className="btn-primary flex items-center gap-2 disabled:opacity-60 text-white text-xs font-semibold rounded-lg px-3.5 py-2 shadow-xs transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isExporting ? "Exporting..." : "Export to Excel (RIS)"}</span>
          </button>
        ) : (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              disabled={isExporting}
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="btn-primary flex items-center gap-2 disabled:opacity-60 text-white text-xs font-semibold rounded-lg px-3.5 py-2 shadow-xs transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isExporting ? "Exporting..." : "Export to Excel"}</span>
              <ChevronDown className="h-3.5 w-3.5 ml-0.5 opacity-90" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-64 bg-[#F9FBFB] border border-[#CFDDE0] rounded-xl shadow-lg z-50 py-1.5 text-xs text-[#1B2B30] animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onExportRis?.();
                  }}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-[#E5EFF1]/60 flex items-start gap-2.5 transition-colors cursor-pointer group"
                >
                  <FileSpreadsheet className="h-4 w-4 text-[#1F4E5A] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-[#1B2B30] group-hover:text-[#1F4E5A]">
                      Daily Dispensing Slip (RIS)
                    </div>
                    <div className="text-[11px] text-[#5B7077] mt-0.5">
                      2 Sheets: CHO clinic & Barangay Health Stations
                    </div>
                  </div>
                </button>

                <div className="border-t border-[#CFDDE0] my-1" />

                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onExportInventory?.();
                  }}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-[#E5EFF1]/60 flex items-start gap-2.5 transition-colors cursor-pointer group"
                >
                  <FileSpreadsheet className="h-4 w-4 text-[#1F4E5A] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-[#1B2B30] group-hover:text-[#1F4E5A]">
                      Monthly Inventory Form
                    </div>
                    <div className="text-[11px] text-[#5B7077] mt-0.5">
                      Official CHO physical count & stock reconciliation
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
