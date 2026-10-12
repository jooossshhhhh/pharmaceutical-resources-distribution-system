import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Download,
  Eye,
  Package,
  Pill,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import AdminShell from "../../components/layout/AdminShell";
import PaginationControls from "../../components/PaginationControls";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import { getSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import {
  calculateStockReturnKpis,
  fetchStockReturns,
  getReturnReasonLabel,
  getReturnReasonTone,
  getReturnStatusBadge,
  RETURN_REASON_OPTIONS,
  RETURN_STATUS_OPTIONS,
} from "@backend/services/stockReturnsService";
import { formatCurrency, formatDate, formatNumber } from "@shared/utils/inventoryUtils";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
import { MetricCard } from "../inventory/inventoryComponents";
import RecordStockReturnModal from "./components/RecordStockReturnModal";
import StockReturnDetailsModal from "./components/StockReturnDetailsModal";

const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export default function StockReturnsModule() {
  const { profile } = useAuth();
  const isBhw = profile?.role === "BHW";
  const [returnsList, setReturnsList] = useState(() => getSnapshot(STORAGE_KEYS.STOCK_RETURNS, []));
  const [facilities, setFacilities] = useState(() => getSnapshot(STORAGE_KEYS.FACILITIES, []));
  const [medicines, setMedicines] = useState(() => getSnapshot(STORAGE_KEYS.MEDICINES, []));
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [facilityFilter, setFacilityFilter] = useState(() => isBhw ? profile?.facility_id || "ALL" : "ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [reasonFilter, setReasonFilter] = useState("ALL");
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [selectedReturnRecord, setSelectedReturnRecord] = useState(null);
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchStockReturns({
        facilityId: isBhw ? profile?.facility_id : undefined,
      });
      setReturnsList(data);
      setFacilities(getSnapshot(STORAGE_KEYS.FACILITIES, []));
      setMedicines(getSnapshot(STORAGE_KEYS.MEDICINES, []));
    } catch (err) {
      console.error("[StockReturnsModule] Failed to load stock returns:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isBhw, profile]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const barangayFacilities = useMemo(
    () =>
      (facilities || []).filter(
        (facility) =>
          facility.facility_type === "BARANGAY_HEALTH_STATION" ||
          (facility.facility_code &&
            facility.facility_code !== "CHO" &&
            !facility.facility_name?.includes("City Health Office"))
      ),
    [facilities]
  );

  const filteredReturns = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const activeFacilityFilter = isBhw ? profile?.facility_id || "ALL" : facilityFilter;

    return (returnsList || []).filter((item) => {
      if (activeFacilityFilter !== "ALL" && item.facility_id !== activeFacilityFilter) return false;
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (reasonFilter !== "ALL" && item.reason !== reasonFilter) return false;

      if (!term) return true;

      return [
        item.return_slip_no,
        item.id,
        item.lot_no,
        item.batch_number,
        item.medicine_name,
        item.brand_name,
        item.facility?.facility_name,
        item.facility?.facility_code,
        getReturnReasonLabel(item.reason),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [returnsList, searchTerm, isBhw, profile?.facility_id, facilityFilter, statusFilter, reasonFilter]);

  const pagination = usePaginatedRows(filteredReturns, 10);
  const kpis = useMemo(() => calculateStockReturnKpis(filteredReturns), [filteredReturns]);

  const totalValuation = useMemo(
    () =>
      filteredReturns.reduce(
        (sum, item) => sum + (parseInt(item.quantity, 10) || 0) * (parseFloat(item.unit_cost) || 0),
        0
      ),
    [filteredReturns]
  );

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
      (!isBhw && facilityFilter !== "ALL") ||
      statusFilter !== "ALL" ||
      reasonFilter !== "ALL"
  );

  const clearFilters = () => {
    setSearchTerm("");
    if (!isBhw) setFacilityFilter("ALL");
    setStatusFilter("ALL");
    setReasonFilter("ALL");
    pagination.setCurrentPage(1);
  };

  const handleRecordSuccess = (newRecord) => {
    setNotice(isBhw ? "Stock return submitted to CHO." : "Stock return recorded.");
    setTimeout(() => setNotice(""), 5000);
    setReturnsList((prev) => [newRecord, ...(prev || []).filter((item) => item.id !== newRecord.id)]);
    loadData();
  };

  const handleRecordUpdated = (updatedRecord) => {
    setReturnsList((prev) =>
      (prev || []).map((item) => (item.id === updatedRecord.id ? { ...item, ...updatedRecord } : item))
    );
    setNotice("Stock return successfully verified.");
    setTimeout(() => setNotice(""), 5000);
  };

  const handleExportCsv = () => {
    const headers = [
      "Return Slip No",
      "Return Date",
      "Returning Facility",
      "Medicine Name",
      "Brand Name",
      "Batch / Lot No",
      "Quantity",
      "Unit Cost (PHP)",
      "Total Value (PHP)",
      "Expiration Date",
      "Return Reason",
      "Status",
    ];

    const rows = filteredReturns.map((item) => {
      const qty = parseInt(item.quantity, 10) || 0;
      const cost = parseFloat(item.unit_cost) || 0;
      return [
        item.return_slip_no || String(item.id || "").slice(0, 8),
        item.return_date || item.submitted_at ? formatDate(item.return_date || item.submitted_at) : "",
        item.facility?.facility_name || "",
        item.medicine_name || "",
        item.brand_name || "",
        item.lot_no || item.batch_number || "",
        qty,
        cost.toFixed(2),
        (qty * cost).toFixed(2),
        item.expiration_date ? formatDate(item.expiration_date) : "",
        getReturnReasonLabel(item.reason),
        getReturnStatusBadge(item.status).label,
      ];
    });

    const csvContent = [headers.map(escapeCsv).join(","), ...rows.map((row) => row.map(escapeCsv).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `PRDS_Stock_Returns_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminShell profile={profile} onSignOut={logoutUser}>
      <div className="space-y-4 pb-12">
        {notice && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900 shadow-2xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{notice}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice("")}
              className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Top Header Card */}
        <section className="rounded-xl border border-[#d8dadc] bg-white px-4 py-3 shadow-xs">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black leading-none text-[#0d1117]">
                {isBhw ? "Barangay Stock Returns" : "Stock Returns"}
              </h2>
              <p className="mt-1 text-xs font-semibold text-neutral-500">
                {isBhw
                  ? "Record and dispatch returned medicine stock to the City Health Office central warehouse."
                  : "Review, verify, and reconcile medicines returned by barangay health stations."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadData}
                disabled={isLoading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d8dadc] bg-white px-3 text-xs font-bold text-neutral-700 shadow-2xs hover:bg-neutral-50 hover:border-neutral-300 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-emerald-600" : ""}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d8dadc] bg-white px-3.5 text-xs font-bold text-neutral-700 shadow-2xs hover:bg-neutral-50 hover:border-neutral-300 transition cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-neutral-600" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => setIsRecordModalOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0d1117] px-4 text-xs font-black text-white shadow-sm hover:bg-neutral-800 active:scale-[0.98] transition cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                {isBhw ? "Send Return" : "Record Return"}
              </button>
            </div>
          </div>
        </section>

        {/* Metric Summary Cards in standard PRDS format */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="Total Returns"
            value={formatNumber(filteredReturns.length)}
            sub="return entries on record"
            compact
          />
          <MetricCard
            label="Returned Units"
            value={formatNumber(kpis.totalUnitsReturned)}
            sub="total medicine items"
            compact
          />
          <MetricCard
            label="Pending Review"
            value={formatNumber(kpis.pendingVerificationCount)}
            sub="awaiting CHO verification"
            compact
          />
          <MetricCard
            label="Verified Returns"
            value={formatNumber(kpis.verifiedCount)}
            sub={totalValuation > 0 ? `${formatCurrency(totalValuation)} reconciled` : "reconciled to CHO"}
            compact
          />
        </section>

        {/* Filter and Search Bar */}
        <section className="overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-xs">
          <div className="flex flex-col gap-3 border-b border-neutral-100 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2 shrink-0">
              <h2 className="text-base font-black text-[#0d1117] whitespace-nowrap">
                Stock Returns Ledger
              </h2>
              <span className="font-semibold text-neutral-400 whitespace-nowrap">
                ({filteredReturns.length} {filteredReturns.length === 1 ? "record" : "records"})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[200px] flex-1 sm:w-64 sm:flex-initial">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  <Search className="h-4 w-4" />
                </span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    pagination.setCurrentPage(1);
                  }}
                  placeholder="Search slip, batch, medicine, facility..."
                  className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-8 text-xs font-semibold text-[#0d1117] outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </label>

              {!isBhw && (
                <select
                  value={facilityFilter}
                  onChange={(event) => {
                    setFacilityFilter(event.target.value);
                    pagination.setCurrentPage(1);
                  }}
                  className="h-9 max-w-[170px] rounded-lg border border-[#d8dadc] bg-white px-2.5 text-xs font-bold text-neutral-700 outline-none transition hover:border-neutral-300 focus:border-emerald-500 cursor-pointer truncate"
                >
                  <option value="ALL">All Facilities</option>
                  {barangayFacilities.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.facility_name}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={reasonFilter}
                onChange={(event) => {
                  setReasonFilter(event.target.value);
                  pagination.setCurrentPage(1);
                }}
                className="h-9 max-w-[155px] rounded-lg border border-[#d8dadc] bg-white px-2.5 text-xs font-bold text-neutral-700 outline-none transition hover:border-neutral-300 focus:border-emerald-500 cursor-pointer truncate"
              >
                <option value="ALL">All Reasons</option>
                {RETURN_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  pagination.setCurrentPage(1);
                }}
                className="h-9 max-w-[145px] rounded-lg border border-[#d8dadc] bg-white px-2.5 text-xs font-bold text-neutral-700 outline-none transition hover:border-neutral-300 focus:border-emerald-500 cursor-pointer truncate"
              >
                <option value="ALL">All Statuses</option>
                {RETURN_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-xs font-bold text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition cursor-pointer"
                  title="Clear active filters"
                >
                  <RotateCcw className="h-3 w-3 text-neutral-500" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Clean, Non-Cluttered Table Matching Database Schema */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-y border-neutral-100 bg-[#f7f6f3] text-[11px] font-black uppercase tracking-[0.14em] text-[#42474e]">
                <tr>
                  <th className="w-[16%] px-4 py-2.5">Return Slip #</th>
                  <th className="w-[18%] px-4 py-2.5">Returning Facility</th>
                  <th className="w-[28%] px-4 py-2.5">Medicine &amp; Batch</th>
                  <th className="w-[10%] px-4 py-2.5 text-right">Quantity</th>
                  <th className="w-[14%] px-4 py-2.5">Return Reason</th>
                  <th className="w-[10%] px-4 py-2.5">Status</th>
                  <th className="w-[4%] px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {pagination.paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <Package className="h-5 w-5" />
                      </div>
                      <p className="font-bold text-[#0d1117]">No Stock Returns Found</p>
                      <p className="mt-0.5 text-xs font-medium text-neutral-400">
                        {hasActiveFilters
                          ? "Try adjusting or clearing the active filters."
                          : isBhw
                          ? "Use 'Send Return' when your barangay station has medicines to return to CHO."
                          : "Returned medicines from barangay stations will be listed here for inspection."}
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200 transition cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5 text-neutral-500" />
                          Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  pagination.paginatedRows.map((item) => {
                    const reasonTone = getReturnReasonTone(item.reason);
                    const reasonLabel = getReturnReasonLabel(item.reason);
                    const statusBadge = getReturnStatusBadge(item.status);
                    const returnSlipDisplay =
                      item.return_slip_no ||
                      (item.id ? `RET-${String(item.id).slice(0, 8).toUpperCase()}` : "-");
                    const dateDisplay =
                      item.return_date || item.submitted_at
                        ? formatDate(item.return_date || item.submitted_at)
                        : item.created_at
                        ? formatDate(item.created_at)
                        : null;

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedReturnRecord(item)}
                        className="group cursor-pointer transition hover:bg-emerald-50/35"
                      >
                        {/* Return Slip Column */}
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-[#0d1117]">
                            <Receipt className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                            <span>{returnSlipDisplay}</span>
                          </div>
                          {dateDisplay && (
                            <p className="mt-0.5 text-[11px] font-semibold text-neutral-400">
                              {dateDisplay}
                            </p>
                          )}
                        </td>

                        {/* Returning Facility Column */}
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span className="text-xs font-bold text-[#0d1117] line-clamp-1">
                              {item.facility?.facility_name || "Barangay Health Center"}
                            </span>
                          </div>
                          {item.facility?.facility_code && (
                            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                              {item.facility.facility_code}
                            </p>
                          )}
                        </td>

                        {/* Medicine Name & Batch Column */}
                        <td className="px-4 py-3 align-middle">
                          <p className="text-sm font-black text-[#0d1117] leading-snug">
                            {item.medicine_name || "Medicine Item"}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500 font-semibold">
                            <span className="font-mono bg-neutral-100 border border-neutral-200/60 rounded px-1.5 py-0.2 text-[10px] font-bold text-neutral-700">
                              Lot: {item.lot_no || item.batch_number || "—"}
                            </span>
                            {item.brand_name && (
                              <span>• Brand: {item.brand_name}</span>
                            )}
                            {item.expiration_date && (
                              <span>• Exp: {formatDate(item.expiration_date)}</span>
                            )}
                          </div>
                        </td>

                        {/* Quantity Column */}
                        <td className="px-4 py-3 align-middle text-right">
                          <p className="text-sm font-black text-[#0d1117]">
                            {formatNumber(item.quantity)}
                          </p>
                          {Number(item.unit_cost) > 0 && (
                            <p className="text-[11px] font-semibold text-neutral-400">
                              {formatCurrency((item.quantity || 0) * (item.unit_cost || 0))}
                            </p>
                          )}
                        </td>

                        {/* Reason Column */}
                        <td className="px-4 py-3 align-middle">
                          <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold ${reasonTone}`}>
                            {reasonLabel}
                          </span>
                        </td>

                        {/* Status Column */}
                        <td className="px-4 py-3 align-middle">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${statusBadge.tone}`}
                          >
                            {item.status === "VERIFIED" && <ShieldCheck className="h-3 w-3 shrink-0" />}
                            {statusBadge.label}
                          </span>
                        </td>

                        {/* Action Column */}
                        <td
                          className="px-4 py-3 align-middle text-right"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedReturnRecord(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#d8dadc] bg-white px-2.5 py-1 text-xs font-bold text-neutral-700 shadow-2xs transition hover:border-neutral-400 hover:bg-neutral-50 active:scale-[0.98] cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5 text-neutral-500" />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filteredReturns.length > 0 && (
            <div className="border-t border-neutral-100 px-4 py-3">
              <PaginationControls
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                onPageChange={pagination.setCurrentPage}
                totalCount={pagination.totalCount}
                pageSize={pagination.pageSize}
                itemLabel="stock returns"
              />
            </div>
          )}
        </section>
      </div>

      <RecordStockReturnModal
        isOpen={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
        onSuccess={handleRecordSuccess}
        facilities={facilities}
        medicines={medicines}
        currentUserProfile={profile}
      />

      <StockReturnDetailsModal
        isOpen={!!selectedReturnRecord}
        onClose={() => setSelectedReturnRecord(null)}
        returnRecord={selectedReturnRecord}
        onRecordUpdated={handleRecordUpdated}
        currentUserProfile={profile}
      />
    </AdminShell>
  );
}
