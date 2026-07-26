import assert from "node:assert/strict";
import test from "node:test";

import {
  getItemStockStatus,
  getCompletedRequestQuantity,
  getFacilityRequestRating,
  getRequestNumber,
  getRequestPriority,
  getRequestSummary,
  getStockMap,
  matchesRequestFilters,
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
