import { useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";
import { formatDateTime } from "../dashboard/dashboardUtils";

const getInitials = (profile) => {
  const firstInitial = profile?.first_name?.[0] || "P";
  const lastInitial = profile?.last_name?.[0] || "U";

  return `${firstInitial}${lastInitial}`.toUpperCase();
};

const getFullName = (profile) => {
  const fullName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
  return fullName || "Pharma User";
};

const preferenceRows = [
  {
    label: "Email Notifications",
    description: "Receive email updates for requests, transfers, and alerts",
    icon: "mail",
    enabled: true,
  },
  {
    label: "Low Stock Alerts",
    description: "Get notified when medicine stock falls below minimum",
    icon: "alert",
    enabled: true,
  },
  {
    label: "Request Auto-Approval",
    description: "Automatically approve routine monthly replenishments",
    icon: "check",
    enabled: false,
  },
  {
    label: "Dark Mode",
    description: "Switch to dark color theme for low-light environments",
    icon: "moon",
    enabled: false,
  },
  {
    label: "Compact View",
    description: "Use condensed layout with smaller text and spacing",
    icon: "layout",
    enabled: false,
  },
];

const FieldIcon = ({ type }) => {
  const commonProps = {
    className: "h-4 w-4 text-neutral-400",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: "1.8",
    viewBox: "0 0 24 24",
  };

  const paths = {
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
      </>
    ),
    mail: (
      <>
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path d="m4 8 8 6 8-6" />
      </>
    ),
    phone: (
      <path d="M7 4h3l1.5 4-2 1.2a10 10 0 0 0 5.3 5.3l1.2-2 4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 5 6.2 2 2 0 0 1 7 4Z" />
    ),
    role: (
      <>
        <path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6l-7-3Z" />
        <path d="M9.5 12 11 13.5 14.5 10" />
      </>
    ),
    status: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    facility: (
      <>
        <path d="M5 21V7l7-4 7 4v14" />
        <path d="M9 21v-6h6v6M9 10h.01M15 10h.01" />
      </>
    ),
    alert: (
      <>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 4.3 2.7 17.5A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.5L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />,
    layout: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M4 10h16M10 10v9" />
      </>
    ),
  };

  return <svg {...commonProps}>{paths[type]}</svg>;
};

