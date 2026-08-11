import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFefoBatchAllocations,
  buildRequestsCsv,
  getAllocationValidationError,
  getAverageApprovalTimeLabel,
  getChoAvailabilityMap,
  getDuplicateRequestMedicineIds,
  getMedicineFullLabel,
  getItemStockStatus,
  getLowStockRequestItems,
  getCompletedRequestQuantity,
  getFacilityRequestRating,
  getRelativeTime,
  getRequestNumber,
  getRequestItemFullLabel,
  getRequestPriority,
  getRequestSummary,
  getRequestTrackingSteps,
  getStockMap,
  isRequestWithinDateRange,
  matchesRequestFilters,
  normalizeRequestErrorMessage,
  validateChoRequestAvailability,
  requestContainsMedicine,
  sortRequests,
} from "./requestUtils.js";

const requests = [
  {
    id: "abcdef12-0000-0000-0000-000000000001",
    facility_id: "facility-a",
    request_date: "2026-07-26T02:00:00.000Z",
    status: "PENDING",
    facility: { facility_name: "Tinaan", facility_code: "TCH" },
    requester: { first_name: "Jude", last_name: "Sinugbuhan" },
    items: [
      {
        id: "item-a",
        medicine_id: "med-a",
        quantity: 600,
        medicine: { generic_name: "Amoxicillin", dosage: "500mg" },
      },
    ],
  },
  {
    id: "bbbbbb12-0000-0000-0000-000000000002",
    facility_id: "facility-b",
    request_date: "2026-07-24T02:00:00.000Z",
    status: "APPROVED",
    facility: { facility_name: "LUTAC", facility_code: "LCNC" },
    requester: { first_name: "Maria", last_name: "Aquino" },
    items: [
      {
        id: "item-b",
        medicine_id: "med-b",
        quantity: 50,
        medicine: { generic_name: "Paracetamol", dosage: "500mg" },
      },
    ],
  },
  {
    id: "cccccc12-0000-0000-0000-000000000003",
    facility_id: "facility-a",
    request_date: "2026-07-25T02:00:00.000Z",
    status: "COMPLETED",
    facility: { facility_name: "Tinaan", facility_code: "TCH" },
    requester: { first_name: "Josh", last_name: "Laroa" },
    items: [],
  },
];

test("formats request number from uuid prefix", () => {
  assert.equal(getRequestNumber(requests[0].id), "#RQ-ABCDEF12");
});

test("formats full medicine details for BHW request selection", () => {
  assert.equal(
    getMedicineFullLabel({
      generic_name: "Amlodipine",
      brand_name: "CardioNorm",
      unit_of_measure: "tablet",
      dosage: "5mg",
    }),
    "Amlodipine - CardioNorm - tablet - 5mg"
  );
});

test("formats full request item medicine details for BHW tracking", () => {
  assert.equal(
    getRequestItemFullLabel({
      medicine: {
        generic_name: "Paracetamol",
        brand_name: "PainRelief",
        unit_of_measure: "tablet",
        dosage: "500mg",
      },
    }),
    "Paracetamol - PainRelief - tablet - 500mg"
  );
});

test("summarizes request statuses", () => {
  assert.deepEqual(getRequestSummary(requests), {
    completed: 1,
    inTransit: 1,
    pending: 1,
    total: 3,
  });
});

test("calculates completed quantity and facility rating", () => {
  assert.equal(getCompletedRequestQuantity(requests), 0);
  assert.equal(getFacilityRequestRating(requests), 66.7);
});

test("derives pending request priority from quantity", () => {
  assert.equal(getRequestPriority(requests[0]), "HIGH");
  assert.equal(getRequestPriority(requests[1]), "LOW");
});

test("filters requests by keyword, facility, and status", () => {
  assert.equal(
    matchesRequestFilters(requests[0], {
      facilityId: "facility-a",
      keyword: "amoxicillin",
      status: "PENDING",
    }),
    true
  );

  assert.equal(
    matchesRequestFilters(requests[1], {
      facilityId: "facility-a",
      keyword: "",
      status: "ALL",
    }),
    false
  );
});

