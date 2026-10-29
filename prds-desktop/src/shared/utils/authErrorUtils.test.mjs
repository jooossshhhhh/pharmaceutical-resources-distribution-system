import assert from "node:assert/strict";
import test from "node:test";

import {
  getAuthErrorMessage,
  isDuplicateProfileEmailError,
  isSmsGatewayError,
} from "./authErrorUtils.js";

test("detects duplicate profile email constraint errors", () => {
  assert.equal(isDuplicateProfileEmailError({
    code: "23505",
    message: "duplicate key value violates unique constraint profiles_email_key",
  }), true);
  assert.equal(isDuplicateProfileEmailError({
    code: "23505",
    details: "Key (email)=(person@example.com) already exists.",
  }), true);
  assert.equal(isDuplicateProfileEmailError({
    code: "23505",
    message: "duplicate key value violates unique constraint patients_pkey",
  }), false);
  assert.equal(isDuplicateProfileEmailError({
    code: "42501",
    message: "profiles_email_key",
  }), false);
});

test("detects and maps Twilio and SMS gateway errors cleanly", () => {
  const twilioError = {
    message: "Error sending confirmation OTP to provider: authentication failed, account AC_MOCK_ACCOUNT_000000000000000000 with status 8 is not active More information: https://www.twilio.com/docs/errors/20003",
  };

  assert.equal(isSmsGatewayError(twilioError), true);
  assert.match(
    getAuthErrorMessage(twilioError),
    /SMS verification service is currently unavailable/
  );
  assert.equal(
    getAuthErrorMessage(twilioError).includes("AC_MOCK_"),
    false
  );
  assert.equal(
    getAuthErrorMessage(twilioError).includes("https://"),
    false
  );
});

test("maps duplicate profile email errors to a sign-in message", () => {
  assert.equal(
    getAuthErrorMessage({
      code: "23505",
      message: "duplicate key value violates unique constraint profiles_email_key",
    }),
    "This Gmail address is already registered. Sign in with the existing account instead."
  );
  assert.equal(
    getAuthErrorMessage({ message: "Network unavailable" }),
    "Network unavailable"
  );
});

test("maps signups not allowed for otp errors to a friendly unregistered message", () => {
  assert.equal(
    getAuthErrorMessage({ message: "Signups not allowed for otp" }),
    "This Gmail address is not registered yet in the system. Please verify your email or contact an administrator."
  );
  assert.equal(
    getAuthErrorMessage({ code: "otp_disabled" }),
    "This Gmail address is not registered yet in the system. Please verify your email or contact an administrator."
  );
});

test("maps same_password error to a clear explanation instead of unregistered email", () => {
  assert.equal(
    getAuthErrorMessage({
      code: "same_password",
      message: "New password should be different from the old password.",
      status: 422,
    }),
    "New password should be different from your old password. Please choose a different password."
  );
});

test("maps weak_password or complexity error accurately", () => {
  assert.equal(
    getAuthErrorMessage({
      code: "weak_password",
      message: "Password should be at least 6 characters.",
      status: 422,
    }),
    "Password should be at least 6 characters."
  );
});