export default function ProfileSettingsModule() {
  const { profile, refreshProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    first_name: profile?.first_name || "",
    last_name: profile?.last_name || "",
    phone_number: profile?.phone_number || "",
  });

  const today = useMemo(() => formatDateTime(new Date()), []);
  const statusLabel = profile?.status
    ? profile.status.charAt(0) + profile.status.slice(1).toLowerCase()
    : "Active";

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
  };

  const startEditing = () => {
    setForm({
      first_name: profile?.first_name || "",
      last_name: profile?.last_name || "",
      phone_number: profile?.phone_number || "",
    });
    setMessage("");
    setIsEditing(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!profile?.id) {
      return;
    }

    if (!form.first_name.trim() || !form.last_name.trim()) {
      setMessage("First name and last name are required.");
      return;
    }

    setIsSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone_number: form.phone_number.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (error) {
      setMessage(error.message);
      setIsSaving(false);
      return;
    }

    await refreshProfile?.();
    setIsSaving(false);
    setIsEditing(false);
    setMessage("Profile updated.");
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <div className="max-w-[728px] space-y-5">
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-2xl font-black text-white">
              {getInitials(profile)}
            </div>
            <div>
              <h2 className="text-2xl font-black text-black">{getFullName(profile)}</h2>
              <p className="mt-1 text-sm font-medium text-neutral-500">
                {profile?.role || "Pharmacist"} -{" "}
                {profile?.facility_name || "Palompon District Hospital"}
              </p>
              <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                {statusLabel}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-base font-black text-black">Personal Information</h3>
            <button
              type="button"
              onClick={startEditing}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-bold text-emerald-700 hover:bg-emerald-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="m14 5 5 5" />
                <path d="M4 20h5L19.5 9.5a3.5 3.5 0 0 0-5-5L4 15v5Z" />
              </svg>
              Edit
            </button>
          </div>

          {message && (
            <p className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {message}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <ProfileField icon="user" label="First Name" value={profile?.first_name || "Not set"} readOnly />
            <ProfileField icon="user" label="Last Name" value={profile?.last_name || "Not set"} readOnly />
            <ProfileField icon="mail" label="Email" value={profile?.email || "Not set"} readOnly />
            <ProfileField icon="phone" label="Phone" value={profile?.phone_number || "Not set"} readOnly />
            <ProfileField icon="role" label="Role" value={profile?.role || "Pharmacist"} readOnly />
            <ProfileField icon="status" label="Status" value={statusLabel} readOnly />
            <ProfileField
              icon="facility"
              label="Facility"
              value={profile?.facility_name || "Palompon District Hospital"}
              readOnly
            />
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40">
          <h3 className="mb-5 text-base font-black text-black">System Preferences</h3>
          <div className="divide-y divide-neutral-100">
            {preferenceRows.map((preference) => (
              <PreferenceRow key={preference.label} {...preference} />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-red-200 bg-white p-6">
          <h3 className="text-base font-black text-red-600">Danger Zone</h3>
          <p className="mt-2 text-sm font-medium text-neutral-500">
            Irreversible actions - please proceed with caution.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="rounded-lg bg-red-50 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-100">
              Reset Password
            </button>
            <button className="rounded-lg bg-neutral-50 px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100">
              Export My Data
            </button>
          </div>
        </section>
      </div>

      {isEditing && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4 py-5">
          <form
            onSubmit={handleSave}
            className="flex max-h-[88vh] w-full max-w-[486px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
              <h3 className="text-lg font-black text-black">Edit Profile</h3>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800"
                aria-label="Close edit profile"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="prds-modal-scrollbar flex-1 overflow-y-auto px-6 py-5">
              {message && (
                <p className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {message}
                </p>
              )}

              <div className="grid gap-4">
                <ModalField
                  label="First Name"
                  name="first_name"
                  value={form.first_name}
                  onChange={handleFieldChange}
                />
                <ModalField
                  label="Last Name"
                  name="last_name"
                  value={form.last_name}
                  onChange={handleFieldChange}
                />
                <ModalField label="Email" value={profile?.email || "Not set"} readOnly />
                <ModalField
                  label="Phone"
                  name="phone_number"
                  value={form.phone_number}
                  onChange={handleFieldChange}
                />
                <ModalField label="Role" value={profile?.role || "Pharmacist"} readOnly />
                <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
                  Status
                  <select
                    value={statusLabel}
                    disabled
                    className="h-10 rounded-lg border border-neutral-200 bg-[#faf9f7] px-3 text-sm font-semibold normal-case tracking-normal text-black outline-none disabled:opacity-100"
                  >
                    <option>{statusLabel}</option>
                  </select>
                </label>
                <ModalField
                  label="Facility"
                  value={profile?.facility_name || "Palompon District Hospital"}
                  readOnly
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-neutral-100 bg-white px-6 py-5">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-lg bg-neutral-50 px-5 py-2.5 text-sm font-bold text-neutral-700 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AdminShell>
  );
}

function ProfileField({ icon, label, readOnly, ...props }) {
  return (
    <label className="block rounded-lg bg-[#faf9f7] px-4 py-3">
      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-neutral-500">
        <FieldIcon type={icon} />
        {label}
      </span>
      <input
        {...props}
        readOnly={readOnly}
        className="mt-3 w-full bg-transparent text-sm font-semibold text-black outline-none read-only:cursor-default"
      />
    </label>
  );
}

function ModalField({ label, readOnly, ...props }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
      {label}
      <input
        {...props}
        readOnly={readOnly}
        className="h-10 rounded-lg border border-neutral-200 bg-[#faf9f7] px-3 text-sm font-semibold normal-case tracking-normal text-black outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 read-only:cursor-default read-only:focus:border-neutral-200 read-only:focus:bg-[#faf9f7] read-only:focus:ring-0"
      />
    </label>
  );
}

function PreferenceRow({ icon, label, description, enabled }) {
  return (
    <div className="flex items-center justify-between gap-5 py-4">
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#faf9f7]">
          <FieldIcon type={icon} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-black">{label}</p>
          <p className="truncate text-sm font-medium text-neutral-500">{description}</p>
        </div>
      </div>
      <button
        type="button"
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          enabled ? "bg-emerald-600" : "bg-neutral-200"
        }`}
        aria-pressed={enabled}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
            enabled ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}