test("sorts requests by newest and priority", () => {
  assert.deepEqual(
    sortRequests(requests, "newest").map((request) => request.id),
    [requests[0].id, requests[2].id, requests[1].id]
  );
  assert.equal(sortRequests(requests, "priority")[0].id, requests[0].id);
});

test("calculates stock status from facility inventory", () => {
  const stockMap = getStockMap([
    { facility_id: "facility-a", medicine_id: "med-a", quantity: 200, threshold: 100 },
    { facility_id: "facility-a", medicine_id: "med-a", quantity: 50, threshold: 100 },
  ]);

  assert.deepEqual(
    getItemStockStatus(requests[0].items[0], "facility-a", stockMap),
    { label: "250 available", tone: "text-orange-600" }
  );
});

test("detects duplicate medicines before request item insert", () => {
  assert.deepEqual(
    getDuplicateRequestMedicineIds([
      { medicine_id: "med-a", quantity: 10 },
      { medicine_id: "med-b", quantity: 20 },
      { medicine_id: "med-a", quantity: 30 },
      { medicine_id: "", quantity: 40 },
    ]),
    ["med-a"]
  );

  assert.deepEqual(
    getDuplicateRequestMedicineIds([
      { medicine_id: "med-a", quantity: 10 },
      { medicine_id: "med-b", quantity: 20 },
    ]),
    []
  );
});

test("maps CHO physical, reserved, and available stock by medicine", () => {
  const availabilityMap = getChoAvailabilityMap([
    {
      id: "med-a",
      physical_quantity: 120,
      reserved_quantity: 35,
      available_quantity: 85,
    },
  ]);

  assert.deepEqual(availabilityMap.get("med-a"), {
    availableQuantity: 85,
    physicalQuantity: 120,
    reservedQuantity: 35,
  });
});

test("blocks a BHW request that exceeds CHO available stock", () => {
  const availabilityMap = getChoAvailabilityMap([
    {
      id: "med-a",
      physical_quantity: 120,
      reserved_quantity: 35,
      available_quantity: 85,
    },
  ]);

  assert.equal(
    validateChoRequestAvailability(
      [{ medicine_id: "med-a", quantity: 86 }],
      availabilityMap
    ),
    "Requested quantity exceeds the 85 units currently available at CHO."
  );
  assert.equal(
    validateChoRequestAvailability(
      [{ medicine_id: "med-a", quantity: 85 }],
      availabilityMap
    ),
    ""
  );
});

test("builds FEFO batch allocations from soonest expiring CHO batches", () => {
  const allocations = buildFefoBatchAllocations(
    [
      { id: "item-a", medicine_id: "med-a", quantity: 120 },
      { id: "item-b", medicine_id: "med-b", quantity: 15 },
    ],
    [
      {
        id: "batch-late",
        medicine_id: "med-a",
        quantity: 80,
        expiration_date: "2027-12-01",
      },
      {
        id: "batch-soon",
        medicine_id: "med-a",
        quantity: 50,
        expiration_date: "2026-10-01",
      },
      {
        id: "batch-other",
        medicine_id: "med-b",
        quantity: 20,
        expiration_date: "2026-09-01",
      },
    ]
  );

  assert.deepEqual(allocations, [
    { request_item_id: "item-a", source_inventory_id: "batch-soon", quantity: 50 },
    { request_item_id: "item-a", source_inventory_id: "batch-late", quantity: 70 },
    { request_item_id: "item-b", source_inventory_id: "batch-other", quantity: 15 },
  ]);
});

test("validates batch allocations must fully cover each requested item", () => {
  const requestItems = [
    { id: "item-a", medicine_id: "med-a", quantity: 120 },
  ];
  const batches = [
    { id: "batch-a", medicine_id: "med-a", quantity: 100 },
  ];

  assert.equal(
    getAllocationValidationError(requestItems, batches, [
      { request_item_id: "item-a", source_inventory_id: "batch-a", quantity: 100 },
    ]),
    "Allocate exactly 120 units for this request item before approving."
  );

  assert.equal(
    getAllocationValidationError(requestItems, batches, [
      { request_item_id: "item-a", source_inventory_id: "batch-a", quantity: 101 },
    ]),
    "Batch allocation exceeds the selected CHO stock quantity."
  );
});

