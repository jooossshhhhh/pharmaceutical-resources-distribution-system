import assert from "node:assert/strict";
import test from "node:test";

import {
  MIN_PASSWORD_LENGTH,
  checkGoogleRegistrationProfile,
  getGoogleRegistrationOutcome,
  getLoginAccountStatus,
  getPasswordValidationError,
  getRegistrationDestination,
  routeGoogleRegistrationProfile,
  validateRegistrationFields,
} from "./authRegistrationUtils.js";

const base = {
  firstName: "Ava",
  lastName: "Naga",
  phoneNumber: "09123456789",
  facilityId: "facility-1",
  facilities: [{ id: "facility-1", status: "ACTIVE" }],
  role: "BHW",
  allowedRoles: ["BHW", "PHARMA_I"],
  password: "correct horse battery",
  confirmPassword: "correct horse battery",
};

test("registration requires a 12-character password and accepts passphrases", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 12);
  assert.equal(getPasswordValidationError("12345678901", "12345678901"), "Password must be at least 12 characters.");
  assert.equal(getPasswordValidationError("123456789012", "123456789012"), "");
  assert.equal(validateRegistrationFields({ ...base, password: "12345678901", confirmPassword: "12345678901" }), "Password must be at least 12 characters.");
  assert.equal(validateRegistrationFields({ ...base, password: "            " }), "Password cannot contain only spaces.");
  assert.equal(validateRegistrationFields(base), "");
  assert.equal(validateRegistrationFields({ ...base, firstName: " Ava ", lastName: " Naga " }), "");
});

test("registration rejects blank names, invalid phone numbers, and mismatched passwords", () => {
  assert.match(validateRegistrationFields({ ...base, firstName: "   " }), /First name and last name are required/);
  assert.match(validateRegistrationFields({ ...base, phoneNumber: "0912345678" }), /09XXXXXXXXX/);
  assert.match(validateRegistrationFields({ ...base, confirmPassword: "different passphrase" }), /do not match/);
});

test("registration only accepts active facilities and allowed roles", () => {
  assert.match(validateRegistrationFields({ ...base, facilities: [{ id: "facility-1", status: "INACTIVE" }] }), /active facility/);
  assert.match(validateRegistrationFields({ ...base, role: "PHARMA_II" }), /select a valid role/);
});

test("login account status distinguishes unregistered, pending, and active profiles", () => {
  const profile = {
    first_name: "Ava",
    last_name: "Naga",
    role: "BHW",
    facility_id: "facility-1",
    phone_number: "09123456789",
    email: "ava@example.com",
  };

  assert.equal(getLoginAccountStatus(null), "unregistered");
  assert.equal(getLoginAccountStatus({ id: "auth-user-only" }), "unregistered");
  assert.equal(getLoginAccountStatus({ ...profile, status: "PENDING" }), "pending");
  assert.equal(getLoginAccountStatus({ ...profile, status: "ACTIVE" }), "active");
});

test("phone registration requires the Philippine mobile format; Google registration does not", () => {
  assert.match(validateRegistrationFields({ ...base, phoneNumber: "", isGoogleRegistration: false }), /09XXXXXXXXX/);
  assert.equal(validateRegistrationFields({ ...base, phoneNumber: "", isGoogleRegistration: true }), "");
});

test("Google registration routes existing profiles by status and leaves incomplete profiles on registration", () => {
  assert.equal(getRegistrationDestination({ first_name: "Ava", last_name: "Naga", role: "BHW", facility_id: "facility-1", phone_number: "09123456789", status: "ACTIVE" }), "/dashboard");
  assert.equal(getRegistrationDestination({ first_name: "Ava", last_name: "Naga", role: "BHW", facility_id: "facility-1", email: "ava@gmail.com", status: "PENDING" }), "/pending-approval");
  assert.equal(getRegistrationDestination({ id: "auth-user-only" }), null);
});

test("Google registration distinguishes active, pending, deactivated, incomplete, and new profiles", () => {
  const completeProfile = {
    first_name: "Ava",
    last_name: "Naga",
    role: "BHW",
    facility_id: "facility-1",
    email: "ava@gmail.com",
  };

  assert.equal(getGoogleRegistrationOutcome(null), "new");
  assert.equal(getGoogleRegistrationOutcome({ id: "auth-user-only" }), "incomplete");
  assert.equal(getGoogleRegistrationOutcome({ ...completeProfile, status: "ACTIVE" }), "active");
  assert.equal(getGoogleRegistrationOutcome({ ...completeProfile, status: "PENDING" }), "pending");
  assert.equal(getGoogleRegistrationOutcome({ ...completeProfile, status: "DEACTIVATED" }), "deactivated");
  assert.equal(getGoogleRegistrationOutcome({ ...completeProfile, status: "UNKNOWN" }), "invalid-status");
});

test("Google account check distinguishes confirmed absence from a failed lookup", async () => {
  const lookups = [];
  const absent = await checkGoogleRegistrationProfile("user-1", async (userId) => {
    lookups.push(userId);
    return null;
  });

  assert.deepEqual(absent, { profile: null, outcome: "new" });
  assert.deepEqual(lookups, ["user-1"]);

  await assert.rejects(
    checkGoogleRegistrationProfile("user-1", async () => {
      throw new Error("Database unavailable");
    }),
    /Database unavailable/,
  );
});

