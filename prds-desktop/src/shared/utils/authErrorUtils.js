export const isDuplicateProfileEmailError = (error) => {
  const context = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
    error?.constraint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (error?.code === "23505") {
    return (
      context.includes("profiles_email_key") ||
      context.includes("profiles.email") ||
      /key\s*\(email\)/.test(context) ||
      context.includes("email")
    );
  }

  if (error?.code === "42501") {
    return false;
  }

  return (
    context.includes("already registered") ||
    context.includes("already exists") ||
    context.includes("profiles_email_key")
  );
};

export const isSmsGatewayError = (error) => {
  const context = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    context.includes("twilio") ||
    context.includes("otp provider") ||
    context.includes("confirmation otp") ||
    context.includes("sms provider") ||
    context.includes("error sending confirmation otp") ||
    context.includes("error sending sms") ||
    context.includes("sms gateway") ||
    context.includes("status 8 is not active") ||
    context.includes("20003") ||
    context.includes("21211") ||
    context.includes("21614") ||
    context.includes("21408")
  );
};

export const getAuthErrorMessage = (error) => {
  const message = error?.message || "";
  const msgLower = message.toLowerCase();
  const code = (error?.code || "").toLowerCase();
  const status = error?.status;

  if (isSmsGatewayError(error)) {
    return "SMS verification service is currently unavailable (SMS gateway integration pending). Please use Google authentication in the meantime, or contact your PRDS administrator.";
  }

  if (
    code === "same_password" ||
    msgLower.includes("same_password") ||
    msgLower.includes("should be different from the old password") ||
    msgLower.includes("different from old password")
  ) {
    return "New password should be different from your old password. Please choose a different password.";
  }

  if (
    msgLower.includes("at least one character of each") ||
    msgLower.includes("abcdefghijklmnopqrstuvwxyz")
  ) {
    return "Password must contain at least one uppercase letter (A-Z), one lowercase letter (a-z), one number (0-9), and one special symbol (!@#$...).";
  }

  if (
    code === "weak_password" ||
    msgLower.includes("weak_password") ||
    (msgLower.includes("password") &&
      (msgLower.includes("character") ||
        msgLower.includes("pwned") ||
        msgLower.includes("short")))
  ) {
    return message || "Password does not meet security requirements. Please choose a stronger password.";
  }

  if (
    msgLower.includes("auth session missing") ||
    msgLower.includes("session missing") ||
    msgLower.includes("token has expired") ||
    code === "bad_jwt"
  ) {
    return "No active reset session found or link has expired. Please request a new verification code or reset link.";
  }

  if (
    msgLower.includes("signups not allowed") ||
    code === "otp_disabled" ||
    msgLower.includes("user not found")
  ) {
    return "This Gmail address is not registered yet in the system. Please verify your email or contact an administrator.";
  }

  if (msgLower.includes("rate limit") || status === 429) {
    return "Too many requests. Please wait a moment before trying again.";
  }

  if (msgLower.includes("error sending") || status === 500) {
    return "Unable to send verification code. Please check your network connection or contact your administrator.";
  }

  if (isDuplicateProfileEmailError(error)) {
    return "This Gmail address is already registered. Sign in with the existing account instead.";
  }

  if (message.includes("row-level security policy") && message.includes("profiles")) {
    return "Registration could not be completed. Please check your account details and try again.";
  }

  if (message.includes("column") && message.includes("does not exist")) {
    return "A temporary database configuration error occurred. Please try again or contact your administrator.";
  }

  return message || "Authentication failed. Please try again.";
};
