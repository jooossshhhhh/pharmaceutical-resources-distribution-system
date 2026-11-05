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

      if (init?.headers) {
        if (typeof Headers !== "undefined" && init.headers instanceof Headers) {
          init.headers.set("Authorization", `Bearer ${session.access_token}`);
        } else if (Array.isArray(init.headers)) {
          const idx = init.headers.findIndex(
            ([k]) => String(k).toLowerCase() === "authorization"
          );
          if (idx >= 0) {
            init.headers[idx] = ["Authorization", `Bearer ${session.access_token}`];
          } else {
            init.headers.push(["Authorization", `Bearer ${session.access_token}`]);
          }
        } else if (typeof init.headers === "object") {
          init.headers = {
            ...init.headers,
            Authorization: `Bearer ${session.access_token}`,
          };
        }
      }
    }

    return fetchImpl(input, init);
  };
}
