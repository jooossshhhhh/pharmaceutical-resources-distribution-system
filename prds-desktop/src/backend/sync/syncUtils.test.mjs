import assert from "node:assert/strict";
import test from "node:test";

import { fetchAllRows, getSnapshotFailureMessage } from "./syncUtils.js";

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
