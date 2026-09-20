const CONNECTIVITY_MESSAGES = [
  "failed to fetch",
  "fetch failed",
  "networkerror",
  "network request failed",
];

export const isConnectivityError = (error) => {
  const message = String(error?.message || error || "").toLowerCase();

  return CONNECTIVITY_MESSAGES.some((fragment) => message.includes(fragment));
};

export const getMutationFailureStatus = (error) =>
  isConnectivityError(error) ? "PENDING" : "FAILED";
