import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Boxes,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Package,
  Pill,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";

import AdminShell from "../../components/layout/AdminShell";
import PaginationControls from "../../components/PaginationControls";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import { getSnapshot, saveSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import { getSqliteDb, isTauriEnvironment } from "@backend/database/sqliteClient";
import {
  calculateStockReturnKpis,
  fetchStockReturns,
  formatReturnId,
  getReturnReasonLabel,
  getReturnReasonTone,
  getReturnStatusBadge,
  resolveStockReturnMedicineInfo,
  RETURN_STATUS_OPTIONS,
} from "@backend/services/stockReturnsService";
import { formatCurrency, formatDate, formatNumber } from "@shared/utils/inventoryUtils";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
import RecordStockReturnModal from "./components/RecordStockReturnModal";
import StockReturnDetailsModal from "./components/StockReturnDetailsModal";

export default function StockReturnsModule() {
  const { profile } = useAuth();
  const isBhw = profile?.role === "BHW";
  const [returnsList, setReturnsList] = useState(() => getSnapshot(STORAGE_KEYS.STOCK_RETURNS, []));
  const [facilities, setFacilities] = useState(() => getSnapshot(STORAGE_KEYS.FACILITIES, []));
  const [medicines, setMedicines] = useState(() => getSnapshot(STORAGE_KEYS.MEDICINES, []));
  const [inventory, setInventory] = useState(() => getSnapshot(STORAGE_KEYS.INVENTORY, []));
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [facilityFilter, setFacilityFilter] = useState(() => isBhw ? profile?.facility_id || "ALL" : "ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [selectedReturnRecord, setSelectedReturnRecord] = useState(null);
  const [notice, setNotice] = useState("");

  const location = useLocation();

  useEffect(() => {
    if (location.state?.openNewReturn) {
      setIsRecordModalOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchStockReturns({
        facilityId: isBhw ? profile?.facility_id : undefined,
      });
      setReturnsList(data);

      let currentMeds = getSnapshot(STORAGE_KEYS.MEDICINES, []);
      if (currentMeds.length === 0 && isTauriEnvironment()) {
        try {
          const db = await getSqliteDb();
          const rows = await db.select("SELECT id, generic_name, dosage, unit_of_measure, data_json FROM medicines");
          if (rows?.length) {
            currentMeds = rows.map((r) => {
              let parsed = {};
              try { parsed = r.data_json ? JSON.parse(r.data_json) : {}; } catch {}
              return { ...parsed, id: r.id, generic_name: r.generic_name, dosage: r.dosage, unit_of_measure: r.unit_of_measure };
            });
            saveSnapshot(STORAGE_KEYS.MEDICINES, currentMeds);
          }
        } catch (e) {
          console.warn("[StockReturnsModule] SQLite medicines read fallback:", e);
        }
      }

      setFacilities(getSnapshot(STORAGE_KEYS.FACILITIES, []));
      setMedicines(currentMeds);

      let currentInv = getSnapshot(STORAGE_KEYS.INVENTORY, []);
      if (isTauriEnvironment()) {
        try {
          const db = await getSqliteDb();
          const invRows = await db.select(
            "SELECT id, facility_id, medicine_id, quantity, batch_number, po_number, unit_cost, date_received, expiration_date, origin_facility_id, intake_type, return_reason, status, brand_name, supplier_name, data_json FROM inventory WHERE quantity > 0"
          );
          if (invRows?.length) {
            currentInv = invRows.map((r) => {
              let parsed = {};
              try { parsed = r.data_json ? JSON.parse(r.data_json) : {}; } catch {}
              return { ...parsed, ...r };
            });
            saveSnapshot(STORAGE_KEYS.INVENTORY, currentInv);
          }
        } catch (e) {
          console.warn("[StockReturnsModule] SQLite inventory read fallback:", e);
        }
      }
      if (currentInv.length === 0 && isCurrentNetworkOnline()) {
        try {
          const { data: remoteInv } = await supabase
            .from("inventory")
            .select("id, facility_id, medicine_id, quantity, batch_number, po_number, unit_cost, date_received, expiration_date, origin_facility_id, intake_type, return_reason, status, brand_name, supplier_name")
            .gt("quantity", 0);
          if (remoteInv?.length) {
            currentInv = remoteInv;
            saveSnapshot(STORAGE_KEYS.INVENTORY, currentInv);
          }
        } catch (e) {
          console.warn("[StockReturnsModule] Remote inventory read fallback:", e);
        }
      }
      setInventory(currentInv);
    } catch (err) {
      console.error("[StockReturnsModule] Failed to load stock returns:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isBhw, profile]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  // Listen for inventory change events across the app
  useEffect(() => {
    const handleInvChange = () => {
      setInventory(getSnapshot(STORAGE_KEYS.INVENTORY, []));
    };
    window.addEventListener("prds:inventory-changed", handleInvChange);
    return () => window.removeEventListener("prds:inventory-changed", handleInvChange);
  }, []);

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

  const medicinesMap = useMemo(() => {
    const map = new Map();
    for (const m of medicines || []) {
      if (m.id) map.set(m.id, m);
      if (m.generic_name) map.set(m.generic_name.toLowerCase().trim(), m);
    }
    return map;
  }, [medicines]);

  const baseReturns = useMemo(() => {
    if (isBhw && profile?.facility_id) {
      return (returnsList || []).filter((item) => item.facility_id === profile.facility_id);
    }
    return returnsList || [];
  }, [returnsList, isBhw, profile?.facility_id]);

  const filteredReturns = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const activeFacilityFilter = isBhw ? profile?.facility_id || "ALL" : facilityFilter;

    return (returnsList || []).filter((item) => {
      if (activeFacilityFilter !== "ALL" && item.facility_id !== activeFacilityFilter) return false;
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;

      if (!term) return true;

      return [
        item.return_id,
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
  }, [returnsList, searchTerm, isBhw, profile?.facility_id, facilityFilter, statusFilter]);

  const pagination = usePaginatedRows(filteredReturns, 10);
  const kpis = useMemo(() => calculateStockReturnKpis(baseReturns), [baseReturns]);

  const totalValuation = useMemo(
    () =>
      filteredReturns.reduce(
        (sum, item) => sum + (parseInt(item.quantity, 10) || 0) * (parseFloat(item.unit_cost) || 0),
        0
      ),
    [filteredReturns]
  );

  const handleRecordSuccess = (newRecord) => {
    const record = Array.isArray(newRecord) ? newRecord[0] : newRecord;
    const returnId = record?.return_id || "";
    const isDirectlyConfirmed = record?.status === "CONFIRMED";
    const count = Array.isArray(newRecord) ? newRecord.length : 1;
    setNotice(
      isDirectlyConfirmed
        ? `Stock return ${returnId} (${count} ${count === 1 ? "medicine" : "medicines"}) recorded and confirmed.`
        : `Stock return ${returnId} (${count} ${count === 1 ? "medicine" : "medicines"}) submitted to CHO (Pending confirmation).`
    );
    setTimeout(() => setNotice(""), 5000);
    loadData();
  };

  const handleRecordUpdated = (updatedRecord) => {
    const targetReturnId = updatedRecord.return_id || updatedRecord.return_slip_no;
    setReturnsList((prev) =>
      (prev || []).map((item) => {
        const itemReturnId = item.return_id || item.return_slip_no;
        if (targetReturnId && itemReturnId === targetReturnId) {
          return { ...item, ...updatedRecord, id: item.id };
        }
        return item.id === updatedRecord.id ? { ...item, ...updatedRecord } : item;
      })
    );
    setNotice("Stock return successfully confirmed.");
    setTimeout(() => setNotice(""), 5000);
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
                  : "Review, confirm, and reconcile medicines returned by barangay health stations."}
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
                onClick={() => setIsRecordModalOpen(true)}
                className="btn-primary inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-bold text-white shadow-xs hover:brightness-105 active:scale-[0.98] transition cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                {isBhw ? "Send Return" : "Record Return"}
              </button>
            </div>
          </div>
        </section>

        {/* Metric Summary Cards in standard PRDS format */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/* Card 1: Total Returns */}
          <button
            type="button"
            onClick={() => {
              setStatusFilter("ALL");
              pagination.setCurrentPage(1);
            }}
            className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all duration-150 hover:-translate-y-0.5 cursor-pointer ${
              statusFilter === "ALL"
                ? "border-[#1F4E5A] bg-white shadow-md ring-2 ring-[#1F4E5A]/15"
                : "border-[#CFDDE0] bg-white shadow-xs hover:border-[#1F4E5A]/40 hover:shadow-sm"
            }`}
          >
            <div className="flex items-start justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#5B7077]">
                Total Returns
              </span>
              <span
                className={`rounded-lg p-2 transition-colors duration-150 ${
                  statusFilter === "ALL"
                    ? "bg-[#1F4E5A] text-white"
                    : "bg-[#E5EFF1] text-[#1F4E5A] group-hover:bg-[#1F4E5A] group-hover:text-white"
                }`}
              >
                <RotateCcw className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-[#1B2B30] leading-none">
                {formatNumber(kpis.totalReturns)}
              </p>
              <p className="mt-1 text-xs text-[#5B7077]">
                All recorded return slips
              </p>
            </div>
          </button>

          {/* Card 2: Pending Confirmation */}
          <button
            type="button"
            onClick={() => {
              setStatusFilter((prev) => (prev === "PENDING" ? "ALL" : "PENDING"));
              pagination.setCurrentPage(1);
            }}
            className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all duration-150 hover:-translate-y-0.5 cursor-pointer ${
              statusFilter === "PENDING"
                ? "border-[#34769B] bg-white shadow-md ring-2 ring-[#34769B]/15"
                : "border-[#CFDDE0] bg-white shadow-xs hover:border-[#34769B]/40 hover:shadow-sm"
            }`}
          >
            <div className="flex items-start justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#5B7077]">
                Pending Confirmation
              </span>
              <span
                className={`rounded-lg p-2 transition-colors duration-150 ${
                  statusFilter === "PENDING"
                    ? "bg-[#34769B] text-white"
                    : "bg-[#E3EEF5] text-[#34769B] group-hover:bg-[#34769B] group-hover:text-white"
                }`}
              >
                <Clock className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-[#1B2B30] leading-none">
                {formatNumber(kpis.pendingConfirmationCount)}
              </p>
              <p className="mt-1 text-xs text-[#5B7077]">
                Awaiting CHO verification
              </p>
            </div>
          </button>

          {/* Card 3: Confirmed Returns */}
          <button
            type="button"
            onClick={() => {
              setStatusFilter((prev) => (prev === "CONFIRMED" ? "ALL" : "CONFIRMED"));
              pagination.setCurrentPage(1);
            }}
            className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all duration-150 hover:-translate-y-0.5 cursor-pointer ${
              statusFilter === "CONFIRMED"
                ? "border-[#4C9F80] bg-white shadow-md ring-2 ring-[#4C9F80]/15"
                : "border-[#CFDDE0] bg-white shadow-xs hover:border-[#4C9F80]/40 hover:shadow-sm"
            }`}
          >
            <div className="flex items-start justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#5B7077]">
                Confirmed Returns
              </span>
              <span
                className={`rounded-lg p-2 transition-colors duration-150 ${
                  statusFilter === "CONFIRMED"
                    ? "bg-[#4C9F80] text-white"
                    : "bg-[#E2F3EC] text-[#226048] group-hover:bg-[#4C9F80] group-hover:text-white"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-[#1B2B30] leading-none">
                {formatNumber(kpis.confirmedCount)}
              </p>
              <p className="mt-1 text-xs text-[#5B7077]">
                Restocked into inventory
              </p>
            </div>
          </button>

          {/* Card 4: Returned Units */}
          <div className="flex flex-col justify-between rounded-xl border border-[#CFDDE0] bg-white p-4 shadow-xs">
            <div className="flex items-start justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#5B7077]">
                Returned Units
              </span>
              <span className="rounded-lg bg-[#E5EFF1] p-2 text-[#1F4E5A]">
                <Boxes className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-[#1B2B30] leading-none">
                {formatNumber(kpis.totalUnitsReturned)}
              </p>
              <p className="mt-1 text-xs text-[#5B7077]">
                Total medicine units
              </p>
            </div>
          </div>
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
                  placeholder="Search Return ID, batch, medicine, facility..."
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
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  pagination.setCurrentPage(1);
                }}
                className="h-9 rounded-lg border border-[#d8dadc] bg-white px-2.5 text-xs font-bold text-neutral-700 outline-none transition hover:border-neutral-300 focus:border-emerald-500 cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                {RETURN_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Streamlined, Readable Stock Returns Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-white text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Return ID</th>
                  {!isBhw && <th className="px-4 py-3">Returning Facility</th>}
                  <th className="px-4 py-3 min-w-[220px]">Medicine Information</th>
                  <th className="px-4 py-3">Batch / Lot</th>
                  <th className="px-4 py-3">Expiration Date</th>
                  <th className="px-4 py-3 text-right">Quantity</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {pagination.paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={isBhw ? 6 : 7} className="px-4 py-12 text-center">
                      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <Package className="h-5 w-5" />
                      </div>
                      <p className="font-bold text-[#0d1117]">No Stock Returns Found</p>
                      <p className="mt-0.5 text-xs font-medium text-neutral-400">
                        {isBhw
                          ? "Use 'Send Return' when your barangay station has medicines to return to CHO."
                          : "Returned medicines from barangay stations will be listed here for inspection."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  pagination.paginatedRows.map((item) => {
                    const statusBadge = getReturnStatusBadge(item.status);
                    const returnIdDisplay =
                      formatReturnId(item.return_id || item.return_slip_no) ||
                      (item.id ? formatReturnId(item.id) : "—");

                    const info = resolveStockReturnMedicineInfo(item, { medicinesMap, medicines, inventory });

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedReturnRecord(item)}
                        className="group cursor-pointer transition hover:bg-emerald-50/30"
                      >
                        {/* Return ID (Clean ID only, no date subheading) */}
                        <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                          <span className="font-mono text-xs font-bold text-[#0d1117] tracking-tight">
                            {returnIdDisplay}
                          </span>
                        </td>

                        {/* Returning Facility (CHO view only) */}
                        {!isBhw && (
                          <td className="px-4 py-3.5 align-middle">
                            <span className="text-xs font-bold text-[#0d1117]">
                              {item.facility?.facility_name || "Barangay Health Center"}
                            </span>
                          </td>
                        )}

                        {/* Medicine Information (Unified generic, brand, dosage, and unit) */}
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-[#0d1117] leading-tight">
                              {info.genericName}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {info.brand ? (
                                <span className="inline-flex items-center rounded bg-neutral-100 px-1.5 py-0.2 text-[10px] font-bold text-neutral-700 border border-neutral-200/70">
                                  Brand: {info.brand}
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded bg-neutral-100/70 px-1.5 py-0.2 text-[10px] font-medium text-neutral-500">
                                  Generic
                                </span>
                              )}
                              {info.dosage ? (
                                <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.2 text-[10px] font-semibold text-blue-700 border border-blue-200/60">
                                  Dosage: {info.dosage}
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded bg-neutral-50 px-1.5 py-0.2 text-[10px] font-medium text-neutral-400 border border-neutral-200/50">
                                  Dosage: N/A
                                </span>
                              )}
                              {info.unit && (
                                <span className="inline-flex items-center rounded bg-slate-50 px-1.5 py-0.2 text-[10px] font-medium text-slate-600 border border-slate-200/60">
                                  Unit: {info.unit}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Batch / Lot */}
                        <td className="px-4 py-3.5 align-middle font-mono text-xs font-semibold text-neutral-800">
                          {item.lot_no || item.batch_number || "—"}
                        </td>

                        {/* Expiration Date */}
                        <td className="px-4 py-3.5 align-middle text-xs font-medium text-neutral-700">
                          {item.expiration_date ? formatDate(item.expiration_date) : "—"}
                        </td>

                        {/* Quantity */}
                        <td className="px-4 py-3.5 align-middle text-right whitespace-nowrap">
                          <span className="text-xs font-black text-[#0d1117] tabular-nums">
                            {formatNumber(info.itemQty || item.quantity)}
                          </span>
                          <span className="ml-1 text-[11px] font-semibold text-neutral-500 lowercase">
                            {info.unit || "units"}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 align-middle">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${statusBadge.tone}`}
                          >
                            {(item.status === "CONFIRMED" || item.status === "VERIFIED") && (
                              <CheckCircle2 className="h-3 w-3 shrink-0" />
                            )}
                            {statusBadge.label}
                          </span>
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
        inventory={inventory}
        currentUserProfile={profile}
      />

      <StockReturnDetailsModal
        isOpen={!!selectedReturnRecord}
        onClose={() => setSelectedReturnRecord(null)}
        returnRecord={selectedReturnRecord}
        allReturns={returnsList}
        medicines={medicines}
        inventory={inventory}
        onRecordUpdated={handleRecordUpdated}
        currentUserProfile={profile}
      />
    </AdminShell>
  );
}
