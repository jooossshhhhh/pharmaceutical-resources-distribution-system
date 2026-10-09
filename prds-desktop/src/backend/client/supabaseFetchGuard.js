export const AUTH_SESSION_REQUIRED_MESSAGE =
  "Your online session needs to be refreshed. Please sign in again to update protected records.";

const PROTECTED_SUPABASE_PATHS = ["/rest/v1/", "/storage/v1/object"];

export function shouldRestoreSessionForRequest(input) {
  const url = typeof input === "string" ? input : input?.url || "";
  if (!url.includes(".supabase.co")) return false;
  if (url.includes("/auth/v1/")) return false;

  return PROTECTED_SUPABASE_PATHS.some((path) => url.includes(path));
}

function hasCachedIdentity(cachedSession) {
  return Boolean(cachedSession?.user?.id || cachedSession?.profile?.id);
}

export function createAuthSessionRequiredError() {
  const error = new Error(AUTH_SESSION_REQUIRED_MESSAGE);
  error.code = "AUTH_SESSION_REQUIRED";
  return error;
}

export function createAuthenticatedFetch({
  fetchImpl,
  restoreSession,
  getCachedSession,
  isOnline,
}) {
  return async (input, init) => {
    const shouldRestore =
      shouldRestoreSessionForRequest(input) &&
      isOnline?.() &&
      hasCachedIdentity(getCachedSession?.());

    if (shouldRestore) {
      const session = await restoreSession();
      if (!session?.access_token) {
        throw createAuthSessionRequiredError();
      }
    }

    return fetchImpl(input, init);
  };
}
