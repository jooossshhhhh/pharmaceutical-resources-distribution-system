import assert from "node:assert/strict";
import test from "node:test";

import {
  getGoogleIdentityEmail,
  getLoginMethodAction,
  getLoginMethodStatusLabel,
  getReadableEmail,
} from "./profileSettingsUtils.js";

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
