import { useEffect, useMemo, useState } from "react";

import PaginationControls from "../../components/PaginationControls";
import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
import { formatDateTime } from "../dashboard/dashboardUtils";
import {
  AuditBadge,
  AuditDateGroup,
  AuditEventShell,
  AuditIcon,
  AuditListPanel,
  AuditMetaRow,
  AuditTimeline,
  DownloadIcon,
  SearchIcon,
} from "../shared/AuditInboxUi";
import { groupItemsByDate, getRelativeTime } from "../shared/AuditInboxUtils";
import { getActivityLogData } from "./ActivityLogService";
import {
  activityDateModes,
  getAllowedActivityLogRoleFilters,
  getActivityLogPanelLabel,
  getVisibleActivityLogs,
  matchesActivityLogFilters,
} from "./activityLogUtils";

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
  if (module === "Inventory") {
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
  const [logs, setLogs] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("all");
  const [dateMode, setDateMode] = useState("all");
  const [endDate, setEndDate] = useState("");
  const [facilityId, setFacilityId] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [specificDate, setSpecificDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
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
        })
      );
    });
  }, [
    category,
    dateMode,
    endDate,
    facilityId,
    keyword,
    profile?.id,
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
    setIsLoading(true);
    setError("");

    try {
      const data = await getActivityLogData();
      setLogs(data.logs);
      setFacilities(data.facilities);
    } catch (loadError) {
      setError(loadError.message);
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

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <div className="space-y-5">
        <section className="rounded-xl border border-neutral-200 bg-white shadow-sm shadow-neutral-200/50">
          <div className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#00a36c]">
                Accountability
              </p>
              <h2 className="mt-1 text-lg font-black text-[#0d1117]">
                Activity log
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#eff4ff] px-3 py-2 text-xs font-black tabular-nums text-[#0d1117]">
                {visibleLogs.length} total
              </span>
              <button
                type="button"
                onClick={loadLogs}
                disabled={isLoading}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#00a36c] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[#007f5f] disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                <RefreshIcon className={isLoading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>

          <div className="grid gap-3 px-4 py-4 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1.3fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)_minmax(11rem,0.9fr)_minmax(10rem,0.7fr)]">
            <TopSearchField
              label="Search"
              value={keyword}
              onChange={setKeyword}
              placeholder="Search action, user, role..."
            />
            <TopSelectField
              label="Action Type"
              value={category}
              onChange={setCategory}
              options={allowedCategories}
            />
            <TopSelectField
              label="Role"
              value={roleFilter}
              onChange={setRoleFilter}
              options={allowedRoleOptions}
            />
            <TopSelectField
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
            <TopSelectField
              label="Date"
              value={dateMode}
              onChange={setDateMode}
              options={activityDateModes}
            />
          </div>

          {dateMode !== "all" && (
            <div className="grid gap-3 border-t border-neutral-100 px-4 py-4 md:grid-cols-2 xl:max-w-xl">
              {dateMode === "specific" ? (
                <TopDateField
                  label="Select Date"
                  value={specificDate}
                  onChange={setSpecificDate}
                />
              ) : (
                <>
                  <TopDateField
                    label="Start Date"
                    value={startDate}
                    onChange={setStartDate}
                  />
                  <TopDateField
                    label="End Date"
                    value={endDate}
                    onChange={setEndDate}
                  />
                </>
              )}
            </div>
          )}

          <div className="flex justify-end border-t border-neutral-100 px-4 py-3">
            <button
              type="button"
              onClick={resetFilters}
              className="h-9 rounded-lg px-3 text-xs font-black text-[#42474e] transition hover:bg-[#eff4ff] hover:text-[#0d1117]"
            >
              Reset Filters
            </button>
          </div>
        </section>

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
            action={
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-black text-[#0d1117] shadow-sm transition hover:bg-[#eff4ff]"
              >
                <DownloadIcon />
                Export
              </button>
            }
          >
            <AuditTimeline>
              {groupedLogs.map((group) => (
                <AuditDateGroup key={group.label} label={group.label}>
                  {group.items.map((log) => (
                    <ActivityLogCard key={log.id} log={log} />
                  ))}
                </AuditDateGroup>
              ))}
            </AuditTimeline>
          </AuditListPanel>
        </div>
      </div>
    </AdminShell>
  );
}

function TopSearchField({ label, onChange, placeholder, value }) {
  return (
    <label className="grid min-w-0 gap-2 text-xs font-black uppercase tracking-wide text-[#42474e]">
      {label}
      <div className="relative min-w-0">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-10 min-w-0 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium normal-case tracking-normal text-[#0d1117] outline-none transition placeholder:text-neutral-400 focus:border-[#00a36c] focus:ring-2 focus:ring-emerald-100"
        />
      </div>
    </label>
  );
}

function TopSelectField({ label, onChange, options, value }) {
  return (
    <label className="grid min-w-0 gap-2 text-xs font-black uppercase tracking-wide text-[#42474e]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-0 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-emerald-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TopDateField({ label, onChange, value }) {
  return (
    <label className="grid min-w-0 gap-2 text-xs font-black uppercase tracking-wide text-[#42474e]">
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-0 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}

function ActivityLogCard({ log }) {
  const tone = getLogTone(log.module);

  return (
    <AuditEventShell tone={tone}>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
        <AuditIcon tone={tone}>
          <ActivityIcon />
        </AuditIcon>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 break-words text-sm font-black text-[#0d1117] [overflow-wrap:anywhere]">
                  {log.action}
                </h3>
                <AuditBadge tone={tone}>{log.module}</AuditBadge>
              </div>
              <p className="mt-1 min-w-0 break-words text-sm leading-6 text-[#42474e] [overflow-wrap:anywhere]">
                {log.details}
              </p>
            </div>
            <div className="shrink-0 text-left lg:text-right">
              <p className="text-xs font-black text-[#0d1117]">
                {getRelativeTime(log.created_at)}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-neutral-400">
                {formatDateTime(new Date(log.created_at))}
              </p>
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

function RefreshIcon({ className = "" }) {
  return (
    <svg className={`h-4 w-4 ${className}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" />
    </svg>
  );
}