test("suggests only low-stock medicines that CHO can fulfill", () => {
  const stockMap = getStockMap([
    { facility_id: "facility-a", medicine_id: "med-a", quantity: 3, threshold: 5 },
    { facility_id: "facility-a", medicine_id: "med-a", quantity: 2, threshold: 5 },
    { facility_id: "facility-a", medicine_id: "med-b", quantity: 0, threshold: 5 },
  ]);
  const availabilityMap = getChoAvailabilityMap([
    {
      id: "med-a",
      physical_quantity: 12,
      reserved_quantity: 4,
      available_quantity: 8,
    },
  ]);

  assert.deepEqual(
    getLowStockRequestItems("facility-a", stockMap, availabilityMap),
    [{ medicine_id: "med-a", quantity: "8" }]
  );
});

test("derives BHW request tracking steps from request status", () => {
  const steps = getRequestTrackingSteps({
    ...requests[1],
    approved_at: "2026-07-24T04:00:00.000Z",
  });

  assert.deepEqual(
    steps.map((step) => [step.key, step.state]),
    [
      ["requested", "complete"],
      ["approved", "complete"],
      ["in_transit", "current"],
      ["received", "pending"],
    ]
  );

  assert.deepEqual(
    getRequestTrackingSteps({
      ...requests[0],
      status: "REJECTED",
    }).map((step) => [step.key, step.state]),
    [
      ["requested", "complete"],
      ["approved", "rejected"],
      ["in_transit", "pending"],
      ["received", "pending"],
    ]
  );

  const completedSteps = getRequestTrackingSteps({
    ...requests[2],
    approved_at: "2026-07-25T04:00:00.000Z",
    received_at: "2026-07-27T04:00:00.000Z",
  });

  assert.deepEqual(
    completedSteps.map((step) => [step.key, step.state]),
    [
      ["requested", "complete"],
      ["approved", "complete"],
      ["in_transit", "complete"],
      ["received", "complete"],
    ]
  );
  assert.match(completedSteps[3].detail, /Jul 27, 2026/);
});

test("matches requests that contain the selected medicine", () => {
  assert.equal(requestContainsMedicine(requests[0], "med-a"), true);
  assert.equal(requestContainsMedicine(requests[0], "med-b"), false);
  assert.equal(requestContainsMedicine(requests[0], ""), true);
  assert.equal(requestContainsMedicine(requests[0], "ALL"), true);
  assert.equal(requestContainsMedicine({ items: [] }, "med-a"), false);
});

test("normalizes request database errors for users", () => {
  assert.equal(
    normalizeRequestErrorMessage(
      'duplicate key value violates unique constraint "request_item_unique_medicine"'
    ),
    "Each medicine can appear only once per request. Update the existing quantity instead."
  );

  assert.equal(normalizeRequestErrorMessage("Some other failure"), "Some other failure");
});

test("filters requests within the selected date range", () => {
  assert.equal(isRequestWithinDateRange(requests[0], "ALL"), true);
  assert.equal(isRequestWithinDateRange({}, "30D"), true);

  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 6);

  assert.equal(isRequestWithinDateRange({ request_date: lastWeek.toISOString() }, "7D"), true);
  assert.equal(
    isRequestWithinDateRange({ request_date: "2020-01-01T00:00:00.000Z" }, "30D"),
    false
  );
});

test("formats relative timestamps", () => {
  assert.equal(getRelativeTime(new Date().toISOString()), "just now");
  assert.equal(getRelativeTime("2020-01-01T00:00:00.000Z").endsWith("y ago"), true);
});

test("computes average approval time for resolved requests", () => {
  const resolved = requests.map((request) => ({ ...request }));
  resolved[1].approved_at = new Date(
    new Date(resolved[1].request_date).getTime() + 2 * 86400000
  ).toISOString();

  assert.match(getAverageApprovalTimeLabel(resolved), /2\.0 days/);
  assert.equal(getAverageApprovalTimeLabel([]), "—");
});

test("builds a csv export from request history", () => {
  const csv = buildRequestsCsv([requests[0], requests[2]]);
  const lines = csv.split("\n");

  assert.equal(lines[0], "Request Number,Date,Status,Items,Total Quantity,Remarks");
  assert.match(lines[1], /^#RQ-ABCDEF12,/);
  assert.equal(lines.length, 3);
});
