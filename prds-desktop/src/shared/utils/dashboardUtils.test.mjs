import assert from "node:assert/strict";
import test from "node:test";

import {
  countActivePatients,
  getDashboardInventoryMetrics,
  getDashboardLayoutGroups,
  getDashboardRoleConfig,
  getDashboardStatCards,
  getMonthlyDispensedQuantity,
} from "./dashboardUtils.js";

const stats = {
  activeFacilities: 13,
  activePatients: 4,
  criticalStock: 2,
  dispensedThisMonth: 420,
  lowStock: 3,
  pendingRequests: 5,
  stockedBatches: 12,
};

test("pharmacist ii dashboard includes system administration actions", () => {
  const config = getDashboardRoleConfig({ role: "PHARMA_II" });
  const cards = getDashboardStatCards({
    config,
    inventoryPath: "/inventory",
    stats,
  });

  assert.equal(config.scopeLabel, "System-wide CHO oversight");
  assert.equal(config.canReviewUsers, true);
  assert.deepEqual(
    cards.map((card) => card.key),
    ["stockedBatches", "dispensedThisMonth", "activePatients", "pendingRequests", "criticalStock", "lowStock"]
  );
  assert.equal(cards.some((card) => card.key === "pendingApprovals"), false);
});

test("pharmacist i dashboard excludes user administration but keeps CHO operations", () => {
  const config = getDashboardRoleConfig({ role: "PHARMA_I" });
  const cards = getDashboardStatCards({
    config,
    inventoryPath: "/inventory",
    stats,
  });

  assert.equal(config.scopeLabel, "CHO operations monitoring");
  assert.equal(config.canReviewUsers, false);
  assert.deepEqual(
    cards.map((card) => card.key),
    ["stockedBatches", "dispensedThisMonth", "activePatients", "pendingRequests", "criticalStock", "lowStock"]
  );
  assert.equal(cards.some((card) => ["pendingApprovals", "expiringSoon", "transfersAwaitingAction", "requestFillRate"].includes(card.key)), false);
});

test("bhw dashboard is scoped to the assigned facility and routes to bhw inventory", () => {
  const config = getDashboardRoleConfig({
    role: "BHW",
    facilityName: "Tinaan Health Center",
  });
  const cards = getDashboardStatCards({
    config,
    inventoryPath: "/inventory-bhw",
    stats,
  });

  assert.equal(config.scopeLabel, "Tinaan Health Center facility view");
  assert.equal(config.canReviewUsers, false);
  assert.deepEqual(
    cards.map((card) => card.key),
    ["stockedBatches", "dispensedThisMonth", "activePatients", "pendingRequests", "criticalStock", "lowStock"]
  );
  assert.equal(cards.find((card) => card.key === "lowStock").to, "/inventory-bhw");
});

test("dashboard layout keeps all summary cards in a compact top row", () => {
  const config = getDashboardRoleConfig({ role: "PHARMA_II" });
  const cards = getDashboardStatCards({
    config,
    inventoryPath: "/inventory",
    stats,
  });
  const groups = getDashboardLayoutGroups(cards);

  assert.deepEqual(groups.summaryCards.map((card) => card.key), ["stockedBatches", "dispensedThisMonth", "activePatients", "pendingRequests", "criticalStock", "lowStock"]);
  assert.deepEqual(groups.overflowCards, []);
});

test("inventory metrics count stocked batches and keep critical separate from low stock", () => {
  const metrics = getDashboardInventoryMetrics([
    { quantity: 0, threshold: 10 },
    { quantity: 2, threshold: 10 },
    { quantity: 7, threshold: 10 },
    { quantity: 20, threshold: 10 },
  ]);

  assert.deepEqual(metrics, { stockedBatches: 3, criticalStock: 2, lowStock: 1 });
});

test("active patient count excludes archived patients", () => {
  assert.equal(countActivePatients([
    { archived_at: null },
    { archived_at: null },
    { archived_at: "2026-09-01T00:00:00Z" },
  ]), 2);
});

test("monthly dispensing excludes voided and history-only rows and other months", () => {
  const now = new Date("2026-09-20T12:00:00Z");
  const quantity = getMonthlyDispensedQuantity([
    { dispense_date: "2026-09-01T10:00:00Z", quantity: 30, record_type: "LIVE_DISPENSING", voided_at: null },
    { dispense_date: "2026-09-10T10:00:00Z", quantity: 50, record_type: "BARANGAY_DISPENSING_LOG", voided_at: null },
    { dispense_date: "2026-09-11T10:00:00Z", quantity: 90, record_type: "LIVE_DISPENSING", voided_at: "2026-09-12T10:00:00Z" },
    { dispense_date: "2026-09-12T10:00:00Z", quantity: 100, record_type: "HISTORY_ONLY", voided_at: null },
    { dispense_date: "2026-08-31T12:00:00Z", quantity: 200, record_type: "LIVE_DISPENSING", voided_at: null },
  ], now);

  assert.equal(quantity, 80);
});
