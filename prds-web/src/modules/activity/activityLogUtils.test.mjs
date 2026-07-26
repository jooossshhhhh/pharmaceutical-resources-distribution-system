import assert from "node:assert/strict";
import test from "node:test";

import {
  getAllowedActivityLogRoleFilters,
  getActivityLogPanelLabel,
  getVisibleActivityLogs,
  matchesActivityLogDateFilter,
  matchesActivityLogFilters,
} from "./activityLogUtils.js";

const logs = [
  {
    id: "admin-profile",
    action: "Profile Updated",
    module: "User Account",
    user_id: "admin",
    created_at: "2026-07-26T02:00:00.000Z",
    user: { id: "admin", role: "PHARMA_II", facility_id: "cho" },
  },
  {
    id: "pharma-inventory",
    action: "Stock Added",
    module: "Inventory",
    user_id: "pharma",
    created_at: "2026-07-25T02:00:00.000Z",
    user: { id: "pharma", role: "PHARMA_I", facility_id: "cho" },
  },
  {
    id: "bhw-profile",
    action: "Phone Updated",
    module: "User Account",
    user_id: "bhw",
    created_at: "2026-07-20T02:00:00.000Z",
    user: { id: "bhw", role: "BHW", facility_id: "hc-1" },
  },
];

test("Pharma II can view all activity logs", () => {
  assert.deepEqual(
    getVisibleActivityLogs(logs, { id: "admin", role: "PHARMA_II" }).map(
      (log) => log.id
    ),
    ["admin-profile", "pharma-inventory", "bhw-profile"]
  );
});

test("Pharma I can view own logs and BHW logs", () => {
  assert.deepEqual(
    getVisibleActivityLogs(logs, { id: "pharma", role: "PHARMA_I" }).map(
      (log) => log.id
    ),
    ["pharma-inventory", "bhw-profile"]
  );
});

test("BHW can view only own logs", () => {
  assert.deepEqual(
    getVisibleActivityLogs(logs, { id: "bhw", role: "BHW" }).map((log) => log.id),
    ["bhw-profile"]
  );
});

test("profile change filter is available only for Pharma II", () => {
  assert.equal(
    getAllowedActivityLogRoleFilters("PHARMA_II").some(
      (filter) => filter.value === "profile"
    ),
    true
  );
  assert.equal(
    getAllowedActivityLogRoleFilters("PHARMA_I").some(
      (filter) => filter.value === "profile"
    ),
    false
  );
});

test("matches keyword, category, self, and facility filters", () => {
  assert.equal(
    matchesActivityLogFilters(logs[1], {
      category: "inventory",
      currentUserId: "pharma",
      facilityId: "cho",
      keyword: "stock",
      selfOnly: true,
    }),
    true
  );

  assert.equal(
    matchesActivityLogFilters(logs[2], {
      category: "inventory",
      currentUserId: "pharma",
      facilityId: "ALL",
      keyword: "",
      selfOnly: false,
    }),
    false
  );
});

test("builds a panel label from the selected action category", () => {
  assert.equal(
    getActivityLogPanelLabel({
      category: "inventory",
      facilityId: "ALL",
      roleFilter: "ALL",
    }),
    "Inventory Updates"
  );
});

test("adds role and facility filters to the panel label", () => {
  assert.equal(
    getActivityLogPanelLabel({
      category: "profile",
      facilityId: "cho",
      facilities: [{ id: "cho", facility_name: "City Of Naga Health Office" }],
      roleFilter: "PHARMA_I",
      roleOptions: [
        { value: "ALL", label: "All visible roles" },
        { value: "PHARMA_I", label: "Pharmacist I" },
      ],
    }),
    "Profile Changes - Pharmacist I - City Of Naga Health Office"
  );
});

test("matches a specific activity log date", () => {
  assert.equal(
    matchesActivityLogDateFilter(logs[0], {
      dateMode: "specific",
      specificDate: "2026-07-26",
    }),
    true
  );
  assert.equal(
    matchesActivityLogDateFilter(logs[1], {
      dateMode: "specific",
      specificDate: "2026-07-26",
    }),
    false
  );
});

test("matches activity logs within a date range", () => {
  assert.equal(
    matchesActivityLogDateFilter(logs[1], {
      dateMode: "range",
      endDate: "2026-07-26",
      startDate: "2026-07-21",
    }),
    true
  );
  assert.equal(
    matchesActivityLogDateFilter(logs[2], {
      dateMode: "range",
      endDate: "2026-07-26",
      startDate: "2026-07-21",
    }),
    false
  );
});

test("adds selected date filters to the panel label", () => {
  assert.equal(
    getActivityLogPanelLabel({
      category: "all",
      dateMode: "range",
      endDate: "2026-07-26",
      facilityId: "ALL",
      roleFilter: "ALL",
      startDate: "2026-07-20",
    }),
    "All Activity - 2026-07-20 to 2026-07-26"
  );
});
