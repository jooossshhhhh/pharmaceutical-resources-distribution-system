import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUserSummary,
  canAccessModule,
  filterFacilityRequests,
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

test("builds account summary with pending facility request count", () => {
  const summary = buildUserSummary(users, [
    { status: "PENDING" },
    { status: "APPROVED" },
  ]);

  assert.deepEqual(summary, {
    active: 1,
    deactivated: 1,
    facilityRequests: 1,
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

test("filters facility change requests by requester or facility", () => {
  const requests = [
    {
      current_facility: { facility_code: "CONHO", facility_name: "City Of Naga Health Office" },
      profile: { first_name: "Maria", last_name: "Santos" },
      reason: "Transferred assignment",
      requested_facility: { facility_code: "IHC", facility_name: "Inayagan Barangay Health Center" },
      status: "PENDING",
    },
    {
      current_facility: { facility_code: "BHC", facility_name: "Bairan Barangay Health Center" },
      profile: { first_name: "Juan", last_name: "Reyes" },
      reason: "",
      requested_facility: { facility_code: "CHC", facility_name: "Cogon Barangay Health Center" },
      status: "APPROVED",
    },
  ];

  assert.deepEqual(
    filterFacilityRequests(requests, "cogon").map((request) => request.profile.first_name),
    ["Juan"]
  );

  assert.deepEqual(
    filterFacilityRequests(requests, "transferred").map((request) => request.profile.first_name),
    ["Maria"]
  );
});
