import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFefoInventoryRows,
  buildFefoTransferAllocations,
  filterIncomingTransfers,
  filterOutgoingTransfers,
  formatTransferNumber,
  getActiveTransferStatusFilter,
  getDuplicateTransferMedicineIds,
  getMedicineAvailabilityOptions,
  getTransferActionTabStatus,
  getTransferAllocationValidationError,
  getTransferAvailabilityMap,
  getTransferItemLabel,
  getTransferMedicineFullLabel,
  getTransferSummary,
  getTransferTotalQuantity,
  getTransferTrackingSteps,
  matchesTransferFilters,
  sortTransfers,
  validateTransferAvailability,
  transferQueueStatusOptions,
} from "./transferUtils.js";

const transfers = [
  {
    id: "aaaaaa12-0000-0000-0000-000000000001",
    source_facility_id: "facility-cho",
    destination_facility_id: "facility-a",
    created_at: "2026-08-01T02:00:00.000Z",
    status: "PENDING",
    source: { facility_name: "City of Naga Health Office", facility_code: "CONHO" },
    destination: { facility_name: "Tinaan Health Center", facility_code: "TCH" },
    items: [
      {
        id: "item-a",
        medicine_id: "med-a",
        quantity: 120,
        medicine: {
          generic_name: "Amlodipine",
          brand_name: "CardioNorm",
          dosage: "5mg",
          unit_of_measure: "tablet",
        },
      },
    ],
  },
  {
    id: "bbbbbb12-0000-0000-0000-000000000002",
    source_facility_id: "facility-b",
    destination_facility_id: "facility-a",
    created_at: "2026-07-30T02:00:00.000Z",
    status: "APPROVED",
    source: { facility_name: "LUTAC", facility_code: "LCNC" },
    destination: { facility_name: "Tinaan Health Center", facility_code: "TCH" },
    items: [
      {
        id: "item-b",
        medicine_id: "med-b",
        quantity: 40,
        medicine: {
          generic_name: "Paracetamol",
          brand_name: "PainRelief",
          dosage: "500mg",
          unit_of_measure: "tablet",
        },
      },
    ],
  },
  {
    id: "cccccc12-0000-0000-0000-000000000003",
    source_facility_id: "facility-a",
    destination_facility_id: "facility-b",
    created_at: "2026-07-31T02:00:00.000Z",
    status: "COMPLETED",
    source: { facility_name: "Tinaan Health Center", facility_code: "TCH" },
    destination: { facility_name: "LUTAC", facility_code: "LCNC" },
    items: [],
  },
  {
    id: "dddddd12-0000-0000-0000-000000000004",
    source_facility_id: "facility-b",
    destination_facility_id: "facility-a",
    created_at: "2026-08-02T02:00:00.000Z",
    status: "READY_FOR_PICKUP",
    source: { facility_name: "LUTAC", facility_code: "LCNC" },
    destination: { facility_name: "Tinaan Health Center", facility_code: "TCH" },
    items: [],
  },
];

test("formats transfer number from uuid prefix", () => {
  assert.equal(formatTransferNumber(transfers[0].id), "#TR-AAAAAA12");
});

test("formats medicine labels with generic, brand, unit, and dosage", () => {
  assert.equal(
    getTransferMedicineFullLabel(transfers[0].items[0].medicine),
    "Amlodipine - 5mg - CardioNorm - tablet"
  );
  assert.equal(getTransferItemLabel(transfers[1].items[0]), "PainRelief 500mg");
});

test("summarizes transfer statuses", () => {
  assert.deepEqual(getTransferSummary(transfers), {
    approved: 1,
    completed: 1,
    pending: 1,
    readyForPickup: 1,
    rejected: 0,
    total: 4,
  });
});

test("calculates total requested quantity", () => {
  assert.equal(getTransferTotalQuantity(transfers[0]), 120);
  assert.equal(getTransferTotalQuantity(transfers[2]), 0);
});

test("filters transfers by keyword, source, destination, status, and medicine", () => {
  assert.equal(
    matchesTransferFilters(transfers[0], {
      destinationFacilityId: "facility-a",
      keyword: "amlodipine",
      medicineId: "med-a",
      sourceFacilityId: "facility-cho",
      status: "PENDING",
    }),
    true
  );

  assert.equal(
    matchesTransferFilters(transfers[1], {
      destinationFacilityId: "ALL",
      keyword: "city of naga",
      medicineId: "ALL",
      sourceFacilityId: "ALL",
      status: "ALL",
    }),
    false
  );
});

