import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  signOutOtherSessions,
  toPhilippineE164PhoneNumber,
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
  getProfileAvatarUrl,
  removeProfileAvatar,
  updateOwnProfileAvatar,
  updateOwnProfileContact,
  uploadProfileAvatar,
} from "../../features/auth/ProfileService";
import { supabase } from "../../services/supabase";
import { formatDateTime } from "../dashboard/dashboardUtils";
import ModalShell from "../../components/ModalShell";
import OtpModal from "./OtpModal";
import PasswordModal from "./PasswordModal";
import { LoginMethod } from "./ProfileCards";
import { ModalField, ProfileField, ReadonlyBlock } from "./ProfileFields";
import RemoveLoginMethodModal from "./RemoveLoginMethodModal";
import {
  canRemoveLoginMethod,
  emptyForm,
  emptyPasswordVerification,
  emptyPhoneVerification,
  formatRequestDate,
  getAuthCallbackParams,
  getAuthLinkedPhoneNumber,
  getFacilityLabel,
  getFullName,
  getGoogleIdentityEmail,
  getGoogleLinkErrorMessage,
  getInitials,
  getIdentityByProvider,
  getLinkedGmailEmail,
  getLoginMethodAction,
getPhoneChangeState,
  getPendingAuthPhoneNumber,
  getPhoneNumberErrorMessage,
  getRoleLabel,
  getStatusLabel,
  maskPhoneNumber,
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

const emptyAddPhoneLogin = {
  error: "",
  isOpen: false,
  isSending: false,
  phoneNumber: "",
};

export default function ProfileSettingsModule() {
  const { profile, refreshProfile } = useAuth();
  const avatarInputRef = useRef(null);
  const [authIdentities, setAuthIdentities] = useState([]);
  const [authUser, setAuthUser] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [facilities, setFacilities] = useState([]);
  const [pendingFacilityRequest, setPendingFacilityRequest] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [isLoadingFacilities, setIsLoadingFacilities] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSigningOutOthers, setIsSigningOutOthers] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [message, setMessage] = useState("");
  const [modalError, setModalError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [addPhoneLogin, setAddPhoneLogin] = useState(emptyAddPhoneLogin);
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
  const authLinkedPhoneNumber = getAuthLinkedPhoneNumber({
    authUser,
    identities: authIdentities,
    normalizePhoneNumber,
  });
  const profilePhoneNumber = profile?.phone_number
    ? normalizePhoneNumber(profile.phone_number)
    : "";
  const linkedPhoneNumber = profilePhoneNumber || authLinkedPhoneNumber;
  const hasPhoneLogin = !!authLinkedPhoneNumber || (!!phoneIdentity && !!linkedPhoneNumber);
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

  const phoneInputFeedback = (() => {
    const raw = form.phone_number || "";
    const normalized = raw ? normalizePhoneNumber(raw) : "";

    if (!normalized) {
      return { tone: "neutral", message: "" };
    }

    if (isPhilippineMobileNumber(normalized)) {
      return { tone: "valid", message: "Valid phone number." };
    }

    return { tone: "invalid", message: "Phone number must use the 09XXXXXXXXX format." };
  })();

  useEffect(() => {
    if (!message) {
      return undefined;
    }

    const timerId = window.setTimeout(() => setMessage(""), 4000);

    return () => window.clearTimeout(timerId);
  }, [message]);

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

  const syncProfilePhone = useCallback(async (
    phoneNumberOverride,
    emailOverride = linkedGmailEmail
  ) => {
    const nextPhoneNumber = normalizePhoneNumber(phoneNumberOverride || "");
    const currentPhoneNumber = profile?.phone_number
      ? normalizePhoneNumber(profile.phone_number)
      : "";

    if (!profile?.id || !nextPhoneNumber || currentPhoneNumber === nextPhoneNumber) {
      return false;
    }

    await updateOwnProfileContact({
      email: emailOverride || profile.email || null,
      firstName: profile.first_name,
      lastName: profile.last_name,
      phoneNumber: nextPhoneNumber,
    });
    await refreshProfile?.();
    return true;
  }, [linkedGmailEmail, profile, refreshProfile]);

  const loadAuthIdentitiesAndSyncEmail = useCallback(async () => {
    const currentAuthUser = await getCurrentAuthUser();
    const identities = await getUserIdentities();
    const linkedGoogleEmail = getGoogleIdentityEmail(identities);
    const linkedAuthPhoneNumber = getAuthLinkedPhoneNumber({
      authUser: currentAuthUser,
      identities,
      normalizePhoneNumber,
    });

    setAuthIdentities(identities);
    setAuthUser(currentAuthUser);

    let didSync = false;
    if (linkedGoogleEmail) {
      didSync = await syncProfileEmail(linkedGoogleEmail);
    }

    if (linkedAuthPhoneNumber) {
      didSync =
        (await syncProfilePhone(linkedAuthPhoneNumber, linkedGoogleEmail || profile?.email)) ||
        didSync;
    }

    return didSync;
  }, [profile?.email, syncProfileEmail, syncProfilePhone]);

  useEffect(() => {
    let isMounted = true;

    const loadProfileContext = async () => {
      setIsLoadingFacilities(true);
      setProfileError("");

      try {
        const [facilitiesResult, requestResult, identities, currentAuthUser, avatar] =
          await Promise.all([
            supabase
              .from("facilities")
              .select("id, facility_name, facility_code, facility_type, address, status")
              .eq("status", "ACTIVE")
              .order("facility_name", { ascending: true }),
            getOwnPendingFacilityChangeRequest(profile?.id),
            getUserIdentities(),
            getCurrentAuthUser(),
            getProfileAvatarUrl(profile?.id),
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
        setAuthUser(currentAuthUser);
        setAvatarUrl(avatar);

        const linkedGoogleEmail = getGoogleIdentityEmail(identities);
        const linkedAuthPhoneNumber = getAuthLinkedPhoneNumber({
          authUser: currentAuthUser,
          identities,
          normalizePhoneNumber,
        });
        const shouldSyncEmail = linkedGoogleEmail && profile.email !== linkedGoogleEmail;
        const shouldSyncPhone =
          linkedAuthPhoneNumber &&
          normalizePhoneNumber(profile.phone_number || "") !== linkedAuthPhoneNumber;

        if (shouldSyncEmail || shouldSyncPhone) {
          await updateOwnProfileContact({
            email: linkedGoogleEmail || profile.email,
            firstName: profile.first_name,
            lastName: profile.last_name,
            phoneNumber: shouldSyncPhone ? linkedAuthPhoneNumber : profile.phone_number,
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
      phone_number: linkedPhoneNumber || "",
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

    const phoneChangeState = getPhoneChangeState({
      currentPhoneNumber: linkedPhoneNumber || "",
      formPhoneNumber: form.phone_number,
      normalizePhoneNumber,
    });
    const nextPhoneNumber = phoneChangeState.nextPhoneNumber;

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

    const phoneChangeState = getPhoneChangeState({
      currentPhoneNumber: linkedPhoneNumber || "",
      formPhoneNumber: form.phone_number,
      normalizePhoneNumber,
    });
    const nextPhoneNumber = phoneChangeState.nextPhoneNumber;

    if (phoneChangeState.requiresVerification) {
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

  const handleStartPhoneChange = async (phoneNumber, source = "profile-edit") => {
    const nextPhoneNumber = normalizePhoneNumber(phoneNumber || "");

    setIsSaving(true);
    setModalError("");

    try {
const currentAuthUser = await getCurrentAuthUser();
      const identities = await getUserIdentities();
      const currentAuthPhoneNumber = getAuthLinkedPhoneNumber({
        authUser: currentAuthUser,
        identities,
        normalizePhoneNumber,
      });
      const pendingAuthPhoneNumber = getPendingAuthPhoneNumber({
        authUser: currentAuthUser,
        normalizePhoneNumber,
      });

      setAuthUser(currentAuthUser);
      setAuthIdentities(identities);

      if (currentAuthPhoneNumber && currentAuthPhoneNumber === nextPhoneNumber) {
        if (source === "login-method") {
          await syncProfilePhone(nextPhoneNumber);
          setAddPhoneLogin(emptyAddPhoneLogin);
          setMessage("Phone login was already linked in Supabase Auth and has been synced to your profile.");
        } else {
          await saveEditableProfileFields(nextPhoneNumber);
          setIsEditing(false);
        }

        return true;
      }

      if (pendingAuthPhoneNumber && pendingAuthPhoneNumber === nextPhoneNumber) {
        setIsEditing(false);
        setAddPhoneLogin(emptyAddPhoneLogin);
        setPhoneVerification({
          ...emptyPhoneVerification,
          isOpen: true,
          phoneNumber: nextPhoneNumber,
          source,
        });
        return true;
      }

      await updateUserPhone(nextPhoneNumber);
      setIsEditing(false);
      setAddPhoneLogin(emptyAddPhoneLogin);
      setPhoneVerification({
        ...emptyPhoneVerification,
        isOpen: true,
        phoneNumber: nextPhoneNumber,
        source,
      });
return true;
    } catch (error) {
      const currentAuthUser = await getCurrentAuthUser().catch(() => null);
      const identities = await getUserIdentities().catch(() => []);
      const currentAuthPhoneNumber = getAuthLinkedPhoneNumber({
        authUser: currentAuthUser,
        identities,
        normalizePhoneNumber,
      });
      const pendingAuthPhoneNumber = getPendingAuthPhoneNumber({
        authUser: currentAuthUser,
        normalizePhoneNumber,
      });

      setAuthUser(currentAuthUser);
      setAuthIdentities(identities);

      if (currentAuthPhoneNumber && currentAuthPhoneNumber === nextPhoneNumber) {
        if (source === "login-method") {
          await syncProfilePhone(nextPhoneNumber);
          setAddPhoneLogin(emptyAddPhoneLogin);
          setMessage("Phone login was already linked in Supabase Auth and has been synced to your profile.");
        } else {
          await saveEditableProfileFields(nextPhoneNumber);
          setIsEditing(false);
        }

        return true;
      }

      if (pendingAuthPhoneNumber && pendingAuthPhoneNumber === nextPhoneNumber) {
        setIsEditing(false);
        setAddPhoneLogin(emptyAddPhoneLogin);
        setPhoneVerification({
          ...emptyPhoneVerification,
          isOpen: true,
          phoneNumber: nextPhoneNumber,
          source,
        });
        return true;
      }

      const errorMessage = getPhoneNumberErrorMessage(error);
      if (source === "login-method") {
        setAddPhoneLogin((current) => ({
          ...current,
          error: errorMessage,
        }));
      } else {
        setModalError(errorMessage);
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddPhoneLoginSubmit = async (event) => {
    event.preventDefault();
    const nextPhoneNumber = normalizePhoneNumber(addPhoneLogin.phoneNumber);

    if (!isPhilippineMobileNumber(nextPhoneNumber)) {
      setAddPhoneLogin((current) => ({
        ...current,
        error: "Phone number must use the 09XXXXXXXXX format.",
      }));
      return;
    }

    if (linkedPhoneNumber && nextPhoneNumber === linkedPhoneNumber) {
      setAddPhoneLogin((current) => ({
        ...current,
        error: "This phone number is already linked to your profile.",
      }));
      return;
    }

    setAddPhoneLogin((current) => ({
      ...current,
      error: "",
      isSending: true,
    }));

    const didStartVerification = await handleStartPhoneChange(nextPhoneNumber, "login-method");

    if (!didStartVerification) {
      setAddPhoneLogin((current) => ({
        ...current,
        isSending: false,
      }));
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

      if (phoneVerification.source === "login-method") {
        await updateOwnProfileContact({
          email: linkedGmailEmail,
          firstName: profile.first_name,
          lastName: profile.last_name,
          phoneNumber: phoneVerification.phoneNumber,
        });
        await refreshProfile?.();
      } else {
        await saveEditableProfileFields(phoneVerification.phoneNumber);
      }

      const identities = await getUserIdentities();
      setAuthIdentities(identities);
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

  const handleExportMyData = async () => {
    setIsExporting(true);
    setProfileError("");

    try {
      const identities = await getUserIdentities();
      const currentAuthUser = await getCurrentAuthUser();
      const exportData = {
        exportedAt: new Date().toISOString(),
        profile: profile
          ? {
              id: profile.id,
              firstName: profile.first_name,
              lastName: profile.last_name,
              email: profile.email,
              phoneNumber: profile.phone_number,
              role: profile.role,
              status: profile.status,
              facilityId: profile.facility_id,
              facilityName: profile.facility_name,
              createdAt: profile.created_at,
            }
          : null,
        authUser: currentAuthUser
          ? {
              email: currentAuthUser.email,
              phone: currentAuthUser.phone,
              createdAt: currentAuthUser.created_at,
              lastSignInAt: currentAuthUser.last_sign_in_at,
              identities: identities.map((identity) => ({
                provider: identity.provider,
                email: identity.email || identity.identity_data?.email || null,
                phone: identity.identity_data?.phone || null,
                createdAt: identity.created_at,
              })),
            }
          : null,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `prds-profile-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Your data has been exported.");
    } catch (error) {
      setProfileError(getAuthErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setProfileError("Please choose an image file for your profile photo.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setProfileError("Profile photo must be 5MB or smaller.");
      return;
    }

    setIsUploadingAvatar(true);
    setProfileError("");

    try {
      const publicUrl = await uploadProfileAvatar({
        file,
        userId: profile.id,
      });
      await updateOwnProfileAvatar(publicUrl);
      setAvatarUrl(publicUrl);
      setMessage("Profile photo updated.");
    } catch (error) {
      setProfileError(getAuthErrorMessage(error));
    } finally {
      setIsUploadingAvatar(false);

      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  };

  const handleRemoveAvatar = async () => {
    setIsUploadingAvatar(true);
    setProfileError("");

    try {
      await removeProfileAvatar({ userId: profile.id });
      await updateOwnProfileAvatar("");
      setAvatarUrl("");
      setMessage("Profile photo removed.");
    } catch (error) {
      setProfileError(getAuthErrorMessage(error));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSignOutOtherSessions = async () => {
    setIsSigningOutOthers(true);
    setProfileError("");

    try {
      await signOutOtherSessions();
      setMessage("Signed out of all other devices.");
    } catch (error) {
      setProfileError(getAuthErrorMessage(error));
    } finally {
      setIsSigningOutOthers(false);
    }
  };

  const handleLoginMethodAction = () => {
    if (loginMethodAction?.kind === "gmail") {
      handleLinkGoogle();
      return;
    }

    if (loginMethodAction?.kind === "phone") {
      setAddPhoneLogin({
        ...emptyAddPhoneLogin,
        isOpen: true,
        phoneNumber: profile?.phone_number || "",
      });
      setMessage("");
      setModalError("");
      setProfileError("");
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

        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40">
          <div className="flex flex-wrap items-center gap-5">
            <div className="shrink-0">
              <div className="relative">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={`${getFullName(profile)} profile photo`}
                    className="h-20 w-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600 text-2xl font-black text-white">
                    {getInitials(profile)}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 shadow-sm hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Change profile photo"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5l-2-3Z" />
                    <path d="M12 17v-4m-2 2h4" />
                  </svg>
                </button>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={isUploadingAvatar}
                  className="mt-2 text-xs font-bold text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isUploadingAvatar ? "Saving..." : "Remove photo"}
                </button>
              )}
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

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-base font-black text-black">Personal Information</h3>
              {!isEditing ? (
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
              ) : (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                  Editing
                </span>
              )}
            </div>

            {isEditing ? (
              <form id="inline-profile-form" onSubmit={handleSave} className="grid gap-4 md:grid-cols-2">
                {modalError && (
                  <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 md:col-span-2">
                    {modalError}
                  </p>
                )}

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
                <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
                  Phone
                  <input
                    type="text"
                    inputMode="numeric"
                    name="phone_number"
                    value={form.phone_number}
                    onChange={handleFieldChange}
                    placeholder="09XXXXXXXXX"
                    className="h-11 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-black outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                  {phoneInputFeedback.message && (
                    <span
                      className={`text-xs font-bold normal-case tracking-normal ${
                        phoneInputFeedback.tone === "valid"
                          ? "text-emerald-700"
                          : "text-red-700"
                      }`}
                    >
                      {phoneInputFeedback.message}
                    </span>
                  )}
                </label>
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

                <div className="flex justify-end gap-3 md:col-span-2">
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
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <ProfileField icon="user" label="First Name" value={profile?.first_name || "Not set"} readOnly />
                <ProfileField icon="user" label="Last Name" value={profile?.last_name || "Not set"} readOnly />
                <ProfileField icon="mail" label="Gmail" value={linkedGmailEmail || "No Gmail linked"} readOnly />
                <ProfileField icon="phone" label="Phone" value={hasPhoneLogin ? maskPhoneNumber(linkedPhoneNumber) : "No phone linked"} readOnly />
                <ProfileField icon="role" label="Role" value={roleLabel} readOnly />
                <ProfileField icon="status" label="Status" value={statusLabel} readOnly />
                <ProfileField icon="facility" label="Facility" value={facilityLabel} readOnly />
                <ProfileField icon="facility" label="Facility Code" value={profile?.facility_code || "Not set"} readOnly />
              </div>
            )}
          </section>

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
                value={hasPhoneLogin ? maskPhoneNumber(linkedPhoneNumber) : "Not connected"}
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
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm shadow-neutral-200/40">
            <h3 className="mb-5 text-base font-black text-black">Account Details</h3>
            <div className="grid gap-3">
              <ProfileField
                icon="user"
                label="Member Since"
                value={profile?.created_at ? formatRequestDate(profile.created_at) : "—"}
                readOnly
              />
              <ProfileField
                icon="check"
                label="Last Login"
                value={authUser?.last_sign_in_at ? formatRequestDate(authUser.last_sign_in_at) : "—"}
                readOnly
              />
              <ProfileField
                icon="mail"
                label="Account Email"
                value={authUser?.email || "—"}
                readOnly
              />
              <ProfileField
                icon="phone"
                label="Account Phone"
                value={
                  linkedPhoneNumber
                    ? maskPhoneNumber(linkedPhoneNumber)
                    : "—"
                }
                readOnly
              />
            </div>
          </section>

          <section className="rounded-xl border border-red-200 bg-white p-6">
            <h3 className="text-base font-black text-red-600">Account Security</h3>
            <p className="mt-2 text-sm font-medium text-neutral-500">
              Password changes require OTP verification through a linked login method.
            </p>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={openPasswordModal}
                className="rounded-lg bg-red-50 px-4 py-2.5 text-left text-sm font-bold text-red-600 hover:bg-red-100"
              >
                Change Password
              </button>
              <button
                type="button"
                onClick={handleExportMyData}
                disabled={isExporting}
                className="rounded-lg bg-neutral-50 px-4 py-2.5 text-left text-sm font-bold text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExporting ? "Exporting..." : "Export My Data"}
              </button>
              <button
                type="button"
                onClick={handleSignOutOtherSessions}
                disabled={isSigningOutOthers}
                className="rounded-lg bg-neutral-50 px-4 py-2.5 text-left text-sm font-bold text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSigningOutOthers ? "Signing out..." : "Sign Out Other Devices"}
              </button>
            </div>
          </section>
        </div>
      </div>

      {addPhoneLogin.isOpen && (
        <ModalShell
          labelledBy="add-phone-modal-title"
          onClose={() => setAddPhoneLogin(emptyAddPhoneLogin)}
          overlayClassName="bg-white/95 backdrop-blur-sm"
        >
          <form
            onSubmit={handleAddPhoneLoginSubmit}
            className="w-full max-w-[460px] overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
              <div>
                <h3 id="add-phone-modal-title" className="text-lg font-black text-black">Add Phone Number</h3>
                <p className="mt-1 text-sm font-medium text-neutral-500">
                  A verification code will be sent before this phone login is saved.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddPhoneLogin(emptyAddPhoneLogin)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800"
                aria-label="Close add phone number"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5">
              <label className="grid gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
                Phone Number
                <input
                  type="text"
                  inputMode="numeric"
                  name="add_phone_number"
                  value={addPhoneLogin.phoneNumber}
                  onChange={(event) =>
                    setAddPhoneLogin((current) => ({
                      ...current,
                      error: "",
                      phoneNumber: event.target.value,
                    }))
                  }
                  placeholder="09XXXXXXXXX"
                  className="h-11 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-black outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
                {(() => {
                  const raw = addPhoneLogin.phoneNumber || "";
                  const normalized = raw ? normalizePhoneNumber(raw) : "";

                  if (!normalized) {
                    return null;
                  }

                  const isValid = isPhilippineMobileNumber(normalized);

                  return (
                    <span
                      className={`text-xs font-bold normal-case tracking-normal ${
                        isValid ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {isValid
                        ? "Valid phone number."
                        : "Phone number must use the 09XXXXXXXXX format."}
                    </span>
                  );
                })()}
              </label>
              <p className="mt-2 text-xs font-semibold text-neutral-500">
                Use your raw local mobile number format.
              </p>

              {addPhoneLogin.error && (
                <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {addPhoneLogin.error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-neutral-100 px-6 py-5">
              <button
                type="button"
                onClick={() => setAddPhoneLogin(emptyAddPhoneLogin)}
                className="rounded-lg bg-neutral-50 px-5 py-2.5 text-sm font-bold text-neutral-700 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addPhoneLogin.isSending || isSaving}
                className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {addPhoneLogin.isSending || isSaving ? "Sending OTP..." : "Send OTP"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {phoneVerification.isOpen && (
        <OtpModal
          code={phoneVerification.code}
          error={phoneVerification.error}
          isBusy={phoneVerification.isVerifying}
          isResending={phoneVerification.isResending}
          onBack={() => {
            const previousPhoneNumber = phoneVerification.phoneNumber;
            const source = phoneVerification.source;
            setPhoneVerification(emptyPhoneVerification);
            if (source === "login-method") {
              setAddPhoneLogin({
                ...emptyAddPhoneLogin,
                isOpen: true,
                phoneNumber: previousPhoneNumber,
              });
            } else {
              setIsEditing(true);
            }
          }}
          onChange={(code) =>
            setPhoneVerification((current) => ({ ...current, code }))
          }
          onResend={handleResendPhoneChangeOtp}
          onSubmit={handleVerifyPhoneChange}
          subtitle={`Enter the verification code sent to ${toPhilippineE164PhoneNumber(phoneVerification.phoneNumber)}.`}
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
