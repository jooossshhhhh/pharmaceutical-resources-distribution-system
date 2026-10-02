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
} from "@backend/services/auth/authService";
import {
  getProfileAvatarUrl,
  removeProfileAvatar,
  updateOwnProfileAvatar,
  updateOwnProfileContact,
  uploadProfileAvatar,
} from "@backend/services/auth/profileService";
import { isCurrentNetworkOnline } from "@backend/sync/networkStatus";
import { supabase } from "@backend/client/supabase";
import { formatDateTime } from "@shared/utils/dashboardUtils";
import { getLastLoginTimestamp } from "@backend/database/snapshotStore";
import ModalShell from "../../components/ModalShell";
import OtpModal from "./OtpModal";
import PasswordModal from "./PasswordModal";
import PasscodeModal from "./PasscodeModal";
import { LoginMethod } from "./ProfileCards";
import { ModalField, ProfileField } from "./ProfileFields";
import RemoveLoginMethodModal from "./RemoveLoginMethodModal";
import {
  canRemoveLoginMethod,
  canUpdateAvatar,
  emptyForm,
  emptyPasswordVerification,
  emptyPhoneVerification,
  formatRequestDate,
  getAuthCallbackParams,
  getAuthLinkedPhoneNumber,
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
  validateAvatarFile,
} from "@shared/utils/profileSettingsUtils";
import { compressAvatarImage } from "@shared/utils/imageCompressionUtils";

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
  const { profile, refreshProfile, supabaseUser } = useAuth();
  const avatarInputRef = useRef(null);
  const [authIdentities, setAuthIdentities] = useState([]);
  const [authUser, setAuthUser] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [facilities, setFacilities] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSigningOutOthers, setIsSigningOutOthers] = useState(false);
  const [isSignOutOthersModalOpen, setIsSignOutOthersModalOpen] = useState(false);
  const [signOutOthersError, setSignOutOthersError] = useState("");
  const [sessionActionMessage, setSessionActionMessage] = useState("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarCooldown = useMemo(
    () => canUpdateAvatar(profile?.avatar_updated_at),
    [profile?.avatar_updated_at]
  );
  const [message, setMessage] = useState("");
  const [modalError, setModalError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [addPhoneLogin, setAddPhoneLogin] = useState(emptyAddPhoneLogin);
  const [phoneVerification, setPhoneVerification] = useState(emptyPhoneVerification);
  const [passwordVerification, setPasswordVerification] = useState(emptyPasswordVerification);
  const [passcodeModal, setPasscodeModal] = useState({
    isOpen: false,
    mode: "setup",
  });
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
  const hasPasscodeActive = Boolean(
    profile?.has_passcode ||
    authUser?.user_metadata?.has_passcode
  );
  const roleLabel = getRoleLabel(profile?.role);
  const statusLabel = getStatusLabel(profile?.status);
  const activeFacility = facilities.find((facility) => facility.id === profile?.facility_id);
  const facilityLabel =
    profile?.facility_name ||
    activeFacility?.facility_name ||
    "No facility assigned";
  const userIdentifier = profile?.id || authUser?.id || supabaseUser?.id || "";
  const lastSignInAt =
    getLastLoginTimestamp(userIdentifier) ||
    authUser?.last_sign_in_at ||
    supabaseUser?.last_sign_in_at;
  const lastSignInText = lastSignInAt ? formatRequestDate(lastSignInAt) : "Active session";

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
      setProfileError("");

      try {
        const [facilitiesResult, identities, currentAuthUser, avatar] =
          await Promise.all([
            supabase
              .from("facilities")
              .select("id, facility_name, facility_code, facility_type, address, status")
              .eq("status", "ACTIVE")
              .order("facility_name", { ascending: true }),
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
        setAuthIdentities(identities);
        setAuthUser(currentAuthUser);
        if (avatar) {
          setAvatarUrl(avatar);
          if (avatar !== profile?.avatar_url) {
            refreshProfile?.({ avatar_url: avatar });
          }
        }

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

  const saveEditableProfileFields = async (phoneNumberOverride = form.phone_number) => {
    await updateOwnProfileContact({
      email: linkedGmailEmail,
      firstName: form.first_name.trim(),
      lastName: form.last_name.trim(),
      phoneNumber: phoneNumberOverride || "",
    });

    await refreshProfile?.();
    setMessage("Profile updated.");
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

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("prds:register-export", {
            detail: {
              filename: link.download,
              format: "JSON",
              size: blob.size,
              blob,
            },
          })
        );
      }
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

    const cooldownCheck = canUpdateAvatar(profile?.avatar_updated_at);
    if (!cooldownCheck.allowed) {
      setProfileError(cooldownCheck.message);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
      return;
    }

    const validationError = validateAvatarFile(file);
    if (validationError) {
      setProfileError(validationError);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
      return;
    }

    if (!isCurrentNetworkOnline()) {
      setProfileError("Cannot update profile photo while offline. Please connect to the internet.");
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
      return;
    }

    setIsUploadingAvatar(true);
    setProfileError("");

    try {
      const compressedBlob = await compressAvatarImage(file, { maxWidth: 400, maxHeight: 400, quality: 0.8 });
      const uploadFile = new File([compressedBlob], "avatar.webp", { type: compressedBlob.type || "image/webp" });

      const publicUrl = await uploadProfileAvatar({
        file: uploadFile,
        userId: profile.id,
      });
      await updateOwnProfileAvatar(publicUrl);
      setAvatarUrl(publicUrl);
      setMessage("Profile photo updated.");
      await refreshProfile?.({ avatar_url: publicUrl });
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
    if (!isCurrentNetworkOnline()) {
      setProfileError("Cannot remove profile photo while offline. Please connect to the internet.");
      return;
    }

    setIsUploadingAvatar(true);
    setProfileError("");

    try {
      await removeProfileAvatar({ userId: profile.id });
      await updateOwnProfileAvatar("");
      setAvatarUrl("");
      setMessage("Profile photo removed.");
      await refreshProfile?.({ avatar_url: "" });
    } catch (error) {
      setProfileError(getAuthErrorMessage(error));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleOpenSignOutOthersModal = () => {
    setSignOutOthersError("");
    setIsSignOutOthersModalOpen(true);
  };

  const handleConfirmSignOutOthers = async () => {
    if (!isCurrentNetworkOnline()) {
      setSignOutOthersError("Cannot sign out other devices while offline. Please connect to the internet.");
      return;
    }

    setIsSigningOutOthers(true);
    setSignOutOthersError("");
    setProfileError("");

    try {
      await signOutOtherSessions();
      setIsSignOutOthersModalOpen(false);
      const successMsg = "Successfully signed out of all other web and desktop sessions.";
      setMessage(successMsg);
      setSessionActionMessage(successMsg);
      setTimeout(() => setSessionActionMessage(""), 6000);
    } catch (error) {
      setSignOutOthersError(getAuthErrorMessage(error));
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

  const openPasscodeModal = (mode = "setup") => {
    setPasscodeModal({
      isOpen: true,
      mode,
    });
    setMessage("");
    setProfileError("");
  };

  const closePasscodeModal = () => {
    setPasscodeModal({
      isOpen: false,
      mode: "setup",
    });
  };

  const handlePasscodeSuccess = async (successMsg, nextHasPasscode = true, newPasscodeHash = "") => {
    setMessage(successMsg);
    setAuthUser((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        user_metadata: {
          ...(prev?.user_metadata || {}),
          has_passcode: nextHasPasscode,
          ...(newPasscodeHash !== undefined ? { passcode_hash: newPasscodeHash || null } : {}),
        },
      };
    });
    await refreshProfile?.({
      has_passcode: nextHasPasscode,
      ...(newPasscodeHash !== undefined ? { passcode_hash: newPasscodeHash || null } : {}),
    });
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

    const passwordError = getPasswordValidationError(
      passwordVerification.newPassword,
      passwordVerification.confirmPassword
    );
    if (passwordError) {
      setPasswordVerification((current) => ({
        ...current,
        error: passwordError,
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
                  onClick={() => {
                    if (!avatarCooldown.allowed) {
                      setProfileError(avatarCooldown.message);
                      return;
                    }
                    avatarInputRef.current?.click();
                  }}
                  disabled={isUploadingAvatar || !avatarCooldown.allowed}
                  title={!avatarCooldown.allowed ? avatarCooldown.message : "Change profile photo (Max 2 MB, once a week)"}
                  className={`absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm transition-colors ${
                    !avatarCooldown.allowed
                      ? "border-amber-200 bg-amber-50 text-amber-600 cursor-not-allowed"
                      : "border-neutral-200 bg-white text-neutral-500 hover:text-emerald-700"
                  } disabled:opacity-75`}
                  aria-label={!avatarCooldown.allowed ? avatarCooldown.message : "Change profile photo"}
                >
                  {!avatarCooldown.allowed ? (
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5l-2-3Z" />
                      <path d="M12 17v-4m-2 2h4" />
                    </svg>
                  )}
                </button>
              </div>
              {!avatarCooldown.allowed && (
                <p className="mt-1 text-[11px] font-semibold text-amber-700 text-center">
                  {avatarCooldown.remainingDays}d cooldown
                </p>
              )}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
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

        <div className="grid gap-6 xl:grid-cols-2 items-start">
          {/* ================= LEFT COLUMN ================= */}
          <div className="space-y-6">
            {/* CARD 1: PERSONAL DETAILS */}
            <section className="rounded-xl border border-[#d8dadc] bg-white p-6 shadow-sm shadow-neutral-200/40">
              <div className="mb-5 flex items-center justify-between border-b border-neutral-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Personal Details</h3>
                    <p className="text-xs font-semibold text-slate-500">Your identity and primary contact info</p>
                  </div>
                </div>

                {!isEditing ? (
                  <button
                    type="button"
                    onClick={startEditing}
                    className="flex items-center gap-1.5 rounded-lg border border-[#d8dadc] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/50 transition cursor-pointer"
                  >
                    <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="m14 5 5 5" />
                      <path d="M4 20h5L19.5 9.5a3.5 3.5 0 0 0-5-5L4 15v5Z" />
                    </svg>
                    Edit Profile
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Editing Mode
                  </span>
                )}
              </div>

              {isEditing ? (
                <form id="inline-profile-form" onSubmit={handleSave} className="space-y-4">
                  {modalError && (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
                      {modalError}
                    </p>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <ModalField
                      label="First Name"
                      name="first_name"
                      value={form.first_name}
                      onChange={handleFieldChange}
                      placeholder="e.g. Maria"
                      required
                    />
                    <ModalField
                      label="Last Name"
                      name="last_name"
                      value={form.last_name}
                      onChange={handleFieldChange}
                      placeholder="e.g. Santos"
                      required
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <label className="text-xs font-black uppercase tracking-wider text-[#5f6673]">
                      Mobile Phone Number
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      name="phone_number"
                      value={form.phone_number}
                      onChange={handleFieldChange}
                      placeholder="09XXXXXXXXX"
                      className="h-10.5 w-full rounded-xl border border-[#d8dadc] bg-white px-3.5 text-xs font-bold text-[#0d1117] outline-none transition focus:border-[#007f5f] focus:ring-2 focus:ring-[#007f5f]/15"
                    />
                    {phoneInputFeedback.message && (
                      <span
                        className={`text-xs font-bold ${phoneInputFeedback.tone === "valid"
                          ? "text-emerald-700"
                          : "text-red-600"
                          }`}
                      >
                        {phoneInputFeedback.message}
                      </span>
                    )}
                    <p className="text-[11px] font-medium text-slate-500">
                      Changing your phone number will send a 6-digit SMS verification code to verify the device.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="rounded-xl border border-[#d8dadc] bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#007f5f] px-5 py-2 text-xs font-black text-white hover:bg-[#00694f] shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300 transition cursor-pointer"
                    >
                      {isSaving ? "Saving Changes..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ProfileField icon="user" label="First Name" value={profile?.first_name || "—"} />
                    <ProfileField icon="user" label="Last Name" value={profile?.last_name || "—"} />
                    <ProfileField icon="phone" label="Mobile Phone" value={hasPhoneLogin ? maskPhoneNumber(linkedPhoneNumber) : (profile?.phone_number ? maskPhoneNumber(profile.phone_number) : "No phone linked")} />
                    <ProfileField icon="mail" label="Primary Email" value={linkedGmailEmail || profile?.email || "No email linked"} />
                  </div>
                </div>
              )}
            </section>

            {/* CARD 2: HEALTH & POSITION */}
            <section className="rounded-xl border border-[#d8dadc] bg-white p-6 shadow-sm shadow-neutral-200/40">
              <div className="mb-5 flex items-center justify-between border-b border-neutral-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Health Center & Role Assignment</h3>
                    <p className="text-xs font-semibold text-slate-500">Official health center and permissions</p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {statusLabel}
                </span>
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ProfileField
                    icon="facility"
                    label="Assigned Health Center"
                    value={facilityLabel}
                  />
                  <ProfileField icon="role" label="Position" value={roleLabel} />
                  <ProfileField
                    icon="facility"
                    label="Health Center Code"
                    value={profile?.facility_code || activeFacility?.facility_code || "Not set"}
                  />
                  <ProfileField
                    icon="check"
                    label="Member Since"
                    value={profile?.created_at ? formatRequestDate(profile.created_at) : "—"}
                  />
                  {activeFacility?.address && (
                    <ProfileField
                      className="sm:col-span-2"
                      icon="facility"
                      label="Health Center Address"
                      value={activeFacility.address}
                    />
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* ================= RIGHT COLUMN ================= */}
          <div className="space-y-6">
            {/* CARD 3: CONNECTED LOGIN METHODS */}
            <section className="rounded-xl border border-[#d8dadc] bg-white p-6 shadow-sm shadow-neutral-200/40">
              <div className="mb-5 flex items-center justify-between border-b border-neutral-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M15 7a2 2 0 0 1 2 2m4 0a6 6 0 0 1-7.743 5.743L11 17H9v2H7v2H4a1 1 0 0 1-1-1v-2.586a1 1 0 0 1 .293-.707l5.964-5.964A6 6 0 1 1 21 9Z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Connected Login Methods</h3>
                    <p className="text-xs font-semibold text-slate-500">Authentication channels linked to your account</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
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
                  className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#d8dadc] bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer shadow-sm"
                >
                  {isLinkingGoogle ? "Opening Google..." : loginMethodAction.label}
                </button>
              )}
            </section>

            {/* CARD 4: ACCOUNT SECURITY & SESSIONS */}
            <section className="rounded-xl border border-[#d8dadc] bg-white p-6 shadow-sm shadow-neutral-200/40">
              <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Account Security & Sessions</h3>
                    <p className="text-xs font-semibold text-slate-500">Password management and active desktop sessions</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 self-start sm:self-auto rounded-lg border border-slate-200/90 bg-slate-50 px-2.5 py-1 text-slate-600 shadow-2xs">
                  <svg className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span className="text-[11px] font-medium whitespace-nowrap">
                    Last login:{" "}
                    <strong className="font-bold text-slate-800">
                      {lastSignInText}
                    </strong>
                  </span>
                </div>
              </div>

              {sessionActionMessage && (
                <div className="mb-3.5 flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span>{sessionActionMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSessionActionMessage("")}
                    className="text-emerald-700 hover:text-emerald-900 cursor-pointer text-xs font-bold"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="space-y-3">
                {/* 6-Digit Quick Passcode row */}
                <div className="flex items-center justify-between rounded-xl border border-[#eef0f3] bg-[#f8f9fc] p-3.5 transition hover:border-[#d8dadc]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                        <rect width="18" height="18" x="3" y="3" rx="2" />
                        <path d="M7 8h.01M12 8h.01M17 8h.01M7 12h.01M12 12h.01M17 12h.01M7 16h.01M12 16h.01M17 16h.01" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-slate-900">6-Digit Passcode</h4>
                        {hasPasscodeActive ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200">
                            Not configured
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        {hasPasscodeActive
                          ? "Fast login enabled with your 6-digit PIN"
                          : "Set up a 6-digit PIN for quick login with OTP verification"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasPasscodeActive ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openPasscodeModal("change")}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 hover:border-emerald-600 hover:bg-emerald-50/50 transition cursor-pointer shadow-sm"
                        >
                          Change Passcode
                        </button>
                        <button
                          type="button"
                          onClick={() => openPasscodeModal("remove")}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-red-600 hover:border-red-400 hover:bg-red-50/50 transition cursor-pointer shadow-sm"
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openPasscodeModal("setup")}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 hover:border-emerald-600 hover:bg-emerald-50/50 transition cursor-pointer shadow-sm"
                      >
                        Set Up Passcode
                      </button>
                    )}
                  </div>
                </div>

                {/* Change Password row */}
                <div className="flex items-center justify-between rounded-xl border border-[#eef0f3] bg-[#f8f9fc] p-3.5 transition hover:border-[#d8dadc]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900">Account Password</h4>
                      <p className="text-[11px] text-slate-500 truncate">Change your login password with OTP verification</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={openPasswordModal}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 hover:border-emerald-600 hover:bg-emerald-50/50 transition cursor-pointer shadow-sm"
                  >
                    Change Password
                  </button>
                </div>

                {/* Sign Out Other Devices row */}
                <div className="flex items-center justify-between rounded-xl border border-[#eef0f3] bg-[#f8f9fc] p-3.5 transition hover:border-[#d8dadc]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900">Active Sessions</h4>
                      <p className="text-[11px] text-slate-500 truncate">Sign out of all other web and desktop instances</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenSignOutOthersModal}
                    disabled={isSigningOutOthers}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 shadow-sm"
                  >
                    {isSigningOutOthers ? "Signing out..." : "Sign Out Others"}
                  </button>
                </div>

                {/* Export Activity Logs row */}
                <div className="flex items-center justify-between rounded-xl border border-[#eef0f3] bg-[#f8f9fc] p-3.5 transition hover:border-[#d8dadc]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900">Export Activity Logs</h4>
                      <p className="text-[11px] text-slate-500 truncate">Download personal profile and sign-in record history</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportMyData}
                    disabled={isExporting}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 shadow-sm"
                  >
                    {isExporting ? "Exporting..." : "Export Data"}
                  </button>
                </div>
              </div>
            </section>
          </div>
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
            <div className="border-b border-neutral-100 px-6 py-5">
              <div>
                <h3 id="add-phone-modal-title" className="text-lg font-black text-black">Add Phone Number</h3>
                <p className="mt-1 text-sm font-medium text-neutral-500">
                  A verification code will be sent before this phone login is saved.
                </p>
              </div>
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
                      className={`text-xs font-bold normal-case tracking-normal ${isValid ? "text-emerald-700" : "text-red-700"
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

      <PasscodeModal
        authEmail={linkedGmailEmail || profile?.email || authUser?.email || ""}
        existingPasscodeHash={
          authUser?.user_metadata?.passcode_hash ||
          profile?.passcode_hash ||
          ""
        }
        hasPasscode={hasPasscodeActive}
        isOpen={passcodeModal.isOpen}
        mode={passcodeModal.mode}
        onClose={closePasscodeModal}
        onSuccess={handlePasscodeSuccess}
        phoneNumber={linkedPhoneNumber || profile?.phone_number || ""}
      />

      {isSignOutOthersModalOpen && (
        <ModalShell
          labelledBy="sign-out-others-modal-title"
          onClose={() => !isSigningOutOthers && setIsSignOutOthersModalOpen(false)}
          overlayClassName="bg-slate-950/40 backdrop-blur-xs"
        >
          <div className="w-full max-w-[460px] overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200">
            <div className="border-b border-neutral-100 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
                  </svg>
                </div>
                <div>
                  <h3 id="sign-out-others-modal-title" className="text-base font-black text-slate-900">
                    Sign Out Other Sessions
                  </h3>
                  <p className="text-xs font-semibold text-slate-500">
                    Revoke access on all other devices
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="rounded-xl border border-amber-200/70 bg-amber-50/60 p-4 text-xs leading-relaxed text-amber-900 space-y-1.5">
                <p className="font-bold">Are you sure you want to sign out other sessions?</p>
                <p className="text-amber-800/90 text-[11px]">
                  This will immediately invalidate active sessions for <strong className="font-bold">{linkedGmailEmail || profile?.email || "this account"}</strong> on all other web browsers, desktop terminals, and mobile devices.
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-[#f8f9fc] p-3.5 text-xs text-slate-600 flex items-start gap-2.5">
                <svg className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                <p className="text-[11px] font-medium text-slate-600">
                  <strong className="font-bold text-slate-700">Your current session is safe:</strong> You will remain logged in on this terminal without interruption.
                </p>
              </div>

              {signOutOthersError && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                  {signOutOthersError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-neutral-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setIsSignOutOthersModalOpen(false)}
                disabled={isSigningOutOthers}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSignOutOthers}
                disabled={isSigningOutOthers}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition cursor-pointer disabled:opacity-50 shadow-sm"
              >
                {isSigningOutOthers ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Signing out...</span>
                  </>
                ) : (
                  <span>Sign Out Other Devices</span>
                )}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </AdminShell>
  );
}