test("sorts transfers newest and oldest", () => {
  assert.deepEqual(
    sortTransfers(transfers, "newest").map((transfer) => transfer.id),
    [transfers[3].id, transfers[0].id, transfers[2].id, transfers[1].id]
  );
  assert.deepEqual(
    sortTransfers(transfers, "oldest").map((transfer) => transfer.id),
    [transfers[1].id, transfers[2].id, transfers[0].id, transfers[3].id]
  );
});

test("maps transfer action tabs to active and history status groups", () => {
  assert.deepEqual(getActiveTransferStatusFilter("ACTIVE"), [
    "PENDING",
    "APPROVED",
    "READY_FOR_PICKUP",
  ]);
  assert.deepEqual(getActiveTransferStatusFilter("HISTORY"), ["COMPLETED", "REJECTED"]);
  assert.deepEqual(getActiveTransferStatusFilter("COMPLETED"), ["COMPLETED"]);
  assert.equal(getTransferActionTabStatus("REJECTED"), "REJECTED");
  assert.equal(getTransferActionTabStatus("UNKNOWN"), "ACTIVE");
});

test("queue status dropdown excludes archived transfer statuses", () => {
  assert.deepEqual(
    transferQueueStatusOptions.map((option) => option.value),
    ["ACTIVE", "PENDING", "APPROVED", "READY_FOR_PICKUP"]
  );
});

test("maps source availability by facility and medicine", () => {
  const availabilityMap = getTransferAvailabilityMap([
    {
      source_facility_id: "facility-a",
      medicine_id: "med-a",
      physical_quantity: 120,
      reserved_quantity: 20,
      available_quantity: 100,
    },
  ]);

  assert.deepEqual(availabilityMap.get("facility-a:med-a"), {
    availableQuantity: 100,
    physicalQuantity: 120,
    reservedQuantity: 20,
  });
});

test("returns medicine-first source availability options", () => {
  const options = getMedicineAvailabilityOptions(
    [
      {
        source_facility_id: "facility-b",
        source_facility_name: "B Facility",
        source_facility_code: "BHC",
        medicine_id: "med-a",
        generic_name: "Amlodipine",
        brand_name: "CardioNorm",
        dosage: "5mg",
        unit_of_measure: "tablet",
        physical_quantity: 120,
        reserved_quantity: 20,
        available_quantity: 100,
      },
      {
        source_facility_id: "facility-a",
        source_facility_name: "A Facility",
        source_facility_code: "AHC",
        medicine_id: "med-a",
        generic_name: "Amlodipine",
        brand_name: "CardioNorm",
        dosage: "5mg",
        unit_of_measure: "tablet",
        physical_quantity: 40,
        reserved_quantity: 0,
        available_quantity: 40,
      },
      {
        source_facility_id: "facility-c",
        source_facility_name: "C Facility",
        source_facility_code: "CHC",
        medicine_id: "med-b",
        generic_name: "Paracetamol",
        brand_name: "PainRelief",
        dosage: "500mg",
        unit_of_measure: "tablet",
        physical_quantity: 0,
        reserved_quantity: 0,
        available_quantity: 0,
      },
    ],
    "amlod"
  );

  assert.equal(options.length, 1);
  assert.equal(options[0].medicine_id, "med-a");
  assert.equal(options[0].sources.length, 2);
  assert.deepEqual(
    options[0].sources.map((source) => source.source_facility_name),
    ["B Facility", "A Facility"]
  );
});

test("blocks transfer quantities that exceed source availability", () => {
  const availabilityMap = getTransferAvailabilityMap([
    {
      source_facility_id: "facility-a",
      medicine_id: "med-a",
      physical_quantity: 120,
      reserved_quantity: 20,
      available_quantity: 100,
    },
  ]);

  assert.equal(
    validateTransferAvailability(
      [{ medicine_id: "med-a", quantity: 101 }],
      availabilityMap,
      "facility-a"
    ),
    "Requested quantity exceeds the 100 units currently available from the selected source."
  );
  assert.equal(
    validateTransferAvailability(
      [{ medicine_id: "med-a", quantity: 100 }],
      availabilityMap,
      "facility-a"
    ),
    ""
  );
});

