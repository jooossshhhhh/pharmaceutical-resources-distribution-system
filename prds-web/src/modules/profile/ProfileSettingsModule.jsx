import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import {
  getAuthErrorMessage,
  isPhilippineMobileNumber,
  linkGoogleIdentity,
  normalizePhoneNumber,
  resendPhoneChangeOtp,
  sendEmailOtp,
  sendPhoneOtp,
  updateUserPassword,
  updateUserPhone,
  verifyEmailOtp,
  verifyPhoneChangeOtp,
  verifyPhoneOtp,
  logoutUser,
} from "../../features/auth/AuthService";
import {
  createFacilityChangeRequest,
  getOwnPendingFacilityChangeRequest,
  updateOwnProfileContact,
} from "../../features/auth/ProfileService";
import { supabase } from "../../services/supabase";
import { formatDateTime } from "../dashboard/dashboardUtils";

const roleLabels = {
  PHARMA_II: "Pharmacist II",
  PHARMA_I: "Pharmacist I",
  BHW: "Barangay Health Worker",
};

const statusLabels = {
  ACTIVE: "Active",
  PENDING: "Pending",
  DEACTIVATED: "Deactivated",
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

const emptyForm = {
  facility_id: "",
  facility_reason: "",
  first_name: "",
  last_name: "",
  phone_number: "",
};

const emptyPhoneVerification = {
  code: "",
  error: "",
  isOpen: false,
  isResending: false,
  isVerifying: false,
  phoneNumber: "",
};

const emptyPasswordVerification = {
  code: "",
  confirmPassword: "",
  error: "",
  isOpen: false,
  isSending: false,
  isVerifying: false,
  method: "phone",
  newPassword: "",
  step: "choose",
};

const getInitials = (profile) => {
  const firstInitial = profile?.first_name?.[0] || "P";
  const lastInitial = profile?.last_name?.[0] || "U";

  return `${firstInitial}${lastInitial}`.toUpperCase();
};

const getFullName = (profile) => {
  const fullName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
  return fullName || "Pharma User";
};

const getRoleLabel = (role) => roleLabels[role] || "Not assigned";

const getStatusLabel = (status) => statusLabels[status] || "Not set";

const isPhoneDerivedEmail = (email, phoneNumber) => {
  if (!email || !phoneNumber) {
    return false;
  }

  const [localPart] = email.split("@");
  return localPart?.replace(/\D/g, "") === phoneNumber.replace(/\D/g, "");
};

const getReadableEmail = ({ authEmail, profile }) => {
  const profileEmail = profile?.email || "";

  if (isPhoneDerivedEmail(profileEmail, profile?.phone_number)) {
    return authEmail || "";
  }

  return profileEmail || authEmail || "";
};

const getFacilityLabel = (facility) => {
  if (!facility) {
    return "No facility assigned";
  }

  return `${facility.facility_name}${facility.facility_code ? ` (${facility.facility_code})` : ""}`;
};

const formatRequestDate = (dateValue) => {
  if (!dateValue) {
    return "";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateValue));
};

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
    alert: (
      <>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 4.3 2.7 17.5A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.5L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    facility: (
      <>
        <path d="M5 21V7l7-4 7 4v14" />
        <path d="M9 21v-6h6v6M9 10h.01M15 10h.01" />
      </>
    ),
    layout: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M4 10h16M10 10v9" />
      </>
    ),
    mail: (
      <>
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path d="m4 8 8 6 8-6" />
      </>
    ),
    moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />,
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
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
      </>
    ),
  };

  return <svg {...commonProps}>{paths[type]}</svg>;
};

