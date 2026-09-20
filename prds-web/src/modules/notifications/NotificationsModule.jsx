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
  AuditSearchField,
  AuditSelectField,
  AuditTimeline,
  CheckIcon,
} from "../shared/AuditInboxUi";
import { groupItemsByDate, getRelativeTime } from "../shared/AuditInboxUtils";
import {
  getNotificationData,
  updateOwnNotificationReadStatus,
} from "./NotificationService";
import {
  getNotificationCategory,
  getNotificationPanelLabel,
  getVisibleNotifications,
  matchesNotificationFilters,
  notificationDateModes,
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

const notificationTypeFilters = [
  { value: "all", label: "All" },
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
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [specificDate, setSpecificDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [savingNotificationId, setSavingNotificationId] = useState("");
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
        readFilter: "all",
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
    roleFilter,
    specificDate,
    startDate,
    visibleNotifications,
  ]);

  const groupedNotifications = useMemo(() => {
    return groupItemsByDate(filteredNotifications, (notification) => notification.created_at);
  }, [filteredNotifications]);

  const panelLabel = useMemo(() => {
    return getNotificationPanelLabel({
      category,
      categoryOptions: notificationTypeFilters,
      dateMode,
      endDate,
      facilities,
      facilityId: effectiveFacilityId,
      readFilter: "all",
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

  const toggleNotificationReadStatus = async (notification) => {
    if (
      !profileId ||
      notification.user_id !== profileId ||
      savingNotificationId
    ) {
      return;
    }

    const nextIsRead = !notification.is_read;
    setSavingNotificationId(notification.id);
    setError("");

    try {
      await updateOwnNotificationReadStatus({
        isRead: nextIsRead,
        notificationId: notification.id,
        profileId,
      });
      setNotifications((currentNotifications) =>
        currentNotifications.map((currentNotification) =>
          currentNotification.id === notification.id
            ? { ...currentNotification, is_read: nextIsRead }
            : currentNotification
        )
      );
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingNotificationId("");
    }
  };

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

      <div className="space-y-4">
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[14rem_minmax(0,1fr)]">
          <AuditFilterPanel title="Notifications" onReset={resetFilters}>
            <AuditSearchField
              label="Search"
              value={keyword}
              onChange={setKeyword}
              placeholder="Search notifications..."
            />

            <AuditSelectField
              label="Type"
              value={category}
              onChange={setCategory}
              options={notificationTypeFilters}
            />

            {profileRole !== "BHW" && (
              <AuditSelectField
                label="Role"
                value={roleFilter}
                onChange={setRoleFilter}
                options={allowedRoleOptions}
              />
            )}

            {profileRole !== "BHW" && (
              <AuditSelectField
                label="Facility"
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
            )}

            <AuditSelectField
              label="Date"
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
            emptyDescription="Try another notification type, facility, role, keyword, or date range."
            bodyClassName="max-h-[calc(100dvh-9rem)]"
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
                    />
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

function NotificationCard({
  currentUserId,
  isSaving,
  notification,
  onToggleRead,
}) {
  const category = getNotificationCategory(notification);
  const meta = getNotificationMeta(category);
  const canUpdateReadStatus = notification.user_id === currentUserId;

  return (
    <AuditEventShell isUnread={!notification.is_read} tone={meta.tone}>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
        <AuditIcon tone={meta.tone}>{meta.icon}</AuditIcon>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 break-words text-sm font-black text-[#0d1117] [overflow-wrap:anywhere]">
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
              {canUpdateReadStatus && (
                <button
                  type="button"
                  onClick={() => onToggleRead(notification)}
                  disabled={isSaving}
                  aria-label={
                    notification.is_read
                      ? "Mark notification as unread"
                      : "Mark notification as read"
                  }
                  className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 text-[11px] font-black text-[#0d1117] transition hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:text-neutral-400"
                >
                  {!notification.is_read && <CheckIcon />}
                  {isSaving
                    ? "Saving"
                    : notification.is_read
                      ? "Mark unread"
                      : "Mark read"}
                </button>
              )}
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

