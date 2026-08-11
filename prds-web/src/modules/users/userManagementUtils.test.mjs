import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessModule,
  getAllowedNavItems,
} from "./userManagementUtils.js";

const navItems = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "User Management", path: "/users", roles: ["PHARMA_II"] },
  { label: "Facilities", path: "/facilities", roles: ["PHARMA_I", "PHARMA_II"] },
  { label: "Suppliers", path: "/suppliers", roles: ["PHARMA_II"] },
  { label: "Notifications", path: "/notifications" },
];

test("only Pharma II can access the user management module", () => {
  assert.equal(canAccessModule("PHARMA_II", "/users"), true);
  assert.equal(canAccessModule("PHARMA_I", "/users"), false);
  assert.equal(canAccessModule("BHW", "/users"), false);
});

test("only CHO roles can access the facilities module", () => {
  assert.equal(canAccessModule("PHARMA_I", "/facilities"), true);
  assert.equal(canAccessModule("PHARMA_II", "/facilities"), true);
  assert.equal(canAccessModule("BHW", "/facilities"), false);
});

test("only Pharma II can access the suppliers module", () => {
  assert.equal(canAccessModule("PHARMA_I", "/suppliers"), false);
  assert.equal(canAccessModule("PHARMA_II", "/suppliers"), true);
  assert.equal(canAccessModule("BHW", "/suppliers"), false);
});

test("filters role-restricted navigation items", () => {
  assert.deepEqual(
    getAllowedNavItems(navItems, "PHARMA_I").map((item) => item.label),
    ["Dashboard", "Facilities", "Notifications"]
  );

  assert.deepEqual(
    getAllowedNavItems(navItems, "PHARMA_II").map((item) => item.label),
    ["Dashboard", "User Management", "Facilities", "Suppliers", "Notifications"]
  );

  assert.deepEqual(
    getAllowedNavItems(navItems, "BHW").map((item) => item.label),
    ["Dashboard", "Notifications"]
  );
});
