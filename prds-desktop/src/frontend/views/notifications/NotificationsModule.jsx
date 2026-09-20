import { useCallback, useEffect, useMemo, useState } from "react";

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
  CheckIcon,
} from "../shared/AuditInboxUi";
import { groupItemsByDate, getRelativeTime } from "@shared/utils/AuditInboxUtils";
import {
  getNotificationData,
  updateOwnNotificationReadStatus,
} from "@backend/services/notificationService";
import { getSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import {
  getNotificationCategory,
  getNotificationPanelLabel,
  getVisibleNotifications,
  matchesNotificationFilters,
  notificationDateModes,
} from "@shared/utils/notificationUtils";

const roleFilterOptions = [
  { value: "ALL", label: "All visible roles" },
  { value: "PHARMA_II", label: "Pharmacist II" },
  { value: "PHARMA_I", label: "Pharmacist I" },
  { value: "BHW", label: "Barangay Health Worker" },
];

const roleLabels = {
  PHARMA_II: "Pharmacist II",
  PHARMA_I: "Pharmacist I",
  BHW: "Barangay Health Worker",
};

const notificationTypeFilters = [
  { value: "all", label: "All Types" },
  { value: "low_stock", label: "Low Stock" },
  { value: "requests", label: "Requests" },
  { value: "transfers", label: "Transfers" },
  { value: "facility", label: "Facility" },
  { value: "system", label: "System" },
];

const readFilterOptions = [
  { value: "all", label: "All Statuses" },
  { value: "unread", label: "Unread Only" },
  { value: "read", label: "Read Only" },
];

const getFullName = (notification) => {
  return `${notification.recipient_first_name || ""} ${notification.recipient_last_name || ""}`.trim() || "Unknown user";
};

const getNotificationMeta = (category) => {
  const meta = {
    low_stock: {
      label: "Low Stock",
      tone: "red",
      icon: <AlertIcon />,
    },
    requests: {
      label: "Request",
      tone: "amber",
      icon: <RequestIcon />,
    },
    transfers: {
      label: "Transfer",
      tone: "blue",
      icon: <TransferIcon />,
    },
    system: {
      label: "System",
      tone: "emerald",
      icon: <SystemIcon />,
    },
  };

  return meta[category] || meta.system;
};

export default function NotificationsModule() {
  const { profile } = useAuth();
  const profileId = profile?.id;
  const profileRole = profile?.role;
  const [notifications, setNotifications] = useState(() => getSnapshot(STORAGE_KEYS.NOTIFICATIONS, []));
  const [facilities, setFacilities] = useState(() => getSnapshot(STORAGE_KEYS.FACILITIES, []));
  const [selectedNotification, setSelectedNotification] = useState(null);

  // Filters State
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("all");
  const [readFilter, setReadFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [facilityId, setFacilityId] = useState("ALL");
  const [dateMode, setDateMode] = useState("all");
  const [specificDate, setSpecificDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [isLoading, setIsLoading] = useState(() => getSnapshot(STORAGE_KEYS.NOTIFICATIONS, []).length === 0);
  const [savingNotificationId, setSavingNotificationId] = useState("");
  const [error, setError] = useState("");

  const visibleNotifications = useMemo(() => {
    return getVisibleNotifications(notifications, profile);
  }, [notifications, profile]);

  const allowedRoleOptions = useMemo(() => {
    if (profileRole === "PHARMA_II") {
      return roleFilterOptions;
    }

    if (profileRole === "PHARMA_I") {
      return roleFilterOptions.filter((option) =>
        ["ALL", "PHARMA_I", "BHW"].includes(option.value)
      );
    }

    return roleFilterOptions.filter((option) =>
      ["ALL", "BHW"].includes(option.value)
    );
  }, [profileRole]);

  // Quick Pill Counts
  const counts = useMemo(() => {
    const total = visibleNotifications.length;
    let unread = 0;
    let lowStock = 0;
    let requests = 0;
    let transfers = 0;
    let system = 0;

    for (const notification of visibleNotifications) {
      if (!notification.is_read) unread++;
      const cat = getNotificationCategory(notification);
      if (cat === "low_stock") lowStock++;
      else if (cat === "requests") requests++;
      else if (cat === "transfers") transfers++;
      else system++;
    }

    return { total, unread, lowStock, requests, transfers, system };
  }, [visibleNotifications]);

  // Count active advanced filters
  const activeAdvancedCount = useMemo(() => {
    let count = 0;
    if (roleFilter !== "ALL") count++;
    if (facilityId !== "ALL") count++;
    if (dateMode !== "all") count++;
    if (readFilter !== "all") count++;
    return count;
  }, [roleFilter, facilityId, dateMode, readFilter]);

  const hasAnyFiltersActive = useMemo(() => {
    return (
      keyword.trim() !== "" ||
      category !== "all" ||
      readFilter !== "all" ||
      roleFilter !== "ALL" ||
      facilityId !== "ALL" ||
      dateMode !== "all"
    );
  }, [keyword, category, readFilter, roleFilter, facilityId, dateMode]);

  const panelLabel = useMemo(() => {
    return getNotificationPanelLabel({
      category,
      categoryOptions: notificationTypeFilters,
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

  const filteredNotifications = useMemo(() => {
    return visibleNotifications.filter((notification) => {
      return matchesNotificationFilters(notification, {
        category,
        currentUserId: profileId,
        dateMode,
        endDate,
        facilityId,
        keyword,
        readFilter,
        roleFilter,
        specificDate,
        startDate,
      });
    });
  }, [
    category,
    dateMode,
    endDate,
    facilityId,
    keyword,
    profileId,
    readFilter,
    roleFilter,
    specificDate,
    startDate,
    visibleNotifications,
  ]);

  const {
    currentPage,
    paginatedRows: paginatedNotifications,
    pageSize,
    setCurrentPage,
    totalCount,
    totalPages,
  } = usePaginatedRows(filteredNotifications);

  const groupedNotifications = useMemo(() => {
    return groupItemsByDate(paginatedNotifications, (item) => item.created_at);
  }, [paginatedNotifications]);

  const loadNotifications = useCallback(async () => {
    const cachedNotifications = getSnapshot(STORAGE_KEYS.NOTIFICATIONS, []);
    if (cachedNotifications.length === 0) {
      setIsLoading(true);
    }
    setError("");

    try {
      const data = await getNotificationData(profileId);
      if (data.error) {
        setError(`Notifications could not be refreshed: ${data.error.message || data.error}`);
      }
      if (Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
      }
      if (Array.isArray(data.facilities)) {
        setFacilities(data.facilities);
      }
    } catch (loadError) {
      if (cachedNotifications.length === 0) {
        setError(loadError.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadNotifications();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadNotifications]);

  const toggleNotificationReadStatus = async (notification) => {
    setSavingNotificationId(notification.id);
    const nextReadStatus = !notification.is_read;

    try {
      await updateOwnNotificationReadStatus({
        notificationId: notification.id,
        isRead: nextReadStatus,
        profileId,
      });
      setNotifications((currentNotifications) =>
        currentNotifications.map((item) =>
          item.id === notification.id
            ? { ...item, is_read: nextReadStatus }
            : item
        )
      );
      if (selectedNotification?.id === notification.id) {
        setSelectedNotification((prev) => (prev ? { ...prev, is_read: nextReadStatus } : null));
      }
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingNotificationId("");
    }
  };

  const resetFilters = () => {
    setKeyword("");
    setCategory("all");
    setReadFilter("all");
    setDateMode("all");
    setEndDate("");
    setFacilityId("ALL");
    setRoleFilter("ALL");
    setSpecificDate("");
    setStartDate("");
  };

  // Facility name lookup for active chips
  const activeFacilityName = useMemo(() => {
    if (facilityId === "ALL") return null;
    const found = facilities.find((f) => f.id === facilityId);
    return found ? found.facility_name : "Selected Facility";
  }, [facilities, facilityId]);

  return (
    <AdminShell profile={profile} onSignOut={logoutUser}>
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
                Alerts & Updates
              </p>
              <h2 className="mt-0.5 text-lg font-black text-[#0d1117]">
                Notifications
              </h2>
            </div>

            {/* Header Right Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#eff4ff] px-3 py-1.5 text-xs font-black tabular-nums text-[#0d1117]">
                {visibleNotifications.length} total
              </span>

              {counts.unread > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black tabular-nums text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {counts.unread} unread
                </span>
              )}

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
                aria-label="Toggle notifications filter"
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
                onClick={loadNotifications}
                disabled={isLoading}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#00a36c] px-3.5 text-xs font-black text-white shadow-sm transition hover:bg-[#007f5f] disabled:cursor-not-allowed disabled:bg-emerald-300 cursor-pointer"
              >
                <RefreshIcon className={isLoading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>

          {/* Search and Quick Filter Pills */}
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
                placeholder="Search alerts, title, user, facility..."
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
              {/* All Pill */}
              <button
                type="button"
                onClick={() => {
                  setCategory("all");
                  setReadFilter("all");
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition cursor-pointer ${
                  category === "all" && readFilter === "all"
                    ? "bg-[#0d1117] text-white shadow-xs"
                    : "bg-neutral-50 text-neutral-600 border border-neutral-200 hover:bg-neutral-100 hover:text-black"
                }`}
              >
                <span>All</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    category === "all" && readFilter === "all"
                      ? "bg-white/20"
                      : "bg-neutral-200/80 text-neutral-700"
                  }`}
                >
                  {counts.total}
                </span>
              </button>

              {/* Unread Pill */}
              <button
                type="button"
                onClick={() => {
                  setReadFilter((prev) => (prev === "unread" ? "all" : "unread"));
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition cursor-pointer ${
                  readFilter === "unread"
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "bg-neutral-50 text-neutral-600 border border-neutral-200 hover:bg-emerald-50 hover:text-emerald-800"
                }`}
              >
                <span>Unread</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    readFilter === "unread"
                      ? "bg-white/20"
                      : "bg-neutral-200/80 text-neutral-700"
                  }`}
                >
                  {counts.unread}
                </span>
              </button>

              {/* Low Stock Pill */}
              <button
                type="button"
                onClick={() => {
                  setCategory((prev) => (prev === "low_stock" ? "all" : "low_stock"));
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition cursor-pointer ${
                  category === "low_stock"
                    ? "bg-red-700 text-white shadow-xs"
                    : "bg-neutral-50 text-neutral-600 border border-neutral-200 hover:bg-red-50 hover:text-red-700"
                }`}
              >
                <span>Low Stock</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    category === "low_stock"
                      ? "bg-white/20"
                      : "bg-neutral-200/80 text-neutral-700"
                  }`}
                >
                  {counts.lowStock}
                </span>
              </button>

              {/* Requests Pill */}
              <button
                type="button"
                onClick={() => {
                  setCategory((prev) => (prev === "requests" ? "all" : "requests"));
                }}
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

              {/* Transfers Pill */}
              <button
                type="button"
                onClick={() => {
                  setCategory((prev) => (prev === "transfers" ? "all" : "transfers"));
                }}
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
            </div>
          </div>

          {/* Active Filter Removable Tags (Shown whenever any filter is applied) */}
          {hasAnyFiltersActive && (
            <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 bg-neutral-50/60 px-4 py-2 text-xs">
              <span className="font-bold text-neutral-500">Active filters:</span>

              {category !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-0.5 font-bold text-[#0d1117]">
                  Type: {notificationTypeFilters.find((f) => f.value === category)?.label || category}
                  <button
                    type="button"
                    onClick={() => setCategory("all")}
                    className="ml-1 text-neutral-400 hover:text-red-600 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              )}

              {readFilter !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-0.5 font-bold text-[#0d1117]">
                  Status: {readFilter === "unread" ? "Unread only" : "Read only"}
                  <button
                    type="button"
                    onClick={() => setReadFilter("all")}
                    className="ml-1 text-neutral-400 hover:text-red-600 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              )}

              {roleFilter !== "ALL" && (
                <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-0.5 font-bold text-[#0d1117]">
                  Role: {roleLabels[roleFilter] || roleFilter}
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
                  Date: {notificationDateModes.find((m) => m.value === dateMode)?.label || dateMode}
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
                  label="Read Status"
                  value={readFilter}
                  onChange={setReadFilter}
                  options={readFilterOptions}
                />
                <AuditSelectField
                  label="Date Range"
                  value={dateMode}
                  onChange={setDateMode}
                  options={notificationDateModes}
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

        {/* Notification List Section */}
        <div className="min-w-0">
          <AuditListPanel
            label={panelLabel}
            count={paginatedNotifications.length}
            isLoading={isLoading}
            emptyTitle="No notifications match this view"
            emptyDescription="Try another notification type, facility, role, keyword, or date range."
            footer={
              !isLoading && totalCount > 0 ? (
                <PaginationControls
                  currentPage={currentPage}
                  itemLabel="notifications"
                  onPageChange={setCurrentPage}
                  pageSize={pageSize}
                  totalCount={totalCount}
                  totalPages={totalPages}
                />
              ) : null
            }
          >
            <AuditTimeline>
              {groupedNotifications.map((group) => (
                <AuditDateGroup key={group.label} label={group.label}>
                  {group.items.map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      currentUserId={profileId}
                      isSaving={savingNotificationId === notification.id}
                      notification={notification}
                      onToggleRead={toggleNotificationReadStatus}
                      onSelect={setSelectedNotification}
                    />
                  ))}
                </AuditDateGroup>
              ))}
            </AuditTimeline>
          </AuditListPanel>
        </div>
      </div>

      {/* Full View Notification Modal */}
      {selectedNotification && (
        <NotificationDetailModal
          notification={selectedNotification}
          currentUserId={profileId}
          isSaving={savingNotificationId === selectedNotification.id}
          onToggleRead={toggleNotificationReadStatus}
          onClose={() => setSelectedNotification(null)}
        />
      )}
    </AdminShell>
  );
}

function NotificationCard({
  currentUserId,
  isSaving,
  notification,
  onToggleRead,
  onSelect,
}) {
  const category = getNotificationCategory(notification);
  const meta = getNotificationMeta(category);
  const canUpdateReadStatus = notification.user_id === currentUserId;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(notification)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(notification);
        }
      }}
      className="group block text-left outline-none cursor-pointer rounded-xl transition-all"
    >
      <AuditEventShell isUnread={!notification.is_read} tone={meta.tone}>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
          <AuditIcon tone={meta.tone}>{meta.icon}</AuditIcon>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {!notification.is_read && (
                    <span
                      className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100 shrink-0"
                      title="Unread alert"
                    />
                  )}
                  <h3 className={`min-w-0 break-words text-sm ${!notification.is_read ? "font-black text-[#0d1117]" : "font-bold text-neutral-800"} transition-colors group-hover:text-emerald-700 [overflow-wrap:anywhere]`}>
                    {notification.title}
                  </h3>
                  <AuditBadge tone={meta.tone}>{meta.label}</AuditBadge>
                </div>
                <p className="mt-1 min-w-0 break-words text-sm leading-6 text-[#42474e] [overflow-wrap:anywhere]">
                  {notification.message}
                </p>
              </div>
              <div className="shrink-0 text-left lg:text-right">
                <p className="text-xs font-black text-[#0d1117]">
                  {getRelativeTime(notification.created_at)}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-neutral-400">
                  {formatDateTime(new Date(notification.created_at))}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-start lg:justify-end gap-2">
                  {canUpdateReadStatus && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleRead(notification);
                      }}
                      disabled={isSaving}
                      aria-label={
                        notification.is_read
                          ? "Mark notification as unread"
                          : "Mark notification as read"
                      }
                      className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 text-[11px] font-black text-[#0d1117] transition hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:text-neutral-400 cursor-pointer"
                    >
                      {!notification.is_read && <CheckIcon />}
                      {isSaving
                        ? "Saving"
                        : notification.is_read
                          ? "Mark unread"
                          : "Mark read"}
                    </button>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-neutral-400 transition-colors group-hover:text-emerald-600">
                    <span>View details</span>
                    <ChevronRightIcon className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </div>
            <AuditMetaRow
              items={[
                getFullName(notification),
                roleLabels[notification.recipient_role] || "No role",
                notification.facility_name || "No facility",
                notification.is_read ? "Read" : "Unread",
              ]}
            />
          </div>
        </div>
      </AuditEventShell>
    </div>
  );
}

function NotificationDetailModal({
  notification,
  currentUserId,
  isSaving,
  onToggleRead,
  onClose,
}) {
  const [copied, setCopied] = useState(false);
  const category = notification ? getNotificationCategory(notification) : "system";
  const meta = getNotificationMeta(category);
  const canUpdateReadStatus = Boolean(notification && notification.user_id === currentUserId);

  // Extract request reference if message relates to a medicine request
  const requestInfo = useMemo(() => {
    if (!notification) return null;
    const text = `${notification.title} ${notification.message}`;
    const reqNumMatch = text.match(/#RQ-([A-Z0-9]{8})/i) || text.match(/RQ-([A-Z0-9]{8})/i);
    const uuidMatch = text.match(/[0-9a-fA-F-]{36}/);
    const hex8Match = text.match(/request\s+([0-9a-fA-F]{8})/i);

    const targetPrefix = reqNumMatch
      ? reqNumMatch[1].toLowerCase()
      : hex8Match
        ? hex8Match[1].toLowerCase()
        : uuidMatch
          ? uuidMatch[0].slice(0, 8).toLowerCase()
          : null;

    if (!targetPrefix) return null;

    const cachedRequests = getSnapshot(STORAGE_KEYS.REQUESTS, []);
    const matchingReq = cachedRequests.find(
      (r) => r.id && (r.id.toLowerCase() === targetPrefix || r.id.toLowerCase().startsWith(targetPrefix))
    );

    if (!matchingReq) return null;

    const isReleaseEvent =
      notification.title === "Request Released" ||
      notification.message.toLowerCase().includes("released") ||
      matchingReq.status === "COMPLETED" ||
      matchingReq.status === "APPROVED";

    const fulfillments = matchingReq.fulfillments || [];
    const hasFulfillments = Array.isArray(fulfillments) && fulfillments.length > 0;

    const items = (matchingReq.items || []).map((item) => {
      const releasedQty = fulfillments
        .filter((f) => f.request_item_id === item.id)
        .reduce((sum, f) => sum + Number(f.quantity || 0), 0);

      const effectiveQuantity = isReleaseEvent && hasFulfillments ? releasedQty : item.quantity;

      return {
        ...item,
        requested_quantity: item.quantity,
        released_quantity: releasedQty,
        quantity: effectiveQuantity,
        display_quantity: effectiveQuantity,
      };
    });

    return {
      requestNumber: `#RQ-${matchingReq.id.slice(0, 8).toUpperCase()}`,
      fullUuid: matchingReq.id,
      items,
      isReleaseEvent,
    };
  }, [notification]);

  if (!notification) return null;

  const handleCopyId = () => {
    if (requestInfo?.requestNumber) {
      navigator.clipboard.writeText(requestInfo.requestNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <ModalShell labelledBy="notification-detail-title" onClose={onClose} panelClassName="max-w-xl">
      <div className="w-full rounded-2xl border border-neutral-200 bg-white shadow-2xl overflow-hidden text-left">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 bg-neutral-50/70">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                meta.tone === "red"
                  ? "border-red-200 bg-red-100/70 text-red-700"
                  : meta.tone === "amber"
                    ? "border-amber-200 bg-amber-100/70 text-amber-700"
                    : meta.tone === "blue"
                      ? "border-blue-200 bg-blue-100/70 text-blue-700"
                      : "border-emerald-200 bg-emerald-100/70 text-emerald-700"
              } shrink-0`}
            >
              {meta.icon}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="notification-detail-title" className="text-base font-black text-[#0d1117]">
                  {notification.title}
                </h3>
                <AuditBadge tone={meta.tone}>{meta.label}</AuditBadge>
                <span
                  className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                    notification.is_read
                      ? "bg-neutral-100 text-neutral-600 border border-neutral-200"
                      : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  }`}
                >
                  {notification.is_read ? "Read" : "Unread"}
                </span>
              </div>
              <p className="text-xs font-semibold text-neutral-500">
                {formatDateTime(new Date(notification.created_at))} • {getRelativeTime(notification.created_at)}
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

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Transaction / Request ID Callout if request is recognized */}
          {requestInfo?.requestNumber && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
              <div className="space-y-0.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700">
                  Transaction / Request ID
                </span>
                <p className="text-base font-black text-emerald-950 font-mono tracking-tight">
                  {requestInfo.requestNumber}
                </p>
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

          <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-neutral-400">
              Notification Message
            </h4>
            <p className="mt-1.5 text-sm font-medium leading-relaxed text-[#0d1117] break-words">
              {notification.message}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 p-3.5 space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-neutral-400">
                Facility
              </span>
              <p className="text-sm font-black text-[#0d1117]">
                {notification.facility_name || "All Facilities"}
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 p-3.5 space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-neutral-400">
                Recipient
              </span>
              <p className="text-sm font-black text-[#0d1117]">
                {getFullName(notification)}
              </p>
              <p className="text-xs text-neutral-500 font-medium">
                {roleLabels[notification.recipient_role] || "All roles"}
              </p>
            </div>
          </div>

          {/* Requested / Released Medicines Breakdown Table if available */}
          {requestInfo?.items && requestInfo.items.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-neutral-400">
                {requestInfo.isReleaseEvent ? "Released Medicines" : "Requested Medicines"} ({requestInfo.items.length})
              </h4>
              <div className="rounded-xl border border-neutral-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase tracking-wider font-bold">
                    <tr>
                      <th className="px-4 py-2.5">Medicine</th>
                      <th className="px-4 py-2.5">Dosage / Form</th>
                      <th className="px-4 py-2.5 text-right">
                        {requestInfo.isReleaseEvent ? "Release Quantity" : "Quantity"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {requestInfo.items.map((item, idx) => {
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

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-100 px-6 py-3.5 bg-neutral-50/70">
          {canUpdateReadStatus ? (
            <button
              type="button"
              onClick={() => onToggleRead(notification)}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-[#0d1117] shadow-xs hover:bg-neutral-100 transition cursor-pointer disabled:cursor-not-allowed disabled:text-neutral-400"
            >
              {!notification.is_read && <CheckIcon />}
              {isSaving ? "Saving..." : notification.is_read ? "Mark as unread" : "Mark as read"}
            </button>
          ) : (
            <div />
          )}
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

function AlertIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 4.3 2.7 17.5A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.5L13.7 4.3a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function RequestIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M7 3h8l4 4v14H7V3Z" />
      <path d="M14 3v5h5M10 13h6M10 17h4" />
    </svg>
  );
}

function TransferIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <path d="M9 12h6M13 9l3 3-3 3" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-2 .4l-.1.1a1.7 1.7 0 0 0-.5 1.2V22h-4v-.1a1.7 1.7 0 0 0-.5-1.2l-.1-.1a1.7 1.7 0 0 0-2-.4l-.2.1-2-3.4.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 2-.4l.1-.1A1.7 1.7 0 0 0 10.2 2V2h4v.1a1.7 1.7 0 0 0 .5 1.2l.1.1a1.7 1.7 0 0 0 2 .4l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4h-.2a1.7 1.7 0 0 0-1.6 1Z" />
    </svg>
  );
}

function CopyIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}
