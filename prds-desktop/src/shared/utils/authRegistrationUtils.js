export const MIN_PASSWORD_LENGTH = 12;

export const isPhilippineMobileNumber = (phoneNumber) =>
  /^09\d{9}$/.test(String(phoneNumber || "").replace(/\D/g, ""));

export const getPasswordValidationError = (password, confirmPassword) => {
  if (String(password || "").trim().length === 0) {
    return "Password cannot contain only spaces.";
  }

  if (String(password || "").length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
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
}) => {
  if (!String(firstName || "").trim() || !String(lastName || "").trim()) {
    return "First name and last name are required.";
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

  return getPasswordValidationError(password, confirmPassword);
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