test("detects duplicate medicines in transfer items", () => {
  assert.deepEqual(
    getDuplicateTransferMedicineIds([
      { medicine_id: "med-a", quantity: 10 },
      { medicine_id: "med-b", quantity: 20 },
      { medicine_id: "med-a", quantity: 30 },
    ]),
    ["med-a"]
  );
});

test("builds FEFO transfer allocations from soonest expiring source batches", () => {
  const allocations = buildFefoTransferAllocations(
    [{ id: "item-a", medicine_id: "med-a", quantity: 120 }],
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
    ]
  );

  assert.deepEqual(allocations, [
    { source_inventory_id: "batch-soon", transfer_item_id: "item-a", quantity: 50 },
    { source_inventory_id: "batch-late", transfer_item_id: "item-a", quantity: 70 },
  ]);
});

test("validates transfer allocations fully cover each item without overusing batches", () => {
  const transferItems = [{ id: "item-a", medicine_id: "med-a", quantity: 120 }];
  const batches = [{ id: "batch-a", medicine_id: "med-a", quantity: 100 }];

  assert.equal(
    getTransferAllocationValidationError(transferItems, batches, [
      { source_inventory_id: "batch-a", transfer_item_id: "item-a", quantity: 100 },
    ]),
    "Allocate exactly 120 units for this transfer item before releasing."
  );

  assert.equal(
    getTransferAllocationValidationError(transferItems, batches, [
      { source_inventory_id: "batch-a", transfer_item_id: "item-a", quantity: 101 },
    ]),
    "Batch allocation exceeds the selected source stock quantity."
  );
});

test("derives transfer tracking steps from status", () => {
  assert.deepEqual(
    getTransferTrackingSteps({ ...transfers[1], approved_at: "2026-07-30T03:00:00.000Z" }).map(
      (step) => [step.key, step.state]
    ),
    [
      ["requested", "complete"],
      ["approved", "complete"],
      ["ready", "current"],
      ["received", "pending"],
    ]
  );

  assert.deepEqual(
    getTransferTrackingSteps({
      ...transfers[2],
      approved_at: "2026-07-31T03:00:00.000Z",
      received_at: "2026-08-01T03:00:00.000Z",
    }).map((step) => [step.key, step.state]),
    [
      ["requested", "complete"],
      ["approved", "complete"],
      ["ready", "complete"],
      ["received", "complete"],
    ]
  );

  assert.equal(getTransferTrackingSteps({ ...transfers[0], status: "REJECTED" })[1].state, "rejected");
});

test("filters transfers where the facility is the destination (outgoing)", () => {
  const outgoing = filterOutgoingTransfers(transfers, "facility-a");

  assert.deepEqual(
    outgoing.map((transfer) => transfer.id),
    [transfers[0].id, transfers[1].id, transfers[3].id]
  );
  assert.equal(filterOutgoingTransfers(transfers, "facility-unknown").length, 0);
});

test("filters transfers where the facility is the source (incoming)", () => {
  const incoming = filterIncomingTransfers(transfers, "facility-a");

  assert.deepEqual(
    incoming.map((transfer) => transfer.id),
    [transfers[2].id]
  );
  assert.equal(filterIncomingTransfers(transfers, "facility-unknown").length, 0);
});

test("orders inventory rows FEFO by expiration then date received", () => {
  const rows = [
    {
      id: "inv-late",
      expiration_date: "2027-12-01",
      date_received: "2026-07-01",
    },
    {
      id: "inv-same-expiry-older",
      expiration_date: "2026-10-01",
      date_received: "2026-01-01",
    },
    {
      id: "inv-same-expiry-newer",
      expiration_date: "2026-10-01",
      date_received: "2026-06-01",
    },
  ];

  assert.deepEqual(
    buildFefoInventoryRows(rows).map((row) => row.id),
    ["inv-same-expiry-older", "inv-same-expiry-newer", "inv-late"]
  );
  assert.deepEqual(buildFefoInventoryRows([]), []);
});
