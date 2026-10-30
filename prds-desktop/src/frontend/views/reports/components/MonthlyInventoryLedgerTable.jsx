import { useState, useMemo, Fragment } from "react";
import { formatPeso } from "@shared/utils/reportUtils";
import { groupReportItemsByPo } from "@shared/utils/reportExportUtils";
import {
  Search,
  Download,
  Filter,
  Layers,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  X,
  Eye,
} from "lucide-react";

/**
 * MonthlyInventoryLedgerTable
 * Interactive high-density on-screen ledger replicating the official
 * "REPORT ON PHYSICAL COUNT OF INVENTORIES / VMCH MEDICINE SUPPLIES" (inventory-form.xlsx).
 */
export default function MonthlyInventoryLedgerTable({
  items = [],
  totals = {},
  selectedProgramFilter = null,
  onClearProgramFilter,
  onExportExcel,
  isExporting = false,
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL, ISSUED, PROGRAM, EXPIRED
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Formatted date labels based on official statutory template (inventory-form.xlsx Rows 5 & 6)
  const { begDateLabel, remDateLabel } = useMemo(() => {
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;

    const targetDate = new Date(year, month - 1, 1);
    const monthName = new Intl.DateTimeFormat("en-US", { month: "long" })
      .format(targetDate)
      .toUpperCase();
    const lastDay = new Date(year, month, 0).getDate();
    // Adaptive remaining balance date: If viewing current in-progress month, stamp active date; if closed past month, stamp month-end
    const effectiveRemDay = isCurrentMonth ? now.getDate() : lastDay;
    const remDateLabel = `AS OF ${monthName} ${effectiveRemDay}, ${year}`;

    const prevDate = new Date(year, month - 1, 0);
    const prevMonthName = new Intl.DateTimeFormat("en-US", { month: "long" })
      .format(prevDate)
      .toUpperCase();
    const prevLastDay = prevDate.getDate();
    const prevYear = prevDate.getFullYear();
    const begDateLabel = `AS OF ${prevMonthName} ${prevLastDay}, ${prevYear}`;

    return { begDateLabel, remDateLabel };
  }, [year, month]);

  // Filter items based on search, status filter, and active program filter
  const filteredItems = useMemo(() => {
    let result = items || [];

    // 1. Program filter (from program cards or dropdown)
    if (selectedProgramFilter) {
      const pUpper = selectedProgramFilter.toUpperCase();
      result = result.filter((item) => {
        const progName = (item.programName || "").toUpperCase();
        return progName.includes(pUpper);
      });
    }

    // 2. Search term (matches Generic Name, Brand, Lot No, Program Name, and Purchase Order / PO Number)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      const cleanQ = q.replace(/^po\s*(no\.?)?\s*[-:]?\s*/i, "").trim();
      result = result.filter((item) => {
        const desc = (item.itemDescription || "").toLowerCase();
        const brand = (item.brandName || "").toLowerCase();
        const lot = (item.lotNo || "").toLowerCase();
        const prog = (item.programName || "").toLowerCase();
        const po = (item.poNumber || "").toLowerCase();
        const formattedPo = `po no. ${po}`;

        return (
          desc.includes(q) ||
          brand.includes(q) ||
          lot.includes(q) ||
          prog.includes(q) ||
          po.includes(q) ||
          formattedPo.includes(q) ||
          (cleanQ && po.includes(cleanQ))
        );
      });
    }

    // 3. Status filter
    if (statusFilter === "ISSUED") {
      result = result.filter((item) => (item.issuedQty || 0) > 0);
    } else if (statusFilter === "PROGRAM") {
      result = result.filter((item) => (item.programQty || 0) > 0);
    } else if (statusFilter === "EXPIRED") {
      result = result.filter((item) => (item.expiredQty || 0) > 0);
    }

    return result;
  }, [items, selectedProgramFilter, searchTerm, statusFilter]);

  // Recalculate dynamic totals for the filtered subset
  const filteredTotals = useMemo(() => {
    let begVal = 0;
    let addVal = 0;
    let grossVal = 0;
    let issuedVal = 0;
    let progVal = 0;
    let expiredVal = 0;
    let remVal = 0;

    filteredItems.forEach((item) => {
      begVal += item.begTotal || 0;
      addVal += item.addTotal || 0;
      grossVal += item.grossTotal || 0;
      issuedVal += item.issuedTotal || 0;
      progVal += item.programTotal || 0;
      expiredVal += item.expiredTotal || 0;
      remVal += item.remainingTotal || 0;
    });

    return {
      begVal,
      addVal,
      grossVal,
      issuedVal,
      progVal,
      expiredVal,
      remVal,
    };
  }, [filteredItems]);

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Group paginated items by Purchase Order (matching official inventory-report.xlsx layout)
  const paginatedGroups = useMemo(() => {
    return groupReportItemsByPo(paginatedItems);
  }, [paginatedItems]);



  return (
    <div className="bg-white border border-[#d8dadc] rounded-xl shadow-xs overflow-hidden flex flex-col">
      {/* Top Toolbar */}
      <div className="p-4 border-b border-[#d8dadc] flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between bg-white">
        <div>
          <h3 className="text-sm font-bold text-[#0d1117]">
            Monthly Physical Count Inventory Ledger
          </h3>
          <p className="text-[11px] text-[#42474e] mt-0.5 font-medium">
            REPORT ON PHYSICAL COUNT OF INVENTORIES: VMCH MEDICINE SUPPLIES MONTH &bull; {new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(year, month - 1, 1))}, {year}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Export Button */}
          {onExportExcel && (
            <button
              type="button"
              disabled={isExporting}
              onClick={onExportExcel}
              className="flex items-center gap-1.5 bg-linear-to-r from-[#1F4E5A] to-[#286575] hover:brightness-105 active:scale-[0.99] border border-[#1F4E5A] disabled:opacity-60 text-white text-xs font-semibold rounded-lg px-3 py-1.5 shadow-xs transition-all cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isExporting ? "Exporting..." : "Export .xlsx"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-4 py-2.5 bg-[#f8f9ff]/70 border-b border-[#d8dadc]/60 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search generic name, brand, lot, PO number..."
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#d8dadc] rounded-lg text-xs text-[#0d1117] placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { id: "ALL", label: "All Items" },
            { id: "ISSUED", label: "With Issuances" },
            { id: "PROGRAM", label: "Program Transferred" },
            { id: "EXPIRED", label: "Expired" },
          ].map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => {
                setStatusFilter(pill.id);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer border ${
                statusFilter === pill.id
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                  : "bg-white text-[#42474e] border-[#d8dadc] hover:border-slate-400 hover:text-[#0d1117]"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Program Active Filter Banner */}
      {selectedProgramFilter && (
        <div className="px-4 py-2 bg-purple-50 border-b border-purple-200 flex items-center justify-between text-xs text-purple-900">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-purple-700" />
            <span>
              Showing only medicines transferred to: <strong>{selectedProgramFilter}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={onClearProgramFilter}
            className="flex items-center gap-1 text-[11px] font-semibold text-purple-700 hover:text-purple-950 underline cursor-pointer"
          >
            <span>Clear filter</span>
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Main High-Density Table */}
      <div className="overflow-x-auto relative flex-1">
        <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
          {/* Section Group Headers (Row 5 of template) */}
          <thead className="bg-[#f0f4f8] text-[#0d1117] border-b border-[#d8dadc] text-[11px] font-bold uppercase tracking-wider sticky top-0 z-20">
            <tr>
              <th colSpan={6} className="px-3 py-2 border-r border-[#d8dadc] bg-slate-100">
                Medicine Identification
              </th>
              <th colSpan={3} className="px-3 py-1.5 text-center border-r border-[#d8dadc] bg-slate-200/70">
                <div>Beginning Balance</div>
                <div className="text-[10px] font-semibold text-slate-600 tracking-normal">{begDateLabel}</div>
              </th>
              <th colSpan={3} className="px-3 py-2 text-center border-r border-[#d8dadc] bg-blue-100/70 text-blue-900">
                Additional Stocks
              </th>
              <th colSpan={3} className="px-3 py-2 text-center border-r border-[#d8dadc] bg-slate-100">
                Summation (Gross)
              </th>
              <th colSpan={3} className="px-3 py-2 text-center border-r border-[#d8dadc] bg-emerald-100/70 text-emerald-900">
                Less: Issuances
              </th>
              <th colSpan={4} className="px-3 py-2 text-center border-r border-[#d8dadc] bg-purple-100/70 text-purple-900">
                Transferred to Other Programs
              </th>
              <th colSpan={3} className="px-3 py-2 text-center border-r border-[#d8dadc] bg-red-100/70 text-red-900">
                Expired
              </th>
              <th colSpan={3} className="px-3 py-1.5 text-center bg-emerald-200/80 text-emerald-950">
                <div>Remaining Balance</div>
                <div className="text-[10px] font-semibold text-emerald-900 tracking-normal">{remDateLabel}</div>
              </th>
            </tr>

            {/* Column Sub-Headers (Row 6 of template) */}
            <tr className="bg-[#f8f9ff] text-[#42474e] border-b border-[#d8dadc] text-[10.5px]">
              {/* Identification */}
              <th className="px-2.5 py-1.5 w-12 text-center border-r border-[#d8dadc]">ITEM NO</th>
              <th className="px-3 py-1.5 min-w-[220px] border-r border-[#d8dadc]">ITEM DESCRIPTION</th>
              <th className="px-2.5 py-1.5 text-center border-r border-[#d8dadc]">UNIT</th>
              <th className="px-2.5 py-1.5 border-r border-[#d8dadc]">BRAND</th>
              <th className="px-2.5 py-1.5 border-r border-[#d8dadc]">LOT NO</th>
              <th className="px-2.5 py-1.5 border-r border-[#d8dadc]">EXPIRY DATE</th>

              {/* Beginning */}
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc]">QUANTITY</th>
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc]">UNIT COST</th>
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc]">TOTAL COST</th>

              {/* Additions */}
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc] text-blue-900">QUANTITY</th>
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc] text-blue-900">UNIT COST</th>
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc] text-blue-900">TOTAL COST</th>

              {/* Summation */}
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc]">QUANTITY</th>
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc]">UNIT COST</th>
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc]">TOTAL COST</th>

              {/* Issuances */}
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc] text-emerald-900">QUANTITY</th>
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc] text-emerald-900">UNIT COST</th>
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc] text-emerald-900">TOTAL COST</th>

              {/* Area / Program */}
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc] text-purple-900">QUANTITY</th>
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc] text-purple-900">UNIT COST</th>
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc] text-purple-900">TOTAL COST</th>
              <th className="px-3 py-1.5 border-r border-[#d8dadc] text-purple-900">AREA / PROGRAM</th>

              {/* Expired */}
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc] text-red-900">QUANTITY</th>
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc] text-red-900">UNIT COST</th>
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc] text-red-900">TOTAL COST</th>

              {/* Remaining */}
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc] text-emerald-950 font-bold">QUANTITY</th>
              <th className="px-2.5 py-1.5 text-right border-r border-[#d8dadc] text-emerald-950">UNIT COST</th>
              <th className="px-2.5 py-1.5 text-right text-emerald-950 font-bold">TOTAL COST</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-[#d8dadc]/60">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={28} className="py-12 text-center text-[#42474e]">
                  <AlertCircle className="h-6 w-6 mx-auto text-slate-300 mb-1.5" />
                  <span className="font-semibold text-xs text-[#0d1117]">No inventory records found.</span>
                  <p className="text-[11px] text-[#42474e] mt-0.5">
                    Try adjusting your search terms or clearing active filters.
                  </p>
                </td>
              </tr>
            ) : (
              paginatedGroups.map((group, groupIdx) => {
                return (
                  <Fragment key={`po-group-${group.poNumber || "default"}-${groupIdx}`}>
                    {/* Official Statutory PO Group Header Row (Row 5 in inventory-report.xlsx) */}
                    <tr className="bg-amber-50/70 border-y border-amber-200/80 font-semibold text-xs">
                      <td className="px-2.5 py-1 text-center font-mono text-[10.5px] text-amber-700/70 border-r border-amber-200/60">
                        §
                      </td>
                      <td
                        colSpan={27}
                        className="px-3 py-1 font-mono text-xs text-amber-950 font-bold"
                      >
                        {group.headerText || "PO NO."}
                      </td>
                    </tr>

                    {group.items.map((item, itemIdx) => {
                      const itemOffsetInPage = paginatedItems.indexOf(item);
                      const globalIdx =
                        (currentPage - 1) * pageSize +
                        (itemOffsetInPage >= 0 ? itemOffsetInPage : itemIdx) +
                        1;
                      const isEven = (globalIdx - 1) % 2 === 0;

                      return (
                        <tr
                          key={`${item.lotNo}-${item.index || globalIdx}`}
                          className={`hover:bg-[#f8f9ff] transition-colors ${
                            isEven ? "bg-white" : "bg-[#fcfdfd]"
                          }`}
                        >
                          {/* Identification (Rows C through H: 6 columns) */}
                          <td className="px-2.5 py-1.5 text-center font-mono text-[11px] text-[#42474e] border-r border-[#d8dadc]/60">
                            {globalIdx}
                          </td>
                          <td className="px-3 py-1.5 font-semibold text-[#0d1117] border-r border-[#d8dadc]/60">
                            {item.itemDescription}
                          </td>
                          <td className="px-2.5 py-1.5 text-center text-[11px] text-[#42474e] border-r border-[#d8dadc]/60">
                            {item.unitOfMeasure}
                          </td>
                          <td className="px-2.5 py-1.5 text-[#42474e] border-r border-[#d8dadc]/60">
                            {item.brandName || "-"}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono text-[11px] text-[#0d1117] border-r border-[#d8dadc]/60">
                            {item.lotNo}
                          </td>
                          <td className="px-2.5 py-1.5 text-[11px] text-[#42474e] border-r border-[#d8dadc]/60">
                            {item.expiryDate}
                          </td>

                          {/* Beginning */}
                          <td className="px-2.5 py-1.5 text-right font-medium border-r border-[#d8dadc]/60">
                            {item.beginningQty.toLocaleString()}
                          </td>
                          <td className="px-2.5 py-1.5 text-right text-[#42474e] border-r border-[#d8dadc]/60">
                            {formatPeso(item.unitCost)}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-semibold text-[#0d1117] border-r border-[#d8dadc]/60">
                            {formatPeso(item.begTotal)}
                          </td>

                          {/* Additions */}
                          <td className="px-2.5 py-1.5 text-right text-blue-800 border-r border-[#d8dadc]/60">
                            {item.additionalQty > 0 ? item.additionalQty.toLocaleString() : "-"}
                          </td>
                          <td className="px-2.5 py-1.5 text-right text-[#42474e] border-r border-[#d8dadc]/60">
                            {item.additionalQty > 0 ? formatPeso(item.unitCost) : "-"}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-semibold text-blue-900 border-r border-[#d8dadc]/60">
                            {item.addTotal > 0 ? formatPeso(item.addTotal) : "-"}
                          </td>

                          {/* Summation */}
                          <td className="px-2.5 py-1.5 text-right font-semibold border-r border-[#d8dadc]/60">
                            {item.grossQty.toLocaleString()}
                          </td>
                          <td className="px-2.5 py-1.5 text-right text-[#42474e] border-r border-[#d8dadc]/60">
                            {item.grossQty > 0 ? formatPeso(item.unitCost) : "-"}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-bold text-[#0d1117] border-r border-[#d8dadc]/60">
                            {formatPeso(item.grossTotal)}
                          </td>

                          {/* Issuances */}
                          <td className="px-2.5 py-1.5 text-right text-emerald-800 border-r border-[#d8dadc]/60">
                            {item.issuedQty > 0 ? item.issuedQty.toLocaleString() : "-"}
                          </td>
                          <td className="px-2.5 py-1.5 text-right text-[#42474e] border-r border-[#d8dadc]/60">
                            {item.issuedQty > 0 ? formatPeso(item.unitCost) : "-"}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-semibold text-emerald-900 border-r border-[#d8dadc]/60">
                            {item.issuedTotal > 0 ? formatPeso(item.issuedTotal) : "-"}
                          </td>

                          {/* Transferred to Other Programs */}
                          <td className="px-2.5 py-1.5 text-right text-purple-800 border-r border-[#d8dadc]/60">
                            {item.programQty > 0 ? item.programQty.toLocaleString() : "-"}
                          </td>
                          <td className="px-2.5 py-1.5 text-right text-[#42474e] border-r border-[#d8dadc]/60">
                            {item.programQty > 0 ? formatPeso(item.unitCost) : "-"}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-semibold text-purple-900 border-r border-[#d8dadc]/60">
                            {item.programTotal > 0 ? formatPeso(item.programTotal) : "-"}
                          </td>
                          <td className="px-3 py-1.5 border-r border-[#d8dadc]/60">
                            {item.programName ? (
                              <span className="font-semibold text-purple-900 text-xs">
                                {item.programName}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          {/* Expired */}
                          <td className="px-2.5 py-1.5 text-right text-red-700 border-r border-[#d8dadc]/60">
                            {item.expiredQty > 0 ? item.expiredQty.toLocaleString() : "-"}
                          </td>
                          <td className="px-2.5 py-1.5 text-right text-[#42474e] border-r border-[#d8dadc]/60">
                            {item.expiredQty > 0 ? formatPeso(item.unitCost) : "-"}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-semibold text-red-800 border-r border-[#d8dadc]/60">
                            {item.expiredTotal > 0 ? formatPeso(item.expiredTotal) : "-"}
                          </td>

                          {/* Remaining */}
                          <td className="px-2.5 py-1.5 text-right font-bold text-emerald-950 border-r border-[#d8dadc]/60">
                            {item.remainingQty.toLocaleString()}
                          </td>
                          <td className="px-2.5 py-1.5 text-right text-[#42474e] border-r border-[#d8dadc]/60">
                            {formatPeso(item.unitCost)}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-bold text-emerald-950">
                            {formatPeso(item.remainingTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })
            )}
          </tbody>

          {/* Sticky Total Footer (Row N+1 of template) */}
          <tfoot className="bg-[#EBF3F5] font-bold border-t-2 border-[#1F4E5A] text-[#1B2B30] text-xs sticky bottom-0 z-20">
            <tr>
              <td colSpan={6} className="px-3 py-2 text-center uppercase tracking-wider border-r border-[#CFDDE0] text-[#1F4E5A] font-bold">
                TOTAL
              </td>
              <td className="px-2.5 py-2 text-right border-r border-[#CFDDE0]">-</td>
              <td className="px-2.5 py-2 text-right border-r border-[#CFDDE0]">-</td>
              <td className="px-2.5 py-2 text-right text-[#1F4E5A] border-r border-[#CFDDE0]">
                {formatPeso(filteredTotals.begVal)}
              </td>

              <td className="px-2.5 py-2 text-right border-r border-[#d8dadc]">-</td>
              <td className="px-2.5 py-2 text-right border-r border-[#d8dadc]">-</td>
              <td className="px-2.5 py-2 text-right text-blue-950 border-r border-[#d8dadc]">
                {formatPeso(filteredTotals.addVal)}
              </td>

              <td className="px-2.5 py-2 text-right border-r border-[#d8dadc]">-</td>
              <td className="px-2.5 py-2 text-right border-r border-[#d8dadc]">-</td>
              <td className="px-2.5 py-2 text-right text-slate-900 border-r border-[#d8dadc]">
                {formatPeso(filteredTotals.grossVal)}
              </td>

              <td className="px-2.5 py-2 text-right border-r border-[#d8dadc]">-</td>
              <td className="px-2.5 py-2 text-right border-r border-[#d8dadc]">-</td>
              <td className="px-2.5 py-2 text-right text-emerald-950 border-r border-[#d8dadc]">
                {formatPeso(filteredTotals.issuedVal)}
              </td>

              <td className="px-2.5 py-2 text-right border-r border-[#d8dadc]">-</td>
              <td className="px-2.5 py-2 text-right border-r border-[#d8dadc]">-</td>
              <td className="px-2.5 py-2 text-right text-purple-950 border-r border-[#d8dadc]">
                {formatPeso(filteredTotals.progVal)}
              </td>
              <td className="px-2.5 py-2 text-center border-r border-[#d8dadc]">-</td>

              <td className="px-2.5 py-2 text-right border-r border-[#d8dadc]">-</td>
              <td className="px-2.5 py-2 text-right border-r border-[#d8dadc]">-</td>
              <td className="px-2.5 py-2 text-right text-red-950 border-r border-[#d8dadc]">
                {formatPeso(filteredTotals.expiredVal)}
              </td>

              <td className="px-2.5 py-2 text-right border-r border-[#d8dadc] text-emerald-950">-</td>
              <td className="px-2.5 py-2 text-right border-r border-[#d8dadc]">-</td>
              <td className="px-2.5 py-2 text-right text-emerald-950 text-sm font-extrabold">
                {formatPeso(filteredTotals.remVal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-3 border-t border-[#d8dadc] flex items-center justify-between bg-white text-xs text-[#42474e]">
        <span>
          Showing{" "}
          <strong className="text-[#0d1117]">
            {filteredItems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
          </strong>{" "}
          to{" "}
          <strong className="text-[#0d1117]">
            {Math.min(currentPage * pageSize, filteredItems.length)}
          </strong>{" "}
          of <strong className="text-[#0d1117]">{filteredItems.length}</strong> items
        </span>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="p-1 border border-[#d8dadc] rounded-md hover:bg-[#f8f9ff] disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 text-xs font-semibold text-[#0d1117]">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="p-1 border border-[#d8dadc] rounded-md hover:bg-[#f8f9ff] disabled:opacity-40 cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
