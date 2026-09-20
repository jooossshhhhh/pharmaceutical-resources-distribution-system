import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPendingOtp,
  clearPendingPhoneOtp,
  getPendingOtp,
  getPendingPhoneOtp,
  OTP_CHANNELS,
  OTP_PURPOSES,
  PHONE_OTP_PURPOSES,
  setPendingOtp,
  setPendingPhoneOtp,
} from "./pendingPhoneOtpStore.js";

test("pendingOtpStore stores and retrieves email OTP payload", () => {
  clearPendingOtp();
  assert.equal(getPendingOtp(), null);

  const emailPayload = {
    channel: OTP_CHANNELS.EMAIL,
    email: "user@naga.gov.ph",
    purpose: OTP_PURPOSES.LOGIN,
  };

  setPendingOtp(emailPayload);
  assert.deepEqual(getPendingOtp(), emailPayload);

  // Legacy getPendingPhoneOtp alias should return the same object
  assert.deepEqual(getPendingPhoneOtp(), emailPayload);

  clearPendingOtp();
  assert.equal(getPendingOtp(), null);
});

test("pendingOtpStore stores phone OTP payload and defaults channel to phone", () => {
  clearPendingOtp();

  const phonePayload = {
    phoneNumber: "09123456789",
    purpose: PHONE_OTP_PURPOSES.LOGIN,
  };

  setPendingPhoneOtp(phonePayload);

  const retrieved = getPendingOtp();
  assert.equal(retrieved.phoneNumber, "09123456789");
  assert.equal(retrieved.channel, OTP_CHANNELS.PHONE);
  assert.equal(retrieved.purpose, OTP_PURPOSES.LOGIN);

  clearPendingPhoneOtp();
  assert.equal(getPendingPhoneOtp(), null);
});
