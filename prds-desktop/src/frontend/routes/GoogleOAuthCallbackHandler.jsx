import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";

import { supabaseAuth } from "@backend/client/supabase";
import {
  consumeGoogleOAuthReturnPath,
  completeGoogleOAuthCallback,
  GOOGLE_OAUTH_RETURN_PATH_KEY,
} from "@backend/services/auth/googleOAuthUtils.js";

export default function GoogleOAuthCallbackHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTauri()) return undefined;

    let active = true;
    let unlisten;
    const handledUrls = new Set();

    const handleUrl = async (rawUrl) => {
      if (!active || handledUrls.has(rawUrl)) return;
      handledUrls.add(rawUrl);

      const result = await completeGoogleOAuthCallback(rawUrl, {
        storage: localStorage,
        exchangeCode: (code) => supabaseAuth.auth.exchangeCodeForSession(code),
      });
      if (!active || !result) return;

      navigate(result.returnPath, {
        replace: true,
        ...(result.notice ? { state: { oauthNotice: result.notice } } : {}),
      });
    };

    const listenForCallbacks = async () => {
      try {
        unlisten = await onOpenUrl((urls) => {
          urls.forEach((url) => void handleUrl(url));
        });
        if (!active) {
          unlisten();
          return;
        }

        const urls = await getCurrent();
        urls?.forEach((url) => void handleUrl(url));
      } catch (error) {
        console.error("Unable to listen for Google sign-in callbacks:", error);
        if (active && localStorage.getItem(GOOGLE_OAUTH_RETURN_PATH_KEY)) {
          const returnPath = consumeGoogleOAuthReturnPath(localStorage);
          navigate(returnPath || "/", {
            replace: true,
            state: { oauthNotice: "Could not receive the Google sign-in response. Please try again." },
          });
        }
      }
    };

    void listenForCallbacks();
    return () => {
      active = false;
      unlisten?.();
    };
  }, [navigate]);

  return null;
}
