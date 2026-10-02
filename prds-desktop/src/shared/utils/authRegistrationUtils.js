export const MIN_PASSWORD_LENGTH = 12;

export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const MAX_OTP_ATTEMPTS = 3;

export const normalizePhilippinePhone = (input) => {
  let cleaned = String(input || "").replace(/\D/g, "");
  if (cleaned.startsWith("639") && cleaned.length === 12) {
    cleaned = "0" + cleaned.slice(2);
  }
  return cleaned;
};

export const toE164Phone = (input) => {
  const local = normalizePhilippinePhone(input);
  return local.startsWith("09") ? "+63" + local.slice(1) : local;
};

export const isPhilippineMobileNumber = (phoneNumber) =>
  /^09\d{9}$/.test(normalizePhilippinePhone(phoneNumber));

export const sanitizeName = (input) => {
  if (!input) return "";
  return String(input)
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .replace(/\s+/g, " ");
};

export const isValidPersonName = (input) => {
  if (!input || !String(input).trim()) return false;
  const trimmed = String(input).trim();
  if (trimmed.length < 2 || trimmed.length > 50) return false;
  return /^[a-zA-ZñÑáéíóúÁÉÍÓÚ]+(?:[-' ][a-zA-ZñÑáéíóúÁÉÍÓÚ]+)*$/.test(trimmed);
};

export const checkPasswordComplexity = (password) => {
  const val = String(password || "");
  const hasLength = val.length >= MIN_PASSWORD_LENGTH;
  const hasUpper = /[A-Z]/.test(val);
  const hasLower = /[a-z]/.test(val);
  const hasDigit = /[0-9]/.test(val);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(val);

  return {
    hasLength,
    hasUpper,
    hasLower,
    hasDigit,
    hasSpecial,
    isComplete: hasLength && hasUpper && hasLower && hasDigit && hasSpecial,
  };
};

export const getPasswordStrength = (password) => {
  const val = String(password || "");
  if (!val) {
    return {
      score: 0,
      level: "none",
      label: "",
      color: "gray",
      criteria: { length: false, upper: false, lower: false, digit: false, special: false },
    };
  }

  const { hasLength, hasUpper, hasLower, hasDigit, hasSpecial, isComplete } = checkPasswordComplexity(val);
  const criteria = { length: hasLength, upper: hasUpper, lower: hasLower, digit: hasDigit, special: hasSpecial };

  let score = 0;
  if (hasLength) score += 1;
  if (hasUpper && hasLower) score += 1;
  if (hasDigit) score += 1;
  if (hasSpecial) score += 1;

  if (isComplete && val.length >= MIN_PASSWORD_LENGTH) {
    return { score: 4, level: "strong", label: "Strong", color: "green", criteria };
  }

  if (hasLength && (hasUpper || hasLower) && hasDigit) {
    return { score: Math.max(score, 2), level: "fair", label: "Fair", color: "amber", criteria };
  }

  return { score: Math.min(score, 2), level: "weak", label: "Weak", color: "red", criteria };
};

export const validatePasswordComplexity = (password) => {
  const { hasUpper, hasLower, hasDigit, hasSpecial } = checkPasswordComplexity(password);
  const missing = [];
  if (!hasUpper) missing.push("an uppercase letter");
  if (!hasLower) missing.push("a lowercase letter");
  if (!hasDigit) missing.push("a number");
  if (!hasSpecial) missing.push("a special character");
  if (missing.length) {
    return `Password must include ${missing.join(", ")}.`;
  }
  return "";
};

export const getLockoutDurationSeconds = (failedAttempts) => {
  if (failedAttempts >= 8) return 300; // 5 minutes
  if (failedAttempts >= 6) return 60;  // 60 seconds
  if (failedAttempts >= 5) return 30;  // 30 seconds
  return 0;
};

export const getPasswordValidationError = (password, confirmPassword, options = {}) => {
  if (String(password || "").trim().length === 0) {
    return "Password cannot contain only spaces.";
  }

  if (String(password || "").length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (options.enforceComplexity) {
    const complexityError = validatePasswordComplexity(password);
    if (complexityError) {
      return complexityError;
    }
  }

  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }

  return "";
};

export const validateRegistrationFields = ({
  firstName,
  lastName,
  phoneNumber,
  facilityId,
  facilities = [],
  role,
  allowedRoles = [],
  password,
  confirmPassword,
  isGoogleRegistration = false,
  options = {},
}) => {
  if (!String(firstName || "").trim() || !String(lastName || "").trim()) {
    return "First name and last name are required.";
  }

  if (!isValidPersonName(firstName) || !isValidPersonName(lastName)) {
    return "Please enter a valid name (letters, hyphens, and apostrophes only).";
  }

  if (!facilities.some((facility) => facility.id === facilityId && facility.status === "ACTIVE")) {
    return "Please select an active facility.";
  }

  if (!allowedRoles.includes(role)) {
    return "Please select a valid role.";
  }

  if (!isGoogleRegistration && !isPhilippineMobileNumber(phoneNumber)) {
    return "Phone number must use the format 09XXXXXXXXX.";
  }

  return getPasswordValidationError(password, confirmPassword, options);
};

export const isProfileRegistrationComplete = (profile) =>
  Boolean(
    profile?.first_name &&
    profile?.last_name &&
    profile?.role &&
    profile?.facility_id &&
    (profile?.email || profile?.phone_number)
  );

export const getLoginAccountStatus = (profile) => {
  if (!isProfileRegistrationComplete(profile)) {
    return "unregistered";
  }

  return profile.status === "PENDING"
    ? "pending"
    : String(profile.status || "unknown").toLowerCase();
};

export const getRegistrationDestination = (profile) => {
  if (!isProfileRegistrationComplete(profile)) {
    return null;
  }

  if (profile.status === "ACTIVE") {
    return "/dashboard";
  }

  return profile.status === "PENDING" ? "/pending-approval" : null;
};

export const getGoogleRegistrationOutcome = (profile) => {
  if (!profile) {
    return "new";
  }

  if (!isProfileRegistrationComplete(profile)) {
    return "incomplete";
  }

  switch (profile.status) {
    case "ACTIVE":
      return "active";
    case "PENDING":
      return "pending";
    case "DEACTIVATED":
      return "deactivated";
    default:
      return "invalid-status";
  }
};

export const checkGoogleRegistrationProfile = async (userId, lookupProfile) => {
  if (!userId) {
    throw new Error("A verified account ID is required to check registration.");
  }

  const profile = await lookupProfile(userId);
  return { profile, outcome: getGoogleRegistrationOutcome(profile) };
};

export const routeGoogleRegistrationProfile = async (
  profile,
  { logout, navigate },
) => {
  const outcome = getGoogleRegistrationOutcome(profile);

  if (outcome === "active") {
    await logout();
    return "active";
  }

  if (outcome === "deactivated") {
    await logout();
    navigate("/", {
      replace: true,
      state: {
        hideRegisterLink: true,
        noticeMessage: "This account is deactivated. Please contact a PRDS administrator for assistance.",
      },
    });
    return true;
  }

  if (outcome === "pending") {
    navigate("/pending-approval", { replace: true });
    return true;
  }

  if (outcome === "invalid-status") {
    throw new Error("Unable to verify this account's status. Please contact a PRDS administrator.");
  }

  return false;
};
