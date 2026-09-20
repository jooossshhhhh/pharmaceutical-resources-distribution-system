export const GOOGLE_OAUTH_RETURN_PATH_KEY = "prds-google-oauth-return-path";

export const normalizeGoogleOAuthReturnPath = (path) =>
  path === "/register" ? "/register" : "/";

export const parseGoogleOAuthCallback = (rawUrl) => {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (
    url.protocol !== "prds:" ||
    url.hostname !== "auth" ||
    url.pathname !== "/callback"
  ) {
    return null;
  }

  const hashParams = new URLSearchParams(url.hash.slice(1));
  const getParam = (name) => url.searchParams.get(name) || hashParams.get(name);
  const error = getParam("error");
  const errorDescription = getParam("error_description");
  const code = getParam("code");

  if (error) {
    return { error: errorDescription?.slice(0, 240) || error };
  }

  return code ? { code } : null;
};

export const consumeGoogleOAuthReturnPath = (storage) => {
  const path = storage.getItem(GOOGLE_OAUTH_RETURN_PATH_KEY);
  storage.removeItem(GOOGLE_OAUTH_RETURN_PATH_KEY);
  return path === "/register" || path === "/" ? path : null;
};

export const completeGoogleOAuthCallback = async (
  rawUrl,
  { storage, exchangeCode }
) => {
  const callback = parseGoogleOAuthCallback(rawUrl);
  if (!callback) return null;

  const returnPath = consumeGoogleOAuthReturnPath(storage);
  if (!returnPath) return null;

  if (callback.error) {
    return { returnPath, notice: `Google sign-in was not completed: ${callback.error}` };
  }

  try {
    const { error } = await exchangeCode(callback.code);
    return {
      returnPath,
      notice: error ? "Google sign-in could not be completed. Please try again." : "",
    };
  } catch {
    return { returnPath, notice: "Google sign-in could not be completed. Please try again." };
  }
};
