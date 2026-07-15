import { useCallback, useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";

const notificationFilters = [
  { value: "ALL", label: "All" },
  { value: "LOW_STOCK", label: "Low Stock" },
  { value: "REQUESTS", label: "Requests" },
  { value: "TRANSFERS", label: "Transfers" },
  { value: "SYSTEM", label: "System" },
];

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

const getNotificationCategory = (notification) => {
  const searchableText = `${notification.title} ${notification.message}`.toLowerCase();

  if (
    searchableText.includes("low stock") ||
    searchableText.includes("critical") ||
    searchableText.includes("expir")
  ) {
    return "LOW_STOCK";
  }

  if (searchableText.includes("request")) {
    return "REQUESTS";
  }

  if (searchableText.includes("transfer")) {
    return "TRANSFERS";
  }

  return "SYSTEM";
};

const getNotificationMeta = (category) => {
  const meta = {
    LOW_STOCK: {
      tone: "bg-red-50 text-red-500",
      icon: <AlertIcon />,
    },
    REQUESTS: {
      tone: "bg-amber-100 text-amber-600",
      icon: <RequestIcon />,
    },
    TRANSFERS: {
      tone: "bg-blue-100 text-blue-600",
      icon: <TransferIcon />,
    },
    SYSTEM: {
      tone: "bg-emerald-100 text-emerald-600",
      icon: <SystemIcon />,
    },
  };

  return meta[category] || meta.SYSTEM;
};

const formatDateTime = (date) => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

export default function NotificationsModule() {
  const { profile } = useAuth();
  const profileId = profile?.id;
  const [notifications, setNotifications] = useState([]);
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notificationError, setNotificationError] = useState("");

  const today = useMemo(() => formatDateTime(new Date()), []);

  const loadNotifications = useCallback(async () => {
    if (!profileId) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setNotificationError("");

    const { data, error } = await supabase
      .from("notifications")
      .select("id, title, message, is_read, created_at")
      .eq("user_id", profileId)
      .order("created_at", { ascending: false });

    if (error) {
      setNotificationError(error.message);
      setIsLoading(false);
      return;
    }

    setNotifications(data || []);
    setIsLoading(false);
  }, [profileId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadNotifications();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadNotifications]);

  const unreadCount = useMemo(() => {
    return notifications.filter((notification) => !notification.is_read).length;
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      const category = getNotificationCategory(notification);

      return activeFilter === "ALL" || category === activeFilter;
    });
  }, [activeFilter, notifications]);

  const markAllAsRead = async () => {
    if (!profileId || unreadCount === 0 || isSaving) {
      return;
    }

    setIsSaving(true);
    setNotificationError("");

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", profileId)
      .eq("is_read", false);

    if (error) {
      setNotificationError(error.message);
      setIsSaving(false);
      return;
    }

    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) => ({
        ...notification,
        is_read: true,
      }))
    );
    setIsSaving(false);
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <section className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-black tracking-tight text-black">Notifications</h2>
          {unreadCount > 0 && (
            <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-black text-white">
              {unreadCount} unread
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={markAllAsRead}
          disabled={unreadCount === 0 || isSaving}
          className="text-sm font-bold text-emerald-700 transition hover:text-emerald-800 disabled:cursor-not-allowed disabled:text-neutral-400"
        >
          {isSaving ? "Updating..." : "Mark all as read"}
        </button>
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {notificationFilters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setActiveFilter(filter.value)}
            className={`h-9 rounded-full px-4 text-sm font-bold transition ${
              activeFilter === filter.value
                ? "bg-black text-white"
                : "bg-white text-neutral-700 hover:bg-emerald-50 hover:text-emerald-700"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {notificationError && (
        <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {notificationError}
        </p>
      )}

      <section className="mt-5 space-y-3">
        {isLoading ? (
          <p className="rounded-xl border border-neutral-200 bg-white px-5 py-14 text-center text-sm font-bold text-neutral-500 shadow-sm">
            Loading notifications...
          </p>
        ) : filteredNotifications.length === 0 ? (
          <p className="rounded-xl border border-neutral-200 bg-white px-5 py-14 text-center text-sm font-bold text-neutral-500 shadow-sm">
            No notifications match this filter.
          </p>
        ) : (
          filteredNotifications.map((notification) => (
            <NotificationCard key={notification.id} notification={notification} />
          ))
        )}
      </section>
    </AdminShell>
  );
}

function NotificationCard({ notification }) {
  const category = getNotificationCategory(notification);
  const meta = getNotificationMeta(category);

  return (
    <article
      className={`rounded-xl border px-4 py-4 shadow-sm transition hover:shadow-md ${
        notification.is_read
          ? "border-neutral-100 bg-white"
          : "border-emerald-300 bg-emerald-50/60"
      }`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}
        >
          {meta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-black text-black">
              {notification.title}
            </h3>
            {!notification.is_read && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
            )}
          </div>
          <p className="mt-1 text-sm font-medium leading-6 text-neutral-700">
            {notification.message}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-neutral-400">
            <span>{getRelativeTime(notification.created_at)}</span>
            <span>{notification.is_read ? "Read" : "Unread"}</span>
          </div>
        </div>
      </div>
    </article>
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
