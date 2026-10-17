import { useState, useMemo } from "react";
import { formatPeso } from "@shared/utils/reportUtils";
import {
  Search,
  X,
  Clock,
  UserCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Pill,
} from "lucide-react";

const ROWS_PER_PAGE = 8;

export default function DailyDispensingLogTable({
  transactions = [],
  formattedDate = "Today",
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedChannel, setSelectedChannel] = useState(null); // 'walk_in' or 'requests'
  const [currentPage, setCurrentPage] = useState(1);

  // Channel counts
  const walkInCount = useMemo(
    () => (transactions || []).filter((t) => t.channelType === "walk_in").length,
    [transactions]
  );
  const requestsCount = useMemo(
    () => (transactions || []).filter((t) => t.channelType === "requests").length,
    [transactions]
  );

  // Active channel: user selection, or fallback to the channel with records, default 'walk_in'
  const activeChannel = useMemo(() => {
    if (selectedChannel === "walk_in" || selectedChannel === "requests") {
      return selectedChannel;
    }
    if (walkInCount === 0 && requestsCount > 0) {
      return "requests";
    }
    return "walk_in";
  }, [selectedChannel, walkInCount, requestsCount]);

  // Filtered transactions for active channel & search
  const filtered = useMemo(() => {
    let result = (transactions || []).filter((item) => item.channelType === activeChannel);

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter((item) => {
        return (
          item.medicineName?.toLowerCase().includes(q) ||
          item.brandName?.toLowerCase().includes(q) ||
          item.recipient?.toLowerCase().includes(q) ||
          item.recipientSub?.toLowerCase().includes(q) ||
          (activeChannel === "walk_in"
            ? item.prescribedBy?.toLowerCase().includes(q) ||
              item.dispensedBy?.toLowerCase().includes(q)
            : (item.requestedBy || item.prescribedBy)?.toLowerCase().includes(q) ||
              (item.releasedBy || item.dispensedBy)?.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [transactions, activeChannel, searchTerm]);

  // Reset pagination on filter change
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const validPage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (validPage - 1) * ROWS_PER_PAGE;
    return filtered.slice(start, start + ROWS_PER_PAGE);
  }, [filtered, validPage]);

  const searchPlaceholder =
    activeChannel === "walk_in"
      ? "Search medicine, patient, prescriber..."
      : "Search medicine, barangay, requester...";

  return (
    <div className="bg-white border border-[#d8dadc] rounded-xl shadow-xs overflow-hidden transition-all">
      {/* Table Header Bar */}
      <div className="p-4 sm:p-5 border-b border-[#e5e7eb] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[#0d1117]">
              Today's Dispensing & Issuance Log
            </h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#f4f6f8] text-[#5f6673] border border-[#d8dadc]">
              {transactions.length} Total Records
            </span>
          </div>
          <p className="text-xs text-[#5f6673] mt-0.5">
            {activeChannel === "walk_in"
              ? `Walk-in patient dispensing records on ${formattedDate}`
              : `Barangay health station requisitions issued on ${formattedDate}`}
          </p>
        </div>

        {/* Filter Pills + Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Channel Filters (No "All" tab) */}
          <div className="inline-flex rounded-lg border border-[#d8dadc] p-0.5 bg-[#f4f6f8] text-xs">
            <button
              type="button"
              onClick={() => {
                setSelectedChannel("walk_in");
                setCurrentPage(1);
              }}
              className={`px-3 py-1 rounded-md font-semibold transition-all inline-flex items-center gap-1.5 ${
                activeChannel === "walk_in"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-[#5f6673] hover:text-[#0d1117]"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>Walk-in</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeChannel === "walk_in"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-[#e5e7eb] text-[#5f6673]"
                }`}
              >
                {walkInCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedChannel("requests");
                setCurrentPage(1);
              }}
              className={`px-3 py-1 rounded-md font-semibold transition-all inline-flex items-center gap-1.5 ${
                activeChannel === "requests"
                  ? "bg-white text-emerald-700 shadow-xs"
                  : "text-[#5f6673] hover:text-[#0d1117]"
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Barangay Requests</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeChannel === "requests"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-[#e5e7eb] text-[#5f6673]"
                }`}
              >
                {requestsCount}
              </span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8c929c]" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-[#d8dadc] rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8c929c] hover:text-[#0d1117]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200/80 bg-white text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="py-2.5 px-4 w-[110px]">Time</th>
              <th className="py-2.5 px-4 min-w-[190px]">
                {activeChannel === "walk_in" ? "Patient / Beneficiary" : "Barangay Station"}
              </th>
              <th className="py-2.5 px-4 min-w-[220px]">
                {activeChannel === "walk_in" ? "Medicine Dispensed" : "Medicine Issued"}
              </th>
              <th className="py-2.5 px-4 w-[110px] text-right">Quantity</th>
              <th className="py-2.5 px-4 w-[120px] text-right">
                {activeChannel === "walk_in" ? "Price" : "Total Value"}
              </th>
              <th className="py-2.5 px-4 min-w-[140px]">
                {activeChannel === "walk_in" ? "Prescriber" : "Requested By"}
              </th>
              <th className="py-2.5 px-4 min-w-[130px]">
                {activeChannel === "walk_in" ? "Dispensed By" : "Released By"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f3f5]">
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <FileText className="h-7 w-7 text-[#8c929c]" />
                    <span className="text-xs font-semibold text-[#0d1117]">
                      {searchTerm
                        ? "No transactions match your search"
                        : activeChannel === "walk_in"
                        ? "No walk-in dispensing recorded on this date"
                        : "No barangay supply requisitions issued on this date"}
                    </span>
                    <p className="text-[11.5px] text-[#5f6673] max-w-[360px]">
                      {searchTerm
                        ? "Try clearing the search term or switching channel tabs."
                        : activeChannel === "walk_in"
                        ? `No medicines were dispensed to walk-in patients on ${formattedDate}.`
                        : `No medicine requisitions were approved or released to barangay health stations on ${formattedDate}.`}
                    </p>
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm("")}
                        className="mt-1 px-3 py-1 text-xs font-semibold rounded-md bg-[#f4f6f8] text-[#0d1117] hover:bg-[#e5e7eb] border border-[#d8dadc]"
                      >
                        Clear Search
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedRows.map((tx) => (
                <tr
                  key={tx.id}
                  className="hover:bg-[#fcfdfd] transition-colors"
                >
                  {/* Time */}
                  <td className="py-2.5 px-4 font-mono text-[11px] text-[#5f6673] whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3 text-[#8c929c]" />
                      {tx.timeFormatted}
                    </span>
                  </td>

                  {/* Recipient / Barangay Station */}
                  <td className="py-2.5 px-4">
                    <div className="font-bold text-[#0d1117] text-[12px] leading-tight flex items-center gap-1.5">
                      {activeChannel === "walk_in" ? (
                        <UserCheck className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      ) : (
                        <Building2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      )}
                      <span>{tx.recipient}</span>
                    </div>
                    {tx.recipientSub && (
                      <div className="text-[10.5px] text-[#5f6673] font-mono mt-0.5 ml-5">
                        {tx.recipientSub}
                      </div>
                    )}
                  </td>

                  {/* Medicine */}
                  <td className="py-2.5 px-4">
                    <div className="font-semibold text-[#0d1117] flex items-center gap-1.5">
                      <Pill className="h-3 w-3 text-emerald-600 shrink-0" />
                      <span>{tx.medicineName}</span>
                    </div>
                    {tx.brandName && tx.brandName !== "-" && (
                      <div className="text-[10.5px] text-[#5f6673] ml-4.5">
                        Brand: {tx.brandName}
                      </div>
                    )}
                  </td>

                  {/* Quantity */}
                  <td className="py-2.5 px-4 text-right">
                    <span className="font-black text-[#0d1117] text-[12.5px]">
                      {tx.quantity?.toLocaleString()}
                    </span>
                    <span className="text-[10.5px] text-[#5f6673] ml-1">
                      {tx.unit}
                    </span>
                  </td>

                  {/* Valuation */}
                  <td className="py-2.5 px-4 text-right font-medium text-[#0d1117]">
                    {formatPeso(tx.totalCost)}
                  </td>

                  {/* Prescriber (Walk-in) / Requested By (Requests) */}
                  <td className="py-2.5 px-4 text-[#5f6673] text-[11px] truncate max-w-[150px]">
                    {activeChannel === "walk_in"
                      ? tx.prescribedBy
                      : (tx.requestedBy || tx.prescribedBy || "Requisition Slip")}
                  </td>

                  {/* Dispensed By (Walk-in) / Released By (Requests) */}
                  <td className="py-2.5 px-4 text-[#5f6673] text-[11px] truncate max-w-[140px]">
                    {activeChannel === "walk_in"
                      ? tx.dispensedBy
                      : (tx.releasedBy || tx.dispensedBy || "CHO Supply Center")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {filtered.length > ROWS_PER_PAGE && (
        <div className="p-3 border-t border-[#e5e7eb] flex items-center justify-between text-xs text-[#5f6673] bg-[#fcfdfd]">
          <div>
            Showing {(validPage - 1) * ROWS_PER_PAGE + 1} to{" "}
            {Math.min(validPage * ROWS_PER_PAGE, filtered.length)} of {filtered.length} records
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={validPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-md border border-[#d8dadc] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white text-[#0d1117]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 font-medium text-[#0d1117]">
              Page {validPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={validPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-md border border-[#d8dadc] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white text-[#0d1117]"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
