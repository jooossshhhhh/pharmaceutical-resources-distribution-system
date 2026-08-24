import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { formatDateTime } from "../dashboard/dashboardUtils";
import {
  AuditBadge,
  AuditChipBar,
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
  AuditTimeline,
  CheckIcon,
} from "../shared/AuditInboxUi";
import { groupItemsByDate, getRelativeTime } from "../shared/AuditInboxUtils";
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

const notificationChipFilters = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "requests", label: "Requests" },
  { value: "transfers", label: "Transfers" },
  { value: "low_stock", label: "Low Stock" },
  { value: "facility", label: "Facility" },
  { value: "system", label: "System" },
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

  const chipOptions = useMemo(() => {
    const countByChip = (chip) => {
      if (chip.value === "all") {
        return visibleNotifications.length;
      }

      if (chip.value === "unread") {
        return visibleNotifications.filter((notification) => !notification.is_read).length;
      }

      return visibleNotifications.filter((notification) => {
        return matchesNotificationFilters(notification, {
          category: chip.value,
          currentUserId: profileId,
          dateMode: "all",
          facilityId: "ALL",
          keyword: "",
          readFilter: "all",
          roleFilter: "ALL",
        });
      }).length;
    };

    return notificationChipFilters.map((chip) => ({
      ...chip,
      count: countByChip(chip),
    }));
  }, [profileId, visibleNotifications]);

  const activeChip = readFilter === "unread" ? "unread" : category;

  const groupedNotifications = useMemo(() => {
    return groupItemsByDate(filteredNotifications, (notification) => notification.created_at);
  }, [filteredNotifications]);

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

  const resetFilters = () => {
    setKeyword("");
    setCategory("all");
    setDateMode("all");
    setEndDate("");
    setFacilityId("ALL");
    setReadFilter("all");
    setRoleFilter("ALL");
    setSpecificDate("");
    setStartDate("");
  };

  const handleChipChange = (nextChip) => {
    if (nextChip === "unread") {
      setCategory("all");
      setReadFilter("unread");
      return;
    }

    setCategory(nextChip);
    setReadFilter("all");
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      <div className="space-y-4">
        <AuditChipBar
          options={chipOptions}
          value={activeChip}
          onChange={handleChipChange}
        />

        <div className="grid items-start gap-5 xl:grid-cols-[270px_1fr]">
          <AuditFilterPanel title="Notifications" onReset={resetFilters}>
            <AuditSearchField
              label="Search Keywords"
              value={keyword}
              onChange={setKeyword}
              placeholder="Search notifications..."
            />

            <AuditRadioGroup
              label="Notification Category"
              name="notification-category"
              value={category}
              onChange={(nextCategory) => {
                setCategory(nextCategory);
                if (nextCategory !== "all") {
                  setReadFilter("all");
                }
              }}
              options={notificationCategories}
            />

            <AuditSelectField
              label="Read Status"
              value={readFilter}
              onChange={setReadFilter}
              options={notificationReadFilters}
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
                { value: "ALL", label: "All visible facilities" },
                ...allowedFacilities.map((facility) => ({
                  value: facility.id,
                  label: facility.facility_name,
                })),
              ]}
            />

            <AuditSelectField
              label="Date Filter"
              value={dateMode}
              onChange={setDateMode}
              options={notificationDateModes}
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
            count={filteredNotifications.length}
            isLoading={isLoading}
            emptyTitle="No notifications match this view"
            emptyDescription="Try another notification type, status, facility, role, keyword, or date range."
            action={
              <button
                type="button"
                onClick={markAllAsRead}
                disabled={unreadOwnCount === 0 || isSaving}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-black text-[#0d1117] shadow-sm transition hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:text-neutral-400"
              >
                <CheckIcon />
                {isSaving ? "Updating" : "Mark mine read"}
              </button>
            }
          >
            <AuditTimeline>
              {groupedNotifications.map((group) => (
                <AuditDateGroup key={group.label} label={group.label}>
                  {group.items.map((notification) => (
                    <NotificationCard key={notification.id} notification={notification} />
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

function NotificationCard({ notification }) {
  const category = getNotificationCategory(notification);
  const meta = getNotificationMeta(category);

  return (
    <AuditEventShell isUnread={!notification.is_read} tone={meta.tone}>
      <div className="flex items-start gap-3">
        <AuditIcon tone={meta.tone}>{meta.icon}</AuditIcon>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-black text-[#0d1117]">{notification.title}</h3>
                <AuditBadge tone={meta.tone}>{meta.label}</AuditBadge>
                {!notification.is_read && (
                  <span className="h-2 w-2 rounded-full bg-[#00a36c]" />
                )}
              </div>
              <p className="mt-1 text-sm leading-6 text-[#42474e]">
                {notification.message}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-black text-[#0d1117]">
                {getRelativeTime(notification.created_at)}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-neutral-400">
                {formatDateTime(new Date(notification.created_at))}
              </p>
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

