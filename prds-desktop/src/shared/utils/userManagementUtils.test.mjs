import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUserSummary,
  canAccessModule,
  filterUsers,
  getAllowedNavItems,
  getDisplayEmail,
  getDisplayPhone,
  getFullName,
  getRoleLabel,
  getStatusLabel,
} from "./userManagementUtils.js";

const navItems = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Stock Returns", path: "/stock-returns" },
  { label: "Transfers", path: "/transfers" },
  { label: "User Management", path: "/users", roles: ["PHARMA_II"] },
  { label: "Facilities", path: "/facilities", roles: ["PHARMA_I", "PHARMA_II"] },
  { label: "Other Programs", path: "/other-programs", roles: ["PHARMA_II"] },
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

test("all operational roles can access the stock returns module", () => {
  assert.equal(canAccessModule("PHARMA_I", "/stock-returns"), true);
  assert.equal(canAccessModule("PHARMA_II", "/stock-returns"), true);
  assert.equal(canAccessModule("BHW", "/stock-returns"), true);
});

test("the retired transfer module is unavailable to all roles", () => {
  assert.equal(canAccessModule("PHARMA_I", "/transfers"), false);
  assert.equal(canAccessModule("PHARMA_II", "/transfers"), false);
  assert.equal(canAccessModule("BHW", "/transfers"), false);
});

test("only Pharma II can access other programs module", () => {
  assert.equal(canAccessModule("PHARMA_I", "/other-programs"), false);
  assert.equal(canAccessModule("PHARMA_II", "/other-programs"), true);
  assert.equal(canAccessModule("BHW", "/other-programs"), false);
});

test("filters role-restricted navigation items", () => {
  assert.deepEqual(
    getAllowedNavItems(navItems, "PHARMA_I").map((item) => item.label),
    ["Dashboard", "Stock Returns", "Facilities", "Notifications"]
  );

  assert.deepEqual(
    getAllowedNavItems(navItems, "PHARMA_II").map((item) => item.label),
    ["Dashboard", "Stock Returns", "User Management", "Facilities", "Other Programs", "Notifications"]
  );

  assert.deepEqual(
    getAllowedNavItems(navItems, "BHW").map((item) => item.label),
    ["Dashboard", "Stock Returns", "Notifications"]
  );
});

const users = [
  {
    email: "09623702834@prds.local",
    facility: { facility_code: "CONHO", facility_name: "City Of Naga Health Office" },
    first_name: "Jude",
    id: "1",
    last_name: "Laroa",
    phone_number: "09623702834",
    role: "PHARMA_II",
    status: "ACTIVE",
  },
  {
    email: "bhw@example.com",
    facility: { facility_code: "IHC", facility_name: "Inayagan Barangay Health Center" },
    first_name: "Maria",
    id: "2",
    last_name: "Santos",
    phone_number: "",
    role: "BHW",
    status: "PENDING",
  },
  {
    email: "",
    facility: null,
    first_name: "Inactive",
    id: "3",
    last_name: "User",
    phone_number: "09170000000",
    role: "PHARMA_I",
    status: "DEACTIVATED",
  },
];

test("formats labels and hides phone-derived email addresses", () => {
  assert.equal(getFullName(users[0]), "Jude Laroa");
  assert.equal(getRoleLabel("PHARMA_I"), "Pharmacist I");
  assert.equal(getStatusLabel("DEACTIVATED"), "Deactivated");
  assert.equal(getDisplayEmail(users[0]), "");
  assert.equal(getDisplayPhone(users[0]), "09623702834");
});

test("builds account summary counts", () => {
  const summary = buildUserSummary(users);

  assert.deepEqual(summary, {
    active: 1,
    deactivated: 1,
    pending: 1,
    total: 3,
  });
});

test("filters users by search, status, and role", () => {
  assert.deepEqual(
    filterUsers(users, { searchTerm: "inayagan" }).map((user) => user.id),
    ["2"]
  );

  assert.deepEqual(
    filterUsers(users, { roleFilter: "PHARMA_I", statusFilter: "DEACTIVATED" }).map((user) => user.id),
    ["3"]
  );
});

test("filters users by facility", () => {
  assert.deepEqual(
    filterUsers(users, { facilityFilter: "NONE" }).map((user) => user.id),
    ["3"]
  );

  assert.deepEqual(
    filterUsers(users, { facilityFilter: "ALL" }).map((user) => user.id),
    ["1", "2", "3"]
  );
});

