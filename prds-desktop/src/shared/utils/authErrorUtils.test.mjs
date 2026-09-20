import assert from "node:assert/strict";
import test from "node:test";

import {
  getAuthErrorMessage,
  isDuplicateProfileEmailError,
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
