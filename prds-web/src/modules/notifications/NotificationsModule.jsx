import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { formatDateTime } from "../dashboard/dashboardUtils";
import { getNotificationData, markOwnNotificationsRead } from "./NotificationService";
import {
  getNotificationCategory,
  getNotificationPanelLabel,
  getVisibleNotifications,
  matchesNotificationFilters,
  notificationCategories,
  notificationDateModes,
  notificationReadFilters,
} from "./notificationUtils";

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

const getFullName = (notification) => {
  return `${notification.recipient_first_name || ""} ${notification.recipient_last_name || ""}`.trim() || "Unknown user";
};

const getRelativeTime = (dateString) => {
  if (!dateString) {
    return "";
  }

  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  return `${Math.round(diffHours / 24)} d ago`;
};

const getNotificationMeta = (category) => {
  const meta = {
    low_stock: {
      badge: "bg-red-100 text-red-700",
      dot: "bg-red-500",
      iconWrap: "bg-red-50 text-red-500",
      label: "Low Stock",
      icon: <AlertIcon />,
    },
    requests: {
      badge: "bg-amber-100 text-amber-700",
      dot: "bg-amber-500",
      iconWrap: "bg-amber-100 text-amber-600",
      label: "Request",
      icon: <RequestIcon />,
    },
    transfers: {
      badge: "bg-blue-100 text-blue-700",
      dot: "bg-blue-500",
      iconWrap: "bg-blue-100 text-blue-600",
      label: "Transfer",
      icon: <TransferIcon />,
    },
    system: {
      badge: "bg-emerald-100 text-emerald-700",
      dot: "bg-emerald-500",
      iconWrap: "bg-emerald-100 text-emerald-600",
      label: "System",
      icon: <SystemIcon />,
    },
  };

  return meta[category] || meta.system;
};

