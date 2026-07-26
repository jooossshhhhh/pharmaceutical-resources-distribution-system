import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { formatDateTime } from "../dashboard/dashboardUtils";
import { getActivityLogData } from "./ActivityLogService";
import {
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

const getFullName = (user) => {
  return `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || "Unknown user";
};

const activityRoleLabels = {
  PHARMA_II: "Pharmacist II",
  PHARMA_I: "Pharmacist I",
  BHW: "Barangay Health Worker",
};

const getActivityRoleLabel = (role) => activityRoleLabels[role] || "Unknown role";

const getLogTone = (module) => {
  if (module === "Inventory") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (module === "User Account") {
    return "bg-blue-100 text-blue-700";
  }

  if (module === "Facility") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-neutral-100 text-neutral-700";
};

export default function ActivityLogsModule() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("all");
  const [facilityId, setFacilityId] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
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
      facilities,
      facilityId,
      roleFilter,
      roleOptions: allowedRoleOptions,
    });
  }, [allowedCategories, allowedRoleOptions, category, facilities, facilityId, roleFilter]);

  const filteredLogs = useMemo(() => {
    return visibleLogs.filter((log) => {
      return (
        (roleFilter === "ALL" || log.user?.role === roleFilter) &&
        matchesActivityLogFilters(log, {
          category,
          currentUserId: profile?.id,
          facilityId,
          keyword,
          selfOnly: false,
        })
      );
    });
  }, [category, facilityId, keyword, profile?.id, roleFilter, visibleLogs]);

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

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[250px_1fr]">
        <aside className="h-fit rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">
            Filter Logs
          </h2>

          <label className="mt-4 grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-500">
            Search Keywords
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                <SearchIcon />
              </span>
              <input
                type="search"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Search logs..."
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium normal-case tracking-normal text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </label>

          <div className="mt-4">
            <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
              Action Category
            </p>
            <div className="mt-2 grid gap-2">
              {allowedCategories.map((filter) => (
                <label key={filter.value} className="flex items-center gap-2 text-sm font-bold text-neutral-700">
                  <input
                    type="radio"
                    name="activity-category"
                    checked={category === filter.value}
                    onChange={() => setCategory(filter.value)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  {filter.label}
                </label>
              ))}
            </div>
          </div>

          <SelectField
            label="Filter by Role"
            value={roleFilter}
            onChange={setRoleFilter}
            options={allowedRoleOptions}
          />

          <SelectField
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

          <button
            type="button"
            onClick={() => {
              setKeyword("");
              setCategory("all");
              setFacilityId("ALL");
              setRoleFilter("ALL");
            }}
            className="mt-5 h-10 w-full rounded-lg bg-black text-sm font-black text-white hover:bg-neutral-800"
          >
            Reset Filters
          </button>
        </aside>

        <section className="self-start overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
                {panelLabel}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-xs font-black text-neutral-500">
                {filteredLogs.length} shown
              </p>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-700 shadow-sm hover:bg-neutral-50"
              >
                <DownloadIcon />
                Export
              </button>
            </div>
          </div>

          <div className="max-h-[68vh] overflow-y-auto p-4">
            {isLoading ? (
              <p className="py-8 text-center text-sm font-bold text-neutral-500">
                Loading activity logs...
              </p>
            ) : filteredLogs.length === 0 ? (
              <p className="py-8 text-center text-sm font-bold text-neutral-500">
                No activity logs match the current filters.
              </p>
            ) : (
              <div className="relative space-y-3 before:absolute before:bottom-0 before:left-2 before:top-2 before:w-px before:bg-neutral-200">
                {filteredLogs.map((log) => (
                  <article key={log.id} className="relative pl-8">
                    <span className="absolute left-0 top-2 h-4 w-4 rounded-full border-4 border-white bg-emerald-500 shadow ring-1 ring-neutral-200" />
                    <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-black text-black">{log.action}</h3>
                            <span className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-wide ${getLogTone(log.module)}`}>
                              {log.module}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-6 text-neutral-600">
                            {log.details}
                          </p>
                        </div>
                        <span className="text-xs font-black text-neutral-400">
                          {formatDateTime(new Date(log.created_at))}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-neutral-500">
                        <span>{getFullName(log.user)}</span>
                        <span>{getActivityRoleLabel(log.user?.role)}</span>
                        <span>{log.user?.facility?.facility_name || "No facility"}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="mt-4 grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-500">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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

const SearchIcon = () => (
  <svg
    aria-hidden="true"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const DownloadIcon = () => (
  <svg
    aria-hidden="true"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);
