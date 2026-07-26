import assert from "node:assert/strict";
import test from "node:test";

import {
  canRemoveLoginMethod,
  getGoogleIdentityEmail,
  getLinkedGmailEmail,
  getLoginMethodAction,
  getLoginMethodStatusLabel,
  getPhoneChangeState,
  getReadableEmail,
  getSubmittedPhoneNumber,
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
