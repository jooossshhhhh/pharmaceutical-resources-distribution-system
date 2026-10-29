import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  History,
  RefreshCw,
  Search,
  User,
  X,
  Building2,
  AlertTriangle,
} from "lucide-react";

import PaginationControls from "../../components/PaginationControls";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
import { getDispensingHistory } from "@backend/services/dispensingService";
import {
  formatDispensingDateTime,
  formatTransactionNumber,
  groupHistoryByTransaction,
  matchesHistoryFilters,
  sortTransactions,
} from "@shared/utils/dispensingUtils";
import { formatPatientName } from "@shared/utils/patientUtils";
import { downloadExportFile } from "@frontend/services/downloadManager";
import { exportMonthlyDispensingExcel } from "@shared/utils/dispensingExportUtils";
import DispensingTransactionModal from "./DispensingTransactionModal";

export default function DispensingHistoryView({
  facilities = [],
  facilityId = null,
  isCho = false,
}) {
  const [historyRows, setHistoryRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("ALL"); // ALL | TODAY | THIS_WEEK | THIS_MONTH
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [selectedFacilityId, setSelectedFacilityId] = useState(isCho ? "ALL" : facilityId || "ALL");
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [sortOrder, setSortOrder] = useState("newest"); // newest | oldest

  // Load Dispensing History
  const loadHistory = async () => {
    setIsLoading(true);
    setError("");
    try {
      const targetFacilityId = selectedFacilityId === "ALL" ? (isCho ? null : facilityId) : selectedFacilityId;
      const data = await getDispensingHistory({ facilityId: targetFacilityId });
      setHistoryRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("Failed to load dispensing history:", err);
      setError("Unable to load dispensing history. Check your connection or offline cache.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [facilityId, selectedFacilityId]);

  // Group raw rows into transaction objects
  const allTransactions = useMemo(() => {
    return sortTransactions(groupHistoryByTransaction(historyRows), sortOrder);
  }, [historyRows, sortOrder]);

  // Calculate Metrics from all transactions
  const metrics = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const uniquePatientIds = new Set();
    let totalUnits = 0;
    let todayCount = 0;

    allTransactions.forEach((tx) => {
      if (tx.patient?.id || tx.patient_id) {
        uniquePatientIds.add(tx.patient?.id || tx.patient_id);
      }
      totalUnits += Number(tx.totalQuantity || 0);

      const txDateStr = (tx.dispenseDate || "").slice(0, 10);
      if (txDateStr === todayStr) {
        todayCount += 1;
      }
    });

    return {
      totalTransactions: allTransactions.length,
      totalUnits,
      uniquePatients: uniquePatientIds.size,
      todayCount,
    };
  }, [allTransactions]);

  // Filter transactions based on search, status, and date range
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

    const startOfMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    return allTransactions.filter((tx) => {
      // 1. Status and Keyword filter
      if (!matchesHistoryFilters({ keyword: searchKeyword, status: statusFilter, transaction: tx })) {
        return false;
      }

      // 2. Date Filter
      const txDateStr = (tx.dispenseDate || "").slice(0, 10);
      if (dateFilter === "TODAY" && txDateStr !== todayStr) {
        return false;
      }
      if (dateFilter === "THIS_WEEK" && txDateStr < sevenDaysAgoStr) {
        return false;
      }
      if (dateFilter === "THIS_MONTH" && txDateStr < startOfMonthStr) {
        return false;
      }
      if (dateFilter === "CUSTOM") {
        if (customStartDate && txDateStr < customStartDate) return false;
        if (customEndDate && txDateStr > customEndDate) return false;
      }

      return true;
    });
  }, [allTransactions, searchKeyword, statusFilter, dateFilter, customStartDate, customEndDate]);

  // Pagination with 10 rows per page
  const {
    currentPage,
    paginatedRows: paginatedTransactions,
    setCurrentPage,
    totalCount,
    totalPages,
  } = usePaginatedRows(filteredTransactions, 10);

  const [isExporting, setIsExporting] = useState(false);

  // Export current filtered list as official Monthly Excel Record
  const handleExportExcel = async () => {
    if (filteredTransactions.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const now = new Date();
      let exportYear = now.getFullYear();
      let exportMonth = now.getMonth() + 1;

      if (customStartDate) {
        const parsed = new Date(customStartDate);
        if (!isNaN(parsed.getTime())) {
          exportYear = parsed.getFullYear();
          exportMonth = parsed.getMonth() + 1;
        }
      }

      const activeFacility = Array.isArray(facilities)
        ? facilities.find((f) => f && String(f.id) === String(selectedFacilityId))
        : null;
      const facilityTitle = activeFacility?.facility_name || (isCho ? "VICENTE MENDIOLA CENTER FOR HEALTH" : "VMCH Pharmacy");

      await exportMonthlyDispensingExcel({
        transactions: filteredTransactions,
        year: exportYear,
        month: exportMonth,
        facilityName: facilityTitle,
        dateFilter,
        startDate: customStartDate,
        endDate: customEndDate,
      });
    } catch (err) {
      console.error("Failed to export dispensing history Excel:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const clearFilters = () => {
    setSearchKeyword("");
    setStatusFilter("ALL");
    setDateFilter("ALL");
    setCustomStartDate("");
    setCustomEndDate("");
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <article className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-4 shadow-xs">
          <p className="text-2xl font-black tracking-tight text-[#1B2B30]">
            {metrics.totalTransactions.toLocaleString()}
          </p>
          <p className="text-xs font-black uppercase tracking-wider text-[#5B7077]">
            Total Transactions
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-[#5B7077]/80 truncate">
            All recorded medicine releases
          </p>
        </article>

        <article className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-4 shadow-xs">
          <p className="text-2xl font-black tracking-tight text-[#4C9F80]">
            {metrics.totalUnits.toLocaleString()}
          </p>
          <p className="text-xs font-black uppercase tracking-wider text-[#5B7077]">
            Units Dispensed
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-[#5B7077]/80 truncate">
            Tablets, vials, and bottles given
          </p>
        </article>

        <article className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-4 shadow-xs">
          <p className="text-2xl font-black tracking-tight text-[#34769B]">
            {metrics.uniquePatients.toLocaleString()}
          </p>
          <p className="text-xs font-black uppercase tracking-wider text-[#5B7077]">
            Patients Served
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-[#5B7077]/80 truncate">
            Unique individuals received care
          </p>
        </article>

        <article className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-4 shadow-xs">
          <p className="text-2xl font-black tracking-tight text-[#1F4E5A]">
            {metrics.todayCount.toLocaleString()}
          </p>
          <p className="text-xs font-black uppercase tracking-wider text-[#5B7077]">
            Dispensed Today
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-[#5B7077]/80 truncate">
            Transactions released today
          </p>
        </article>
      </div>

      {/* Main Ledger Card */}
      <section className="rounded-xl border border-[#CFDDE0] bg-white shadow-sm overflow-hidden">
        {/* Controls Bar */}
        <div className="border-b border-[#CFDDE0] bg-[#F9FBFB] p-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-xl">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5B7077]">
                <Search className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => {
                  setSearchKeyword(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search patient code, name, dispensing ID (TX-...), medicine..."
                className="w-full h-10 rounded-xl border border-[#CFDDE0] bg-white pl-9.5 pr-8 text-xs font-medium text-[#1B2B30] outline-none placeholder:text-[#5B7077]/70 focus:border-[#34769B] focus:ring-2 focus:ring-[#34769B]/15 transition"
              />
              {searchKeyword && (
                <button
                  type="button"
                  onClick={() => setSearchKeyword("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5B7077] hover:text-[#1B2B30] cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadHistory}
                disabled={isLoading}
                className="btn-secondary h-10 inline-flex items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition cursor-pointer"
                title="Refresh history"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                disabled={filteredTransactions.length === 0 || isExporting}
                className="btn-secondary h-10 inline-flex items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Export monthly dispensing history in official Excel format (.xlsx)"
              >
                <Download className={`h-3.5 w-3.5 ${isExporting ? "animate-spin" : ""}`} />
                <span>{isExporting ? "Exporting..." : "Export Excel"}</span>
              </button>
            </div>
          </div>

          {/* Filter Pills / Selectors */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#CFDDE0]/50 text-xs">
            {/* Status Filter */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-[#5B7077] mr-1">Status:</span>
              {["ALL", "COMPLETED", "PARTIAL", "REFERRED", "VOIDED"].map((status) => {
                const isActive = statusFilter === status;
                const labels = {
                  ALL: "All",
                  COMPLETED: "Completed",
                  PARTIAL: "Partial",
                  REFERRED: "Referred",
                  VOIDED: "Voided",
                };

                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      setStatusFilter(status);
                      setCurrentPage(1);
                    }}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      isActive
                        ? "bg-[#34769B] text-white shadow-xs"
                        : "bg-white border border-[#CFDDE0] text-[#5B7077] hover:bg-[#E5EFF1] hover:text-[#1B2B30]"
                    }`}
                  >
                    {labels[status]}
                  </button>
                );
              })}
            </div>

            {/* Date Filter Dropdown */}
            <div className="flex items-center gap-1 ml-auto">
              <Calendar className="h-3.5 w-3.5 text-[#5B7077]" />
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-8 rounded-lg border border-[#CFDDE0] bg-white px-2 text-xs font-bold text-[#1B2B30] outline-none focus:border-[#34769B] cursor-pointer"
              >
                <option value="ALL">All Time</option>
                <option value="TODAY">Today</option>
                <option value="THIS_WEEK">Past 7 Days</option>
                <option value="THIS_MONTH">This Month</option>
                <option value="CUSTOM">Custom Range</option>
              </select>

              {/* Facility Filter (if CHO has facilities) */}
              {isCho && facilities.length > 0 && (
                <div className="flex items-center gap-1 ml-2">
                  <Building2 className="h-3.5 w-3.5 text-[#5B7077]" />
                  <select
                    value={selectedFacilityId}
                    onChange={(e) => {
                      setSelectedFacilityId(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="h-8 max-w-[170px] truncate rounded-lg border border-[#CFDDE0] bg-white px-2 text-xs font-bold text-[#1B2B30] outline-none focus:border-[#34769B] cursor-pointer"
                  >
                    <option value="ALL">All Facilities</option>
                    {facilities.map((fac) => (
                      <option key={fac.id} value={fac.id}>
                        {fac.facility_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Custom Date Pickers (if dateFilter === "CUSTOM") */}
          {dateFilter === "CUSTOM" && (
            <div className="flex items-center gap-3 pt-2 text-xs">
              <span className="font-bold text-[#5B7077]">From:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => {
                  setCustomStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-8 rounded-lg border border-[#CFDDE0] bg-white px-2 text-xs font-semibold text-[#1B2B30] outline-none"
              />
              <span className="font-bold text-[#5B7077]">To:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => {
                  setCustomEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-8 rounded-lg border border-[#CFDDE0] bg-white px-2 text-xs font-semibold text-[#1B2B30] outline-none"
              />
            </div>
          )}
        </div>

        {/* Error Notice */}
        {error && (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="p-12 text-center text-xs font-bold text-[#5B7077]">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto text-[#34769B] mb-2" />
            Loading dispensing history ledger...
          </div>
        ) : filteredTransactions.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E5EFF1] text-[#5B7077] mx-auto">
              <History className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1B2B30]">
                No dispensing transactions found
              </h3>
              <p className="mt-1 text-xs text-[#5B7077]">
                {searchKeyword || statusFilter !== "ALL" || dateFilter !== "ALL"
                  ? "Try adjusting your search terms or filters."
                  : "No medicines have been dispensed from this facility yet."}
              </p>
            </div>
            {(searchKeyword || statusFilter !== "ALL" || dateFilter !== "ALL") && (
              <button
                type="button"
                onClick={clearFilters}
                className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          /* Table of Transactions */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="border-b border-[#CFDDE0] bg-[#F9FBFB] text-[11px] font-bold text-[#5B7077] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Dispensing ID</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Medicines Released</th>
                  <th className="px-4 py-3">Dispenser</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#CFDDE0]/50">
                {paginatedTransactions.map((tx) => {
                  const patient = tx.patient;
                  const patientName = patient ? formatPatientName(patient) : "Unassigned Patient";
                  const healthCenterCode = patient?.facility?.facility_code || patient?.facility?.facility_name || "";
                  const patientSubtitle = [patient?.gender, healthCenterCode].filter(Boolean).join(" · ");
                  const isVoided = Boolean(tx.voidedAt);
                  const firstRow = tx.rows?.[0] || {};
                  const dispenserName =
                    firstRow.manual_dispensed_by ||
                    (tx.dispenser ? `${tx.dispenser.first_name} ${tx.dispenser.last_name}` : "Staff");

                  return (
                    <tr
                      key={tx.key || tx.transactionId}
                      className="hover:bg-[#F9FBFB]/80 transition cursor-pointer"
                      onClick={() => setSelectedTransaction(tx)}
                      title="Click to view dispensing details"
                    >
                      {/* Dispensing ID */}
                      <td className="px-4 py-3.5">
                        <span className="font-mono font-bold text-xs text-[#1B2B30] bg-[#E5EFF1] px-2 py-0.5 rounded-md border border-[#CFDDE0]">
                          {formatTransactionNumber(tx.transactionId || tx.key)}
                        </span>
                      </td>

                      {/* Patient Details */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1F4E5A] text-xs font-black text-white shadow-2xs">
                            {patient?.first_name?.[0] || "P"}
                            {patient?.last_name?.[0] || "T"}
                          </div>
                          <div>
                            <p className="font-black text-[#1B2B30]">{patientName}</p>
                            <p className="text-[11px] font-semibold text-[#5B7077]">
                              {patientSubtitle || "—"}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Medicines List */}
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-[#1B2B30]">
                          {tx.rows.length} {tx.rows.length === 1 ? "medicine" : "medicines"} ({tx.totalQuantity} units)
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1 max-w-xs">
                          {tx.rows.slice(0, 2).map((row, idx) => {
                            const brand = (row.batch?.brand_name || row.medicine?.brand_name || row.brand_name || "").trim();
                            const generic = row.medicine?.generic_name || "Medicine";
                            const label = brand && brand !== "—" && !generic.toLowerCase().includes(brand.toLowerCase())
                              ? `${generic} (${brand})`
                              : generic;
                            return (
                              <span
                                key={row.id || idx}
                                className="inline-block rounded px-2 py-0.5 text-[10.5px] font-bold truncate max-w-[150px] bg-[#E3EEF5] text-[#1F4A66] border border-[#34769B]/20"
                                title={`${label} (${row.quantity})`}
                              >
                                {label} ({row.quantity})
                              </span>
                            );
                          })}
                          {tx.rows.length > 2 && (
                            <span className="inline-block rounded bg-[#E5EFF1] px-1.5 py-0.5 text-[10px] font-bold text-[#5B7077]">
                              +{tx.rows.length - 2} more
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Dispenser */}
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-[#1B2B30] text-xs">
                          {dispenserName}
                        </p>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        {isVoided ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#FBE9E3] border border-[#D9826B]/30 px-2.5 py-0.5 text-[10.5px] font-black text-[#8F3F2B]">
                            <AlertTriangle className="h-3 w-3" /> Voided
                          </span>
                        ) : tx.status === "COMPLETED" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#E2F3EC] border border-[#4C9F80]/30 px-2.5 py-0.5 text-[10.5px] font-black text-[#226048]">
                            <CheckCircle2 className="h-3 w-3" /> Completed
                          </span>
                        ) : tx.status === "PARTIAL" || tx.status === "SCHEDULED" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] border border-[#F59E0B]/30 px-2.5 py-0.5 text-[10.5px] font-black text-[#92400E]">
                            <Clock className="h-3 w-3" /> Partial
                          </span>
                        ) : tx.status === "REFERRED" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#E3EEF5] border border-[#34769B]/30 px-2.5 py-0.5 text-[10.5px] font-black text-[#1F4A66]">
                            Referred
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] border border-[#F59E0B]/30 px-2.5 py-0.5 text-[10.5px] font-black text-[#92400E]">
                            <Clock className="h-3 w-3" /> Partial
                          </span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3.5">
                        <p className="text-xs font-semibold text-[#1B2B30] flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-[#5B7077]/70" />
                          {formatDispensingDateTime(tx.dispenseDate)}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {filteredTransactions.length > 0 && (
          <PaginationControls
            currentPage={currentPage}
            itemLabel="transactions"
            onPageChange={setCurrentPage}
            pageSize={10}
            totalCount={totalCount}
            totalPages={totalPages}
          />
        )}
      </section>

      {/* Details Modal */}
      <DispensingTransactionModal
        isOpen={Boolean(selectedTransaction)}
        onClose={() => setSelectedTransaction(null)}
        transaction={selectedTransaction}
        onVoidSuccess={() => {
          setSelectedTransaction(null);
          loadHistory();
        }}
      />
    </div>
  );
}
