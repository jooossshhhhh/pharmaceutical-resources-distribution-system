import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { formatDateTime } from "../dashboard/dashboardUtils";
import {
  AuditBadge,
  AuditDateField,
  AuditDateGroup,
  AuditEventShell,
  AuditFilterPanel,
  AuditIcon,
  AuditListPanel,
  AuditMetaRow,
  AuditRadioGroup,
  AuditSearchField,
  AuditSelectField,
  AuditSummaryCard,
  AuditSummaryGrid,
  AuditTimeline,
  DownloadIcon,
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

  const summaryCounts = useMemo(() => {
    const countCategory = (summaryCategory) =>
      visibleLogs.filter((log) =>
        matchesActivityLogFilters(log, {
          category: summaryCategory,
          currentUserId: profile?.id,
          dateMode: "all",
          facilityId: "ALL",
          keyword: "",
          selfOnly: false,
        })
      ).length;

    return {
      all: visibleLogs.length,
      self: countCategory("self"),
      inventory: countCategory("inventory"),
      profile: countCategory("profile"),
    };
  }, [profile?.id, visibleLogs]);

  const groupedLogs = useMemo(() => {
    return groupItemsByDate(filteredLogs, (log) => log.created_at);
  }, [filteredLogs]);

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

  const canViewProfileChanges = allowedCategories.some(
    (filter) => filter.value === "profile"
  );

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <div className="space-y-5">
        <AuditSummaryGrid>
          <AuditSummaryCard
            count={summaryCounts.all}
            icon={<ActivityIcon />}
            isActive={category === "all"}
            label="Visible Logs"
            meta="All activity you can access."
            onClick={() => setCategory("all")}
            tone="slate"
          />
          <AuditSummaryCard
            count={summaryCounts.self}
            icon={<UserIcon />}
            isActive={category === "self"}
            label="My Activity"
            meta="Actions tied to your account."
            onClick={() => setCategory("self")}
            tone="emerald"
          />
          <AuditSummaryCard
            count={summaryCounts.inventory}
            icon={<InventoryIcon />}
            isActive={category === "inventory"}
            label="Inventory Updates"
            meta="Stock and batch adjustments."
            onClick={() => setCategory("inventory")}
            tone="amber"
          />
          {canViewProfileChanges && (
            <AuditSummaryCard
              count={summaryCounts.profile}
              icon={<ProfileIcon />}
              isActive={category === "profile"}
              label="Profile Changes"
              meta="Account and facility changes."
              onClick={() => setCategory("profile")}
              tone="blue"
            />
          )}
        </AuditSummaryGrid>

        <div className="grid items-start gap-5 xl:grid-cols-[270px_1fr]">
          <AuditFilterPanel title="Activity Logs" onReset={resetFilters}>
            <AuditSearchField
              label="Search Keywords"
              value={keyword}
              onChange={setKeyword}
              placeholder="Search action, user, role..."
            />

            <AuditRadioGroup
              label="Action Category"
              name="activity-category"
              value={category}
              onChange={setCategory}
              options={allowedCategories}
            />

            <AuditSelectField
              label="Filter by Role"
              value={roleFilter}
              onChange={setRoleFilter}
              options={allowedRoleOptions}
            />

            <AuditSelectField
              label="Filter by Facility"
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
              label="Date Filter"
              value={dateMode}
              onChange={setDateMode}
              options={activityDateModes}
            />

            {dateMode === "specific" && (
              <AuditDateField
                label="Select Date"
                value={specificDate}
                onChange={setSpecificDate}
              />
            )}

            {dateMode === "range" && (
              <div className="grid gap-3">
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
              </div>
            )}
          </AuditFilterPanel>

          <AuditListPanel
            label={panelLabel}
            count={filteredLogs.length}
            isLoading={isLoading}
            emptyTitle="No activity logs match this view"
            emptyDescription="Try another action category, facility, role, keyword, or date range."
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

function ActivityLogCard({ log }) {
  const tone = getLogTone(log.module);

  return (
    <AuditEventShell tone={tone}>
      <div className="flex items-start gap-3">
        <AuditIcon tone={tone}>
          <ActivityIcon />
        </AuditIcon>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-black text-[#0d1117]">{log.action}</h3>
                <AuditBadge tone={tone}>{log.module}</AuditBadge>
              </div>
              <p className="mt-1 text-sm leading-6 text-[#42474e]">{log.details}</p>
            </div>
            <div className="text-right">
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

function InventoryIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="m12 3 8 4-8 4-8-4 8-4Z" />
      <path d="m4 11 8 4 8-4" />
      <path d="m4 15 8 4 8-4" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
      <path d="m17 11 2 2 4-4" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <circle cx="10" cy="8" r="4" />
      <path d="M3 21a7 7 0 0 1 14 0" />
      <path d="M19 8v6M16 11h6" />
    </svg>
  );
}

