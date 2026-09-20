export const isDuplicateProfileEmailError = (error) => {
  if (error?.code !== "23505") {
    return false;
  }

  const context = [error.message, error.details, error.hint, error.constraint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return context.includes("profiles_email_key") ||
    context.includes("profiles.email") ||
    /key\s*\(email\)/.test(context);
};

export const getAuthErrorMessage = (error) => {
  const message = error?.message || "";

  if (isDuplicateProfileEmailError(error)) {
    return "This Gmail address is already registered. Sign in with the existing account instead.";
  }

  if (message.includes("row-level security policy") && message.includes("profiles")) {
    return "Registration could not be completed. Please check your account details and try again.";
  }

  return message || "Authentication failed. Please try again.";
};