export default function ProfileSettingsModule() {
  const { profile, refreshProfile, supabaseUser } = useAuth();
  const [facilities, setFacilities] = useState([]);
  const [pendingFacilityRequest, setPendingFacilityRequest] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [isLoadingFacilities, setIsLoadingFacilities] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [modalError, setModalError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [phoneVerification, setPhoneVerification] = useState(emptyPhoneVerification);
  const [passwordVerification, setPasswordVerification] = useState(emptyPasswordVerification);

  const today = useMemo(() => formatDateTime(new Date()), []);
  const authEmail = supabaseUser?.email || "";
  const readableEmail = getReadableEmail({ authEmail, profile });
  const hasGmailLogin = !!readableEmail;
  const roleLabel = getRoleLabel(profile?.role);
  const statusLabel = getStatusLabel(profile?.status);
  const activeFacility = facilities.find((facility) => facility.id === profile?.facility_id);
  const facilityLabel =
    profile?.facility_name ||
    activeFacility?.facility_name ||
    "No facility assigned";
  const selectedFacility = facilities.find((facility) => facility.id === form.facility_id);
  const selectedFacilityChanged =
    !!form.facility_id && form.facility_id !== (profile?.facility_id || "");

  useEffect(() => {
    let isMounted = true;

    const loadFacilitiesAndRequests = async () => {
      setIsLoadingFacilities(true);
      setProfileError("");

      try {
        const [facilitiesResult, requestResult] = await Promise.all([
          supabase
            .from("facilities")
            .select("id, facility_name, facility_code, facility_type, address, status")
            .eq("status", "ACTIVE")
            .order("facility_name", { ascending: true }),
          getOwnPendingFacilityChangeRequest(profile?.id),
        ]);

        if (facilitiesResult.error) {
          throw facilitiesResult.error;
        }

        if (!isMounted) {
          return;
        }

        setFacilities(facilitiesResult.data || []);
        setPendingFacilityRequest(requestResult);
      } catch (error) {
        if (isMounted) {
          setProfileError(getAuthErrorMessage(error));
        }
      } finally {
        if (isMounted) {
          setIsLoadingFacilities(false);
        }
      }
    };

    if (profile?.id) {
      loadFacilitiesAndRequests();
    }

    return () => {
      isMounted = false;
    };
  }, [profile?.id]);

  const startEditing = () => {
    setForm({
      facility_id: profile?.facility_id || "",
      facility_reason: "",
      first_name: profile?.first_name || "",
      last_name: profile?.last_name || "",
      phone_number: profile?.phone_number || "",
    });
    setMessage("");
    setModalError("");
    setProfileError("");
    setIsEditing(true);
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
  };

  const submitFacilityRequestIfNeeded = async () => {
    if (!selectedFacilityChanged) {
      return false;
    }

    if (pendingFacilityRequest) {
      throw new Error("You already have a pending facility change request.");
    }

    await createFacilityChangeRequest({
      currentFacilityId: profile?.facility_id,
      profileId: profile.id,
      reason: form.facility_reason,
      requestedFacilityId: form.facility_id,
    });

    const latestRequest = await getOwnPendingFacilityChangeRequest(profile.id);
    setPendingFacilityRequest(latestRequest);
    return true;
  };

  const saveEditableProfileFields = async (phoneNumberOverride = form.phone_number) => {
    await updateOwnProfileContact({
      email: readableEmail,
      firstName: form.first_name.trim(),
      lastName: form.last_name.trim(),
      phoneNumber: phoneNumberOverride || "",
    });

    const submittedFacilityRequest = await submitFacilityRequestIfNeeded();

    await refreshProfile?.();
    setMessage(
      submittedFacilityRequest
        ? "Profile updated. Facility change request submitted for admin review."
        : "Profile updated."
    );
  };

  const validateProfileForm = () => {
    if (!profile?.id) {
      return "No active profile was found for this session.";
    }

    if (!form.first_name.trim() || !form.last_name.trim()) {
      return "First name and last name are required.";
    }

    const nextPhoneNumber = form.phone_number.trim()
      ? normalizePhoneNumber(form.phone_number)
      : "";

    if (nextPhoneNumber && !isPhilippineMobileNumber(nextPhoneNumber)) {
      return "Phone number must use the 09XXXXXXXXX format.";
    }

    if (!readableEmail && !nextPhoneNumber) {
      return "Add either a Gmail login or a phone number before saving.";
    }

    if (selectedFacilityChanged && !form.facility_reason.trim()) {
      return "Please explain why you are requesting a facility change.";
    }

    return "";
  };

  const handleSave = async (event) => {
    event.preventDefault();

    const validationError = validateProfileForm();

    if (validationError) {
      setModalError(validationError);
      return;
    }

    const nextPhoneNumber = form.phone_number.trim()
      ? normalizePhoneNumber(form.phone_number)
      : "";
    const currentPhoneNumber = normalizePhoneNumber(profile?.phone_number || "");

    if (nextPhoneNumber !== currentPhoneNumber) {
      await handleStartPhoneChange(nextPhoneNumber);
      return;
    }

    setIsSaving(true);
    setModalError("");

    try {
      await saveEditableProfileFields(nextPhoneNumber);
      setIsEditing(false);
    } catch (error) {
      setModalError(getAuthErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartPhoneChange = async (phoneNumber) => {
    setIsSaving(true);
    setModalError("");

    try {
      await updateUserPhone(phoneNumber);
      setIsEditing(false);
      setPhoneVerification({
        ...emptyPhoneVerification,
        isOpen: true,
        phoneNumber,
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

      await saveEditableProfileFields(phoneVerification.phoneNumber);
      setPhoneVerification(emptyPhoneVerification);
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

  const openPasswordModal = () => {
    setPasswordVerification({
      ...emptyPasswordVerification,
      isOpen: true,
      method: profile?.phone_number ? "phone" : "email",
    });
    setMessage("");
    setProfileError("");
  };

  const handleSendPasswordVerification = async (event) => {
    event.preventDefault();
    setPasswordVerification((current) => ({
      ...current,
      error: "",
      isSending: true,
    }));

    try {
      if (passwordVerification.method === "phone") {
        if (!profile?.phone_number) {
          throw new Error("No phone number is linked to this account.");
        }

        await sendPhoneOtp(profile.phone_number, { shouldCreateUser: false });
      } else {
        if (!readableEmail) {
          throw new Error("No Gmail is linked to this account.");
        }

        await sendEmailOtp(readableEmail, { shouldCreateUser: false });
      }

      setPasswordVerification((current) => ({
        ...current,
        isSending: false,
        step: "verify",
      }));
    } catch (error) {
      setPasswordVerification((current) => ({
        ...current,
        error: getAuthErrorMessage(error),
        isSending: false,
      }));
    }
  };

  const handleVerifyPasswordAndSave = async (event) => {
    event.preventDefault();

    if (passwordVerification.newPassword.length < 6) {
      setPasswordVerification((current) => ({
        ...current,
        error: "Password must be at least 6 characters.",
      }));
      return;
    }

    if (passwordVerification.newPassword !== passwordVerification.confirmPassword) {
      setPasswordVerification((current) => ({
        ...current,
        error: "Passwords do not match.",
      }));
      return;
    }

    setPasswordVerification((current) => ({
      ...current,
      error: "",
      isVerifying: true,
    }));

    try {
      if (passwordVerification.method === "phone") {
        await verifyPhoneOtp({
          phoneNumber: profile.phone_number,
          verificationCode: passwordVerification.code,
        });
      } else {
        await verifyEmailOtp({
          email: readableEmail,
          verificationCode: passwordVerification.code,
        });
      }

      await updateUserPassword(passwordVerification.newPassword);
      setPasswordVerification(emptyPasswordVerification);
      setMessage("Password changed successfully.");
    } catch (error) {
      setPasswordVerification((current) => ({
        ...current,
        error: getAuthErrorMessage(error),
        isVerifying: false,
      }));
    }
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <div className="w-full max-w-[1180px] space-y-5">
        {(message || profileError) && (
          <div className="grid gap-3">
            {message && (
              <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                {message}
              </p>
            )}
            {profileError && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {profileError}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.75fr)]">
          <div className="space-y-5">
            <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40">
              <div className="flex flex-wrap items-center gap-5">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-2xl font-black text-white">
                  {getInitials(profile)}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-2xl font-black text-black">{getFullName(profile)}</h2>
                  <p className="mt-1 text-sm font-medium text-neutral-500">
                    {roleLabel}
                    {facilityLabel !== "No facility assigned" ? ` - ${facilityLabel}` : ""}
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

              <div className="grid gap-4 md:grid-cols-2">
                <ProfileField icon="user" label="First Name" value={profile?.first_name || "Not set"} readOnly />
                <ProfileField icon="user" label="Last Name" value={profile?.last_name || "Not set"} readOnly />
                <ProfileField icon="mail" label="Gmail" value={readableEmail || "No Gmail linked"} readOnly />
                <ProfileField icon="phone" label="Phone" value={profile?.phone_number || "No phone linked"} readOnly />
                <ProfileField icon="role" label="Role" value={roleLabel} readOnly />
                <ProfileField icon="status" label="Status" value={statusLabel} readOnly />
                <ProfileField icon="facility" label="Facility" value={facilityLabel} readOnly />
                <ProfileField icon="facility" label="Facility Code" value={profile?.facility_code || "Not set"} readOnly />
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40">
              <h3 className="text-base font-black text-black">Login Methods</h3>
              <div className="mt-5 grid gap-3">
                <LoginMethod
                  label="Gmail Login"
                  value={readableEmail || "Not linked"}
                  active={hasGmailLogin}
                />
                <LoginMethod
                  label="Phone Login"
                  value={profile?.phone_number || "Not linked"}
                  active={!!profile?.phone_number}
                />
              </div>
              <button
                type="button"
                onClick={handleLinkGoogle}
                disabled={isLinkingGoogle}
                className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-black text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <GoogleIcon />
                {hasGmailLogin ? "Reconnect Gmail Login" : "Add Gmail Login"}
              </button>
            </section>

            {pendingFacilityRequest && (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
                <p className="text-sm font-black uppercase tracking-wide text-amber-700">
                  Pending Facility Request
                </p>
                <h3 className="mt-2 text-lg font-black text-black">
                  {getFacilityLabel(pendingFacilityRequest.requested_facility)}
                </h3>
                <p className="mt-2 text-sm font-medium text-amber-800">
                  Submitted {formatRequestDate(pendingFacilityRequest.created_at)}. Admin approval is required before your assigned facility changes.
                </p>
              </section>
            )}

            <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40">
              <h3 className="mb-5 text-base font-black text-black">System Preferences</h3>
              <div className="divide-y divide-neutral-100">
                {preferenceRows.map((preference) => (
                  <PreferenceRow key={preference.label} {...preference} />
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-red-200 bg-white p-6">
              <h3 className="text-base font-black text-red-600">Account Security</h3>
              <p className="mt-2 text-sm font-medium text-neutral-500">
                Password changes require OTP verification through a linked login method.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={openPasswordModal}
                  className="rounded-lg bg-red-50 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-100"
                >
                  Change Password
                </button>
                <button className="rounded-lg bg-neutral-50 px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100">
                  Export My Data
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4 py-5">
          <form
            onSubmit={handleSave}
            className="flex max-h-[90vh] w-full max-w-[760px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
              <div>
                <h3 className="text-lg font-black text-black">Edit Profile</h3>
                <p className="mt-1 text-sm font-medium text-neutral-500">
                  Role and status are managed by the administrator.
                </p>
              </div>
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

              <div className="grid gap-4 md:grid-cols-2">
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
                <ReadonlyBlock
                  label="Gmail"
                  value={readableEmail || "No Gmail linked"}
                  actionLabel={hasGmailLogin ? "Reconnect Gmail" : "Add Gmail Login"}
                  onAction={handleLinkGoogle}
                  isActionLoading={isLinkingGoogle}
                />
                <ModalField
                  label="Phone"
                  name="phone_number"
                  value={form.phone_number}
                  onChange={handleFieldChange}
                  placeholder="09XXXXXXXXX"
                />
                <ModalField label="Role" value={roleLabel} readOnly />
                <ModalField label="Status" value={statusLabel} readOnly />
                <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-600 md:col-span-2">
                  Facility
                  <select
                    name="facility_id"
                    value={form.facility_id}
                    onChange={handleFieldChange}
                    disabled={isLoadingFacilities || !!pendingFacilityRequest}
                    className="h-11 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-black outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-[#faf9f7]"
                  >
                    <option value="">No facility assigned</option>
                    {facilities.map((facility) => (
                      <option key={facility.id} value={facility.id}>
                        {facility.facility_name} ({facility.facility_code})
                      </option>
                    ))}
                  </select>
                </label>
                {selectedFacilityChanged && !pendingFacilityRequest && (
                  <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-600 md:col-span-2">
                    Facility Change Reason
                    <textarea
                      name="facility_reason"
                      value={form.facility_reason}
                      onChange={handleFieldChange}
                      rows={3}
                      placeholder={`Explain why you need to transfer to ${selectedFacility?.facility_name || "this facility"}.`}
                      className="rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-black outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>
                )}
                {pendingFacilityRequest && (
                  <p className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 md:col-span-2">
                    Facility selection is locked while your current facility change request is pending.
                  </p>
                )}
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
        <OtpModal
          code={phoneVerification.code}
          error={phoneVerification.error}
          isBusy={phoneVerification.isVerifying}
          isResending={phoneVerification.isResending}
          onBack={() => {
            setPhoneVerification(emptyPhoneVerification);
            setIsEditing(true);
          }}
          onChange={(code) =>
            setPhoneVerification((current) => ({ ...current, code }))
          }
          onResend={handleResendPhoneChangeOtp}
          onSubmit={handleVerifyPhoneChange}
          subtitle={`Enter the 6-digit code sent to ${phoneVerification.phoneNumber}.`}
          submitLabel="Verify OTP and Save"
          title="Verify Phone Number"
        />
      )}

      {passwordVerification.isOpen && (
        <PasswordModal
          authEmail={readableEmail}
          onChange={setPasswordVerification}
          onClose={() => setPasswordVerification(emptyPasswordVerification)}
          onSend={handleSendPasswordVerification}
          onSubmit={handleVerifyPasswordAndSave}
          phoneNumber={profile?.phone_number || ""}
          state={passwordVerification}
        />
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
        className="h-11 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-black outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 read-only:cursor-default read-only:bg-[#faf9f7] read-only:focus:border-neutral-200 read-only:focus:ring-0"
      />
    </label>
  );
}

function ReadonlyBlock({ actionLabel, isActionLoading, label, onAction, value }) {
  return (
    <div className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
      {label}
      <div className="rounded-lg border border-neutral-200 bg-[#faf9f7] px-3 py-3 text-sm font-semibold normal-case tracking-normal text-black">
        {value}
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={isActionLoading}
        className="flex h-10 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <GoogleIcon />
        {isActionLoading ? "Opening Google..." : actionLabel}
      </button>
    </div>
  );
}

function LoginMethod({ active, label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-[#faf9f7] px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-black text-black">{label}</p>
        <p className="truncate text-sm font-medium text-neutral-500">{value}</p>
      </div>
      <span
        className={`rounded-full px-3 py-1 text-xs font-black ${
          active
            ? "bg-emerald-100 text-emerald-700"
            : "bg-neutral-100 text-neutral-500"
        }`}
      >
        {active ? "Linked" : "Missing"}
      </span>
    </div>
  );
}

function OtpModal({
  code,
  error,
  isBusy,
  isResending,
  onBack,
  onChange,
  onResend,
  onSubmit,
  submitLabel,
  subtitle,
  title,
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4 py-5">
      <form onSubmit={onSubmit} className="w-full max-w-[430px] rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-black text-black">{title}</h3>
        <p className="mt-1 text-sm font-medium text-neutral-500">{subtitle}</p>

        <label className="mt-6 grid gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
          Verification Code
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
            className="h-12 rounded-lg border border-neutral-200 bg-white px-3 text-center text-lg font-black tracking-[0.35em] text-black outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            required
          />
        </label>

        {error && (
          <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isBusy}
          className="mt-5 w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          {isBusy ? "Verifying..." : submitLabel}
        </button>
        <button
          type="button"
          onClick={onResend}
          disabled={isResending}
          className="mt-3 w-full rounded-lg bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isResending ? "Resending..." : "Resend OTP"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="mt-3 w-full rounded-lg px-4 py-3 text-sm font-bold text-neutral-500 hover:bg-neutral-50"
        >
          Back
        </button>
      </form>
    </div>
  );
}

function PasswordModal({ authEmail, onChange, onClose, onSend, onSubmit, phoneNumber, state }) {
  const updateState = (updates) => onChange((current) => ({ ...current, ...updates }));

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4 py-5">
      <form
        onSubmit={state.step === "choose" ? onSend : onSubmit}
        className="w-full max-w-[500px] rounded-xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-black">Change Password</h3>
            <p className="mt-1 text-sm font-medium text-neutral-500">
              Verify your identity before setting a new phone-login password.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800"
            aria-label="Close change password"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {state.step === "choose" ? (
          <div className="mt-6 grid gap-3">
            <VerificationChoice
              checked={state.method === "phone"}
              disabled={!phoneNumber}
              label="Send OTP to phone"
              value={phoneNumber || "No phone linked"}
              onClick={() => updateState({ method: "phone" })}
            />
            <VerificationChoice
              checked={state.method === "email"}
              disabled={!authEmail}
              label="Send code to Gmail"
              value={authEmail || "No Gmail linked"}
              onClick={() => updateState({ method: "email" })}
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            <ModalField
              label="Verification Code"
              value={state.code}
              onChange={(event) => updateState({ code: event.target.value.replace(/\D/g, "") })}
              inputMode="numeric"
              maxLength={6}
            />
            <ModalField
              label="New Password"
              type="password"
              value={state.newPassword}
              onChange={(event) => updateState({ newPassword: event.target.value })}
            />
            <ModalField
              label="Confirm Password"
              type="password"
              value={state.confirmPassword}
              onChange={(event) => updateState({ confirmPassword: event.target.value })}
            />
          </div>
        )}

        {state.error && (
          <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {state.error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-50 px-5 py-2.5 text-sm font-bold text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={state.isSending || state.isVerifying}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {state.step === "choose"
              ? state.isSending ? "Sending..." : "Send Verification"
              : state.isVerifying ? "Saving..." : "Change Password"}
          </button>
        </div>
      </form>
    </div>
  );
}

function VerificationChoice({ checked, disabled, label, onClick, value }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "border-emerald-500 bg-emerald-50"
          : "border-neutral-200 bg-white hover:bg-neutral-50"
      }`}
    >
      <span>
        <span className="block text-sm font-black text-black">{label}</span>
        <span className="mt-1 block text-sm font-medium text-neutral-500">{value}</span>
      </span>
      <span
        className={`h-4 w-4 rounded-full border ${
          checked ? "border-emerald-600 bg-emerald-600" : "border-neutral-300"
        }`}
      />
    </button>
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
