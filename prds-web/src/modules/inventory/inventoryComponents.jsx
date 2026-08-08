import { useEffect, useMemo, useRef, useState } from "react";

import { computeDaysOfSupply } from "./demandUtils";
import {
  formatDate,
  formatNumber,
  getExpiryStatus,
  getMedicineName,
  getStockStatus,
} from "./inventoryUtils";

export function MetricCard({ label, value, sub, tone, onClick, active, children }) {
  const toneClasses = {
    emerald: "bg-emerald-100 text-emerald-600",
    teal: "bg-teal-100 text-teal-600",
    red: "bg-red-100 text-red-500",
    orange: "bg-orange-100 text-orange-600",
    amber: "bg-amber-100 text-amber-600",
  };

  const interactiveClass = onClick
    ? "cursor-pointer transition hover:-translate-y-0.5 hover:border-[#6be9c2] hover:shadow-md hover:shadow-emerald-100"
    : "";
  const activeClass = active ? "border-[#00a36c] ring-2 ring-emerald-100" : "border-[#d8dadc]";

  return (
    <article
      onClick={onClick}
      className={`group rounded-xl border bg-white p-3.5 text-left shadow-sm shadow-neutral-200/40 ${interactiveClass} ${activeClass}`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-start justify-between gap-2.5">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
          {children}
        </span>
      </div>
      <p className="mt-4 text-2xl font-black tracking-tight text-[#0d1117]">{value}</p>
      <p className="mt-0.5 text-sm font-black text-[#42474e]">{label}</p>
      {sub && <p className="mt-1 text-xs font-medium leading-4 text-neutral-500">{sub}</p>}
    </article>
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
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
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

export function Field({ label, ...props }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-600">
      {label}
      <input
        {...props}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-neutral-50 disabled:text-neutral-500"
      />
    </label>
  );
}

export function SelectField({ label, children, ...props }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-600">
      {label}
      <select
        {...props}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-neutral-50 disabled:text-neutral-500"
      >
        {children}
      </select>
    </label>
  );
}

export function FacilityPicker({ facilities, value, onSelect }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef(null);

  const selectedFacility = facilities.find((facility) => facility.id === value) || null;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

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

  const options = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return term
      ? facilities.filter((facility) => facility.facility_name.toLowerCase().includes(term))
      : facilities;
  }, [facilities, searchTerm]);

  const handleSelect = (facilityId) => {
    onSelect(facilityId);
    setIsOpen(false);
    setSearchTerm("");
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xs shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex h-10 w-full items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-bold text-neutral-800 outline-none transition hover:border-emerald-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      >
        <span className="shrink-0 text-emerald-600">
          <BuildingIcon />
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-left ${
            selectedFacility ? "text-neutral-800" : "text-neutral-400"
          }`}
        >
          {selectedFacility ? selectedFacility.facility_name : "Select facility"}
        </span>
        <ChevronDownIcon
          className={`shrink-0 text-neutral-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2.5">
            <span className="shrink-0 text-neutral-400">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search facility..."
              autoFocus
              className="w-full bg-transparent text-sm font-medium text-neutral-800 outline-none placeholder:text-neutral-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="shrink-0 rounded-md p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Clear facility search"
              >
                <XIcon />
              </button>
            )}
          </div>

          <ul role="listbox" className="prds-sidebar-scrollbar max-h-64 overflow-y-auto py-1">
            {options.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm font-medium text-neutral-400">
                No facilities found.
              </li>
            ) : (
              options.map((facility) => {
                const isSelected = value === facility.id;

                return (
                  <li key={facility.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(facility.id)}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition ${
                        isSelected
                          ? "bg-emerald-50 font-black text-emerald-700"
                          : "font-bold text-neutral-700 hover:bg-[#eff4ff] hover:text-[#0d1117]"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{facility.facility_name}</span>
                      {isSelected && (
                        <span className="shrink-0">
                          <CheckIcon />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
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
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-y border-neutral-100 bg-[#f7f6f3] text-[11px] font-black uppercase tracking-[0.14em] text-[#42474e]">
            <tr>
              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onSort("medicine")}
                  className="inline-flex items-center gap-1 uppercase tracking-[0.14em] hover:text-emerald-700"
                >
                  Medicine
                  <SortArrowIcon
                    direction={sortKey === "medicine" ? sortDirection : null}
                  />
                </button>
              </th>
              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onSort("quantity")}
                  className="inline-flex items-center gap-1 uppercase tracking-[0.14em] hover:text-emerald-700"
                >
                  Stock Level
                  <SortArrowIcon
                    direction={sortKey === "quantity" ? sortDirection : null}
                  />
                </button>
              </th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onSort("expiration_date")}
                  className="inline-flex items-center gap-1 uppercase tracking-[0.14em] hover:text-emerald-700"
                >
                  Expiry
                  <SortArrowIcon
                    direction={sortKey === "expiration_date" ? sortDirection : null}
                  />
                </button>
              </th>
              <th className="w-12 px-4 py-3">
                <span className="sr-only">Open details</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {isLoading ? (
              Array.from({ length: 5 }, (_, index) => <InventoryRowSkeleton key={index} columns={5} />)
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-14 text-center" colSpan="5">
                  <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                    <InboxIcon />
                  </span>
                  <p className="font-bold text-neutral-500">No inventory records found.</p>
                  <p className="mt-1 text-sm font-medium text-neutral-400">
                    {hasActiveFilters
                      ? "Try adjusting or clearing the current filters."
                      : emptyHint || "Add stock to start tracking medicine inventory."}
                  </p>
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={onClearFilters}
                      className="mt-4 rounded-lg bg-neutral-100 px-4 py-2 text-sm font-black text-neutral-700 hover:bg-neutral-200"
                    >
                      Clear filters
                    </button>
                  ) : (
                    emptyAction
                  )}
                </td>
              </tr>
            ) : (
              rows.map((item) => {
                const status = getStockStatus(item);
                const expiryStatus = getExpiryStatus(item);
                const adc = consumptionByMedicine?.[item.medicine_id];
                const daysLeft = adc ? computeDaysOfSupply(item.quantity, adc) : null;
                const daysLeftTone =
                  daysLeft != null
                    ? daysLeft <= 7
                      ? "text-red-500"
                      : daysLeft <= 30
                        ? "text-amber-600"
                        : "text-emerald-600"
                    : "";

                return (
                  <tr
                    key={item.id}
                    onClick={() => onOpenItem(item)}
                    className="group cursor-pointer transition hover:bg-neutral-50"
                  >
                    <td className="px-4 py-3">
                      <p className="font-black text-[#0d1117]">{getMedicineName(item)}</p>
                      <p className="text-xs font-medium text-neutral-400">
                        {item.medicine?.brand_name || item.batch_number}
                        {item.medicine?.unit_of_measure
                          ? ` · ${item.medicine.unit_of_measure}`
                          : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p
                        className={`text-sm font-black ${
                          status.key === "NORMAL" ? "text-[#0d1117]" : "text-red-500"
                        }`}
                      >
                        {formatNumber(item.quantity)}
                        {item.medicine?.unit_of_measure ? ` ${item.medicine.unit_of_measure}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-neutral-400">
                        min: {formatNumber(item.threshold)}
                        {daysLeft != null && (
                          <>
                            {" · "}
                            <span className={`font-bold ${daysLeftTone}`}>
                              ~{formatNumber(daysLeft)}d left
                            </span>
                          </>
                        )}
                      </p>
                      <StockLevelBar quantity={item.quantity} threshold={item.threshold} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-black ${status.badgeClass}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-black ${expiryStatus.badgeClass}`}
                      >
                        {expiryStatus.label}
                      </span>
                      <p className="mt-1 text-xs font-medium text-neutral-400">
                        {formatDate(item.expiration_date)}
                        {expiryStatus.days !== null && (
                          <>
                            {expiryStatus.days < 0
                              ? ` · ${Math.abs(expiryStatus.days)} days ago`
                              : expiryStatus.days <= 30
                                ? ` · in ${expiryStatus.days} day${expiryStatus.days === 1 ? "" : "s"}`
                                : ""}
                          </>
                        )}
                      </p>
                    </td>
                    <td className="w-12 px-4 py-3">
                      <span className="flex items-center justify-center text-neutral-300 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                        <ChevronRightIcon />
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-4">
        <p className="text-xs font-medium text-neutral-500">
          Showing {totalCount > 0 ? (currentPage - 1) * 10 + 1 : 0}–
          {Math.min(currentPage * 10, totalCount)} of {totalCount}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRightIcon />
          </button>
        </div>
      </div>
    </>
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
