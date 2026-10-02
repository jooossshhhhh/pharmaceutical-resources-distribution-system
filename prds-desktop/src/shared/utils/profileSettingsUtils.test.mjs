import assert from "node:assert/strict";
import test from "node:test";

import {
  canRemoveLoginMethod,
  getAuthLinkedPhoneNumber,
  getGoogleIdentityEmail,
  getLinkedGmailEmail,
  getLoginMethodAction,
  getLoginMethodStatusLabel,
  getPhoneChangeState,
  getPhoneNumberErrorMessage,
  getReadableEmail,
  getSubmittedPhoneNumber,
  isPhoneAlreadyRegisteredError,
  maskPhoneNumber,
} from "./profileSettingsUtils.js";

const normalizePhoneNumber = (phoneNumber) => {
  const digitsOnly = phoneNumber.replace(/\D/g, "");

  if (!digitsOnly) {
    return "";
  }

  if (digitsOnly.startsWith("63")) {
    return `0${digitsOnly.slice(2)}`;
  }

  if (digitsOnly.startsWith("0")) {
    return digitsOnly;
  }

  return `0${digitsOnly}`;
};

test("uses Not connected for missing login methods", () => {
  assert.equal(getLoginMethodStatusLabel(false), "Not connected");
  assert.equal(getLoginMethodStatusLabel(true), "Linked");
});

test("chooses the missing login method as the profile action", () => {
  assert.deepEqual(
    getLoginMethodAction({ hasGmailLogin: true, hasPhoneLogin: false }),
    { kind: "phone", label: "Add Phone Number" }
  );
  assert.deepEqual(
    getLoginMethodAction({ hasGmailLogin: false, hasPhoneLogin: true }),
    { kind: "gmail", label: "Add Gmail Login" }
  );
  assert.equal(
    getLoginMethodAction({ hasGmailLogin: true, hasPhoneLogin: true }),
    null
  );
});

test("extracts Gmail from linked Google identities", () => {
  const identities = [
    { provider: "phone", identity_data: { phone: "639623702834" } },
    {
      provider: "google",
      email: "profile@example.com",
      identity_data: { email: "identity@example.com" },
    },
  ];

  assert.equal(getGoogleIdentityEmail(identities), "identity@example.com");
});

test("uses linked Google identity email when the profile email is empty", () => {
  assert.equal(
    getReadableEmail({
      authEmail: "",
      googleIdentityEmail: "linked@gmail.com",
      profile: { email: null, phone_number: "09623702834" },
    }),
    "linked@gmail.com"
  );
});

test("does not treat the Supabase auth email alone as a linked Gmail login", () => {
  assert.equal(
    getLinkedGmailEmail({
      identities: [{ provider: "phone", identity_data: {} }],
      profileEmail: "",
    }),
    ""
  );
});

test("uses the Google identity as the linked Gmail source of truth", () => {
  assert.equal(
    getLinkedGmailEmail({
      identities: [
        {
          provider: "google",
          email: "fallback@gmail.com",
          identity_data: { email: "linked@gmail.com" },
        },
      ],
      profileEmail: "",
    }),
    "linked@gmail.com"
  );
});

test("extracts the linked phone number from Supabase Auth user data", () => {
  assert.equal(
    getAuthLinkedPhoneNumber({
      authUser: { phone: "+639623702834" },
      identities: [],
      normalizePhoneNumber,
    }),
    "09623702834"
  );
});

test("falls back to the phone identity when auth user phone is not populated", () => {
  assert.equal(
    getAuthLinkedPhoneNumber({
      authUser: {},
      identities: [
        {
          provider: "phone",
          identity_data: { phone: "639702347186" },
        },
      ],
      normalizePhoneNumber,
    }),
    "09702347186"
  );
});

test("ignores a stale profile email that is not linked in Supabase Auth", () => {
  assert.equal(
    getLinkedGmailEmail({
      identities: [
        {
          provider: "google",
          identity_data: { email: "actual@gmail.com" },
        },
      ],
      profileEmail: "stale@gmail.com",
    }),
    "actual@gmail.com"
  );
});

test("only allows removing a login method when another method remains", () => {
  assert.equal(
    canRemoveLoginMethod({
      hasGmailLogin: true,
      hasPhoneLogin: true,
      method: "gmail",
    }),
    true
  );
  assert.equal(
    canRemoveLoginMethod({
      hasGmailLogin: true,
      hasPhoneLogin: false,
      method: "gmail",
    }),
    false
  );
});

test("keeps the current phone number when the edit form phone field is blank", () => {
  assert.equal(
    getSubmittedPhoneNumber({
      currentPhoneNumber: "09623702834",
      formPhoneNumber: "",
    }),
    "09623702834"
  );
});

test("keeps phone empty when an account has no current phone and no phone edit", () => {
  assert.equal(
    getSubmittedPhoneNumber({
      currentPhoneNumber: "",
      formPhoneNumber: "",
    }),
    ""
  );
});

test("uses the edited phone number when a new value is submitted", () => {
  assert.equal(
    getSubmittedPhoneNumber({
      currentPhoneNumber: "09623702834",
      formPhoneNumber: "09702347186",
    }),
    "09702347186"
  );
});

test("requires verification when adding a phone number to a profile without one", () => {
  assert.deepEqual(
    getPhoneChangeState({
      currentPhoneNumber: "",
      formPhoneNumber: "09623702834",
      normalizePhoneNumber,
    }),
    {
      currentPhoneNumber: "",
      nextPhoneNumber: "09623702834",
      requiresVerification: true,
    }
  );
});

