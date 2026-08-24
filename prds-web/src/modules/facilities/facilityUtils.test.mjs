import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFacilityView,
  filterFacilities,
  getHealthMeta,
  getStockStatus,
  sortFacilities,
} from "./facilityUtils.js";

const facility = {
  id: "facility-a",
  facility_name: "Inayagan Barangay Health Center",
  facility_code: "IHC",
  facility_type: "HEALTH_CENTER",
  address: "Inayagan, City of Naga, Cebu",
  status: "ACTIVE",
};

test("buildFacilityView summarizes related stock, patients, requests, and forecasts", () => {
  const view = buildFacilityView(facility, {
    inventory: [
      {
        facility_id: "facility-a",
        quantity: 10,
        threshold: 20,
        medicine: { unit_cost: 5 },
      },
      {
        facility_id: "facility-a",
        quantity: 100,
        threshold: 20,
        medicine: { unit_cost: 2 },
      },
      {
        facility_id: "facility-b",
        quantity: 999,
        threshold: 1,
        medicine: { unit_cost: 1 },
      },
    ],
    requests: [
      { facility_id: "facility-a", status: "PENDING" },
      { facility_id: "facility-a", status: "COMPLETED" },
      { facility_id: "facility-b", status: "PENDING" },
    ],
    patients: [
      { facility_id: "facility-a" },
      { facility_id: "facility-a" },
      { facility_id: "facility-b" },
    ],
    forecasts: [
      { facility_id: "facility-a", predicted_quantity: 30 },
      { facility_id: "facility-a", predicted_quantity: 20 },
    ],
  });

  assert.equal(view.stockCounts.totalQuantity, 110);
  assert.equal(view.stockCounts.totalValue, 250);
  assert.equal(view.stockCounts.LOW, 1);
  assert.equal(view.stockCounts.HEALTHY, 1);
  assert.equal(view.pendingRequests, 1);
  assert.equal(view.patientCount, 2);
  assert.equal(view.forecastTotal, 50);
});

test("getStockStatus maps threshold levels to PRDS health states", () => {
  assert.equal(getStockStatus({ quantity: 0, threshold: 10 }), "CRITICAL");
  assert.equal(getStockStatus({ quantity: 2, threshold: 10 }), "CRITICAL");
  assert.equal(getStockStatus({ quantity: 8, threshold: 10 }), "LOW");
  assert.equal(getStockStatus({ quantity: 12, threshold: 10 }), "WATCH");
  assert.equal(getStockStatus({ quantity: 30, threshold: 10 }), "HEALTHY");
});

test("stock health labels use simple facility-facing terms", () => {
  assert.equal(getHealthMeta("WATCH").label, "Warning");
});

test("filterFacilities searches facility metadata and stock health", () => {
  const facilities = [
    buildFacilityView(facility, {
      inventory: [{ facility_id: "facility-a", quantity: 0, threshold: 10 }],
      requests: [],
      patients: [],
      forecasts: [],
    }),
    buildFacilityView(
      {
        ...facility,
        id: "facility-b",
        facility_name: "Central Health Office",
        facility_code: "CONHO",
        facility_type: "CHO",
        address: "East Poblacion, City of Naga, Cebu",
      },
      { inventory: [], requests: [], patients: [], forecasts: [] }
    ),
  ];

  assert.deepEqual(
    filterFacilities(facilities, { searchTerm: "inayagan", stockFilter: "ALL" }).map(
      (item) => item.id
    ),
    ["facility-a"]
  );
  assert.deepEqual(
    filterFacilities(facilities, { searchTerm: "critical", stockFilter: "ALL" }).map(
      (item) => item.id
    ),
    ["facility-a"]
  );
});

test("sortFacilities keeps facility name order deterministic", () => {
  const facilities = [
    { id: "b", facility_name: "Tuyan Health Center" },
    { id: "a", facility_name: "Alpaco Barangay Health Center" },
  ];

  assert.deepEqual(sortFacilities(facilities, "ASC").map((item) => item.id), ["a", "b"]);
  assert.deepEqual(sortFacilities(facilities, "DESC").map((item) => item.id), ["b", "a"]);
});
