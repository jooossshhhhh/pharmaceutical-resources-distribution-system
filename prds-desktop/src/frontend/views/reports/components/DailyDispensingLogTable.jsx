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
  const [channelFilter, setChannelFilter] = useState("ALL"); // ALL, walk_in, requests
  const [currentPage, setCurrentPage] = useState(1);

  // Filtered transactions
  const filtered = useMemo(() => {
    let result = transactions || [];

    if (channelFilter !== "ALL") {
      result = result.filter((item) => item.channelType === channelFilter);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter((item) => {
        return (
          item.medicineName?.toLowerCase().includes(q) ||
          item.brandName?.toLowerCase().includes(q) ||
          item.recipient?.toLowerCase().includes(q) ||
          item.recipientSub?.toLowerCase().includes(q) ||
          item.prescribedBy?.toLowerCase().includes(q) ||
          item.dispensedBy?.toLowerCase().includes(q)
        );
      });
    }

    return result;
  }, [transactions, channelFilter, searchTerm]);

  // Reset pagination on filter change
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const validPage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (validPage - 1) * ROWS_PER_PAGE;
    return filtered.slice(start, start + ROWS_PER_PAGE);
  }, [filtered, validPage]);

  // Channel counts
  const walkInCount = useMemo(
    () => (transactions || []).filter((t) => t.channelType === "walk_in").length,
    [transactions]
  );
  const requestsCount = useMemo(
    () => (transactions || []).filter((t) => t.channelType === "requests").length,
    [transactions]
  );

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
            Transaction log of all medicines released on {formattedDate}
          </p>
        </div>

        {/* Filter Pills + Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Channel Filters */}
          <div className="inline-flex rounded-lg border border-[#d8dadc] p-0.5 bg-[#f4f6f8] text-xs">
            <button
              type="button"
              onClick={() => {
                setChannelFilter("ALL");
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                channelFilter === "ALL"
                  ? "bg-white text-[#0d1117] shadow-xs"
                  : "text-[#5f6673] hover:text-[#0d1117]"
              }`}
            >
              All ({transactions.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setChannelFilter("walk_in");
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                channelFilter === "walk_in"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-[#5f6673] hover:text-[#0d1117]"
              }`}
            >
              Walk-in ({walkInCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setChannelFilter("requests");
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                channelFilter === "requests"
                  ? "bg-white text-emerald-700 shadow-xs"
                  : "text-[#5f6673] hover:text-[#0d1117]"
              }`}
            >
              Barangay Requests ({requestsCount})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[210px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8c929c]" />
            <input
              type="text"
              placeholder="Search medicine, patient, doctor..."
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
            <tr className="bg-[#f9fafb] text-[#5f6673] font-semibold border-b border-[#e5e7eb]">
              <th className="py-2.5 px-4 w-[110px]">Time</th>
              <th className="py-2.5 px-4 min-w-[170px]">Recipient / Beneficiary</th>
              <th className="py-2.5 px-4 w-[130px]">Channel</th>
              <th className="py-2.5 px-4 min-w-[200px]">Medicine Dispensed</th>
              <th className="py-2.5 px-4 w-[110px] text-right">Quantity</th>
              <th className="py-2.5 px-4 w-[110px] text-right">Price</th>
              <th className="py-2.5 px-4 min-w-[140px]">Prescriber</th>
              <th className="py-2.5 px-4 min-w-[130px]">Dispensed By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f3f5]">
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <FileText className="h-7 w-7 text-[#8c929c]" />
                    <span className="text-xs font-semibold text-[#0d1117]">
                      {searchTerm
                        ? "No transactions match your search"
                        : "No dispensing transactions recorded on this date"}
                    </span>
                    <p className="text-[11.5px] text-[#5f6673] max-w-[340px]">
                      {searchTerm
                        ? "Try clearing the search term or switching channel filters."
                        : `No medicines were released to walk-in patients or barangay health centers on ${formattedDate}.`}
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

                  {/* Recipient */}
                  <td className="py-2.5 px-4">
                    <div className="font-bold text-[#0d1117] text-[12px] leading-tight">
                      {tx.recipient}
                    </div>
                    {tx.recipientSub && (
                      <div className="text-[10.5px] text-[#5f6673] font-mono mt-0.5">
                        {tx.recipientSub}
                      </div>
                    )}
                  </td>

                  {/* Channel Badge */}
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    {tx.channelType === "walk_in" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        <UserCheck className="h-3 w-3" />
                        Walk-in
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Building2 className="h-3 w-3" />
                        Barangay
                      </span>
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

                  {/* Prescriber */}
                  <td className="py-2.5 px-4 text-[#5f6673] text-[11px] truncate max-w-[150px]">
                    {tx.prescribedBy}
                  </td>

                  {/* Dispensed By */}
                  <td className="py-2.5 px-4 text-[#5f6673] text-[11px] truncate max-w-[140px]">
                    {tx.dispensedBy}
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
