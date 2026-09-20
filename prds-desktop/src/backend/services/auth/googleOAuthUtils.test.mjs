import test from "node:test";
import assert from "node:assert/strict";

import {
  consumeGoogleOAuthReturnPath,
  completeGoogleOAuthCallback,
  GOOGLE_OAUTH_RETURN_PATH_KEY,
  normalizeGoogleOAuthReturnPath,
  parseGoogleOAuthCallback,
} from "./googleOAuthUtils.js";

test("normalizes OAuth return paths to supported auth routes", () => {
  assert.equal(normalizeGoogleOAuthReturnPath("/register"), "/register");
  assert.equal(normalizeGoogleOAuthReturnPath("/dashboard"), "/");
});

test("accepts only the PRDS callback URL and parses its code", () => {
  assert.deepEqual(
    parseGoogleOAuthCallback("prds://auth/callback?code=pkce-code"),
    { code: "pkce-code" }
  );
  assert.equal(parseGoogleOAuthCallback("https://example.com/callback?code=x"), null);
  assert.equal(parseGoogleOAuthCallback("prds://auth/other?code=x"), null);
});

test("parses provider errors and consumes only a supported saved route", () => {
  assert.deepEqual(
    parseGoogleOAuthCallback("prds://auth/callback?error=access_denied&error_description=Cancelled"),
    { error: "Cancelled" }
  );

  const values = new Map([[GOOGLE_OAUTH_RETURN_PATH_KEY, "/register"]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
  };
  assert.equal(consumeGoogleOAuthReturnPath(storage), "/register");
  assert.equal(consumeGoogleOAuthReturnPath(storage), null);
});

test("completes the PKCE exchange for the originating route and handles cancellation", async () => {
  const values = new Map([[GOOGLE_OAUTH_RETURN_PATH_KEY, "/register"]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
  };
  let exchangedCode;

  assert.deepEqual(
    await completeGoogleOAuthCallback("prds://auth/callback?code=good-code", {
      storage,
      exchangeCode: async (code) => {
        exchangedCode = code;
        return { error: null };
      },
    }),
    { returnPath: "/register", notice: "" }
  );
  assert.equal(exchangedCode, "good-code");

  values.set(GOOGLE_OAUTH_RETURN_PATH_KEY, "/register");
  assert.deepEqual(
    await completeGoogleOAuthCallback("prds://auth/callback?error=access_denied", {
      storage,
      exchangeCode: async () => ({ error: null }),
    }),
    {
      returnPath: "/register",
      notice: "Google sign-in was not completed: access_denied",
    }
  );

  assert.equal(
    await completeGoogleOAuthCallback("prds://auth/callback?code=late-code", {
      storage,
      exchangeCode: async () => ({ error: null }),
    }),
    null
  );

  values.set(GOOGLE_OAUTH_RETURN_PATH_KEY, "/");
  assert.deepEqual(
    await completeGoogleOAuthCallback("prds://auth/callback?code=expired-code", {
      storage,
      exchangeCode: async () => ({ error: new Error("expired") }),
    }),
    { returnPath: "/", notice: "Google sign-in could not be completed. Please try again." }
  );
});
