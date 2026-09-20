import assert from "node:assert/strict";
import test from "node:test";

import {
  enqueueMutation,
  filterMutationsForUser,
  getFailedMutationCount,
  getPendingMutations,
} from "./outboxQueue.js";

test("enqueueMutation rejects mutations without its canonical contract", async () => {
  await assert.rejects(
    enqueueMutation({
      type: "INSERT",
      table: "patients",
      payload: { first_name: "Maria" },
    }),
    /mutationType and target are required/
  );

  await assert.rejects(
    enqueueMutation({
      mutationType: "UPSERT",
      target: "patients",
      payload: { first_name: "Maria" },
    }),
    /Unsupported mutation type/
  );
});

test("getFailedMutationCount includes terminal local queue failures", async () => {
  const originalStorage = globalThis.localStorage;
  const stored = new Map([
    ["prds_desktop_user_session", JSON.stringify({ id: "user-1" })],
    ["prds_desktop_user_profile", JSON.stringify({ id: "user-1" })],
    ["prds_offline_outbox_queue", JSON.stringify([
      { id: "failed-1", user_id: "user-1", status: "FAILED" },
      { id: "pending-1", user_id: "user-1", status: "PENDING" },
      { id: "other-user-failed", user_id: "user-2", status: "FAILED" },
    ])],
  ]);

  try {
    globalThis.localStorage = {
      getItem: (key) => stored.get(key) || null,
      setItem: (key, value) => stored.set(key, value),
      get length() { return stored.size; },
      key: (index) => [...stored.keys()][index] || null,
    };

    assert.equal(await getFailedMutationCount(), 1);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test("queued mutations are visible only to their owning user", () => {
  const queue = [
    { id: "owned", user_id: "user-1", status: "PENDING" },
    { id: "other", user_id: "user-2", status: "PENDING" },
    { id: "legacy", user_id: null, status: "PENDING" },
  ];

  assert.deepEqual(filterMutationsForUser(queue, "user-1"), [queue[0]]);
  assert.deepEqual(filterMutationsForUser(queue, null), []);
});

test("pending queue reads exclude records owned by other users", async () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => key === "prds_offline_outbox_queue"
      ? JSON.stringify([
          { id: "owned", user_id: "user-1", status: "PENDING" },
          { id: "other", user_id: "user-2", status: "PENDING" },
          { id: "legacy", user_id: null, status: "PENDING" },
        ])
      : null,
    setItem: () => {},
  };

  try {
    assert.deepEqual(
      await getPendingMutations("user-1"),
      [{ id: "owned", user_id: "user-1", status: "PENDING" }]
    );
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test("new offline mutations require a signed-in owner", async () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };

  try {
    await assert.rejects(
      enqueueMutation({
        mutationType: "INSERT",
        target: "patients",
        payload: { first_name: "Maria" },
      }),
      /active signed-in user is required/
    );
  } finally {
    globalThis.localStorage = originalStorage;
  }
});
