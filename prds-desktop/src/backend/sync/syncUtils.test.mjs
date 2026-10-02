import assert from "node:assert/strict";
import test from "node:test";

import {
  describeMutation,
  fetchAllRows,
  formatUserFacingError,
  getFriendlyDashboardErrorMessage,
  getFriendlySyncErrorMessage,
  getFriendlySyncTooltip,
  getSafeWatermarkWindow,
  getSnapshotFailureMessage,
  mergeSnapshotDelta,
} from "./syncUtils.js";

test("getSnapshotFailureMessage reports partial snapshot failures", () => {
  assert.equal(
    getSnapshotFailureMessage([
      { data: [], error: null },
      { data: null, error: new Error("timeout") },
      { data: null, error: { message: "permission denied" } },
    ], ["Medicines", "Patients", "Suppliers"]),
    "2 data sources could not be refreshed. Patients: timeout; Suppliers: permission denied"
  );
  assert.equal(getSnapshotFailureMessage([{ data: [], error: null }]), "");
});

test("getFriendlySyncErrorMessage converts technical errors into friendly user messages", () => {
  // Network / timeout
  assert.match(
    getFriendlySyncErrorMessage("Sync timeout: failed to fetch"),
    /Unable to connect to the central server/
  );

  // Local changes waiting
  assert.match(
    getFriendlySyncErrorMessage("3 local changes are still waiting to sync", 3),
    /3 updates are saved locally and waiting to sync/
  );

  // Snapshot refresh failure with technical codes
  assert.match(
    getFriendlySyncErrorMessage("2 data sources could not be refreshed. Patients: timeout; Other Programs: PGRST200"),
    /Could not download the latest updates from the central server/
  );

  // Supabase / database internal details
  assert.match(
    getFriendlySyncErrorMessage("relation public.inventory does not exist in Supabase"),
    /The central server is temporarily busy or unreachable/
  );

  // Fallback
  assert.match(
    getFriendlySyncErrorMessage(""),
    /Unable to sync with the central server right now/
  );

  // Verify none of the messages leak developer jargon
  const allOutputs = [
    getFriendlySyncErrorMessage("Sync timeout"),
    getFriendlySyncErrorMessage("still waiting to sync", 2),
    getFriendlySyncErrorMessage("2 data sources could not be refreshed"),
    getFriendlySyncErrorMessage("relation public.inventory in Supabase"),
    getFriendlySyncErrorMessage("SQLite lock error"),
  ].join(" ");

  assert.doesNotMatch(allOutputs, /supabase/i);
  assert.doesNotMatch(allOutputs, /sqlite/i);
  assert.doesNotMatch(allOutputs, /pgrst/i);
  assert.doesNotMatch(allOutputs, /relation/i);
});

test("getFriendlySyncTooltip formats human-readable tooltips for all sync states", () => {
  // Online Synced without timestamp
  const onlineTooltip = getFriendlySyncTooltip({
    isOnline: true,
    isSyncing: false,
    syncStatus: "SUCCESS",
  });
  assert.match(onlineTooltip, /Connected to central server/);
  assert.match(onlineTooltip, /All records are up to date/);
  assert.doesNotMatch(onlineTooltip, /supabase/i);

  // Online Synced with timestamp
  const onlineWithTime = getFriendlySyncTooltip({
    isOnline: true,
    isSyncing: false,
    syncStatus: "SUCCESS",
    lastSyncTime: "2026-09-23T01:28:00.000Z",
  });
  assert.match(onlineWithTime, /Last synced at/);

  // Online with pending upload
  const onlinePending = getFriendlySyncTooltip({
    isOnline: true,
    isSyncing: false,
    syncStatus: "IDLE",
    pendingCount: 2,
  });
  assert.match(onlinePending, /2 local updates are syncing to the central server/);

  // Syncing in progress
  const syncingTooltip = getFriendlySyncTooltip({
    isOnline: true,
    isSyncing: true,
    pendingCount: 4,
  });
  assert.match(syncingTooltip, /Uploading 4 local updates to the central server/);

  // Offline mode without pending
  const offlineTooltip = getFriendlySyncTooltip({
    isOnline: false,
    pendingCount: 0,
  });
  assert.match(offlineTooltip, /Working offline/);
  assert.match(offlineTooltip, /safely saved on this computer/);
  assert.doesNotMatch(offlineTooltip, /sqlite/i);

  // Offline mode with pending
  const offlinePending = getFriendlySyncTooltip({
    isOnline: false,
    pendingCount: 5,
  });
  assert.match(offlinePending, /5 saved changes will sync automatically/);

  // Error state
  const errorTooltip = getFriendlySyncTooltip({
    isOnline: true,
    syncStatus: "ERROR",
    error: "2 data sources could not be refreshed. Patients: timeout",
  });
  assert.match(errorTooltip, /Could not download the latest updates/);
  assert.match(errorTooltip, /Click to retry/);
});

