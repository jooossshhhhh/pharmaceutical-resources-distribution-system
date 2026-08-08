import assert from "node:assert/strict";
import test from "node:test";

import {
  getDashboardLayoutGroups,
  getDashboardRoleConfig,
  getDashboardStatCards,
} from "./dashboardUtils.js";

const stats = {
  activeFacilities: 13,
  expiringSoon: 4,
  lowStock: 2,
  medicineCatalog: 10,
  pendingApprovals: 3,
  pendingRequests: 5,
  transfersCompleted: 1,
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
    [
      "pendingRequests",
      "lowStock",
      "pendingApprovals",
      "activeFacilities",
      "expiringSoon",
      "transfersCompleted",
    ]
  );
  assert.equal(cards.find((card) => card.key === "pendingApprovals").to, "/users");
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
    [
      "pendingRequests",
      "lowStock",
      "activeFacilities",
      "expiringSoon",
      "medicineCatalog",
      "transfersCompleted",
    ]
  );
  assert.equal(cards.some((card) => card.key === "pendingApprovals"), false);
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
    ["pendingRequests", "lowStock", "expiringSoon", "myFacility"]
  );
  assert.equal(cards.find((card) => card.key === "lowStock").to, "/inventory-bhw?stock=low");
  assert.equal(cards.find((card) => card.key === "myFacility").label, "My Facility");
});

test("dashboard layout keeps all summary cards in a compact top row", () => {
  const config = getDashboardRoleConfig({ role: "PHARMA_II" });
  const cards = getDashboardStatCards({
    config,
    inventoryPath: "/inventory",
    stats,
  });
  const groups = getDashboardLayoutGroups(cards);

  assert.deepEqual(groups.summaryCards.map((card) => card.key), [
    "pendingRequests",
    "lowStock",
    "pendingApprovals",
    "activeFacilities",
    "expiringSoon",
    "transfersCompleted",
  ]);
  assert.deepEqual(groups.overflowCards, []);
});
