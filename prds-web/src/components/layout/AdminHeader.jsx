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
  "/inventory": { title: "Inventory", subtitle: "Manage medicine stock levels" },
  "/requests": { title: "Requests", subtitle: "Review and process medicine requests" },
  "/transfers": { title: "Transfers", subtitle: "Track stock movement across facilities" },
  "/dispensing": { title: "Dispensing", subtitle: "Monitor patient medicine dispensing" },
  "/medicines": { title: "Medicines", subtitle: "Manage the medicine catalog" },
  "/facilities": { title: "Facilities", subtitle: "Manage healthcare facilities" },
  "/patients": { title: "Patients", subtitle: "Manage patient records" },
  "/forecasting": { title: "Forecasting", subtitle: "Review demand forecasts" },
  "/profile-settings": {
    title: "Profile & Settings",
    subtitle: "Manage your account and system preferences",
  },
};

export default function AdminHeader({ profile, currentDateTime }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [headerError, setHeaderError] = useState("");

  const pageInfo = pageTitles[location.pathname] || {
    title: "PRDS",
    subtitle: currentDateTime,
  };
  const notificationOffset = location.pathname === "/profile-settings" ? "right-16" : "right-14";

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
    <header className="relative flex h-[54px] items-center justify-between border-b border-neutral-200 bg-white px-6">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-black tracking-tight text-black">
          {pageInfo.title}
        </h1>
        <p className="truncate text-xs font-medium text-neutral-500">
          {pageInfo.subtitle}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="relative hidden sm:block">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
            <SearchIcon />
          </span>
          <input
            type="search"
            placeholder="Search medicines, requests..."
            className="h-9 w-64 rounded-lg border border-neutral-200 bg-[#faf9f7] pl-9 pr-3 text-sm font-medium text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          />
        </label>

        <button
          type="button"
          onClick={() => setIsNotificationsOpen((isOpen) => !isOpen)}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
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
          className={`flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 ${
            location.pathname === "/profile-settings"
              ? "border-2 border-black bg-white text-black"
              : ""
          }`}
          aria-label="Open profile settings"
        >
          <SettingsIcon />
        </button>
      </div>

      {isNotificationsOpen && (
        <div className={`absolute ${notificationOffset} top-[50px] z-50 w-80 rounded-xl border border-neutral-200 bg-white shadow-xl`}>
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <div>
              <p className="text-sm font-black text-neutral-950">Notifications</p>
              <p className="text-xs font-semibold text-neutral-500">
                {unreadCount} unread
              </p>
            </div>
            <button
              type="button"
              onClick={markNotificationsRead}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800"
            >
              Mark read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
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
                  className="rounded-lg px-3 py-3 hover:bg-neutral-50"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1 h-2 w-2 rounded-full ${
                        notification.is_read ? "bg-neutral-300" : "bg-orange-500"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-black text-neutral-950">
                        {notification.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-neutral-600">
                        {notification.message}
                      </p>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
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

function SettingsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-2 .4l-.1.1a1.7 1.7 0 0 0-.5 1.2V22h-4v-.1a1.7 1.7 0 0 0-.5-1.2l-.1-.1a1.7 1.7 0 0 0-2-.4l-.2.1-2-3.4.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 2-.4l.1-.1A1.7 1.7 0 0 0 10.2 2V2h4v.1a1.7 1.7 0 0 0 .5 1.2l.1.1a1.7 1.7 0 0 0 2 .4l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4h-.2a1.7 1.7 0 0 0-1.6 1Z" />
    </svg>
  );
}