test("getFriendlyDashboardErrorMessage replaces TypeError and technical jargon with friendly message", () => {
  // Network / fetch error with fallback saved data (the exact user scenario!)
  const typeErrorWithFallback = getFriendlyDashboardErrorMessage(
    new TypeError("Failed to fetch"),
    true
  );
  assert.match(typeErrorWithFallback, /Could not connect to the central server/);
  assert.match(typeErrorWithFallback, /Showing your saved dashboard records/);
  assert.match(typeErrorWithFallback, /Click Refresh to try again/);
  assert.doesNotMatch(typeErrorWithFallback, /TypeError/i);
  assert.doesNotMatch(typeErrorWithFallback, /Failed to fetch/i);

  // Network / fetch error without fallback
  const fetchErrorNoFallback = getFriendlyDashboardErrorMessage(
    new Error("Failed to fetch"),
    false
  );
  assert.match(fetchErrorNoFallback, /Unable to connect to the central server/);
  assert.match(fetchErrorNoFallback, /Please check your internet connection/);

  // Database / Supabase error with fallback
  const serverErrorWithFallback = getFriendlyDashboardErrorMessage(
    new Error("PGRST301: relation 'dashboard' does not exist in Supabase"),
    true
  );
  assert.match(serverErrorWithFallback, /The central server is temporarily unreachable/);
  assert.match(serverErrorWithFallback, /Showing your saved dashboard records/);
  assert.doesNotMatch(serverErrorWithFallback, /pgrst/i);
  assert.doesNotMatch(serverErrorWithFallback, /supabase/i);
});

test("formatUserFacingError cleans technical error messages", () => {
  assert.match(
    formatUserFacingError(new TypeError("Failed to fetch")),
    /Unable to connect to the central server/
  );
  assert.match(
    formatUserFacingError("PGRST116: database error"),
    /The central server is temporarily busy or unreachable/
  );
  assert.equal(
    formatUserFacingError(new TypeError("Cannot read properties of undefined"), "Unable to load data."),
    "Unable to load data."
  );
  assert.equal(
    formatUserFacingError("Please select an approved facility first."),
    "Please select an approved facility first."
  );
});

test("fetchAllRows pages until the last partial page", async () => {
  const pages = [[1, 2], [3, 4], [5]];
  const offsets = [];
  const rows = await fetchAllRows(() => ({
    range: async (from, to) => {
      offsets.push([from, to]);
      return { data: pages[from / 2], error: null };
    },
  }), 2);
  assert.deepEqual(rows, [1, 2, 3, 4, 5]);
  assert.deepEqual(offsets, [[0, 1], [2, 3], [4, 5]]);
});

test("fetchAllRows propagates query errors", async () => {
  await assert.rejects(
    fetchAllRows(() => ({ range: async () => ({ data: null, error: new Error("offline") }) })),
    /offline/
  );
});

test("describeMutation generates human-friendly labels and details for outbox entries", () => {
  const dispensing = describeMutation({
    mutation_type: "RPC",
    target: "medicine_dispensing",
    payload_json: JSON.stringify({ quantity: 10 }),
  });
  assert.equal(dispensing.label, "Walk-in Dispensing");
  assert.equal(dispensing.description, "Dispensed 10 units");

  const patient = describeMutation({
    mutation_type: "INSERT",
    target: "patients",
    payload_json: JSON.stringify({ first_name: "Maria", last_name: "Reyes" }),
  });
  assert.equal(patient.label, "New Patient Profile");
  assert.equal(patient.description, "Patient: Maria Reyes");

  const inventory = describeMutation({
    mutation_type: "INSERT",
    target: "inventory",
    payload_json: JSON.stringify({ batch_number: "B204", quantity: 50 }),
  });
  assert.equal(inventory.label, "Receive Stock");
  assert.equal(inventory.description, "Batch #B204 - 50 units");

  const request = describeMutation({
    mutation_type: "INSERT",
    target: "medicine_requests",
    payload_json: JSON.stringify({ request_number: "REQ-001" }),
  });
  assert.equal(request.label, "Medicine Request");
  assert.equal(request.description, "Request #REQ-001");
});

test("getSafeWatermarkWindow computes safe watermark window with clock skew rewind", () => {
  assert.equal(getSafeWatermarkWindow(null), null);
  assert.equal(getSafeWatermarkWindow(undefined), null);
  assert.equal(getSafeWatermarkWindow("invalid-date"), null);

  const baseIso = "2026-10-01T12:00:10.000Z";
  const expectedIso = "2026-10-01T12:00:05.000Z"; // 5000ms earlier
  assert.equal(getSafeWatermarkWindow(baseIso), expectedIso);

  // Custom overlap
  const customOverlap = getSafeWatermarkWindow(baseIso, 10000);
  assert.equal(customOverlap, "2026-10-01T12:00:00.000Z");

  // Near epoch 0 floor
  const nearEpoch = "1970-01-01T00:00:02.000Z";
  assert.equal(getSafeWatermarkWindow(nearEpoch, 5000), "1970-01-01T00:00:00.000Z");
});

test("mergeSnapshotDelta merges updates, appends new records, and purges tombstones", () => {
  const existing = [
    { id: "1", name: "Amoxicillin", qty: 10 },
    { id: "2", name: "Paracetamol", qty: 50 },
    { id: "3", name: "Ibuprofen", qty: 25 },
  ];

  const delta = [
    { id: "2", name: "Paracetamol", qty: 45 }, // updated
    { id: "4", name: "Cetirizine", qty: 100 }, // newly added
  ];

  const tombstones = ["3"]; // deleted

  const merged = mergeSnapshotDelta(existing, delta, tombstones);

  assert.equal(merged.length, 3);
  assert.deepEqual(merged.find((r) => r.id === "1"), { id: "1", name: "Amoxicillin", qty: 10 });
  assert.deepEqual(merged.find((r) => r.id === "2"), { id: "2", name: "Paracetamol", qty: 45 });
  assert.deepEqual(merged.find((r) => r.id === "4"), { id: "4", name: "Cetirizine", qty: 100 });
  assert.equal(merged.find((r) => r.id === "3"), undefined);

  // Handles empty inputs gracefully
  assert.deepEqual(mergeSnapshotDelta([], []), []);
  assert.deepEqual(mergeSnapshotDelta(null, [{ id: "1" }]), [{ id: "1" }]);
});

