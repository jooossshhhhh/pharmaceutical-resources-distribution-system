import assert from "node:assert/strict";
import test from "node:test";

import {
  detectIdentifierType,
  getPasscodeStatusLabel,
  hashPasscode,
  is6DigitNumeric,
  isDifferentFromCurrentPasscode,
  isRepetitivePasscode,
  validatePasscodeChange,
  validatePasscodeInputs,
  verifyPasscodeHash,
} from "./passcodeUtils.js";

test("is6DigitNumeric verifies exact 6 numeric digits", () => {
  assert.equal(is6DigitNumeric("123456"), true);
  assert.equal(is6DigitNumeric("000000"), true);
  assert.equal(is6DigitNumeric("987654"), true);

  assert.equal(is6DigitNumeric("12345"), false);
  assert.equal(is6DigitNumeric("1234567"), false);
  assert.equal(is6DigitNumeric("abcdef"), false);
  assert.equal(is6DigitNumeric("12a456"), false);
  assert.equal(is6DigitNumeric(""), false);
  assert.equal(is6DigitNumeric(null), false);
});

test("isRepetitivePasscode detects repeating digit patterns", () => {
  assert.equal(isRepetitivePasscode("111111"), true);
  assert.equal(isRepetitivePasscode("000000"), true);
  assert.equal(isRepetitivePasscode("999999"), true);

  assert.equal(isRepetitivePasscode("123456"), false);
  assert.equal(isRepetitivePasscode("112233"), false);
  assert.equal(isRepetitivePasscode("111112"), false);
});

test("validatePasscodeInputs checks length, confirmation, and security", () => {
  assert.equal(
    validatePasscodeInputs("12345", "12345"),
    "Passcode must be exactly 6 numeric digits."
  );

  assert.equal(
    validatePasscodeInputs("123456", "654321"),
    "The confirmed passcode does not match."
  );

  assert.equal(
    validatePasscodeInputs("111111", "111111"),
    "Please choose a more secure passcode (avoid repeating numbers like 111111)."
  );

  assert.equal(validatePasscodeInputs("482910", "482910"), "");
});

test("detectIdentifierType differentiates phone numbers from emails", () => {
  assert.equal(detectIdentifierType("09123456789"), "phone");
  assert.equal(detectIdentifierType("+639123456789"), "phone");
  assert.equal(detectIdentifierType("juan@gmail.com"), "email");
  assert.equal(detectIdentifierType("admin@naga.gov.ph"), "email");
  assert.equal(detectIdentifierType(""), "empty");
});

test("getPasscodeStatusLabel returns appropriate status string", () => {
  assert.equal(getPasscodeStatusLabel(true), "Active");
  assert.equal(getPasscodeStatusLabel(false), "Not configured");
});

test("hashPasscode and verifyPasscodeHash correctly hash and verify passcodes", async () => {
  const hash = await hashPasscode("827601");
  assert.ok(hash.includes(":"));

  const matches = await verifyPasscodeHash("827601", hash);
  assert.equal(matches, true);

  const incorrect = await verifyPasscodeHash("123456", hash);
  assert.equal(incorrect, false);

  const empty = await verifyPasscodeHash("", hash);
  assert.equal(empty, false);
});

test("isDifferentFromCurrentPasscode detects matching previous passcode", async () => {
  const currentHash = await hashPasscode("827601");

  // Same passcode must return false (not different)
  const isDifferentSame = await isDifferentFromCurrentPasscode("827601", currentHash);
  assert.equal(isDifferentSame, false);

  // Different passcode must return true
  const isDifferentNew = await isDifferentFromCurrentPasscode("918273", currentHash);
  assert.equal(isDifferentNew, true);

  // If no current hash exists (first-time setup), it is considered different
  const noHashResult = await isDifferentFromCurrentPasscode("827601", "");
  assert.equal(noHashResult, true);
});

test("validatePasscodeChange prevents reusing previous passcode", async () => {
  const currentHash = await hashPasscode("827601");

  // Reusing the same passcode gives specific error
  const reuseError = await validatePasscodeChange("827601", "827601", currentHash);
  assert.equal(reuseError, "New passcode must be different from your current passcode.");

  // Mismatched confirm
  const mismatchError = await validatePasscodeChange("918273", "918274", currentHash);
  assert.equal(mismatchError, "The confirmed passcode does not match.");

  // Valid and different passcode passes
  const validResult = await validatePasscodeChange("918273", "918273", currentHash);
  assert.equal(validResult, "");
});
