import { useEffect, useMemo, useState } from "react";

import PaginationControls from "../../components/PaginationControls";
import AdminShell from "../../components/layout/AdminShell";
import ModalShell from "../../components/ModalShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
import { formatDateTime } from "@shared/utils/dashboardUtils";
import {
  AuditBadge,
  AuditDateField,
  AuditDateGroup,
  AuditEventShell,
  AuditIcon,
  AuditListPanel,
  AuditMetaRow,
  AuditSelectField,
  AuditTimeline,
} from "../shared/AuditInboxUi";
import { groupItemsByDate, getRelativeTime } from "@shared/utils/AuditInboxUtils";
import { getActivityLogData } from "@backend/services/activityLogService";
import { getSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import {
  activityDateModes,
  getAllowedActivityLogRoleFilters,
  getActivityLogPanelLabel,
  getVisibleActivityLogs,
  matchesActivityLogFilters,
  enrichActivityDetails,
} from "@shared/utils/activityLogUtils";

const roleFilterOptions = [
  { value: "ALL", label: "All visible roles" },
  { value: "PHARMA_II", label: "Pharmacist II" },
  { value: "PHARMA_I", label: "Pharmacist I" },
  { value: "BHW", label: "Barangay Health Worker" },
];

const activityRoleLabels = {
  PHARMA_II: "Pharmacist II",
  PHARMA_I: "Pharmacist I",
  BHW: "Barangay Health Worker",
};

const getFullName = (user) => {
  return `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || "Unknown user";
};

const getActivityRoleLabel = (role) => activityRoleLabels[role] || "Unknown role";

const getLogTone = (module) => {
  if (module === "Inventory" || module === "Medicine Request" || module === "Dispensing") {
    return "emerald";
  }

  if (module === "User Account") {
    return "blue";
  }

  if (module === "Facility") {
    return "amber";
  }

  return "slate";
};

export default function ActivityLogsModule() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState(() => getSnapshot(STORAGE_KEYS.ACTIVITY_LOGS, []));
  const [facilities, setFacilities] = useState(() => getSnapshot(STORAGE_KEYS.FACILITIES, []));
  const [requests, setRequests] = useState(() => getSnapshot(STORAGE_KEYS.REQUESTS, []));
  const [patients, setPatients] = useState(() => getSnapshot(STORAGE_KEYS.PATIENTS, []));
  const [selectedLog, setSelectedLog] = useState(null);

  // Filters State
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("all");
  const [dateMode, setDateMode] = useState("all");
  const [endDate, setEndDate] = useState("");
  const [facilityId, setFacilityId] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [specificDate, setSpecificDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [isLoading, setIsLoading] = useState(() => getSnapshot(STORAGE_KEYS.ACTIVITY_LOGS, []).length === 0);
  const [error, setError] = useState("");

  const today = useMemo(() => formatDateTime(new Date()), []);
  const allowedCategories = useMemo(
    () => getAllowedActivityLogRoleFilters(profile?.role),
    [profile?.role]
  );

  const visibleLogs = useMemo(() => {
    return getVisibleActivityLogs(logs, profile);
  }, [logs, profile]);

  const allowedRoleOptions = useMemo(() => {
    if (profile?.role === "PHARMA_II") {
      return roleFilterOptions;
    }

    if (profile?.role === "PHARMA_I") {
      return roleFilterOptions.filter((option) =>
        ["ALL", "PHARMA_I", "BHW"].includes(option.value)
      );
    }

    return roleFilterOptions.filter((option) =>
      ["ALL", "BHW"].includes(option.value)
    );
  }, [profile?.role]);

  // Quick Pill Counts
  const counts = useMemo(() => {
    const total = visibleLogs.length;
    let inventory = 0;
    let dispensing = 0;
    let requestsCount = 0;
    let transfers = 0;
    let patientsCount = 0;

    for (const log of visibleLogs) {
      if (log.module === "Inventory") inventory++;
      else if (log.module === "Dispensing") dispensing++;
      else if (log.module === "Medicine Request") requestsCount++;
      else if (log.module === "Stock Transfer" || log.module === "Transfer") transfers++;
      else if (log.module === "Patients" || log.module === "Patient Registry") patientsCount++;
    }

    return {
      total,
      inventory,
      dispensing,
      requests: requestsCount,
      transfers,
      patients: patientsCount,
    };
  }, [visibleLogs]);

  // Count active advanced filters
  const activeAdvancedCount = useMemo(() => {
    let count = 0;
    if (roleFilter !== "ALL") count++;
    if (facilityId !== "ALL") count++;
    if (dateMode !== "all") count++;
    return count;
  }, [roleFilter, facilityId, dateMode]);

  const hasAnyFiltersActive = useMemo(() => {
    return (
      keyword.trim() !== "" ||
      category !== "all" ||
      roleFilter !== "ALL" ||
      facilityId !== "ALL" ||
      dateMode !== "all"
    );
  }, [keyword, category, roleFilter, facilityId, dateMode]);

  const panelLabel = useMemo(() => {
    return getActivityLogPanelLabel({
      category,
      categoryOptions: allowedCategories,
      dateMode,
      endDate,
      facilities,
      facilityId,
      roleFilter,
      roleOptions: allowedRoleOptions,
      specificDate,
      startDate,
    });
  }, [
    allowedCategories,
    allowedRoleOptions,
    category,
    dateMode,
    endDate,
    facilities,
    facilityId,
    roleFilter,
    specificDate,
    startDate,
  ]);

  const filteredLogs = useMemo(() => {
    return visibleLogs.filter((log) => {
      return (
        (roleFilter === "ALL" || log.user?.role === roleFilter) &&
        matchesActivityLogFilters(log, {
          category,
          currentUserId: profile?.id,
          dateMode,
          endDate,
          facilityId,
          keyword,
          selfOnly: false,
          specificDate,
          startDate,
          requests,
          facilities,
          patients,
        })
      );
    });
  }, [
    category,
    dateMode,
    endDate,
    facilities,
    facilityId,
    keyword,
    patients,
    profile?.id,
    requests,
    roleFilter,
    specificDate,
    startDate,
    visibleLogs,
  ]);

  const {
    currentPage,
    paginatedRows: paginatedLogs,
    pageSize,
    setCurrentPage,
    totalCount,
    totalPages,
  } = usePaginatedRows(filteredLogs);

  const groupedLogs = useMemo(() => {
    return groupItemsByDate(paginatedLogs, (log) => log.created_at);
  }, [paginatedLogs]);

  const loadLogs = async () => {
    const cachedLogs = getSnapshot(STORAGE_KEYS.ACTIVITY_LOGS, []);
    if (cachedLogs.length === 0) {
      setIsLoading(true);
    }
    setError("");

    try {
      const data = await getActivityLogData();
      if (data.error) {
        setError(`Activity logs could not be refreshed: ${data.error.message || data.error}`);
      }
      if (Array.isArray(data.logs)) {
        setLogs(data.logs);
      }
      if (Array.isArray(data.facilities)) {
        setFacilities(data.facilities);
      }
      if (Array.isArray(data.requests)) {
        setRequests(data.requests);
      }
      if (Array.isArray(data.patients)) {
        setPatients(data.patients);
      }
    } catch (loadError) {
      if (cachedLogs.length === 0) {
        setError(loadError.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadLogs();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const resetFilters = () => {
    setKeyword("");
    setCategory("all");
    setDateMode("all");
    setEndDate("");
    setFacilityId("ALL");
    setRoleFilter("ALL");
    setSpecificDate("");
    setStartDate("");
  };

  // Active facility name lookup
  const activeFacilityName = useMemo(() => {
    if (facilityId === "ALL") return null;
    const found = facilities.find((f) => f.id === facilityId);
    return found ? found.facility_name : "Selected Facility";
  }, [facilities, facilityId]);

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <div className="space-y-5">
        {/* Main Header & Toolbar Card */}
        <section className="rounded-xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/50">
          {/* Header Row */}
          <div className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#00a36c]">
                Accountability
              </p>
              <h2 className="mt-0.5 text-lg font-black text-[#0d1117]">
                Activity log
              </h2>
            </div>

            {/* Header Right Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#eff4ff] px-3 py-1.5 text-xs font-black tabular-nums text-[#0d1117]">
                {visibleLogs.length} total
              </span>

              {/* Filter Button */}
              <button
                type="button"
                onClick={() => setShowFilters((prev) => !prev)}
                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-black transition cursor-pointer ${
                  showFilters || activeAdvancedCount > 0
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-xs ring-1 ring-emerald-200"
                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:text-black"
                }`}
                aria-expanded={showFilters}
                aria-label="Toggle activity log filters"
              >
                <FilterIcon className="h-3.5 w-3.5" />
                <span>Filter</span>
                {activeAdvancedCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-700 px-1 text-[10px] font-black text-white">
                    {activeAdvancedCount}
                  </span>
                )}
                <ChevronDownIcon
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    showFilters ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={loadLogs}
                disabled={isLoading}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#00a36c] px-3.5 text-xs font-black text-white shadow-sm transition hover:bg-[#007f5f] disabled:cursor-not-allowed disabled:bg-emerald-300 cursor-pointer"
              >
                <RefreshIcon className={isLoading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>

          {/* Search and Quick Activity Filter Pills */}
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Search Input */}
            <div className="relative min-w-0 sm:w-80">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                <SearchIcon className="h-4 w-4" />
              </span>
              <input
                type="search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Search action, user, ID, facility..."
                className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-8 text-xs font-semibold text-[#0d1117] outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  aria-label="Clear search"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Quick Pills */}
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {/* All Activity */}
              <button
                type="button"
                onClick={() => setCategory("all")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition cursor-pointer ${
                  category === "all"
                    ? "bg-[#0d1117] text-white shadow-xs"
                    : "bg-neutral-50 text-neutral-600 border border-neutral-200 hover:bg-neutral-100 hover:text-black"
                }`}
              >
                <span>All</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    category === "all"
                      ? "bg-white/20"
                      : "bg-neutral-200/80 text-neutral-700"
                  }`}
                >
                  {counts.total}
                </span>
              </button>

              {/* Inventory */}
              <button
                type="button"
                onClick={() => setCategory((prev) => (prev === "inventory" ? "all" : "inventory"))}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition cursor-pointer ${
                  category === "inventory"
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "bg-neutral-50 text-neutral-600 border border-neutral-200 hover:bg-emerald-50 hover:text-emerald-800"
                }`}
              >
                <span>Inventory</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    category === "inventory"
                      ? "bg-white/20"
                      : "bg-neutral-200/80 text-neutral-700"
                  }`}
                >
                  {counts.inventory}
                </span>
              </button>

              {/* Dispensing */}
              <button
                type="button"
                onClick={() => setCategory((prev) => (prev === "dispensing" ? "all" : "dispensing"))}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition cursor-pointer ${
                  category === "dispensing"
                    ? "bg-teal-700 text-white shadow-xs"
                    : "bg-neutral-50 text-neutral-600 border border-neutral-200 hover:bg-teal-50 hover:text-teal-800"
                }`}
              >
                <span>Dispensing</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    category === "dispensing"
                      ? "bg-white/20"
                      : "bg-neutral-200/80 text-neutral-700"
                  }`}
                >
                  {counts.dispensing}
                </span>
              </button>

              {/* Medicine Requests */}
              <button
                type="button"
                onClick={() => setCategory((prev) => (prev === "requests" ? "all" : "requests"))}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition cursor-pointer ${
                  category === "requests"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "bg-neutral-50 text-neutral-600 border border-neutral-200 hover:bg-amber-50 hover:text-amber-800"
                }`}
              >
                <span>Requests</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    category === "requests"
                      ? "bg-white/20"
                      : "bg-neutral-200/80 text-neutral-700"
                  }`}
                >
                  {counts.requests}
                </span>
              </button>

              {/* Stock Transfers */}
              <button
                type="button"
                onClick={() => setCategory((prev) => (prev === "transfers" ? "all" : "transfers"))}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition cursor-pointer ${
                  category === "transfers"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-neutral-50 text-neutral-600 border border-neutral-200 hover:bg-blue-50 hover:text-blue-800"
                }`}
              >
                <span>Transfers</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    category === "transfers"
                      ? "bg-white/20"
                      : "bg-neutral-200/80 text-neutral-700"
                  }`}
                >
                  {counts.transfers}
                </span>
              </button>

              {/* Patients */}
              <button
                type="button"
                onClick={() => setCategory((prev) => (prev === "patients" ? "all" : "patients"))}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition cursor-pointer ${
                  category === "patients"
                    ? "bg-purple-700 text-white shadow-xs"
                    : "bg-neutral-50 text-neutral-600 border border-neutral-200 hover:bg-purple-50 hover:text-purple-800"
                }`}
              >
                <span>Patients</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    category === "patients"
                      ? "bg-white/20"
                      : "bg-neutral-200/80 text-neutral-700"
                  }`}
                >
                  {counts.patients}
                </span>
              </button>
            </div>
          </div>

          {/* Active Filter Removable Tags (Shown whenever any filter is active) */}
          {hasAnyFiltersActive && (
            <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 bg-neutral-50/60 px-4 py-2 text-xs">
              <span className="font-bold text-neutral-500">Active filters:</span>

              {category !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-0.5 font-bold text-[#0d1117]">
                  Action: {allowedCategories.find((c) => c.value === category)?.label || category}
                  <button
                    type="button"
                    onClick={() => setCategory("all")}
                    className="ml-1 text-neutral-400 hover:text-red-600 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              )}

              {roleFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-0.5 font-bold text-[#0d1117]">
                  Role: {activityRoleLabels[roleFilter] || roleFilter}
                  <button
                    type="button"
                    onClick={() => setRoleFilter("ALL")}
                    className="ml-1 text-neutral-400 hover:text-red-600 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              )}

              {facilityId !== "ALL" && activeFacilityName && (
                <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-0.5 font-bold text-[#0d1117]">
                  Facility: {activeFacilityName}
                  <button
                    type="button"
                    onClick={() => setFacilityId("ALL")}
                    className="ml-1 text-neutral-400 hover:text-red-600 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              )}

              {dateMode !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-0.5 font-bold text-[#0d1117]">
                  Date: {activityDateModes.find((m) => m.value === dateMode)?.label || dateMode}
                  <button
                    type="button"
                    onClick={() => {
                      setDateMode("all");
                      setSpecificDate("");
                      setStartDate("");
                      setEndDate("");
                    }}
                    className="ml-1 text-neutral-400 hover:text-red-600 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              )}

              {keyword && (
                <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-0.5 font-bold text-[#0d1117]">
                  "{keyword}"
                  <button
                    type="button"
                    onClick={() => setKeyword("")}
                    className="ml-1 text-neutral-400 hover:text-red-600 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              )}

              <button
                type="button"
                onClick={resetFilters}
                className="ml-auto font-black text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
              >
                Reset All
              </button>
            </div>
          )}

          {/* Collapsible Advanced Filters Drawer */}
          {showFilters && (
            <div className="border-t border-neutral-200 bg-neutral-50/40 p-4 transition-all">
              <div className="flex items-center justify-between pb-3">
                <span className="text-xs font-black uppercase tracking-wider text-neutral-500">
                  Advanced Filters
                </span>
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-neutral-500 hover:text-black cursor-pointer"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                  <span>Close Drawer</span>
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <AuditSelectField
                  label="Action Type"
                  value={category}
                  onChange={setCategory}
                  options={allowedCategories}
                />
                <AuditSelectField
                  label="Role"
                  value={roleFilter}
                  onChange={setRoleFilter}
                  options={allowedRoleOptions}
                />
                <AuditSelectField
                  label="Facility"
                  value={facilityId}
                  onChange={setFacilityId}
                  options={[
                    { value: "ALL", label: "All Facilities" },
                    ...facilities.map((facility) => ({
                      value: facility.id,
                      label: facility.facility_name,
                    })),
                  ]}
                />
                <AuditSelectField
                  label="Date Range"
                  value={dateMode}
                  onChange={setDateMode}
                  options={activityDateModes}
                />
              </div>

              {dateMode !== "all" && (
                <div className="mt-3 grid gap-3 border-t border-neutral-200/60 pt-3 md:grid-cols-2 xl:max-w-xl">
                  {dateMode === "specific" ? (
                    <AuditDateField
                      label="Select Date"
                      value={specificDate}
                      onChange={setSpecificDate}
                    />
                  ) : (
                    <>
                      <AuditDateField
                        label="Start Date"
                        value={startDate}
                        onChange={setStartDate}
                      />
                      <AuditDateField
                        label="End Date"
                        value={endDate}
                        onChange={setEndDate}
                      />
                    </>
                  )}
                </div>
              )}

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-neutral-200/60 pt-3">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="h-8 rounded-lg px-3 text-xs font-bold text-neutral-600 transition hover:bg-neutral-200 hover:text-black cursor-pointer"
                >
                  Clear Filters
                </button>
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="h-8 rounded-lg bg-[#0d1117] px-4 text-xs font-bold text-white transition hover:bg-neutral-800 cursor-pointer"
                >
                  Apply & Close
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Activity List Section */}
        <div className="min-w-0">
          <AuditListPanel
            label={panelLabel}
            count={paginatedLogs.length}
            isLoading={isLoading}
            emptyTitle="No activity logs match this view"
            emptyDescription="Try another action category, facility, role, keyword, or date range."
            footer={
              !isLoading && totalCount > 0 ? (
                <PaginationControls
                  currentPage={currentPage}
                  itemLabel="activity logs"
                  onPageChange={setCurrentPage}
                  pageSize={pageSize}
                  totalCount={totalCount}
                  totalPages={totalPages}
                />
              ) : null
            }
          >
            <AuditTimeline>
              {groupedLogs.map((group) => (
                <AuditDateGroup key={group.label} label={group.label}>
                  {group.items.map((log) => (
                    <ActivityLogCard
                      key={log.id}
                      log={log}
                      requests={requests}
                      facilities={facilities}
                      patients={patients}
                      onSelect={setSelectedLog}
                    />
                  ))}
                </AuditDateGroup>
              ))}
            </AuditTimeline>
          </AuditListPanel>
        </div>
      </div>

      {/* Full View Activity Log Modal */}
      {selectedLog && (
        <ActivityDetailModal
          log={selectedLog}
          requests={requests}
          facilities={facilities}
          patients={patients}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </AdminShell>
  );
}

function ActivityLogCard({
  log,
  requests = [],
  facilities = [],
  patients = [],
  onSelect,
}) {
  const tone = getLogTone(log.module);

  const enriched = useMemo(() => {
    return enrichActivityDetails(log, { requests, facilities, patients });
  }, [log, requests, facilities, patients]);

  // Clean highlight summary for initial timeline display
  const highlightSummary = useMemo(() => {
    if (enriched.requestNumber && enriched.facilityName) {
      if (log.action === "Paper Request Encoded") {
        return `Encoded paper request ${enriched.requestNumber} for ${enriched.facilityName}`;
      }
      if (log.action.toLowerCase().includes("approved")) {
        return `Approved request ${enriched.requestNumber} for ${enriched.facilityName}`;
      }
      if (log.action.toLowerCase().includes("rejected")) {
        return `Rejected request ${enriched.requestNumber} for ${enriched.facilityName}`;
      }
      if (log.action.toLowerCase().includes("released")) {
        return `Released request ${enriched.requestNumber} for ${enriched.facilityName}`;
      }
      return `Request ${enriched.requestNumber} for ${enriched.facilityName}`;
    }
    return enriched.text || log.details;
  }, [enriched, log.action, log.details]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(log)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(log);
        }
      }}
      className="group block text-left outline-none cursor-pointer rounded-xl transition-all"
    >
      <AuditEventShell tone={tone}>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
          <AuditIcon tone={tone}>
            <ActivityIcon />
          </AuditIcon>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 break-words text-sm font-black text-[#0d1117] transition-colors group-hover:text-emerald-700 [overflow-wrap:anywhere]">
                    {log.action}
                  </h3>
                  <AuditBadge tone={tone}>{log.module}</AuditBadge>
                  {enriched.requestNumber && (
                    <span className="font-mono text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded">
                      {enriched.requestNumber}
                    </span>
                  )}
                  {enriched.items && enriched.items.length > 0 && (
                    <span className="text-[11px] font-semibold text-neutral-500 bg-neutral-100 border border-neutral-200 px-1.5 py-0.5 rounded">
                      {enriched.items.length} {enriched.items.length === 1 ? "medicine" : "medicines"}
                    </span>
                  )}
                </div>

                {/* Clean, uncluttered highlight sentence */}
                <p className="mt-1 min-w-0 break-words text-sm leading-6 text-[#42474e] [overflow-wrap:anywhere]">
                  {highlightSummary}
                </p>
              </div>

              <div className="shrink-0 text-left lg:text-right">
                <p className="text-xs font-black text-[#0d1117]">
                  {getRelativeTime(log.created_at)}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-neutral-400">
                  {formatDateTime(new Date(log.created_at))}
                </p>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-neutral-400 transition-colors group-hover:text-emerald-600">
                  <span>View full details</span>
                  <ChevronRightIcon className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </div>

            <AuditMetaRow
              items={[
                getFullName(log.user),
                getActivityRoleLabel(log.user?.role),
                log.user?.facility?.facility_name || "No facility",
              ]}
            />
          </div>
        </div>
      </AuditEventShell>
    </div>
  );
}

function ActivityDetailModal({
  log,
  requests = [],
  facilities = [],
  patients = [],
  onClose,
}) {
  const [copied, setCopied] = useState(false);
  const tone = getLogTone(log?.module);

  const enriched = useMemo(() => {
    if (!log) return {};
    return enrichActivityDetails(log, { requests, facilities, patients });
  }, [log, requests, facilities, patients]);

  const displayId = useMemo(() => {
    if (enriched.requestNumber) return enriched.requestNumber;
    const txMatch = (log?.details || "").match(/transaction\s+([A-Za-z0-9-]+)/i);
    if (txMatch && txMatch[1]) {
      const code = txMatch[1].trim();
      return code.length > 12 ? `#ID-${code.slice(0, 8).toUpperCase()}` : code;
    }
    const trMatch = (log?.details || "").match(/(#[A-Za-z0-9_-]+)/);
    if (trMatch && trMatch[1]) {
      return trMatch[1].trim();
    }
    if (enriched.fullUuid) {
      return `#ID-${enriched.fullUuid.slice(0, 8).toUpperCase()}`;
    }
    return null;
  }, [enriched.requestNumber, enriched.fullUuid, log?.details]);

  if (!log) return null;

  const handleCopyId = (e) => {
    e?.stopPropagation();
    if (displayId && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(displayId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <ModalShell labelledBy="activity-detail-title" onClose={onClose} panelClassName="max-w-2xl">
      <div className="w-full rounded-2xl border border-neutral-200 bg-white shadow-2xl overflow-hidden text-left">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 bg-neutral-50/70">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-100/70 text-emerald-800 shrink-0">
              <ActivityIcon />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="activity-detail-title" className="text-base font-black text-[#0d1117]">
                  {log.action}
                </h3>
                <AuditBadge tone={tone}>{log.module}</AuditBadge>
              </div>
              <p className="text-xs font-semibold text-neutral-500">
                {formatDateTime(new Date(log.created_at))} • {getRelativeTime(log.created_at)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 transition cursor-pointer"
            aria-label="Close modal"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Prominent ID Banner without raw UUID */}
          {displayId && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="min-w-0">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800">
                  Transaction / Request ID
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-mono text-base font-black text-emerald-950">
                    {displayId}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyId}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-black text-emerald-900 shadow-xs hover:bg-emerald-100 transition cursor-pointer shrink-0"
              >
                {copied ? <CheckIcon className="h-3.5 w-3.5 text-emerald-600" /> : <CopyIcon className="h-3.5 w-3.5 text-emerald-700" />}
                {copied ? "Copied ID!" : "Copy ID"}
              </button>
            </div>
          )}

          {/* Event Details Narrative Callout */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-neutral-400">
              Event Details
            </h4>
            <p className="mt-1 text-sm font-medium leading-relaxed text-[#0d1117] break-words">
              {enriched.text || log.details}
            </p>
          </div>

          {/* Overview Grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Target Facility */}
            <div className="rounded-xl border border-neutral-200 p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-neutral-400">
                <FacilityIcon className="h-3.5 w-3.5 text-neutral-500" />
                <span>Target Facility</span>
              </div>
              <p className="text-sm font-black text-[#0d1117]">
                {enriched.facilityName || log.user?.facility?.facility_name || "Central Office"}
              </p>
            </div>

            {/* Performed By */}
            <div className="rounded-xl border border-neutral-200 p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-neutral-400">
                <UserIcon className="h-3.5 w-3.5 text-neutral-500" />
                <span>Performed By</span>
              </div>
              <p className="text-sm font-black text-[#0d1117]">
                {getFullName(log.user)}
              </p>
              <p className="text-xs text-neutral-500 font-medium">
                {getActivityRoleLabel(log.user?.role)} • {log.user?.facility?.facility_name || "Central Office"}
              </p>
            </div>

            {/* Requester if present */}
            {enriched.requesterName && (
              <div className="rounded-xl border border-neutral-200 p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-neutral-400">
                  <UserIcon className="h-3.5 w-3.5 text-neutral-500" />
                  <span>Requested By</span>
                </div>
                <p className="text-sm font-black text-[#0d1117]">
                  {enriched.requesterName}
                </p>
              </div>
            )}

            {/* Patient if present */}
            {enriched.patient && (
              <div className="rounded-xl border border-neutral-200 p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-neutral-400">
                  <UserIcon className="h-3.5 w-3.5 text-neutral-500" />
                  <span>Patient</span>
                </div>
                <p className="text-sm font-black text-[#0d1117]">
                  {`${enriched.patient.first_name || ""} ${enriched.patient.last_name || ""}`.trim()}
                </p>
                {enriched.patient.patient_code && (
                  <p className="text-xs font-mono text-neutral-500 font-semibold">
                    {enriched.patient.patient_code}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Requested / Released Medicines Breakdown Table */}
          {enriched.items && enriched.items.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-neutral-400">
                {enriched.isReleaseEvent ? "Released Medicines" : "Requested Medicines"} ({enriched.items.length})
              </h4>
              <div className="rounded-xl border border-neutral-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase tracking-wider font-bold">
                    <tr>
                      <th className="px-4 py-2.5">Medicine</th>
                      <th className="px-4 py-2.5">Dosage / Form</th>
                      <th className="px-4 py-2.5 text-right">
                        {enriched.isReleaseEvent ? "Release Quantity" : "Quantity"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {enriched.items.map((item, idx) => {
                      const med = item.medicine || {};
                      const genericName = med.generic_name || item.medicine_name || item.generic_name || "Medicine";
                      const brandName = med.brand_name;
                      const dosage = med.dosage || "—";
                      const qty = item.display_quantity != null ? item.display_quantity : (item.quantity != null ? item.quantity : "—");
                      return (
                        <tr key={idx} className="hover:bg-neutral-50/50">
                          <td className="px-4 py-2.5 font-bold text-[#0d1117]">
                            {genericName}
                            {brandName && <span className="text-neutral-400 font-normal ml-1">({brandName})</span>}
                          </td>
                          <td className="px-4 py-2.5 text-neutral-600 font-medium">
                            {dosage}
                          </td>
                          <td className="px-4 py-2.5 text-right font-black text-emerald-800 tabular-nums">
                            {qty} units
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end border-t border-neutral-100 px-6 py-3.5 bg-neutral-50/70">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg bg-[#00a36c] px-5 text-xs font-black text-white shadow-sm transition hover:bg-[#007f5f] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// Icons
function FilterIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function RefreshIcon({ className = "" }) {
  return (
    <svg className={`h-4 w-4 ${className}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" />
    </svg>
  );
}

function ChevronDownIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ChevronRightIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function SearchIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CloseIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function CopyIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <rect height="13" rx="2" ry="2" width="13" x="9" y="9" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function FacilityIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
    </svg>
  );
}

function UserIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
