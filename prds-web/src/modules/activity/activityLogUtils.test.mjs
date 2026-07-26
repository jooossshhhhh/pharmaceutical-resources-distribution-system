import assert from "node:assert/strict";
import test from "node:test";

import {
  getAllowedActivityLogRoleFilters,
  getVisibleActivityLogs,
  matchesActivityLogFilters,
} from "./activityLogUtils.js";

const logs = [
  {
    id: "admin-profile",
    action: "Profile Updated",
    module: "User Account",
    user_id: "admin",
    user: { id: "admin", role: "PHARMA_II", facility_id: "cho" },
  },
  {
    id: "pharma-inventory",
    action: "Stock Added",
    module: "Inventory",
    user_id: "pharma",
    user: { id: "pharma", role: "PHARMA_I", facility_id: "cho" },
  },
  {
    id: "bhw-profile",
    action: "Phone Updated",
    module: "User Account",
    user_id: "bhw",
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