export default function NotificationsModule() {
  const { profile } = useAuth();
  const profileFacilityId = profile?.facility_id;
  const profileId = profile?.id;
  const profileRole = profile?.role;
  const [notifications, setNotifications] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("all");
  const [dateMode, setDateMode] = useState("all");
  const [endDate, setEndDate] = useState("");
  const [facilityId, setFacilityId] = useState("ALL");
  const [readFilter, setReadFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [specificDate, setSpecificDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const today = useMemo(() => formatDateTime(new Date()), []);

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

  const allowedFacilities = useMemo(() => {
    if (profileRole === "BHW") {
      return facilities.filter((facility) => facility.id === profileFacilityId);
    }

    return facilities;
  }, [facilities, profileFacilityId, profileRole]);

  const effectiveFacilityId =
    profileRole === "BHW" && facilityId !== "ALL" && facilityId !== profileFacilityId
      ? "ALL"
      : facilityId;

  const filteredNotifications = useMemo(() => {
    return visibleNotifications.filter((notification) => {
      return matchesNotificationFilters(notification, {
        category,
        currentUserId: profileId,
        dateMode,
        endDate,
        facilityId: effectiveFacilityId,
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
    effectiveFacilityId,
    keyword,
    profileId,
    readFilter,
    roleFilter,
    specificDate,
    startDate,
    visibleNotifications,
  ]);

  const unreadOwnCount = useMemo(() => {
    return notifications.filter((notification) => {
      return notification.user_id === profileId && !notification.is_read;
    }).length;
  }, [notifications, profileId]);

  const panelLabel = useMemo(() => {
    return getNotificationPanelLabel({
      category,
      dateMode,
      endDate,
      facilities,
      facilityId: effectiveFacilityId,
      readFilter,
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
    effectiveFacilityId,
    facilities,
    readFilter,
    roleFilter,
    specificDate,
    startDate,
  ]);

  const loadNotifications = async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await getNotificationData();
      setFacilities(data.facilities);
      setNotifications(data.notifications);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadNotifications();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const markAllAsRead = async () => {
    if (!profileId || unreadOwnCount === 0 || isSaving) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await markOwnNotificationsRead({ profileId });
      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) =>
          notification.user_id === profileId
            ? { ...notification, is_read: true }
            : notification
        )
      );
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

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
            Filter Notifications
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
                placeholder="Search notifications..."
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-medium normal-case tracking-normal text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </label>

          <div className="mt-4">
            <p className="text-xs font-black uppercase tracking-wide text-neutral-500">
              Notification Category
            </p>
            <div className="mt-2 grid gap-2">
              {notificationCategories.map((filter) => (
                <label key={filter.value} className="flex items-center gap-2 text-sm font-bold text-neutral-700">
                  <input
                    type="radio"
                    name="notification-category"
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
            label="Read Status"
            value={readFilter}
            onChange={setReadFilter}
            options={notificationReadFilters}
          />

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
              { value: "ALL", label: "All visible facilities" },
              ...allowedFacilities.map((facility) => ({
                value: facility.id,
                label: facility.facility_name,
              })),
            ]}
          />

          <SelectField
            label="Date Filter"
            value={dateMode}
            onChange={setDateMode}
            options={notificationDateModes}
          />

          {dateMode === "specific" && (
            <DateField
              label="Select Date"
              value={specificDate}
              onChange={setSpecificDate}
            />
          )}

          {dateMode === "range" && (
            <div className="grid gap-3">
              <DateField
                label="Start Date"
                value={startDate}
                onChange={setStartDate}
              />
              <DateField
                label="End Date"
                value={endDate}
                onChange={setEndDate}
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setKeyword("");
              setCategory("all");
              setDateMode("all");
              setEndDate("");
              setFacilityId("ALL");
              setReadFilter("all");
              setRoleFilter("ALL");
              setSpecificDate("");
              setStartDate("");
            }}
            className="mt-5 h-10 w-full rounded-lg bg-neutral-100 text-sm font-black text-neutral-700 hover:bg-neutral-200"
          >
            Reset Filters
          </button>
        </aside>

        <section className="self-start overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
              {panelLabel}
            </p>
            <div className="flex items-center gap-3">
              <p className="text-xs font-black text-neutral-500">
                {filteredNotifications.length} shown
              </p>
              <button
                type="button"
                onClick={markAllAsRead}
                disabled={unreadOwnCount === 0 || isSaving}
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
              >
                <CheckIcon />
                {isSaving ? "Updating" : "Mark mine read"}
              </button>
            </div>
          </div>

          <div className="max-h-[68vh] overflow-y-auto p-4">
            {isLoading ? (
              <p className="py-8 text-center text-sm font-bold text-neutral-500">
                Loading notifications...
              </p>
            ) : filteredNotifications.length === 0 ? (
              <p className="py-8 text-center text-sm font-bold text-neutral-500">
                No notifications match the current filters.
              </p>
            ) : (
              <div className="relative space-y-3 before:absolute before:bottom-0 before:left-2 before:top-2 before:w-px before:bg-neutral-200">
                {filteredNotifications.map((notification) => (
                  <NotificationCard key={notification.id} notification={notification} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function NotificationCard({ notification }) {
  const category = getNotificationCategory(notification);
  const meta = getNotificationMeta(category);

  return (
    <article className="relative pl-8">
      <span className={`absolute left-0 top-2 h-4 w-4 rounded-full border-4 border-white shadow ring-1 ring-neutral-200 ${notification.is_read ? "bg-neutral-300" : "bg-emerald-500"}`} />
      <div
        className={`rounded-xl border p-3.5 shadow-sm transition hover:shadow-md ${
          notification.is_read
            ? "border-neutral-200 bg-white"
            : "border-emerald-200 bg-emerald-50/60"
        }`}
      >
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${meta.iconWrap}`}>
            {meta.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-black text-black">{notification.title}</h3>
                  <span className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-wide ${meta.badge}`}>
                    {meta.label}
                  </span>
                  {!notification.is_read && (
                    <span className="h-2 w-2 rounded-full bg-emerald-600" />
                  )}
                </div>
                <p className="mt-1 text-sm leading-6 text-neutral-600">
                  {notification.message}
                </p>
              </div>
              <span className="text-xs font-black text-neutral-400">
                {formatDateTime(new Date(notification.created_at))}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-neutral-500">
              <span>{getRelativeTime(notification.created_at)}</span>
              <span>{getFullName(notification)}</span>
              <span>{roleLabels[notification.recipient_role] || "No role"}</span>
              <span>{notification.facility_name || "No facility"}</span>
              <span>{notification.is_read ? "Read" : "Unread"}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
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

function DateField({ label, value, onChange }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-neutral-500">
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
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

const CheckIcon = () => (
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
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

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
