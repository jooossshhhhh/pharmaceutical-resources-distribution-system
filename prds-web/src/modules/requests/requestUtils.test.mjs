import assert from "node:assert/strict";
import test from "node:test";

import {
  getDuplicateRequestMedicineIds,
  getItemStockStatus,
  getCompletedRequestQuantity,
  getFacilityRequestRating,
  getRequestNumber,
  getRequestPriority,
  getRequestSummary,
  getRequestTrackingSteps,
  getStockMap,
  matchesRequestFilters,
  normalizeRequestErrorMessage,
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

  assert.deepEqual(
    getRequestTrackingSteps({
      ...requests[2],
      approved_at: "2026-07-25T04:00:00.000Z",
    }).map((step) => [step.key, step.state]),
    [
      ["requested", "complete"],
      ["approved", "complete"],
      ["in_transit", "complete"],
      ["received", "complete"],
    ]
  );
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
