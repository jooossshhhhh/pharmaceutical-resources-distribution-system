import { useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import {
  getAuthErrorMessage,
  isPhilippineMobileNumber,
  linkGoogleIdentity,
  normalizePhoneNumber,
  resendPhoneChangeOtp,
  updateUserPhone,
  verifyPhoneChangeOtp,
  logoutUser,
} from "../../features/auth/AuthService";
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

const roleLabels = {
  PHARMA_II: "Pharmacist II",
  PHARMA_I: "Pharmacist I",
  BHW: "Barangay Health Worker",
};

const getRoleLabel = (role) => roleLabels[role] || "Barangay Health Worker";

const isPhoneDerivedEmail = (email, phoneNumber) => {
  if (!email || !phoneNumber) {
    return false;
  }

  const [localPart] = email.split("@");
  return localPart?.replace(/\D/g, "") === phoneNumber.replace(/\D/g, "");
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
  const { profile, refreshProfile, supabaseUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [modalError, setModalError] = useState("");
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [phoneVerification, setPhoneVerification] = useState({
    isOpen: false,
    phoneNumber: "",
    code: "",
    error: "",
    isVerifying: false,
    isResending: false,
  });
  const [form, setForm] = useState({
    first_name: profile?.first_name || "",
    last_name: profile?.last_name || "",
    email: profile?.email || "",
    phone_number: profile?.phone_number || "",
  });

  const today = useMemo(() => formatDateTime(new Date()), []);
  const statusLabel = profile?.status
    ? profile.status.charAt(0) + profile.status.slice(1).toLowerCase()
    : "Active";
  const roleLabel = getRoleLabel(profile?.role);
  const authEmail = supabaseUser?.email || "";
  const profileEmail = profile?.email || "";
  const readableEmail = isPhoneDerivedEmail(profileEmail, profile?.phone_number)
    ? authEmail || "No Gmail linked"
    : profileEmail;
  const hasGoogleEmail = !!authEmail && !isPhoneDerivedEmail(authEmail, profile?.phone_number);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
  };

  const startEditing = () => {
    setForm({
      first_name: profile?.first_name || "",
      last_name: profile?.last_name || "",
      email: readableEmail === "No Gmail linked" ? "" : readableEmail,
      phone_number: profile?.phone_number || "",
    });
    setMessage("");
    setProfileError("");
    setModalError("");
    setIsEditing(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!profile?.id) {
      return;
    }

    setMessage("");
    setProfileError("");

    if (!form.first_name.trim() || !form.last_name.trim()) {
      setModalError("First name and last name are required.");
      return;
    }

    const nextPhoneNumber = normalizePhoneNumber(form.phone_number);

    if (!isPhilippineMobileNumber(nextPhoneNumber)) {
      setModalError("Phone number must use the 09XXXXXXXXX format.");
      return;
    }

    if (nextPhoneNumber !== normalizePhoneNumber(profile?.phone_number || "")) {
      await handleStartPhoneChange(nextPhoneNumber);
      return;
    }

    setIsSaving(true);
    setModalError("");

    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (error) {
      setModalError(error.message);
      setIsSaving(false);
      return;
    }

    await refreshProfile?.();
    setIsSaving(false);
    setIsEditing(false);
    setMessage("Profile updated.");
  };

  const handleStartPhoneChange = async (phoneNumber) => {
    setIsSaving(true);
    setModalError("");

    try {
      await updateUserPhone(phoneNumber);
      setIsEditing(false);
      setPhoneVerification({
        isOpen: true,
        phoneNumber,
        code: "",
        error: "",
        isVerifying: false,
        isResending: false,
      });
    } catch (error) {
      setModalError(getAuthErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleVerifyPhoneChange = async (event) => {
    event.preventDefault();

    setPhoneVerification((current) => ({
      ...current,
      error: "",
      isVerifying: true,
    }));

    try {
      await verifyPhoneChangeOtp({
        phoneNumber: phoneVerification.phoneNumber,
        verificationCode: phoneVerification.code,
      });

      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone_number: phoneVerification.phoneNumber,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);

      if (error) {
        throw error;
      }

      await refreshProfile?.();
      setPhoneVerification({
        isOpen: false,
        phoneNumber: "",
        code: "",
        error: "",
        isVerifying: false,
        isResending: false,
      });
      setIsEditing(false);
      setMessage("Phone number verified and profile updated.");
    } catch (error) {
      setPhoneVerification((current) => ({
        ...current,
        error: getAuthErrorMessage(error),
        isVerifying: false,
      }));
    }
  };

  const handleResendPhoneChangeOtp = async () => {
    setPhoneVerification((current) => ({
      ...current,
      error: "",
      isResending: true,
    }));

    try {
      await resendPhoneChangeOtp(phoneVerification.phoneNumber);
      setPhoneVerification((current) => ({
        ...current,
        isResending: false,
      }));
    } catch (error) {
      setPhoneVerification((current) => ({
        ...current,
        error: getAuthErrorMessage(error),
        isResending: false,
      }));
    }
  };

  const handleLinkGoogle = async () => {
    setIsLinkingGoogle(true);
    setMessage("");
    setProfileError("");

    try {
      await linkGoogleIdentity();
    } catch (error) {
      const errorMessage = getAuthErrorMessage(error);
      setProfileError(
        errorMessage.includes("Manual linking is disabled")
          ? "Google account linking is disabled in Supabase Auth. Enable manual account linking in your Supabase Auth settings before using Add Gmail Login."
          : errorMessage
      );
      setIsLinkingGoogle(false);
    }
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
                {roleLabel} -{" "}
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
          {profileError && (
            <p className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {profileError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <ProfileField icon="user" label="First Name" value={profile?.first_name || "Not set"} readOnly />
            <ProfileField icon="user" label="Last Name" value={profile?.last_name || "Not set"} readOnly />
            <ProfileField icon="mail" label="Gmail" value={readableEmail} readOnly />
            <ProfileField icon="phone" label="Phone" value={profile?.phone_number || "Not set"} readOnly />
            <ProfileField icon="role" label="Role" value={roleLabel} readOnly />
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
              {modalError && (
                <p className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {modalError}
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
                <div className="grid gap-2">
                  <ModalField
                    label="Gmail"
                    name="email"
                    value={form.email}
                    onChange={handleFieldChange}
                    readOnly
                    placeholder="No Gmail linked"
                  />
                  <button
                    type="button"
                    onClick={handleLinkGoogle}
                    disabled={isLinkingGoogle}
                    className="flex h-10 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-bold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <GoogleIcon />
                    {hasGoogleEmail ? "Reconnect Google" : "Add Gmail Login"}
                  </button>
                  <p className="text-xs font-medium leading-5 text-neutral-500">
                    This links Google to the same Supabase account, so the user can sign in with either phone or Gmail.
                  </p>
                </div>
                <ModalField
                  label="Phone"
                  name="phone_number"
                  value={form.phone_number}
                  onChange={handleFieldChange}
                />
                <p className="-mt-2 text-xs font-medium leading-5 text-neutral-500">
                  Phone edits are saved only after OTP verification. Use 09XXXXXXXXX format.
                </p>
                <ModalField label="Role" value={roleLabel} readOnly />
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

      {phoneVerification.isOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4 py-5">
          <form
            onSubmit={handleVerifyPhoneChange}
            className="w-full max-w-[430px] rounded-xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-black">Verify Phone Number</h3>
                <p className="mt-1 text-sm font-medium text-neutral-500">
                  Enter the 6-digit code sent to {phoneVerification.phoneNumber}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPhoneVerification({
                    isOpen: false,
                    phoneNumber: "",
                    code: "",
                    error: "",
                    isVerifying: false,
                    isResending: false,
                  });
                  setIsEditing(true);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800"
                aria-label="Close phone verification"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <label className="mt-6 grid gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
              Verification Code
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={phoneVerification.code}
                onChange={(event) =>
                  setPhoneVerification((current) => ({
                    ...current,
                    code: event.target.value.replace(/\D/g, ""),
                  }))
                }
                className="h-12 rounded-lg border border-neutral-200 bg-white px-3 text-center text-lg font-black tracking-[0.35em] text-black outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                required
              />
            </label>

            {phoneVerification.error && (
              <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {phoneVerification.error}
              </p>
            )}

            <button
              type="submit"
              disabled={phoneVerification.isVerifying}
              className="mt-5 w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {phoneVerification.isVerifying ? "Verifying..." : "Verify OTP and Save"}
            </button>
            <button
              type="button"
              onClick={handleResendPhoneChangeOtp}
              disabled={phoneVerification.isResending}
              className="mt-3 w-full rounded-lg bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {phoneVerification.isResending ? "Resending..." : "Resend OTP"}
            </button>
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

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4c-.2 1.2-.9 2.2-1.9 2.9v2.4h3.1c1.8-1.7 3-4.1 3-7Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-0.9 6.6-2.4l-3.1-2.4c-.9.6-2 .9-3.5.9-2.6 0-4.8-1.8-5.6-4.1H3.2v2.5C4.8 19.8 8.1 22 12 22Z" />
      <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.5H3.2A10 10 0 0 0 2.1 12c0 1.6.4 3.1 1.1 4.5L6.4 14Z" />
      <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17 2.9 14.7 2 12 2 8.1 2 4.8 4.2 3.2 7.5L6.4 10c.8-2.3 3-4.1 5.6-4.1Z" />
    </svg>
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
