import assert from "node:assert/strict";
import test from "node:test";

import { getMutationFailureStatus, isConnectivityError } from "./networkErrorUtils.js";

test("isConnectivityError recognizes transport failures", () => {
  assert.equal(isConnectivityError(new TypeError("Failed to fetch")), true);
  assert.equal(isConnectivityError(new Error("NetworkError when attempting to fetch resource")), true);
});

test("isConnectivityError rejects Supabase business and permission errors", () => {
  assert.equal(isConnectivityError({ code: "P0001", message: "Insufficient stock" }), false);
  assert.equal(isConnectivityError({ message: "permission denied", status: 403 }), false);
});

test("getMutationFailureStatus keeps transport failures retryable", () => {
  assert.equal(getMutationFailureStatus(new TypeError("Failed to fetch")), "PENDING");
  assert.equal(getMutationFailureStatus({ code: "P0001", message: "Insufficient stock" }), "FAILED");
});