test("does not require verification when phone is unchanged while saving profile details", () => {
  assert.deepEqual(
    getPhoneChangeState({
      currentPhoneNumber: "09623702834",
      formPhoneNumber: "0962 370 2834",
      normalizePhoneNumber,
    }),
    {
      currentPhoneNumber: "09623702834",
      nextPhoneNumber: "09623702834",
      requiresVerification: false,
    }
  );
});

test("requires verification when an existing phone number is changed", () => {
  assert.deepEqual(
    getPhoneChangeState({
      currentPhoneNumber: "09623702834",
      formPhoneNumber: "09702347186",
      normalizePhoneNumber,
    }),
    {
      currentPhoneNumber: "09623702834",
      nextPhoneNumber: "09702347186",
      requiresVerification: true,
    }
  );
});

test("masks a full Philippine phone number for display", () => {
  assert.equal(maskPhoneNumber("09623702834"), "0962•••••834");
  assert.equal(maskPhoneNumber("0962 370 2834"), "0962•••••834");
  assert.equal(maskPhoneNumber(""), "");
});

test("keeps short numbers unmasked when there is not enough to mask", () => {
  assert.equal(maskPhoneNumber("0917"), "0917");
  assert.equal(maskPhoneNumber(null), null);
});

test("explains the already-registered phone error instead of forwarding raw text", () => {
  assert.equal(
    isPhoneAlreadyRegisteredError(
      new Error("A user with this phone number has already been registered")
    ),
    true
  );
  assert.equal(
    getPhoneNumberErrorMessage(
      new Error("A user with this phone number has already been registered")
    ),
    "This phone number is already linked to another account. If it is an old test or abandoned account, remove it in Supabase Auth before linking this number."
  );
  assert.equal(
    getPhoneNumberErrorMessage(new Error("Phone OTP expired")),
    "Phone OTP expired"
  );
});

test("accurately detects offline Google identities and resolves connected Gmail login", () => {
  const offlineIdentities = [
    {
      id: "google-identity",
      user_id: "usr-pharma-2",
      provider: "google",
      email: "joshlroa27@gmail.com",
      identity_data: { email: "joshlroa27@gmail.com" },
    },
  ];

  const googleEmail = getGoogleIdentityEmail(offlineIdentities);
  assert.equal(googleEmail, "joshlroa27@gmail.com");

  const linkedGmail = getLinkedGmailEmail({
    identities: offlineIdentities,
    profileEmail: "joshlroa27@gmail.com",
  });
  assert.equal(linkedGmail, "joshlroa27@gmail.com");

  const action = getLoginMethodAction({
    hasGmailLogin: Boolean(googleEmail && linkedGmail),
    hasPhoneLogin: false,
  });
  assert.deepEqual(action, { kind: "phone", label: "Add Phone Number" });
});

test("validateAvatarFile enforces 2 MB limit, allowed formats, and blocks SVG files", async () => {
  const { validateAvatarFile, MAX_AVATAR_SIZE } = await import("./profileSettingsUtils.js");

  assert.equal(validateAvatarFile(null), "Please select an image file.");
  assert.equal(validateAvatarFile({ name: "hacked.svg", type: "image/svg+xml", size: 1000 }), "SVG images are not allowed for security reasons. Please use JPG, PNG, or WebP.");
  assert.equal(validateAvatarFile({ name: "photo.gif", type: "image/gif", size: 1000 }), "Only JPG, PNG, or WebP images are allowed.");
  assert.equal(validateAvatarFile({ name: "huge.jpg", type: "image/jpeg", size: MAX_AVATAR_SIZE + 10 }), "Image file must be 2 MB or smaller.");
  assert.equal(validateAvatarFile({ name: "valid.jpg", type: "image/jpeg", size: 500 * 1024 }), "");
  assert.equal(validateAvatarFile({ name: "valid.webp", type: "image/webp", size: 50 * 1024 }), "");
  assert.equal(validateAvatarFile({ name: "valid.png", type: "image/png", size: 300 * 1024 }), "");
});

test("canUpdateAvatar enforces once-a-week (7-day) update cooldown", async () => {
  const { canUpdateAvatar } = await import("./profileSettingsUtils.js");

  // No previous update -> allowed
  assert.equal(canUpdateAvatar(null).allowed, true);
  assert.equal(canUpdateAvatar("").allowed, true);

  const baseDate = new Date("2026-09-28T12:00:00Z");

  // 1 day later -> blocked
  const oneDayLater = new Date("2026-09-29T12:00:00Z");
  const blockedState = canUpdateAvatar(baseDate, oneDayLater);
  assert.equal(blockedState.allowed, false);
  assert.equal(blockedState.remainingDays, 6);
  assert.match(blockedState.message, /once a week/);

  // 6 days later -> still blocked
  const sixDaysLater = new Date("2026-10-04T11:00:00Z");
  assert.equal(canUpdateAvatar(baseDate, sixDaysLater).allowed, false);

  // Exactly 7 days later -> allowed
  const sevenDaysLater = new Date("2026-10-05T12:00:01Z");
  assert.equal(canUpdateAvatar(baseDate, sevenDaysLater).allowed, true);

  // 10 days later -> allowed
  const tenDaysLater = new Date("2026-10-08T12:00:00Z");
  assert.equal(canUpdateAvatar(baseDate, tenDaysLater).allowed, true);
});

