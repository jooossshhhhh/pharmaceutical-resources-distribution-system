import { useCallback, useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import {
  getAuthErrorMessage,
  getCurrentAuthUser,
  getUserIdentities,
  isPhilippineMobileNumber,
  logOwnPasswordChange,
  linkGoogleIdentity,
  normalizePhoneNumber,
  resendPhoneChangeOtp,
  sendPasswordResetEmail,
  sendPhoneOtp,
  signInWithEmailPassword,
  signInWithPhonePassword,
  unlinkUserIdentity,
  updateUserPassword,
  updateUserPhone,
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
import OtpModal from "./OtpModal";
import PasswordModal from "./PasswordModal";
import { LoginMethod, PreferenceRow } from "./ProfileCards";
import { ModalField, ProfileField, ReadonlyBlock } from "./ProfileFields";
import RemoveLoginMethodModal from "./RemoveLoginMethodModal";
import {
  canRemoveLoginMethod,
  emptyForm,
  emptyPasswordVerification,
  emptyPhoneVerification,
  formatRequestDate,
  getAuthCallbackParams,
  getFacilityLabel,
  getFullName,
  getGoogleIdentityEmail,
  getGoogleLinkErrorMessage,
  getInitials,
  getIdentityByProvider,
  getLinkedGmailEmail,
  getLoginMethodAction,
  getRoleLabel,
  getStatusLabel,
  getSubmittedPhoneNumber,
  preferenceRows,
} from "./profileSettingsUtils";

const cleanAuthCallbackUrl = () => {
  window.history.replaceState({}, document.title, window.location.pathname);
};

const emptyRemoveLoginMethod = {
  error: "",
  isOpen: false,
  isRemoving: false,
  method: "",
  password: "",
};

export default function ProfileSettingsModule() {
  const { profile, refreshProfile } = useAuth();
  const [authIdentities, setAuthIdentities] = useState([]);
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
  const [removeLoginMethod, setRemoveLoginMethod] = useState(emptyRemoveLoginMethod);
  const [processedUrl, setProcessedUrl] = useState("");

  const today = useMemo(() => formatDateTime(new Date()), []);
  const googleIdentity = getIdentityByProvider(authIdentities, "google");
  const phoneIdentity = getIdentityByProvider(authIdentities, "phone");
  const googleIdentityEmail = getGoogleIdentityEmail(authIdentities);
  const linkedGmailEmail = getLinkedGmailEmail({
    identities: authIdentities,
    profileEmail: profile?.email || "",
  });
  const hasGmailLogin = !!googleIdentity && !!linkedGmailEmail;
  const hasPhoneLogin = !!phoneIdentity && !!profile?.phone_number;
  const loginMethodAction = getLoginMethodAction({ hasGmailLogin, hasPhoneLogin });
  const canRemoveGmail = canRemoveLoginMethod({
    hasGmailLogin,
    hasPhoneLogin,
    method: "gmail",
  });
  const canRemovePhone = canRemoveLoginMethod({
    hasGmailLogin,
    hasPhoneLogin,
    method: "phone",
  });
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

  const syncProfileEmail = useCallback(async (emailOverride = googleIdentityEmail) => {
    if (!profile?.id || !emailOverride || profile.email === emailOverride) {
      return false;
    }

    await updateOwnProfileContact({
      email: emailOverride,
      firstName: profile.first_name,
      lastName: profile.last_name,
      phoneNumber: profile.phone_number,
    });
    await refreshProfile?.();
    return true;
  }, [googleIdentityEmail, profile, refreshProfile]);

  const loadAuthIdentitiesAndSyncEmail = useCallback(async () => {
    await getCurrentAuthUser();
    const identities = await getUserIdentities();
    const linkedGoogleEmail = getGoogleIdentityEmail(identities);

    setAuthIdentities(identities);

    if (linkedGoogleEmail) {
      return syncProfileEmail(linkedGoogleEmail);
    }

    return false;
  }, [syncProfileEmail]);

  useEffect(() => {
    let isMounted = true;

    const loadProfileContext = async () => {
      setIsLoadingFacilities(true);
      setProfileError("");

      try {
        const [facilitiesResult, requestResult, identities] = await Promise.all([
          supabase
            .from("facilities")
            .select("id, facility_name, facility_code, facility_type, address, status")
            .eq("status", "ACTIVE")
            .order("facility_name", { ascending: true }),
          getOwnPendingFacilityChangeRequest(profile?.id),
          getUserIdentities(),
        ]);

        if (facilitiesResult.error) {
          throw facilitiesResult.error;
        }

        if (!isMounted) {
          return;
        }

        setFacilities(facilitiesResult.data || []);
        setPendingFacilityRequest(requestResult);
        setAuthIdentities(identities);

        const linkedGoogleEmail = getGoogleIdentityEmail(identities);
        if (linkedGoogleEmail && profile.email !== linkedGoogleEmail) {
          await updateOwnProfileContact({
            email: linkedGoogleEmail,
            firstName: profile.first_name,
            lastName: profile.last_name,
            phoneNumber: profile.phone_number,
          });
          await refreshProfile?.();
        }
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
      loadProfileContext();
    }

    return () => {
      isMounted = false;
    };
  }, [
    profile?.email,
    profile?.first_name,
    profile?.id,
    profile?.last_name,
    profile?.phone_number,
    refreshProfile,
  ]);

  useEffect(() => {
    if (!profile?.id || processedUrl === window.location.href) {
      return;
    }

    const { error, errorCode, errorDescription } = getAuthCallbackParams(window.location.href);
    const hasAuthCallbackParams =
      window.location.search.includes("code=") ||
      window.location.search.includes("error=") ||
      window.location.hash.includes("access_token") ||
      window.location.hash.includes("error=");

    if (!hasAuthCallbackParams) {
      return;
    }

    setProcessedUrl(window.location.href);

    const handleAuthCallback = async () => {
      setProfileError("");

      try {
        const syncedEmail = await loadAuthIdentitiesAndSyncEmail();

        if (error || errorCode || errorDescription) {
          if (syncedEmail) {
            setMessage("Gmail login was already linked to this account and has been synced.");
          } else {
            setProfileError(getGoogleLinkErrorMessage(errorDescription || errorCode || error));
          }
        } else if (syncedEmail) {
          setMessage("Gmail login linked successfully.");
        }
      } catch (callbackError) {
        setProfileError(getAuthErrorMessage(callbackError));
      } finally {
        setIsLinkingGoogle(false);
        cleanAuthCallbackUrl();
      }
    };

    handleAuthCallback();
  }, [loadAuthIdentitiesAndSyncEmail, processedUrl, profile?.id]);

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
      email: linkedGmailEmail,
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

    const submittedPhoneNumber = getSubmittedPhoneNumber({
      currentPhoneNumber: profile?.phone_number || "",
      formPhoneNumber: form.phone_number,
    });
    const nextPhoneNumber = submittedPhoneNumber
      ? normalizePhoneNumber(submittedPhoneNumber)
      : "";

    if (nextPhoneNumber && !isPhilippineMobileNumber(nextPhoneNumber)) {
      return "Phone number must use the 09XXXXXXXXX format.";
    }

    if (!linkedGmailEmail && !nextPhoneNumber) {
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

    const submittedPhoneNumber = getSubmittedPhoneNumber({
      currentPhoneNumber: profile?.phone_number || "",
      formPhoneNumber: form.phone_number,
    });
    const nextPhoneNumber = submittedPhoneNumber
      ? normalizePhoneNumber(submittedPhoneNumber)
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

  const handleLoginMethodAction = () => {
    if (loginMethodAction?.kind === "gmail") {
      handleLinkGoogle();
      return;
    }

    if (loginMethodAction?.kind === "phone") {
      startEditing();
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
        if (!linkedGmailEmail) {
          throw new Error("No Gmail is linked to this account.");
        }

        await sendPasswordResetEmail(linkedGmailEmail);
        setPasswordVerification(emptyPasswordVerification);
        setMessage(
          "Password reset link sent to your Gmail. Open the email to set a new password."
        );
        return;
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
      }

      await updateUserPassword(passwordVerification.newPassword);
      await logOwnPasswordChange();
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

  const openRemoveLoginMethod = (method) => {
    const methodLabel = method === "gmail" ? "Gmail Login" : "Phone Login";

    setRemoveLoginMethod({
      ...emptyRemoveLoginMethod,
      isOpen: true,
      method,
    });
    setMessage("");
    setProfileError("");

    if (
      !canRemoveLoginMethod({
        hasGmailLogin,
        hasPhoneLogin,
        method,
      })
    ) {
      setRemoveLoginMethod({
        ...emptyRemoveLoginMethod,
        error: `${methodLabel} cannot be removed because it is the only connected login method.`,
        isOpen: true,
        method,
      });
    }
  };

  const verifyCurrentPassword = async (password) => {
    if (profile?.phone_number) {
      const result = await signInWithPhonePassword({
        phoneNumber: profile.phone_number,
        password,
      });

      if (result.user?.id !== profile.id) {
        throw new Error("Password verification did not match the current account.");
      }

      return result;
    }

    if (linkedGmailEmail) {
      const result = await signInWithEmailPassword({
        email: linkedGmailEmail,
        password,
      });

      if (result.user?.id !== profile.id) {
        throw new Error("Password verification did not match the current account.");
      }

      return result;
    }

    throw new Error("No password login method is available for verification.");
  };

  const handleRemoveLoginMethod = async (event) => {
    event.preventDefault();

    if (!removeLoginMethod.password) {
      setRemoveLoginMethod((current) => ({
        ...current,
        error: "Current password is required.",
      }));
      return;
    }

    setRemoveLoginMethod((current) => ({
      ...current,
      error: "",
      isRemoving: true,
    }));

    try {
      await verifyCurrentPassword(removeLoginMethod.password);

      const latestIdentities = await getUserIdentities();
      const identity = getIdentityByProvider(
        latestIdentities,
        removeLoginMethod.method === "gmail" ? "google" : "phone"
      );

      if (!identity) {
        throw new Error("This login method is not linked in Supabase Auth.");
      }

      await unlinkUserIdentity(identity);

      const remainingIdentities = await getUserIdentities();
      const remainingGoogleEmail = getGoogleIdentityEmail(remainingIdentities);
      const nextEmail =
        removeLoginMethod.method === "gmail" ? remainingGoogleEmail : linkedGmailEmail;
      const nextPhoneNumber =
        removeLoginMethod.method === "phone" ? "" : profile?.phone_number || "";

      await updateOwnProfileContact({
        email: nextEmail || null,
        firstName: profile.first_name,
        lastName: profile.last_name,
        phoneNumber: nextPhoneNumber,
      });

      setAuthIdentities(remainingIdentities);
      await refreshProfile?.();
      setRemoveLoginMethod(emptyRemoveLoginMethod);
      setMessage(
        `${removeLoginMethod.method === "gmail" ? "Gmail" : "Phone"} login removed.`
      );
    } catch (error) {
      setRemoveLoginMethod((current) => ({
        ...current,
        error: getAuthErrorMessage(error),
        isRemoving: false,
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
                <ProfileField icon="mail" label="Gmail" value={linkedGmailEmail || "No Gmail linked"} readOnly />
                <ProfileField icon="phone" label="Phone" value={hasPhoneLogin ? profile?.phone_number : "No phone linked"} readOnly />
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
                  value={hasGmailLogin ? linkedGmailEmail : "Not connected"}
                  active={hasGmailLogin}
                  canRemove={canRemoveGmail}
                  isRemoving={removeLoginMethod.isRemoving && removeLoginMethod.method === "gmail"}
                  onRemove={() => openRemoveLoginMethod("gmail")}
                />
                <LoginMethod
                  label="Phone Login"
                  value={hasPhoneLogin ? profile?.phone_number : "Not connected"}
                  active={hasPhoneLogin}
                  canRemove={canRemovePhone}
                  isRemoving={removeLoginMethod.isRemoving && removeLoginMethod.method === "phone"}
                  onRemove={() => openRemoveLoginMethod("phone")}
                />
              </div>
              {loginMethodAction && (
                <button
                  type="button"
                  onClick={handleLoginMethodAction}
                  disabled={isLinkingGoogle}
                  className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-black text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLinkingGoogle ? "Opening Google..." : loginMethodAction.label}
                </button>
              )}
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
                  value={linkedGmailEmail || "No Gmail linked"}
                  actionLabel={!hasGmailLogin ? "Add Gmail Login" : ""}
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
          authEmail={linkedGmailEmail}
          onChange={setPasswordVerification}
          onClose={() => setPasswordVerification(emptyPasswordVerification)}
          onSend={handleSendPasswordVerification}
          onSubmit={handleVerifyPasswordAndSave}
          phoneNumber={profile?.phone_number || ""}
          state={passwordVerification}
        />
      )}

      {removeLoginMethod.isOpen && (
        <RemoveLoginMethodModal
          error={removeLoginMethod.error}
          isRemoving={removeLoginMethod.isRemoving}
          methodLabel={removeLoginMethod.method === "gmail" ? "Gmail Login" : "Phone Login"}
          onClose={() => setRemoveLoginMethod(emptyRemoveLoginMethod)}
          onPasswordChange={(password) =>
            setRemoveLoginMethod((current) => ({ ...current, password }))
          }
          onSubmit={handleRemoveLoginMethod}
          password={removeLoginMethod.password}
        />
      )}
    </AdminShell>
  );
}