test("active Google accounts sign out and wait for the user to choose login", async () => {
  const events = [];
  const result = await routeGoogleRegistrationProfile(
    {
      first_name: "Ava",
      last_name: "Naga",
      role: "PHARMA_II",
      facility_id: "facility-1",
      email: "ava@gmail.com",
      status: "ACTIVE",
    },
    {
      logout: async () => events.push("logout"),
      navigate: (...args) => events.push(["navigate", ...args]),
    },
  );

  assert.equal(result, "active");
  assert.equal(events[0], "logout");
  assert.equal(events.length, 1);
});

test("pending Google accounts route to approval without signing out", async () => {
  const events = [];
  await routeGoogleRegistrationProfile(
    {
      first_name: "Ava",
      last_name: "Naga",
      role: "BHW",
      facility_id: "facility-1",
      email: "ava@gmail.com",
      status: "PENDING",
    },
    {
      logout: async () => events.push("logout"),
      navigate: (...args) => events.push(["navigate", ...args]),
    },
  );

  assert.deepEqual(events, [["navigate", "/pending-approval", { replace: true }]]);
});

test("normalizePhilippinePhone and isPhilippineMobileNumber support 09, +63, and 63 prefixes", async () => {
  const {
    normalizePhilippinePhone,
    toE164Phone,
    isPhilippineMobileNumber,
  } = await import("./authRegistrationUtils.js");

  assert.equal(normalizePhilippinePhone("0917 123 4567"), "09171234567");
  assert.equal(normalizePhilippinePhone("+63 917 123 4567"), "09171234567");
  assert.equal(normalizePhilippinePhone("639171234567"), "09171234567");
  assert.equal(toE164Phone("09171234567"), "+639171234567");

  assert.equal(isPhilippineMobileNumber("09171234567"), true);
  assert.equal(isPhilippineMobileNumber("+63 917 123 4567"), true);
  assert.equal(isPhilippineMobileNumber("639171234567"), true);
  assert.equal(isPhilippineMobileNumber("028123456"), false); // landline
  assert.equal(isPhilippineMobileNumber("091234567"), false); // too short
  assert.equal(isPhilippineMobileNumber(""), false);
});

test("sanitizeName strips angle brackets and trims extra spaces", async () => {
  const { sanitizeName, isValidPersonName } = await import("./authRegistrationUtils.js");

  assert.equal(sanitizeName("<script>alert('xss')</script>Juan"), "alert('xss')Juan");
  assert.equal(sanitizeName("  Maria   Clara  "), "Maria Clara");

  assert.equal(isValidPersonName("Juan Dela Cruz"), true);
  assert.equal(isValidPersonName("Niño Peña"), true);
  assert.equal(isValidPersonName("Mary-Ann D'Angelo"), true);
  assert.equal(isValidPersonName("A"), false); // too short
  assert.equal(isValidPersonName("Juan123"), false); // contains numbers
  assert.equal(isValidPersonName("<script>"), false);
});

test("password complexity and strength meters evaluate clinical security rules", async () => {
  const {
    checkPasswordComplexity,
    getPasswordStrength,
    validatePasswordComplexity,
    getLockoutDurationSeconds,
  } = await import("./authRegistrationUtils.js");

  assert.equal(checkPasswordComplexity("short").isComplete, false);
  assert.equal(checkPasswordComplexity("AllLettersNoDigits!").isComplete, false);
  assert.equal(checkPasswordComplexity("P@ssw0rd123456").isComplete, true);

  const strong = getPasswordStrength("P@ssw0rd123456");
  assert.equal(strong.level, "strong");
  assert.equal(strong.color, "green");

  const fair = getPasswordStrength("password123456");
  assert.equal(fair.level, "fair");

  const weak = getPasswordStrength("weak");
  assert.equal(weak.level, "weak");

  assert.match(validatePasswordComplexity("password123456"), /uppercase/);
  assert.equal(validatePasswordComplexity("P@ssw0rd123456"), "");

  assert.equal(getLockoutDurationSeconds(4), 0);
  assert.equal(getLockoutDurationSeconds(5), 30);
  assert.equal(getLockoutDurationSeconds(6), 60);
  assert.equal(getLockoutDurationSeconds(7), 60);
  assert.equal(getLockoutDurationSeconds(8), 300);
});

test("validateRegistrationFields validates cultural names and supports enforceComplexity option", async () => {
  const { validateRegistrationFields } = await import("./authRegistrationUtils.js");
  const base = {
    firstName: "Ava",
    lastName: "Naga",
    phoneNumber: "09123456789",
    facilityId: "facility-1",
    facilities: [{ id: "facility-1", status: "ACTIVE" }],
    role: "PHARMA_I",
    allowedRoles: ["PHARMA_I"],
    password: "Password12345!",
    confirmPassword: "Password12345!",
  };

  assert.equal(validateRegistrationFields(base), "");

  assert.match(
    validateRegistrationFields({ ...base, firstName: "1234" }),
    /letters, hyphens, and apostrophes only/
  );

  assert.match(
    validateRegistrationFields({
      ...base,
      password: "simplepassword",
      confirmPassword: "simplepassword",
      options: { enforceComplexity: true },
    }),
    /uppercase letter/
  );
});

