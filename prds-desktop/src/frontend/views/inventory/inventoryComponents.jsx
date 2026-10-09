import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowDownZA,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Lock,
  Package,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";

import { computeDaysOfSupply } from "@shared/utils/demandUtils";
import {
  DISPOSAL_METHODS,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  getExpiredDays,
  getExpiryStatus,
  getLotStatus,
  getMedicineName,
  getStockStatus,
  isLotExpired,
  normalizeLotNumber,
  normalizePoNumber,
} from "@shared/utils/inventoryUtils";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
import PaginationControls from "../../components/PaginationControls";
import ModalShell from "../../components/ModalShell";

export function MetricCard({ label, value, sub, onClick, active, compact = false }) {
  const interactiveClass = onClick
    ? "cursor-pointer transition hover:-translate-y-0.5 hover:border-[#6be9c2] hover:shadow-md hover:shadow-emerald-100"
    : "";
  const activeClass = active ? "border-[#00a36c] ring-2 ring-emerald-100" : "border-[#d8dadc]";

  return (
    <article
      onClick={onClick}
      className={`group rounded-xl border bg-white text-left shadow-xs ${compact ? "p-2.5 px-3.5" : "p-3.5"
        } ${interactiveClass} ${activeClass}`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <p
        className={`font-black tracking-tight text-[#0d1117] ${compact ? "text-xl leading-tight" : "mt-1 text-2xl"
          }`}
      >
        {value}
      </p>
      <p className={`${compact ? "text-xs" : "text-sm"} font-black text-[#42474e]`}>
        {label}
      </p>
      {sub && (
        <p className={`${compact ? "mt-0.5" : "mt-1"} text-xs font-medium leading-4 text-neutral-500 truncate`}>
          {sub}
        </p>
      )}
    </article>
  );
}

export function InventoryTabToggle({
  activeTab = "DISPENSABLE",
  onSelectTab,
}) {
  return (
    <div className="inline-flex h-10 items-center rounded-xl bg-neutral-100 p-1 border border-neutral-200/90 shadow-2xs">
      <button
        type="button"
        onClick={() => onSelectTab("DISPENSABLE")}
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-xs font-bold transition-all cursor-pointer ${
          activeTab === "DISPENSABLE"
            ? "bg-[#00a36c] text-white shadow-xs"
            : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50"
        }`}
      >
        <Package className="h-3.5 w-3.5" />
        <span>Dispensable Stock</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectTab("EXPIRED")}
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-xs font-bold transition-all cursor-pointer ${
          activeTab === "EXPIRED"
            ? "bg-red-600 text-white shadow-xs"
            : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50"
        }`}
      >
        <Lock className="h-3.5 w-3.5" />
        <span>Expired Stocks</span>
      </button>
    </div>
  );
}

