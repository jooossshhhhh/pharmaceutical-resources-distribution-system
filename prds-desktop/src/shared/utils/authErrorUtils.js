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

  if (isSmsGatewayError(error)) {
    return "SMS verification service is currently unavailable (SMS gateway integration pending). Please use Google authentication in the meantime, or contact your PRDS administrator.";
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
