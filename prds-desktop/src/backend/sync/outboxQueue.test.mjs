import assert from "node:assert/strict";
import test from "node:test";

import {
  assertMutationAffectedRow,
  enqueueMutation,
  createOfflineInsertPayload,
  filterMutationsForUser,
  getFailedMutationCount,
  getPendingMutations,
  mergeMutationQueues,
  retryFailedMutations,
} from "./outboxQueue.js";

test("outbox queue merge retains local-only entries and reconciles duplicate statuses", () => {
  const sqlite = [
    { id: "shared-pending", status: "PENDING", user_id: "user-1", payload_json: "{}" },
    { id: "local-terminal", status: "PENDING", user_id: "user-1" },
  ];
  const local = [
    { id: "local-only", status: "PENDING", user_id: "user-1" },
    { id: "shared-pending", status: "FAILED", user_id: "user-1", error_message: "Rejected" },
    { id: "local-terminal", status: "SYNCED", user_id: "user-1" },
  ];

  assert.deepEqual(
    mergeMutationQueues(sqlite, local).map(({ id, status }) => ({ id, status })),
    [
      { id: "shared-pending", status: "FAILED" },
      { id: "local-terminal", status: "SYNCED" },
      { id: "local-only", status: "PENDING" },
    ]
  );
});

test("queued row mutations fail when the target ID does not exist", () => {
  assert.throws(
    () => assertMutationAffectedRow("UPDATE", { id: "missing-id" }, [], "patients"),
    /found no patients row with id missing-id/
  );
  assert.throws(
    () => assertMutationAffectedRow("DELETE", { id: "missing-id" }, [], "inventory"),
    /found no inventory row with id missing-id/
  );
  assert.doesNotThrow(() => assertMutationAffectedRow("UPDATE", { id: "known-id" }, [{ id: "known-id" }], "patients"));
});

test("offline insert payload keeps one database-valid ID for later queued edits", () => {
  const payload = createOfflineInsertPayload({ first_name: "Maria" });

  assert.match(payload.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.deepEqual(payload, { id: payload.id, first_name: "Maria" });
});

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

test("retryFailedMutations requeues only the signed-in user's failed work", async () => {
  const originalStorage = globalThis.localStorage;
  const stored = new Map([
    ["prds_desktop_user_session", JSON.stringify({ id: "user-1" })],
    ["prds_desktop_user_profile", JSON.stringify({ id: "user-1" })],
    ["prds_offline_outbox_queue", JSON.stringify([
      { id: "mine", user_id: "user-1", status: "FAILED", error_message: "network" },
      { id: "other", user_id: "user-2", status: "FAILED", error_message: "network" },
    ])],
  ]);
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) || null,
    setItem: (key, value) => stored.set(key, value),
  };

  try {
    assert.equal(await retryFailedMutations(), 1);
    const queue = JSON.parse(stored.get("prds_offline_outbox_queue"));
    assert.equal(queue[0].status, "PENDING");
    assert.equal(queue[0].error_message, null);
    assert.equal(queue[1].status, "FAILED");
    assert.equal(await getFailedMutationCount(), 0);
    assert.equal((await getPendingMutations()).length, 1);
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
