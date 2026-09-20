import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { supabase } from "../../services/supabase";

const pageTitles = {
  "/dashboard": {
    title: "Dashboard",
    subtitle: new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date()),
  },
  "/inventory": {
    title: "Inventory Management",
    subtitle: "Track medicine stock levels across all facilities",
  },
  "/inventory-bhw": {
    title: "Facility Inventory",
    subtitle: "View stock levels and consumption",
  },
  "/requests": { title: "Request", subtitle: "Review and process medicine requests" },
  "/transfers": { title: "Transfer", subtitle: "Track stock movement across facilities" },
  "/dispensing": { title: "Dispensing", subtitle: "Monitor patient medicine dispensing" },
  "/medicines": {
    title: "Medicine Catalog",
    subtitle: "Browse and manage the full list of medicines and pricing",
  },
  "/facilities": { title: "Facilities", subtitle: "Manage healthcare facilities" },
  "/suppliers": {
    title: "Suppliers",
    subtitle: "Manage supplier records and contact details",
  },
  "/patients": { title: "Patients", subtitle: "Manage patient records" },
  "/forecasting": { title: "Forecasting", subtitle: "Review demand forecasts" },
  "/activity-logs": {
    title: "Activity Logs",
    subtitle: "Review user actions, profile changes, inventory updates, and facility activity.",
  },
  "/notifications": {
    title: "Notifications",
    subtitle: "System alerts, request updates, and transfer notifications",
  },
  "/users": {
    title: "User Management",
    subtitle: "Review accounts, approvals, roles, and facility assignments",
  },
  "/users/accounts": {
    title: "User Management",
    subtitle: "Review accounts, approvals, roles, and facility assignments",
  },
  "/users/change-requests": {
    title: "Facility Changes",
    subtitle: "Review requested facility updates from user profile settings",
  },
  "/profile-settings": {
    title: "Profile & Settings",
    subtitle: "Manage your account and system preferences",
  },
};

export default function AdminHeader({ profile, currentDateTime, onSignOut }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [headerError, setHeaderError] = useState("");
  const [currentTime, setCurrentTime] = useState(() => new Date());

  const pageInfo = pageTitles[location.pathname] || {
    title: "PRDS",
    subtitle: currentDateTime,
  };
  const notificationOffset = location.pathname === "/profile-settings" ? "right-16" : "right-14";
  const formattedTime = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(currentTime);
  }, [currentTime]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadNotifications = async () => {
      if (!profile?.id) {
        setNotifications([]);
        return;
      }

      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, message, is_read, created_at")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!isMounted) {
        return;
      }

      if (error) {
        setHeaderError(error.message);
        return;
      }

      setNotifications(data || []);
    };

    loadNotifications();

    return () => {
      isMounted = false;
    };
  }, [profile?.id]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications]
  );

  const markNotificationsRead = async () => {
    if (!profile?.id || unreadCount === 0) {
      return;
    }

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", profile.id)
      .eq("is_read", false);

    if (error) {
      setHeaderError(error.message);
      return;
    }

    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) => ({
        ...notification,
        is_read: true,
      }))
    );
  };

  return (
    <header className="relative z-30 flex h-13.5 items-center justify-between border-b border-[#d8dadc] bg-[#f8f9ff] px-6 shadow-sm shadow-neutral-200/50">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-black tracking-tight text-[#0d1117]">
          {pageInfo.title}
        </h1>
        <p className="truncate text-xs font-medium text-[#42474e]">
          {pageInfo.subtitle}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-[#eff4ff] bg-[#eff4ff]/80 px-3.5 py-1.5 text-xs font-black tabular-nums tracking-wide text-[#0d1117] sm:flex">
          <ClockIcon />
          {formattedTime}
        </div>

        <button
          type="button"
          onClick={() => setIsNotificationsOpen((isOpen) => !isOpen)}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[#42474e] transition hover:bg-[#eff4ff] hover:text-[#0d1117]"
          aria-label="Open notifications"
        >
          <BellIcon />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-black text-white ring-2 ring-white">
              {unreadCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setIsNotificationsOpen(false);
            navigate("/profile-settings");
          }}
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
            location.pathname === "/profile-settings"
              ? "bg-[#eff4ff] text-[#0d1117] ring-1 ring-[#d8dadc]"
              : "text-[#42474e] hover:bg-[#eff4ff] hover:text-[#0d1117]"
          }`}
          aria-label="Open profile settings"
        >
          <SettingsIcon />
        </button>

        <div className="hidden h-6 w-px bg-[#d8dadc] sm:block" />

        <button
          type="button"
          onClick={onSignOut}
          className="hidden h-8 items-center gap-2 rounded-md px-2 text-sm font-bold text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-950 sm:flex"
        >
          <LogoutIcon />
          Logout
        </button>
      </div>

      {isNotificationsOpen && (
        <div className={`absolute ${notificationOffset} top-12.5 z-50 w-75.5 overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-xl shadow-neutral-200/70`}>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-black text-[#0d1117]">Notifications</p>
              {unreadCount > 0 && (
                <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-black text-white">
                  {unreadCount} new
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={markNotificationsRead}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800"
            >
              View all
            </button>
          </div>
          <div className="prds-modal-scrollbar max-h-81.5 overflow-y-auto px-4 pb-2">
            {headerError && (
              <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {headerError}
              </p>
            )}
            {notifications.length === 0 ? (
              <p className="rounded-lg bg-neutral-50 px-3 py-6 text-center text-sm font-semibold text-neutral-500">
                No notifications yet.
              </p>
            ) : (
              notifications.map((notification) => (
                <article
                  key={notification.id}
                  className={`rounded-lg px-3 py-3 ${
                    notification.is_read ? "hover:bg-neutral-50" : "bg-emerald-50/60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <NotificationIcon title={notification.title} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-xs font-black text-neutral-950">
                          {notification.title}
                        </p>
                        {!notification.is_read && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-600">
                        {notification.message}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-neutral-400">
                        {getRelativeTime(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setIsNotificationsOpen(false);
              navigate("/notifications");
            }}
            className="w-full border-t border-neutral-100 px-4 py-3 text-center text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
          >
            See all notifications
          </button>
        </div>
      )}
    </header>
  );
}

function getRelativeTime(dateString) {
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
}

function NotificationIcon({ title }) {
  const normalizedTitle = title?.toLowerCase() || "";
  const isRequest = normalizedTitle.includes("request");
  const isTransfer = normalizedTitle.includes("transfer");
  const tone = isTransfer
    ? "bg-emerald-100 text-emerald-600"
    : isRequest
      ? "bg-orange-100 text-orange-600"
      : "bg-red-50 text-red-500";

  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        {isTransfer ? (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="M9 12h6M13 9l3 3-3 3" />
          </>
        ) : isRequest ? (
          <>
            <path d="M7 3h8l4 4v14H7V3Z" />
            <path d="M14 3v5h5M10 13h6M10 17h4" />
          </>
        ) : (
          <>
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.3 4.3 2.7 17.5A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.5L13.7 4.3a2 2 0 0 0-3.4 0Z" />
          </>
        )}
      </svg>
    </span>
  );
}

function BellIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 text-[#00a36c]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 4v16" />
    </svg>
  );
}
