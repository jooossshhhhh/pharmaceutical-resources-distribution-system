import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessModule,
  getAllowedNavItems,
} from "./userManagementUtils.js";

const navItems = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "User Management", path: "/users", roles: ["PHARMA_II"] },
  { label: "Notifications", path: "/notifications" },
];

test("only Pharma II can access the user management module", () => {
  assert.equal(canAccessModule("PHARMA_II", "/users"), true);
  assert.equal(canAccessModule("PHARMA_I", "/users"), false);
  assert.equal(canAccessModule("BHW", "/users"), false);
});

test("filters role-restricted navigation items", () => {
  assert.deepEqual(
    getAllowedNavItems(navItems, "PHARMA_I").map((item) => item.label),
    ["Dashboard", "Notifications"]
  );

  assert.deepEqual(
    getAllowedNavItems(navItems, "PHARMA_II").map((item) => item.label),
    ["Dashboard", "User Management", "Notifications"]
  );
});
