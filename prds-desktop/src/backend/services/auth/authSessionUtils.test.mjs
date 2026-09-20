import assert from "node:assert/strict";
import test from "node:test";

import { signOutCurrentSession } from "./authSessionUtils.js";

test("sign out only the current Supabase session", async () => {
  let options;
  await signOutCurrentSession({
    signOut: async (value) => {
      options = value;
      return { error: null };
    },
  });

  assert.deepEqual(options, { scope: "local" });
});

test("propagate a failed Supabase sign-out", async () => {
  const error = new Error("Sign-out failed");

  await assert.rejects(
    signOutCurrentSession({ signOut: async () => ({ error }) }),
    error,
  );
});
