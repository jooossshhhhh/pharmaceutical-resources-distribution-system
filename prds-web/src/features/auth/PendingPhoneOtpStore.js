let pendingPhoneOtp = null;

export const PHONE_OTP_PURPOSES = {
  LOGIN: "login",
  REGISTRATION: "registration",
};

export const setPendingPhoneOtp = (otpRequest) => {
  pendingPhoneOtp = otpRequest;
};

export const getPendingPhoneOtp = () => pendingPhoneOtp;

export const clearPendingPhoneOtp = () => {
  pendingPhoneOtp = null;
};
