import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "../../context/useAuth";
import { supabase } from "../../services/supabase";

const pageTitles = {
  "/dashboard": "Dashboard",
  "/inventory": "Inventory",
  "/requests": "Requests",
  "/transfers": "Transfers",
  "/dispensing": "Dispensing",
  "/medicines": "Medicines",
  "/facilities": "Facilities",
  "/patients": "Patients",
  "/forecasting": "Forecasting",
};

const getInitials = (profile) => {
  const firstInitial = profile?.first_name?.[0] || "P";
  const lastInitial = profile?.last_name?.[0] || "A";

  return `${firstInitial}${lastInitial}`.toUpperCase();
};

const formatHeaderDate = () =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

export default function AdminHeader({ profile, currentDateTime, onSignOut }) {
  const { refreshProfile } = useAuth();
  const location = useLocation();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    first_name: "",
    last_name: "",
    phone_number: "",
  });
  const [notifications, setNotifications] = useState([]);
  const [headerError, setHeaderError] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const pageTitle = pageTitles[location.pathname] || "PRDS";
  const pageDate = useMemo(() => formatHeaderDate(), []);

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

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  const handleProfileFieldChange = (event) => {
    const { name, value } = event.target;
    setProfileForm((currentForm) => ({ ...currentForm, [name]: value }));
  };

  const toggleProfilePanel = () => {
    setIsProfileOpen((isOpen) => {
      const nextIsOpen = !isOpen;

      if (nextIsOpen) {
        setProfileForm({
          first_name: profile?.first_name || "",
          last_name: profile?.last_name || "",
          phone_number: profile?.phone_number || "",
        });
      }

      return nextIsOpen;
    });
    setIsNotificationsOpen(false);
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();

    if (!profile?.id) {
      return;
    }

    if (!profileForm.first_name.trim() || !profileForm.last_name.trim()) {
      setHeaderError("First name and last name are required.");
      return;
    }

    setIsSavingProfile(true);
    setHeaderError("");

    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: profileForm.first_name.trim(),
        last_name: profileForm.last_name.trim(),
        phone_number: profileForm.phone_number.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (error) {
      setHeaderError(error.message);
      setIsSavingProfile(false);
      return;
    }

    await refreshProfile?.();
    setIsSavingProfile(false);
    setIsProfileOpen(false);
  };

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
    <header className="relative flex h-[68px] items-center justify-between border-b border-neutral-200 bg-white px-6">
      <div>
        <h1 className="text-lg font-black tracking-tight text-black">{pageTitle}</h1>
        <p className="text-xs font-medium text-neutral-500">
          {pageDate || currentDateTime}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="relative hidden sm:block">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
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
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </span>
          <input
            type="search"
            placeholder="Search medicines, requests..."
            className="h-9 w-64 rounded-lg border border-neutral-200 bg-[#faf9f7] pl-9 pr-3 text-sm font-medium text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          />
        </label>

        <button
          type="button"
          onClick={() => {
            setIsNotificationsOpen((isOpen) => !isOpen);
            setIsProfileOpen(false);
          }}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
          aria-label="Open notifications"
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M10 21h4" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-black text-white ring-2 ring-white">
              {unreadCount}
            </span>
          )}
        </button>

        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950"
          aria-label="Settings"
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-2 .4l-.1.1a1.7 1.7 0 0 0-.5 1.2V22h-4v-.1a1.7 1.7 0 0 0-.5-1.2l-.1-.1a1.7 1.7 0 0 0-2-.4l-.2.1-2-3.4.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 2-.4l.1-.1A1.7 1.7 0 0 0 10.2 2V2h4v.1a1.7 1.7 0 0 0 .5 1.2l.1.1a1.7 1.7 0 0 0 2 .4l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4h-.2a1.7 1.7 0 0 0-1.6 1Z" />
          </svg>
        </button>

        <button
          type="button"
          onClick={toggleProfilePanel}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-xs font-black text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
          aria-label="Edit profile"
        >
          {getInitials(profile)}
        </button>
      </div>

      {isNotificationsOpen && (
        <div className="absolute right-20 top-[62px] z-50 w-80 rounded-xl border border-neutral-200 bg-white shadow-xl">
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

      {isProfileOpen && (
        <div className="absolute right-6 top-[62px] z-50 w-96 rounded-xl border border-neutral-200 bg-white shadow-xl">
          <form onSubmit={handleSaveProfile}>
            <div className="border-b border-neutral-100 px-5 py-4">
              <p className="text-base font-black text-neutral-950">Edit Profile</p>
              <p className="text-xs font-semibold text-neutral-500">
                Update your personal profile details.
              </p>
            </div>
            <div className="grid gap-3 px-5 py-4">
              {headerError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  {headerError}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <HeaderField
                  label="First Name"
                  name="first_name"
                  value={profileForm.first_name}
                  onChange={handleProfileFieldChange}
                />
                <HeaderField
                  label="Last Name"
                  name="last_name"
                  value={profileForm.last_name}
                  onChange={handleProfileFieldChange}
                />
              </div>
              <HeaderField
                label="Phone Number"
                name="phone_number"
                value={profileForm.phone_number}
                onChange={handleProfileFieldChange}
              />
              <ReadOnlyDetail label="Email" value={profile?.email || "Not set"} />
              <div className="grid grid-cols-2 gap-3">
                <ReadOnlyDetail label="Role" value={profile?.role || "Not set"} />
                <ReadOnlyDetail label="Status" value={profile?.status || "Not set"} />
              </div>
            </div>
            <div className="flex justify-between gap-2 border-t border-neutral-100 px-5 py-4">
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50"
              >
                Sign out
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsProfileOpen(false)}
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                >
                  {isSavingProfile ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </header>
  );
}

function HeaderField({ label, ...props }) {
  return (
    <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-neutral-500">
      {label}
      <input
        {...props}
        className="h-10 rounded-lg border border-neutral-200 px-3 text-sm font-semibold normal-case tracking-normal text-neutral-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}

function ReadOnlyDetail({ label, value }) {
  return (
    <div className="grid gap-1">
      <p className="text-[10px] font-black uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs font-bold text-neutral-600">
        {value}
      </p>
    </div>
  );
}
