export const roleLabels = {
  PHARMA_II: "Pharmacist II",
  PHARMA_I: "Pharmacist I",
  BHW: "Barangay Health Worker",
};

export const statusLabels = {
  ACTIVE: "Active",
  PENDING: "Pending",
  DEACTIVATED: "Deactivated",
};

export const emptyForm = {
  facility_id: "",
  facility_reason: "",
  first_name: "",
  last_name: "",
  phone_number: "",
};

export const emptyPhoneVerification = {
  code: "",
  error: "",
  isOpen: false,
  isResending: false,
  isVerifying: false,
  phoneNumber: "",
  source: "profile-edit",
};

export const emptyPasswordVerification = {
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

export const getInitials = (profile) => {
  const firstInitial = profile?.first_name?.[0] || "P";
  const lastInitial = profile?.last_name?.[0] || "U";

  return `${firstInitial}${lastInitial}`.toUpperCase();
};

export const getFullName = (profile) => {
  const fullName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
  return fullName || "Pharma User";
};

export const getRoleLabel = (role) => roleLabels[role] || "Not assigned";

export const getStatusLabel = (status) => statusLabels[status] || "Not set";

export const isPhoneDerivedEmail = (email, phoneNumber) => {
  if (!email || !phoneNumber) {
    return false;
  }

  const [localPart] = email.split("@");
  return localPart?.replace(/\D/g, "") === phoneNumber.replace(/\D/g, "");
};

export const getSubmittedPhoneNumber = ({ currentPhoneNumber = "", formPhoneNumber = "" }) => {
  const trimmedPhoneNumber = formPhoneNumber.trim();

  if (!trimmedPhoneNumber) {
    return currentPhoneNumber ? currentPhoneNumber.trim() : "";
  }

  return trimmedPhoneNumber;
};

export const getPhoneChangeState = ({
  currentPhoneNumber = "",
  formPhoneNumber = "",
  normalizePhoneNumber,
}) => {
  const normalizedCurrentPhoneNumber = currentPhoneNumber
    ? normalizePhoneNumber(currentPhoneNumber)
    : "";
  const submittedPhoneNumber = getSubmittedPhoneNumber({
    currentPhoneNumber: normalizedCurrentPhoneNumber,
    formPhoneNumber,
  });
  const nextPhoneNumber = submittedPhoneNumber
    ? normalizePhoneNumber(submittedPhoneNumber)
    : "";

  return {
    currentPhoneNumber: normalizedCurrentPhoneNumber,
    nextPhoneNumber,
    requiresVerification: nextPhoneNumber !== normalizedCurrentPhoneNumber,
  };
};

export const getGoogleIdentityEmail = (identities = []) => {
  const googleIdentity = identities.find((identity) => identity.provider === "google");

  return (
    googleIdentity?.identity_data?.email ||
    googleIdentity?.email ||
    ""
  );
};

export const getIdentityByProvider = (identities = [], provider) => {
  return identities.find((identity) => identity.provider === provider) || null;
};

export const getAuthLinkedPhoneNumber = ({
  authUser,
  identities = [],
  normalizePhoneNumber,
}) => {
  const phoneIdentity = identities.find((identity) => identity.provider === "phone");
  const candidates = [
    authUser?.phone,
    phoneIdentity?.phone,
    phoneIdentity?.identity_data?.phone,
    phoneIdentity?.identity_data?.sub,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const normalizedPhoneNumber = normalizePhoneNumber(String(candidate));

    if (normalizedPhoneNumber) {
      return normalizedPhoneNumber;
    }
  }

  return "";
};

export const getLinkedGmailEmail = ({ identities = [], profileEmail = "" }) => {
  const googleIdentityEmails = identities
    .filter((identity) => identity.provider === "google")
    .map((identity) => identity.identity_data?.email || identity.email || "")
    .filter(Boolean);
  const googleIdentityEmail = googleIdentityEmails[0] || "";

  if (!googleIdentityEmail) {
    return "";
  }

  return googleIdentityEmails.includes(profileEmail) ? profileEmail : googleIdentityEmail;
};

export const getReadableEmail = ({ authEmail, googleIdentityEmail, profile }) => {
  const profileEmail = profile?.email || "";

  if (isPhoneDerivedEmail(profileEmail, profile?.phone_number)) {
    return googleIdentityEmail || authEmail || "";
  }

  return profileEmail || googleIdentityEmail || authEmail || "";
};

export const getFacilityLabel = (facility) => {
  if (!facility) {
    return "No facility assigned";
  }

  return `${facility.facility_name}${facility.facility_code ? ` (${facility.facility_code})` : ""}`;
};

export const formatRequestDate = (dateValue) => {
  if (!dateValue) {
    return "";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateValue));
};

export const getLoginMethodStatusLabel = (isConnected) => {
  return isConnected ? "Linked" : "Not connected";
};

export const getLoginMethodAction = ({ hasGmailLogin, hasPhoneLogin }) => {
  if (!hasGmailLogin) {
    return { kind: "gmail", label: "Add Gmail Login" };
  }

  if (!hasPhoneLogin) {
    return { kind: "phone", label: "Add Phone Number" };
  }

  return null;
};

export const canRemoveLoginMethod = ({ hasGmailLogin, hasPhoneLogin, method }) => {
  if (method === "gmail") {
    return hasGmailLogin && hasPhoneLogin;
  }

  if (method === "phone") {
    return hasPhoneLogin && hasGmailLogin;
  }

  return false;
};

export const getGoogleLinkErrorMessage = (errorDescription = "") => {
  if (errorDescription.includes("identity_already_exists")) {
    return "This Gmail is already linked to another Supabase account. Use a different Gmail or remove/merge the other account first.";
  }

  if (errorDescription.includes("manual_linking_disabled")) {
    return "Google account linking is disabled in Supabase Auth. Enable manual account linking before adding Gmail login.";
  }

  return errorDescription || "Google login was not linked. Please try again.";
};

export const maskPhoneNumber = (phoneNumber = "") => {
  const digits = String(phoneNumber).replace(/\D/g, "");

  if (!digits) {
    return phoneNumber;
  }

  if (digits.length < 8) {
    return digits;
  }

  return `${digits.slice(0, 4)}•••••${digits.slice(-3)}`;
};

export const getPhoneNumberErrorMessage = (error) => {
  const message = error?.message || "Authentication failed. Please try again.";

  if (isPhoneAlreadyRegisteredError(error)) {
    return "This phone number is already linked to another account. If it is an old test or abandoned account, remove it in Supabase Auth before linking this number.";
  }

  return message;
};

export const isPhoneAlreadyRegisteredError = (error) => {
  const message = error?.message || "";

  return (
    message.includes("already been registered") ||
    message.includes("already registered") ||
    message.includes("already exists")
  );
};

export const getAuthCallbackParams = (url) => {
  const parsedUrl = new URL(url);
  const searchParams = new URLSearchParams(parsedUrl.search);
  const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ""));

  return {
    error: searchParams.get("error") || hashParams.get("error") || "",
    errorCode: searchParams.get("error_code") || hashParams.get("error_code") || "",
    errorDescription:
      searchParams.get("error_description") ||
      hashParams.get("error_description") ||
      "",
  };
};
