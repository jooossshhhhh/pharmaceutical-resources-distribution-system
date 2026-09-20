import assert from "node:assert/strict";
import test from "node:test";

import {
  activityCategories,
  getAllowedActivityLogRoleFilters,
  getActivityLogPanelLabel,
  getVisibleActivityLogs,
  matchesActivityLogDateFilter,
  matchesActivityLogFilters,
  enrichActivityDetails,
} from "./activityLogUtils.js";

const logs = [
  {
    id: "admin-inventory",
    action: "Stock Adjusted",
    module: "Inventory",
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
    id: "bhw-dispensing",
    action: "Medicine Released",
    module: "Dispensing",
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
    ["admin-inventory", "pharma-inventory", "bhw-dispensing"]
  );
});

test("Pharma I can view own logs and BHW logs", () => {
  assert.deepEqual(
    getVisibleActivityLogs(logs, { id: "pharma", role: "PHARMA_I" }).map(
      (log) => log.id
    ),
    ["pharma-inventory", "bhw-dispensing"]
  );
});

test("BHW can view only own logs", () => {
  assert.deepEqual(
    getVisibleActivityLogs(logs, { id: "bhw", role: "BHW" }).map((log) => log.id),
    ["bhw-dispensing"]
  );
});

test("profile change filter is removed and action categories are present", () => {
  const pharmaFilters = getAllowedActivityLogRoleFilters("PHARMA_II");
  assert.equal(
    pharmaFilters.some((filter) => filter.value === "profile"),
    false
  );
  assert.equal(
    pharmaFilters.some((filter) => filter.value === "dispensing"),
    true
  );
  assert.equal(
    pharmaFilters.some((filter) => filter.value === "requests"),
    true
  );
  assert.equal(
    pharmaFilters.some((filter) => filter.value === "transfers"),
    true
  );
  assert.equal(
    pharmaFilters.some((filter) => filter.value === "patients"),
    true
  );
  assert.equal(
    activityCategories.some((cat) => cat.value === "profile"),
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

  assert.equal(
    matchesActivityLogFilters(logs[2], {
      category: "dispensing",
      currentUserId: "bhw",
      facilityId: "ALL",
      keyword: "",
      selfOnly: false,
    }),
    true
  );
});

test("builds a panel label from the selected action category", () => {
  assert.equal(
    getActivityLogPanelLabel({
      category: "inventory",
      facilityId: "ALL",
      roleFilter: "ALL",
    }),
    "Inventory"
  );
});

test("adds role and facility filters to the panel label", () => {
  assert.equal(
    getActivityLogPanelLabel({
      category: "dispensing",
      facilityId: "cho",
      facilities: [{ id: "cho", facility_name: "City Of Naga Health Office" }],
      roleFilter: "PHARMA_I",
      roleOptions: [
        { value: "ALL", label: "All visible roles" },
        { value: "PHARMA_I", label: "Pharmacist I" },
      ],
    }),
    "Dispensing - Pharmacist I - City Of Naga Health Office"
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

test("enriches encoded paper request logs with request number and facility name", () => {
  const paperLog = {
    id: "log-1",
    action: "Paper Request Encoded",
    module: "Medicine Request",
    details: "Encoded paper medicine request 6fb447f2-5598-47df-b33a-5deb02928405.",
    user: { first_name: "Josh", last_name: "Laroa" },
  };

  const mockRequests = [
    {
      id: "6fb447f2-5598-47df-b33a-5deb02928405",
      facility_id: "facility-alpaco",
      manual_requested_by: "Nurse Joy",
      facility: { facility_name: "Alpaco Barangay Health Center" },
      items: [{ medicine: { generic_name: "Amlodipine", dosage: "5mg" }, quantity: 21 }],
    },
  ];

  const enriched = enrichActivityDetails(paperLog, {
    requests: mockRequests,
  });

  assert.equal(enriched.requestNumber, "#RQ-6FB447F2");
  assert.equal(enriched.facilityName, "Alpaco Barangay Health Center");
  assert.equal(enriched.requesterName, "Nurse Joy");
  assert.match(enriched.text, /#RQ-6FB447F2/);
  assert.match(enriched.text, /Alpaco Barangay Health Center/);
});

test("matches activity search using enriched request number and facility name", () => {
  const paperLog = {
    id: "log-1",
    action: "Paper Request Encoded",
    module: "Medicine Request",
    details: "Encoded paper medicine request 6fb447f2-5598-47df-b33a-5deb02928405.",
    user: { first_name: "Josh", last_name: "Laroa" },
  };

  const mockRequests = [
    {
      id: "6fb447f2-5598-47df-b33a-5deb02928405",
      facility_id: "facility-alpaco",
      facility: { facility_name: "Alpaco Barangay Health Center" },
    },
  ];

  assert.equal(
    matchesActivityLogFilters(paperLog, {
      keyword: "#RQ-6FB447F2",
      category: "all",
      facilityId: "ALL",
      requests: mockRequests,
    }),
    true
  );

  assert.equal(
    matchesActivityLogFilters(paperLog, {
      keyword: "Alpaco",
      category: "all",
      facilityId: "ALL",
      requests: mockRequests,
    }),
    true
  );
});

test("enriches preformatted #RQ- logs and extracts items and facility", () => {
  const preformattedLog = {
    id: "log-2",
    action: "Paper Request Encoded",
    module: "Medicine Request",
    details: "Encoded paper medicine request #RQ-A5342461 for Alpaco Barangay Health Center.",
    user: { first_name: "Josh", last_name: "Laroa" },
  };

  const mockRequests = [
    {
      id: "a5342461-0a64-4f2d-8380-d3bca3e7f5fe",
      facility_id: "facility-alpaco",
      facility: { facility_name: "Alpaco Barangay Health Center" },
      manual_requested_by: "Maria Santos",
      items: [
        { medicine: { generic_name: "Amlodipine", dosage: "5mg" }, quantity: 221 },
        { medicine: { generic_name: "Amoxicillin", dosage: "500mg" }, quantity: 31 },
      ],
    },
  ];

  const enriched = enrichActivityDetails(preformattedLog, {
    requests: mockRequests,
  });

  assert.equal(enriched.requestNumber, "#RQ-A5342461");
  assert.equal(enriched.fullUuid, "a5342461-0a64-4f2d-8380-d3bca3e7f5fe");
  assert.equal(enriched.facilityName, "Alpaco Barangay Health Center");
  assert.equal(enriched.requesterName, "Maria Santos");
  assert.equal(enriched.items.length, 2);
});

test("enriches released request logs with actual released quantities from fulfillments", () => {
  const releaseLog = {
    id: "log-3",
    action: "Request Released",
    module: "Medicine Request",
    details: "Released and completed medicine request #RQ-A5342461",
    user: { first_name: "Josh", last_name: "Laroa" },
  };

  const mockRequests = [
    {
      id: "a5342461-0a64-4f2d-8380-d3bca3e7f5fe",
      facility_id: "facility-alpaco",
      facility: { facility_name: "Alpaco Barangay Health Center" },
      status: "COMPLETED",
      items: [
        { id: "item-1", medicine: { generic_name: "Amlodipine", dosage: "5mg" }, quantity: 221 },
        { id: "item-2", medicine: { generic_name: "Amoxicillin", dosage: "500mg" }, quantity: 31 },
      ],
      fulfillments: [
        { request_item_id: "item-1", quantity: 100 },
        { request_item_id: "item-2", quantity: 10 },
      ],
    },
  ];

  const enriched = enrichActivityDetails(releaseLog, {
    requests: mockRequests,
  });

  assert.equal(enriched.isReleaseEvent, true);
  assert.equal(enriched.items[0].quantity, 100);
  assert.equal(enriched.items[0].released_quantity, 100);
  assert.equal(enriched.items[0].requested_quantity, 221);
  assert.equal(enriched.items[1].quantity, 10);
  assert.equal(enriched.items[1].released_quantity, 10);
  assert.equal(enriched.items[1].requested_quantity, 31);
});

