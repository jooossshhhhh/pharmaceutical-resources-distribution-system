let pendingOtp = null;

export const OTP_CHANNELS = {
  PHONE: "phone",
  EMAIL: "email",
};

export const OTP_PURPOSES = {
  LOGIN: "login",
  REGISTRATION: "registration",
};

export const PHONE_OTP_PURPOSES = OTP_PURPOSES;

export const setPendingOtp = (otpRequest) => {
  pendingOtp = otpRequest;
};

export const getPendingOtp = () => pendingOtp;

export const clearPendingOtp = () => {
  pendingOtp = null;
};

// Backwards-compatible aliases for existing callers
export const setPendingPhoneOtp = (otpRequest) => {
  setPendingOtp({
    channel: OTP_CHANNELS.PHONE,
    ...otpRequest,
  });
};

export const getPendingPhoneOtp = () => getPendingOtp();

export const clearPendingPhoneOtp = () => clearPendingOtp();
