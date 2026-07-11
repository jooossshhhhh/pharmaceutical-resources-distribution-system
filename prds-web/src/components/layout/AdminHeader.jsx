import { useEffect, useState } from "react";

import { useAuth } from "../../context/useAuth";
import { supabase } from "../../services/supabase";

const getInitials = (profile) => {
  const firstInitial = profile?.first_name?.[0] || "P";
  const lastInitial = profile?.last_name?.[0] || "A";

  return `${firstInitial}${lastInitial}`.toUpperCase();
};

export default function AdminHeader({ profile, currentDateTime, onSignOut }) {
  const { refreshProfile } = useAuth();
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
    <header className="relative flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <h1 className="text-2xl font-black tracking-tight text-emerald-700">
        PRDS
      </h1>

      <div className="flex items-center gap-5 text-xs font-semibold text-slate-600">
        <span>{currentDateTime}</span>
        <button
          type="button"
          onClick={() => {
            setIsNotificationsOpen((isOpen) => !isOpen);
            setIsProfileOpen(false);
          }}
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-transparent font-black text-slate-600 hover:border-slate-200 hover:bg-slate-50"
          aria-label="Open notifications"
        >
          !
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
          )}
        </button>
        <button
          type="button"
          onClick={toggleProfilePanel}
          className="flex items-center gap-3 rounded-md px-2 py-1 text-left hover:bg-slate-50"
        >
          <div className="text-right">
            <p className="font-bold text-slate-950">
              {profile?.first_name} {profile?.last_name}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">
              CHO Administrator
            </p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-xs font-black text-emerald-700">
            {getInitials(profile)}
          </span>
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>

      {isNotificationsOpen && (
        <div className="absolute right-40 top-14 z-50 w-80 rounded-md border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-black text-slate-950">Notifications</p>
              <p className="text-xs font-semibold text-slate-500">
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
              <p className="rounded-md bg-slate-50 px-3 py-6 text-center text-sm font-semibold text-slate-500">
                No notifications yet.
              </p>
            ) : (
              notifications.map((notification) => (
                <article
                  key={notification.id}
                  className="rounded-md px-3 py-3 hover:bg-slate-50"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1 h-2 w-2 rounded-full ${
                        notification.is_read ? "bg-slate-300" : "bg-red-500"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-black text-slate-950">
                        {notification.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
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
        <div className="absolute right-6 top-14 z-50 w-96 rounded-md border border-slate-200 bg-white shadow-xl">
          <form onSubmit={handleSaveProfile}>
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-base font-black text-slate-950">Edit Profile</p>
              <p className="text-xs font-semibold text-slate-500">
                Update your personal profile details.
              </p>
            </div>
            <div className="grid gap-3 px-5 py-4">
              {headerError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
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
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setIsProfileOpen(false)}
                className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingProfile}
                className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {isSavingProfile ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        </div>
      )}
    </header>
  );
}

function HeaderField({ label, ...props }) {
  return (
    <label className="grid gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
      {label}
      <input
        {...props}
        className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}

function ReadOnlyDetail({ label, value }) {
  return (
    <div className="grid gap-1">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="rounded-md bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
        {value}
      </p>
    </div>
  );
}
