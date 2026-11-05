import test from "node:test";
import assert from "node:assert/strict";

const mockStorage = new Map();
if (!globalThis.localStorage) {
  globalThis.localStorage = {
    getItem: (k) => (mockStorage.has(k) ? mockStorage.get(k) : null),
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k),
    clear: () => mockStorage.clear(),
  };
}

// Seed user session so outboxQueue accepts offline mutations
mockStorage.set("prds_desktop_user_session", JSON.stringify({ id: "user-123", email: "cho@naga.gov.ph" }));
mockStorage.set("prds_desktop_user_profile", JSON.stringify({ id: "user-123", facility_id: "fac-456", role: "CHO" }));

import {
  saveOtherProgram,
  startOtherProgram,
  completeOtherProgram,
  cancelOtherProgram,
  ACTION_SAVE_OTHER_PROGRAM,
  ACTION_START_OTHER_PROGRAM,
  ACTION_COMPLETE_OTHER_PROGRAM,
  ACTION_CANCEL_OTHER_PROGRAM,
} from "./otherProgramsService.js";
import { getSnapshot, saveSnapshot, STORAGE_KEYS } from "../database/snapshotStore.js";
import { computeProgramReservations } from "../../shared/utils/inventoryUtils.js";

test("otherProgramsService exports action constants", () => {
  assert.equal(ACTION_SAVE_OTHER_PROGRAM, "save_other_program");
  assert.equal(ACTION_START_OTHER_PROGRAM, "start_other_program");
  assert.equal(ACTION_COMPLETE_OTHER_PROGRAM, "complete_other_program");
  assert.equal(ACTION_CANCEL_OTHER_PROGRAM, "cancel_other_program");
});

test("saveOtherProgram offline creates queued program representation", async () => {
  const medicineMap = new Map([
    ["med-1", { id: "med-1", generic_name: "Amoxicillin", dosage: "500mg", unit_of_measure: "capsule" }],
  ]);

  const profile = {
    id: "user-123",
    facility_id: "fac-456",
  };

  const result = await saveOtherProgram({
    programId: null,
    programName: "Community Medical Outreach",
    programDate: "2026-11-15",
    description: "Free checkups and medicine distribution",
    items: [{ medicine_id: "med-1", quantity_allocated: 50, quantity_used: 50 }],
    profile,
    medicineMap,
  });

  assert.equal(result.success, true);
  assert.ok(result.program);
  assert.equal(result.program.program_name, "Community Medical Outreach");
  assert.equal(result.program.program_date, "2026-11-15");
  assert.equal(result.program.description, "Free checkups and medicine distribution");
  assert.equal(result.program.status, "UPCOMING");
  assert.equal(result.program.medicines.length, 1);
  assert.equal(result.program.medicines[0].medicine_id, "med-1");
  assert.equal(result.program.medicines[0].quantity_allocated, 50);
  assert.equal(result.program.medicines[0].quantity_returned, 0);
  assert.equal(result.program.medicines[0].quantity_used, 50);
  assert.equal(result.program.medicines[0].medicine.generic_name, "Amoxicillin");
});

test("startOtherProgram transitions UPCOMING program to ONGOING and keeps stock reserved", async () => {
  const profile = { id: "user-123", facility_id: "fac-456" };
  saveSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, [
    {
      id: "prog-ongoing-1",
      facility_id: "fac-456",
      program_name: "Community Outreach",
      program_date: "2026-11-04",
      status: "UPCOMING",
      medicines: [{ id: "pm-1", medicine_id: "med-x", quantity_allocated: 500, quantity_used: 500 }],
    },
  ]);

  const result = await startOtherProgram({
    programId: "prog-ongoing-1",
    profile,
  });

  assert.equal(result.success, true);
  const updated = getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []).find((p) => p.id === "prog-ongoing-1");
  assert.equal(updated.status, "ONGOING");
  assert.ok(updated.started_at);

  const { reservedByMedicine } = computeProgramReservations([updated]);
  assert.equal(reservedByMedicine.get("med-x"), 500);
});

test("completeOtherProgram reconciles returned stock and deducts only actual dispensed (allocated - returned)", async () => {
  const profile = { id: "user-123", facility_id: "fac-456" };
  saveSnapshot(STORAGE_KEYS.INVENTORY, [
    {
      id: "inv-lot-1",
      facility_id: "fac-456",
      medicine_id: "med-x",
      quantity: 2000,
      expiration_date: "2027-05-31",
    },
  ]);
  saveSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, [
    {
      id: "prog-rec-1",
      facility_id: "fac-456",
      program_name: "Community Outreach",
      program_date: "2026-11-04",
      status: "ONGOING",
      started_at: "2026-11-04T08:00:00Z",
      medicines: [
        { id: "pm-rec-1", medicine_id: "med-x", quantity_allocated: 500, quantity_returned: 0, quantity_used: 500 },
      ],
    },
  ]);

  const result = await completeOtherProgram({
    programId: "prog-rec-1",
    returns: [{ medicine_id: "med-x", quantity_returned: 120 }],
    profile,
  });

  assert.equal(result.success, true);
  const completedProg = getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []).find((p) => p.id === "prog-rec-1");
  assert.equal(completedProg.status, "COMPLETED");
  assert.equal(completedProg.medicines[0].quantity_allocated, 500);
  assert.equal(completedProg.medicines[0].quantity_returned, 120);
  assert.equal(completedProg.medicines[0].quantity_used, 380);

  // Inventory should have only 380 deducted (2000 - 380 = 1620), not 500
  const invLot = getSnapshot(STORAGE_KEYS.INVENTORY, []).find((l) => l.id === "inv-lot-1");
  assert.equal(invLot.quantity, 1620);

  // Completed program should no longer hold any reserved stock
  const { reservedByMedicine } = computeProgramReservations([completedProg]);
  assert.equal(reservedByMedicine.get("med-x") || 0, 0);
});

test("completeOtherProgram dispatches prds:other-programs-changed and prds:inventory-changed events", async () => {
  const events = [];
  const origWindow = globalThis.window;
  globalThis.window = {
    dispatchEvent: (evt) => {
      events.push({ type: evt.type, detail: evt.detail });
    },
  };

  try {
    const result = await completeOtherProgram({
      programId: "prog-evt-1",
      profile: { id: "user-123", facility_id: "fac-456" },
      program: { id: "prog-evt-1", medicines: [] },
    });

    assert.equal(result.success, true);
    assert.ok(events.some((e) => e.type === "prds:other-programs-changed" && e.detail?.status === "COMPLETED"));
    assert.ok(events.some((e) => e.type === "prds:inventory-changed" && e.detail?.action === "PROGRAM_COMPLETED"));
  } finally {
    globalThis.window = origWindow;
  }
});

test("cancelOtherProgram dispatches prds:other-programs-changed and prds:inventory-changed events", async () => {
  const events = [];
  const origWindow = globalThis.window;
  globalThis.window = {
    dispatchEvent: (evt) => {
      events.push({ type: evt.type, detail: evt.detail });
    },
  };

  try {
    const result = await cancelOtherProgram({
      programId: "prog-evt-2",
      profile: { id: "user-123", facility_id: "fac-456" },
    });

    assert.equal(result.success, true);
    assert.ok(events.some((e) => e.type === "prds:other-programs-changed" && e.detail?.status === "CANCELLED"));
    assert.ok(events.some((e) => e.type === "prds:inventory-changed" && e.detail?.action === "PROGRAM_CANCELLED"));
  } finally {
    globalThis.window = origWindow;
  }
});