export function FacilityPicker({
  facilities = [],
  value = "ALL",
  onSelect,
  className = "",
  dropdownClassName = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef(null);

  const selectedFacility = useMemo(() => {
    if (!value || value === "ALL") return null;
    return facilities.find((facility) => facility.id === value) || null;
  }, [facilities, value]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  const filteredFacilities = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return facilities;
    return facilities.filter(
      (f) =>
        f.facility_name?.toLowerCase().includes(term) ||
        f.facility_code?.toLowerCase().includes(term)
    );
  }, [facilities, searchTerm]);

  const handleSelect = (facilityId) => {
    onSelect?.(facilityId);
    setIsOpen(false);
    setSearchTerm("");
  };

  const isAllSelected = !value || value === "ALL";

  return (
    <div ref={containerRef} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-neutral-200/90 bg-white px-3 py-1.5 text-xs font-bold text-neutral-800 shadow-2xs hover:border-[#00a36c] focus:outline-none focus:ring-2 focus:ring-emerald-100 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 text-left">
          <Building2 className="h-4 w-4 text-[#00a36c] shrink-0" />
          <span className="truncate">
            {isAllSelected
              ? "All Health Centers (City-Wide)"
              : selectedFacility?.facility_name || "Select Health Center"}
          </span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-neutral-400 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute right-0 top-full z-30 mt-1.5 w-72 sm:w-80 overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-xl ${dropdownClassName}`}
        >
          <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50/60 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search health center..."
              autoFocus
              className="w-full bg-transparent text-xs font-medium text-neutral-800 outline-none placeholder:text-neutral-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="rounded p-0.5 text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {(!searchTerm || "all health centers city-wide".includes(searchTerm.toLowerCase())) && (
              <>
                <button
                  type="button"
                  onClick={() => handleSelect("ALL")}
                  className={`flex w-full items-center justify-between px-3 py-2 text-xs font-bold transition cursor-pointer ${
                    isAllSelected
                      ? "bg-emerald-50 text-[#00a36c]"
                      : "text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-[#00a36c]" />
                    <span>All Health Centers (City-Wide)</span>
                  </div>
                  {isAllSelected && <Check className="h-3.5 w-3.5 text-[#00a36c]" />}
                </button>
                <div className="my-1 border-t border-neutral-100" />
              </>
            )}

            {filteredFacilities.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs font-medium text-neutral-400">
                No health centers found
              </div>
            ) : (
              filteredFacilities.map((facility) => {
                const isSelected = value === facility.id;
                return (
                  <button
                    key={facility.id}
                    type="button"
                    onClick={() => handleSelect(facility.id)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-xs font-bold transition cursor-pointer ${
                      isSelected
                        ? "bg-emerald-50 text-[#00a36c]"
                        : "text-neutral-700 hover:bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2 text-left">
                      <span className="truncate">{facility.facility_name}</span>
                      {facility.facility_code && (
                        <span className="shrink-0 rounded bg-neutral-100 px-1 py-0.2 text-[10px] font-semibold text-neutral-500">
                          {facility.facility_code}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#00a36c]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}


export function DisposeStockModal({
  lot,
  isOpen,
  onClose,
  onConfirm,
  isSubmitting = false,
}) {
  const defaultMethod =
    typeof DISPOSAL_METHODS[0] === "object"
      ? DISPOSAL_METHODS[0]?.label || DISPOSAL_METHODS[0]?.value || "LGU City Health Condemnation Protocol"
      : DISPOSAL_METHODS[0] || "LGU City Health Condemnation Protocol";
  const [method, setMethod] = useState(defaultMethod);
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (isOpen) {
      setMethod(defaultMethod);
      setRemarks("");
    }
  }, [isOpen, lot?.id, defaultMethod]);

  if (!isOpen || !lot) return null;

  const qty = Number(lot.quantity || 0);
  const unitCost = Number(lot.medicine?.unit_cost || lot.unit_cost || 0);
  const lossValue = qty * unitCost;

  return (
    <ModalShell
      labelledBy="dispose-stock-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/45 backdrop-blur-xs"
      panelClassName="max-w-lg"
    >
      <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-red-100 bg-red-50/70 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-white">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <h3 id="dispose-stock-modal-title" className="text-sm font-black text-red-950">
                Condemn &amp; Dispose Expired Stock
              </h3>
              <p className="text-[11px] font-semibold text-red-800/80">
                Official condemnation protocol &amp; audit record
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 space-y-2">
            <div className="flex justify-between">
              <span className="text-neutral-500 font-semibold">Medicine:</span>
              <strong className="text-neutral-900 font-black text-right">{getMedicineName(lot)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500 font-semibold">Lot / Batch #:</span>
              <span className="font-mono font-bold text-neutral-800">{lot.batch_number || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500 font-semibold">Expired On:</span>
              <span className="font-bold text-red-700">{formatDate(lot.expiration_date)}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-2">
              <span className="text-neutral-500 font-semibold">Quantity to Condemn:</span>
              <span className="font-black text-sm text-red-600">{formatNumber(qty)} units</span>
            </div>
            {lossValue > 0 && (
              <div className="flex justify-between">
                <span className="text-neutral-500 font-semibold">Loss Value (COA):</span>
                <span className="font-bold text-neutral-700">{formatCurrency(lossValue)}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-neutral-700 mb-1">
              Disposal / Condemnation Method
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            >
              {DISPOSAL_METHODS.map((m) => {
                const optVal = typeof m === "object" ? m.label || m.value : m;
                const optLabel = typeof m === "object" ? m.label || m.value : m;
                return (
                  <option key={optVal} value={optVal}>
                    {optLabel}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-neutral-700 mb-1">
              Disposal Notes / COA Remarks (Optional)
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Condemned and witnessed by CHO Inspection and COA representative"
              className="w-full rounded-lg border border-neutral-300 bg-white p-2.5 text-xs text-neutral-800 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>

          <p className="text-[11px] text-neutral-500 leading-relaxed">
            Note: Disposing this batch permanently marks it as <strong>DISPOSED</strong> with zero active stock in all records, removing it from active dispensary, while logging the condemnation record for audit compliance.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-neutral-100 bg-neutral-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onConfirm(lot, { method, remarks })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-black text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isSubmitting ? "Processing..." : "Confirm Condemnation"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function StockLevelBar({ quantity, threshold }) {
  const qty = Number(quantity || 0);
  const thresh = Number(threshold || 0);
  const ratio = Math.min(1, qty / Math.max(thresh, 1));
  const width = `${Math.max(2, Math.round(ratio * 100))}%`;
  const toneClass =
    qty === 0 || qty <= Math.max(1, Math.floor(thresh * 0.25))
      ? "bg-red-500"
      : qty <= thresh
        ? "bg-orange-400"
        : "bg-emerald-500";

  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-neutral-100">
      <div className={`h-full rounded-full ${toneClass}`} style={{ width }} />
    </div>
  );
}

export function FilterChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 py-1 pl-3 pr-1.5 text-xs font-bold text-emerald-700">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="flex h-4 w-4 items-center justify-center rounded-full text-emerald-600 transition hover:bg-emerald-100"
      >
        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" viewBox="0 0 24 24">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

export function AlertBanner({ alerts, onJump }) {
  if (!alerts || alerts.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <TriangleIcon />
        </span>
        <p className="text-sm font-black text-amber-800">Stock attention needed</p>
        {alerts.map((alert) => (
          <button
            key={alert.key}
            type="button"
            onClick={() => onJump(alert.key)}
            className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-100"
          >
            {alert.count} {alert.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Field({ label, className = "", autoComplete = "off", ...props }) {
  return (
    <label className={`block min-w-0 w-full text-xs font-black uppercase tracking-wide text-neutral-600 ${className}`}>
      {label && <span className="block mb-1.5 truncate text-[11px]">{label}</span>}
      <input
        autoComplete={autoComplete}
        autoCorrect="off"
        spellCheck="false"
        data-form-type="other"
        {...props}
        className="h-10 w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-neutral-50 disabled:text-neutral-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </label>
  );
}

export function SelectField({ label, className = "", children, ...props }) {
  return (
    <label className={`block min-w-0 w-full text-xs font-black uppercase tracking-wide text-neutral-600 ${className}`}>
      {label && <span className="block mb-1.5 truncate text-[11px]">{label}</span>}
      <select
        {...props}
        className="h-10 w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-neutral-50 disabled:text-neutral-500"
      >
        {children}
      </select>
    </label>
  );
}



export function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-1 text-sm font-black text-black">{value || "-"}</p>
    </div>
  );
}

export function InventoryRowSkeleton({ columns = 4 }) {
  return (
    <tr>
      {Array.from({ length: columns }, (_, index) => (
        <td key={index} className="px-4 py-3">
          <div className="h-4 w-24 animate-pulse rounded bg-neutral-100" />
        </td>
      ))}
    </tr>
  );
}

export function InventoryTable({
  rows,
  isLoading,
  totalCount,
  hasActiveFilters,
  sortKey,
  sortDirection,
  onSort,
  onOpenItem,
  onClearFilters,
  consumptionByMedicine,
  currentPage,
  totalPages,
  onPageChange,
  emptyHint,
  emptyAction,
  variant = "medicine",
  isExpiredTab = false,
  showFacility = false,
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-y border-neutral-100 bg-[#f7f6f3] text-[11px] font-black uppercase tracking-[0.14em] text-[#42474e]">
            <tr>
              <th className="w-[32%] px-4 py-2.5">Medicine name</th>
              <th className="w-[18%] px-4 py-2.5">Brand name</th>
              <th className="w-[14%] px-4 py-2.5">Unit of Measurement</th>
              <th className="w-[18%] px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => onSort("quantity")}
                  className="inline-flex items-center gap-1 uppercase tracking-[0.14em] hover:text-emerald-700"
                >
                  {isExpiredTab ? "Expired Qty" : "Stock Level"}
                  <SortArrowIcon
                    direction={sortKey === "quantity" ? sortDirection : null}
                  />
                </button>
              </th>
              <th className="w-[18%] px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => onSort("expiration_date")}
                  className="inline-flex items-center gap-1 uppercase tracking-[0.14em] hover:text-emerald-700"
                >
                  {isExpiredTab ? "Date Expired" : "Expiration Date"}
                  <SortArrowIcon
                    direction={sortKey === "expiration_date" ? sortDirection : null}
                  />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {isLoading ? (
              Array.from({ length: 10 }, (_, index) => (
                <InventoryRowSkeleton key={index} columns={5} />
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-12 text-center" colSpan="5">
                  {isExpiredTab ? (
                    <>
                      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <p className="font-bold text-[#0d1117]">No Expired Medicines</p>
                      <p className="mt-0.5 text-xs font-medium text-neutral-400">
                        {hasActiveFilters
                          ? "Try adjusting or clearing the current filters."
                          : "All medicine batches in this facility are within their valid shelf life and safe for dispensing."}
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                        <InboxIcon />
                      </span>
                      <p className="font-bold text-neutral-500">No inventory records found.</p>
                      <p className="mt-0.5 text-xs font-medium text-neutral-400">
                        {hasActiveFilters
                          ? "Try adjusting or clearing the current filters."
                          : emptyHint || "Add stock to start tracking medicine inventory."}
                      </p>
                    </>
                  )}
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={onClearFilters}
                      className="mt-3 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-black text-neutral-700 hover:bg-neutral-200"
                    >
                      Clear filters
                    </button>
                  ) : (
                    !isExpiredTab && emptyAction
                  )}
                </td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => onOpenItem(item)}
                  className="group cursor-pointer transition hover:bg-emerald-50/35"
                >
                  <td className="px-4 py-2.5 align-middle">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black leading-snug text-[#0d1117]">
                        {getMedicineName(item)}
                      </p>
                      {item.lotCount > 1 && (
                        <span className="inline-flex items-center rounded-md bg-neutral-100 border border-neutral-200/60 px-1.5 py-0.2 text-[10px] font-bold text-neutral-600">
                          {item.lotCount} batches
                        </span>
                      )}
                    </div>
                    {showFacility && item.facility?.facility_name && (
                      <p className="text-[11px] font-semibold text-neutral-500 mt-0.5">
                        {item.facility.facility_name}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 align-middle">
                    <p className="font-bold text-[#42474e]">
                      {item.medicine?.brand_name || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 align-middle">
                    <p className="font-bold text-[#42474e]">
                      {item.medicine?.unit_of_measure || "-"}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 align-middle">
                    <p className="text-sm font-black text-[#0d1117]">
                      {formatNumber(item.quantity)}
                    </p>
                    {isExpiredTab ? (
                      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.2 text-[10px] font-black text-red-700">
                        <Lock className="h-2.5 w-2.5" />
                        Non-Dispensable
                      </span>
                    ) : (
                      <>
                        <p className="text-[11px] font-semibold text-neutral-500">
                          {getStockStatus(item).label}
                        </p>
                        <StockLevelBar quantity={item.quantity} threshold={item.threshold} />
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2.5 align-middle">
                    <p className="text-sm font-black text-[#0d1117]">
                      {formatDate(item.expiration_date)}
                    </p>
                    {isExpiredTab ? (
                      <p className="mt-0.5 text-xs font-bold text-red-600">
                        {getExpiredDays(item.expiration_date) > 0
                          ? `Expired ${getExpiredDays(item.expiration_date)} day${getExpiredDays(item.expiration_date) === 1 ? "" : "s"} ago`
                          : "Expired today"}
                      </p>
                    ) : (
                      item.expiration_date && getExpiryStatus(item).key !== "OK" && getExpiryStatus(item).key !== "NO_DATE" && (
                        <p
                          className={`mt-0.5 text-xs font-semibold ${
                            getExpiryStatus(item).key === "EXPIRED"
                              ? "text-red-600"
                              : "text-amber-600"
                          }`}
                        >
                          {getExpiryStatus(item).label}
                        </p>
                      )
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3">
        <p className="text-xs font-medium text-neutral-500">
          Showing {totalCount > 0 ? (currentPage - 1) * 10 + 1 : 0} -{" "}
          {Math.min(currentPage * 10, totalCount)} of {totalCount}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 transition"
            aria-label="Previous page"
          >
            <ChevronLeftIcon />
          </button>
          <span className="rounded-lg bg-black px-3 py-1.5 text-xs font-black text-white">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 transition"
            aria-label="Next page"
          >
            <ChevronRightIcon />
          </button>
        </div>
      </div>
    </>
  );
}

export function InventoryLotTable({
  lots = [],
  canEdit = false,
  onEditLot,
  onDisposeLot,
  onSelectLot,
  showActions = false,
}) {
  const displayedLots = lots;

  const {
    currentPage,
    paginatedRows,
    pageSize,
    setCurrentPage,
    totalCount,
    totalPages,
  } = usePaginatedRows(displayedLots, 10);

  const fefoLotId = useMemo(() => {
    const unexpiredWithStock = displayedLots.filter(
      (lot) => !isLotExpired(lot) && Number(lot.quantity || 0) > 0 && lot.expiration_date
    );
    if (unexpiredWithStock.length === 0) {
      return null;
    }
    const sorted = [...unexpiredWithStock].sort((a, b) =>
      String(a.expiration_date).localeCompare(String(b.expiration_date))
    );
    return sorted[0]?.id || null;
  }, [displayedLots]);

  const hasActions = showActions && (canEdit || displayedLots.some((lot) => isLotExpired(lot) && Boolean(onDisposeLot)));

  return (
    <section className="rounded-xl border border-[#d8dadc] bg-white shadow-2xs overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 bg-[#fafaf9] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <p className="text-xs font-black uppercase tracking-wider text-[#0d1117]">
            Batch &amp; Lot Records
          </p>
          <span className="inline-flex items-center rounded-full bg-neutral-200/80 px-2 py-0.5 text-[10px] font-bold text-neutral-700">
            {displayedLots.length}
          </span>
        </div>
        {onSelectLot && (
          <p className="text-[11px] font-semibold text-neutral-400">
            Click any batch to view details or edit
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f7f6f3] text-[10px] font-black uppercase tracking-[0.14em] text-[#42474e] border-b border-neutral-100">
            <tr>
              <th className="px-4 py-2.5">PO #</th>
              <th className="px-4 py-2.5">Batch / Lot</th>
              <th className="px-4 py-2.5">Supplier</th>
              <th className="px-4 py-2.5">Quantity</th>
              <th className="px-4 py-2.5">Received</th>
              <th className="px-4 py-2.5">Expiration</th>
              <th className="px-4 py-2.5">Status</th>
              {hasActions && <th className="px-4 py-2.5 text-center">Action</th>}
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-100 text-xs">
            {totalCount === 0 ? (
              <tr>
                <td className="px-4 py-12 text-center" colSpan={hasActions ? 8 : 7}>
                  <div className="max-w-md mx-auto">
                    <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                      <Package className="h-5 w-5" />
                    </div>
                    <p className="font-bold text-[#0d1117]">No Supplier Deliveries</p>
                    <p className="mt-0.5 text-xs text-neutral-400">
                      No stock batches for this medicine have been recorded via Supplier Purchase Order.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedRows.map((lot) => {
                const expiry = getExpiryStatus(lot);
                const isExpired = expiry.key === "EXPIRED";
                const status = getLotStatus(lot);
                const lotCost =
                  lot.unit_cost !== null && lot.unit_cost !== undefined && !isNaN(Number(lot.unit_cost))
                    ? Number(lot.unit_cost)
                    : lot.medicine?.unit_cost !== null && lot.medicine?.unit_cost !== undefined && !isNaN(Number(lot.medicine?.unit_cost))
                      ? Number(lot.medicine.unit_cost)
                      : null;
                const totalBatchValue =
                  lotCost !== null ? Number(lot.quantity || 0) * lotCost : null;
                const unitMeasure = lot.medicine?.unit_of_measure || "";

                return (
                  <tr
                    key={lot.id}
                    onClick={() => onSelectLot?.(lot)}
                    className={`transition-colors ${
                      onSelectLot ? "hover:bg-emerald-50/50 cursor-pointer group" : "hover:bg-neutral-50/70"
                    }`}
                  >
                      {/* Column 1: PO Number */}
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <span className="font-mono text-xs font-bold text-neutral-600">
                          {normalizePoNumber(lot.po_number) || "—"}
                        </span>
                      </td>

                      {/* Column 2: Batch / Lot # */}
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-black text-[#0d1117] group-hover:text-emerald-700 tracking-wider">
                            {normalizeLotNumber(lot.batch_number) || "-"}
                          </span>
                          {displayedLots.length > 1 && lot.id === fefoLotId && (
                            <span
                              title="First-Expired, First-Out: Priority batch to dispense"
                              className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                            >
                              FEFO Next
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 3: Supplier Name */}
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <span className="text-xs font-semibold text-neutral-700">
                          {lot.supplier?.supplier_name || "—"}
                        </span>
                      </td>

                      {/* Column 4: Quantity in Stock */}
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm font-black text-[#0d1117]">
                            {formatNumber(lot.quantity)}
                          </span>
                          {unitMeasure && (
                            <span className="text-xs font-bold text-neutral-500 lowercase">
                              {unitMeasure}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 5: Date Received */}
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <span className="text-xs font-semibold text-neutral-800">
                          {lot.date_received ? formatDate(lot.date_received) : "—"}
                        </span>
                      </td>

                      {/* Column 4: Expiration & Shelf Life */}
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <div className="text-xs font-bold text-[#0d1117]">
                          {formatDate(lot.expiration_date)}
                        </div>
                        <div className="mt-1">
                          {isExpired ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                              Expired ({getExpiredDays(lot.expiration_date) > 0 ? `${getExpiredDays(lot.expiration_date)}d ago` : "Today"})
                            </span>
                          ) : expiry.days !== null && expiry.days <= 30 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                              {expiry.days === 0 ? "Expires today" : `Expiring in ${expiry.days}d`}
                            </span>
                          ) : expiry.days !== null ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                              {expiry.days}d shelf life
                            </span>
                          ) : (
                            <span className="text-[11px] text-neutral-400">No expiry date</span>
                          )}
                        </div>
                      </td>

                      {/* Column 5: Stock Health */}
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <span className={'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-black ' + status.badgeClass}>
                          {status.label}
                        </span>
                      </td>

                      {/* Column 6: Action */}
                      {hasActions && (
                        <td className="px-4 py-3 align-top text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => onEditLot?.(lot)}
                                className="inline-flex h-7 items-center justify-center rounded-lg border border-neutral-200 bg-white px-2.5 text-xs font-bold text-neutral-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                              >
                                Edit
                              </button>
                            )}
                            {isExpired && onDisposeLot && (
                              <button
                                type="button"
                                onClick={() => onDisposeLot?.(lot)}
                                className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 text-xs font-bold text-red-700 transition-colors hover:border-red-300 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500/20 cursor-pointer"
                                title="Condemn and dispose expired stock"
                              >
                                <Trash2 className="h-3 w-3" />
                                Dispose
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
              })
            )}
          </tbody>
        </table>
      </div>
      {totalCount > 10 && (
        <div className="border-t border-neutral-100 p-2">
          <PaginationControls
            currentPage={currentPage}
            itemLabel="lot records"
            onPageChange={setCurrentPage}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
          />
        </div>
      )}
    </section>
  );
}

export function SearchIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function LayersIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="m12 3 8 4-8 4-8-4 8-4Z" />
      <path d="m4 11 8 4 8-4" />
      <path d="m4 15 8 4 8-4" />
    </svg>
  );
}

export function AlertCircleIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

export function TriangleIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M10.3 4.3 2.7 17.5A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.5L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function BuildingIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 21v-4h6v4" />
      <path d="M9 7h.01M12 7h.01M15 7h.01M9 11h.01M12 11h.01M15 11h.01M9 15h.01M12 15h.01M15 15h.01" />
    </svg>
  );
}

export function ChevronDownIcon({ className = "" }) {
  return (
    <svg className={`h-4 w-4 ${className}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function XIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

export function UploadIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

export function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function InboxIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.5 5.5 4 12v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6l-1.5-6.5A2 2 0 0 0 16.6 4H7.4a2 2 0 0 0-1.9 1.5Z" />
    </svg>
  );
}

export function BanknoteIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}

export function PillIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M10.5 20.5 20.5 10.5a5 5 0 0 0-7-7l-10 10a5 5 0 0 0 7 7Z" />
      <path d="m8.5 8.5 7 7" />
    </svg>
  );
}

export function TrendingUpIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M17 7h4v4" />
    </svg>
  );
}

export function RequestIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M7 3h8l4 4v14H7V3Z" />
      <path d="M14 3v5h5" />
      <path d="M10 13h6M10 17h4" />
    </svg>
  );
}

export function SortArrowIcon({ direction }) {
  if (direction === "ASC") {
    return (
      <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
        <path d="m18 15-6-6-6 6" />
      </svg>
    );
  }

  if (direction === "DESC") {
    return (
      <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
        <path d="m6 9 6 6 6-6" />
      </svg>
    );
  }

  return (
    <svg className="h-3.5 w-3.5 text-neutral-300" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
      <path d="m8 9 4-4 4 4" />
      <path d="m8 15 4 4 4-4" />
    </svg>
  );
}

export function MedicineOrderToggle({ direction = "ASC", onToggle }) {
  const nextDirection = direction === "ASC" ? "DESC" : "ASC";
  const isAsc = direction === "ASC";

  return (
    <button
      type="button"
      onClick={() => onToggle(nextDirection)}
      title={isAsc ? "Sort medicine Z to A (currently A to Z)" : "Sort medicine A to Z (currently Z to A)"}
      aria-label={`Sort medicine ${isAsc ? "Z to A" : "A to Z"}`}
      className="group inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 active:translate-y-0 cursor-pointer"
    >
      <span className="transition-transform duration-200 group-hover:scale-110">
        {isAsc ? (
          <ArrowDownAZ className="h-4.5 w-4.5" />
        ) : (
          <ArrowDownZA className="h-4.5 w-4.5" />
        )}
      </span>
    </button>
  );
}
