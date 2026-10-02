import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDispensingCsv,
  buildFefoPreview,
  buildMedicineOptions,
  buildWalkInRpcPayload,
  deductWalkInInventoryFefo,
  FOLLOW_UP_ACTIONS,
  formatDispensingDayParts,
  formatTransactionNumber,
  getDefaultFollowUpDate,
  getCartLineError,
  getCartSummary,
  getBlockedPatientIdsFromClaimRows,
  getFollowUpDisplay,
  getMedicineFullLabel,
  getMedicineLabel,
  getDispensingStepBlocker,
  getMonthRangeIso,
  getTransactionTotalQuantity,
  groupHistoryByTransaction,
  getPatientMonthlyClaimsBreakdown,
  getPatientDispensingStatus,
  matchesHistoryFilters,
  sortTransactions,
} from "./dispensingUtils.js";

test("buildWalkInRpcPayload keeps the operation ID stable for retries", () => {
  assert.deepEqual(
    buildWalkInRpcPayload({
      operationId: "11111111-1111-4111-8111-111111111111",
      patientId: "patient-1",
      prescribedBy: "Dr. Reyes",
      items: [{ medicine_id: "medicine-1", needed_quantity: "8", quantity: "5" }],
    }),
    {
      p_operation_id: "11111111-1111-4111-8111-111111111111",
      p_patient_id: "patient-1",
      p_prescribed_by: "Dr. Reyes",
      p_items: [
        {
          follow_up_action: null,
          follow_up_date: null,
          medicine_id: "medicine-1",
          needed_quantity: 8,
          quantity: 5,
          referred_facility_id: null,
        },
      ],
    }
  );
});

test("deductWalkInInventoryFefo deducts only the dispensing facility in FEFO order", () => {
  const rows = [
    { id: "later", facility_id: "cho", medicine_id: "med-1", quantity: 10, expiration_date: "2027-02-01", date_received: "2026-01-01" },
    { id: "other-facility", facility_id: "barangay", medicine_id: "med-1", quantity: 20, expiration_date: "2026-11-01", date_received: "2026-01-01" },
    { id: "expired", facility_id: "cho", medicine_id: "med-1", quantity: 30, expiration_date: "2026-08-01", date_received: "2026-01-01" },
    { id: "first", facility_id: "cho", medicine_id: "med-1", quantity: 4, expiration_date: "2027-01-01", date_received: "2026-02-01" },
  ];

  const result = deductWalkInInventoryFefo({
    facilityId: "cho",
    inventoryRows: rows,
    items: [{ medicine_id: "med-1", quantity: 7 }],
    today: "2026-09-19",
  });

  assert.deepEqual(
    Object.fromEntries(result.map((row) => [row.id, row.quantity])),
    { later: 7, "other-facility": 20, expired: 30, first: 0 }
  );
});

const futureDate = (days) => {
  const date = new Date();

  date.setDate(date.getDate() + days);

  return date.toISOString().slice(0, 10);
};

const inventoryRows = [
  {
    id: "batch-1",
    medicine_id: "med-1",
    quantity: 20,
    batch_number: "BATCH-A",
    expiration_date: futureDate(10),
    date_received: "2026-01-05",
    medicine: { generic_name: "Paracetamol", brand_name: "Biogesic", dosage: "500mg", unit_of_measure: "tablet" },
  },
  {
    id: "batch-2",
    medicine_id: "med-1",
    quantity: 15,
    batch_number: "BATCH-B",
    expiration_date: futureDate(200),
    date_received: "2026-02-01",
    medicine: { generic_name: "Paracetamol", brand_name: "Biogesic", dosage: "500mg", unit_of_measure: "tablet" },
  },
  {
    id: "batch-3",
    medicine_id: "med-1",
    quantity: 99,
    batch_number: "BATCH-X",
    expiration_date: "2020-01-01",
    date_received: "2019-12-01",
    medicine: { generic_name: "Paracetamol", brand_name: "Biogesic", dosage: "500mg", unit_of_measure: "tablet" },
  },
  {
    id: "batch-4",
    medicine_id: "med-2",
    quantity: 40,
    batch_number: "BATCH-C",
    expiration_date: futureDate(90),
    date_received: "2026-03-01",
    medicine: { generic_name: "Amoxicillin", brand_name: null, dosage: "250mg", unit_of_measure: "capsule" },
  },
];

test("buildMedicineOptions aggregates non-expired batches per medicine in FEFO order", () => {
  const options = buildMedicineOptions(inventoryRows, "");
  const paracetamol = options.find((option) => option.medicine_id === "med-1");

  assert.equal(options.length, 2);
  assert.equal(paracetamol.total_quantity, 35);
  assert.deepEqual(
    paracetamol.batches.map((batch) => batch.batch_number),
    ["BATCH-A", "BATCH-B"]
  );
});

test("buildMedicineOptions filters by keyword across name fields", () => {
  assert.equal(buildMedicineOptions(inventoryRows, "paracet").length, 1);
  assert.equal(buildMedicineOptions(inventoryRows, "biogesic").length, 1);
  assert.equal(buildMedicineOptions(inventoryRows, "capsule").length, 1);
  assert.equal(buildMedicineOptions(inventoryRows, "ibuprofen").length, 0);
});

test("buildFefoPreview splits quantity across batches oldest-expiry-first", () => {
  const paracetamol = buildMedicineOptions(inventoryRows, "").find((option) => option.medicine_id === "med-1");
  const preview = buildFefoPreview(paracetamol.batches, 30);

  assert.deepEqual(
    preview.allocations.map((allocation) => [allocation.batch_number, allocation.quantity]),
    [["BATCH-A", 20], ["BATCH-B", 10]]
  );
  assert.equal(preview.shortfall, 0);
});

test("buildFefoPreview reports shortfall when stock is insufficient", () => {
  const amoxicillin = buildMedicineOptions(inventoryRows, "").find((option) => option.medicine_id === "med-2");
  const preview = buildFefoPreview(amoxicillin.batches, 55);

  assert.deepEqual(preview.allocations.map((allocation) => allocation.quantity), [40]);
  assert.equal(preview.shortfall, 15);
});

test("getCartLineError validates quantities against availability", () => {
  const options = buildMedicineOptions(inventoryRows, "");

  assert.equal(getCartLineError({ line: { medicine_id: "med-1", quantity: 30 }, medicineOptions: options }), "");
  assert.match(
    getCartLineError({ line: { medicine_id: "med-1", quantity: 36 }, medicineOptions: options }),
    /Only 35 available quantity/
  );
  assert.match(
    getCartLineError({ line: { medicine_id: "med-1", quantity: 5.5 }, medicineOptions: options }),
    /Release quantity/
  );
  assert.equal(
    getCartLineError({ line: { medicine_id: "missing", quantity: 1 }, medicineOptions: options }),
    "This medicine is no longer in stock."
  );
});

test("getCartLineError validates needed and partial release details", () => {
  const options = buildMedicineOptions(inventoryRows, "");

  assert.match(
    getCartLineError({
      line: { medicine_id: "med-1", needed_quantity: 4, quantity: 5 },
      medicineOptions: options,
    }),
    /cannot be lower/
  );
  assert.equal(
    getCartLineError({
      line: { medicine_id: "med-1", needed_quantity: 10, quantity: 5 },
      medicineOptions: options,
    }),
    ""
  );
  assert.match(
    getCartLineError({
      line: {
        follow_up_action: "NOT_VALID",
        medicine_id: "med-1",
        needed_quantity: 10,
        quantity: 5,
      },
      medicineOptions: options,
    }),
    /valid follow-up/
  );
  assert.match(
    getCartLineError({
      line: {
        follow_up_action: FOLLOW_UP_ACTIONS.schedule,
        medicine_id: "med-1",
        needed_quantity: 10,
        quantity: 5,
      },
      medicineOptions: options,
    }),
    /date/
  );
  assert.equal(
    getCartLineError({
      line: {
        follow_up_action: FOLLOW_UP_ACTIONS.refer,
        medicine_id: "med-1",
        needed_quantity: 10,
        quantity: 5,
        referred_facility_id: "facility-1",
      },
      medicineOptions: options,
    }),
    ""
  );
});

test("getCartSummary totals lines and needed/released units", () => {
  assert.deepEqual(
    getCartSummary([
      { medicine_id: "med-1", needed_quantity: 35, quantity: 30 },
      { medicine_id: "med-2", quantity: 12 },
    ]),
    { lineCount: 2, neededUnits: 47, releasedUnits: 42, totalUnits: 42 }
  );
  assert.deepEqual(getCartSummary([]), { lineCount: 0, neededUnits: 0, releasedUnits: 0, totalUnits: 0 });
});

test("formatTransactionNumber renders a short uppercase label", () => {
  assert.equal(formatTransactionNumber("a61c01dc-fd6c-4bd4-984e-77f3dfc44c96"), "TXN-A61C01DC");
  assert.equal(formatTransactionNumber(null), "TXN-UNKNOWN");
});

test("getMonthRangeIso returns the first day of this and next month", () => {
  const range = getMonthRangeIso();
  const now = new Date();

  assert.equal(new Date(range.start).getDate(), 1);
  assert.equal(new Date(range.start).getMonth(), now.getMonth());
  assert.equal(new Date(range.end).getDate(), 1);
  assert.equal(new Date(range.end).getMonth(), (now.getMonth() + 1) % 12);
});

const historyRows = [
  {
    id: "row-1",
    dispensing_transaction_id: "txn-aaa",
    quantity: 20,
    needed_quantity: 25,
    follow_up_action: FOLLOW_UP_ACTIONS.schedule,
    follow_up_date: "2026-08-17",
    prescribed_by: "Dr. Santos",
    dispense_date: "2026-08-10T08:00:00.000Z",
    voided_at: null,
    void_reason: null,
    patient: { patient_code: "PRD-0001", first_name: "Juan", last_name: "Dela Cruz", facility: { facility_name: "Tinaan Health Center" } },
    dispenser: { first_name: "Maria", last_name: "Santos", role: "BHW" },
    medicine: { generic_name: "Paracetamol", dosage: "500mg" },
    batch: { batch_number: "BATCH-A" },
  },
  {
    id: "row-2",
    dispensing_transaction_id: "txn-aaa",
    quantity: 10,
    needed_quantity: 10,
    dispense_date: "2026-08-10T08:00:00.000Z",
    voided_at: null,
    void_reason: null,
    patient: { patient_code: "PRD-0001", first_name: "Juan", last_name: "Dela Cruz", facility: { facility_name: "Tinaan Health Center" } },
    dispenser: { first_name: "Maria", last_name: "Santos", role: "BHW" },
    medicine: { generic_name: "Amoxicillin", dosage: "250mg" },
    batch: { batch_number: "BATCH-C" },
  },
  {
    id: "row-3",
    dispensing_transaction_id: "txn-bbb",
    quantity: 5,
    needed_quantity: 5,
    dispense_date: "2026-08-11T09:00:00.000Z",
    voided_at: "2026-08-12T10:00:00.000Z",
    void_reason: "Wrong patient selected.",
    patient: { patient_code: "PRD-0002", first_name: "Ana", last_name: "Lopez", facility: { facility_name: "LUTAC" } },
    dispenser: { first_name: "Maria", last_name: "Santos", role: "BHW" },
    medicine: { generic_name: "Vitamin C", dosage: null },
    batch: { batch_number: "BATCH-D" },
  },
];

test("groupHistoryByTransaction groups rows and computes totals", () => {
  const transactions = groupHistoryByTransaction(historyRows);

  assert.equal(transactions.length, 2);

  const grouped = transactions.find((transaction) => transaction.transactionId === "txn-aaa");

  assert.equal(grouped.rows.length, 2);
  assert.equal(grouped.totalQuantity, 30);
  assert.equal(grouped.voidedAt, null);
  assert.equal(grouped.medicineLines[0].neededQuantity, 25);
  assert.equal(grouped.medicineLines[0].releasedQuantity, 20);
});

test("matchesHistoryFilters searches across transaction fields and honours status", () => {
  const transactions = groupHistoryByTransaction(historyRows);
  const juan = transactions[0];
  const ana = transactions[1];

  assert.equal(matchesHistoryFilters({ keyword: "juan", transaction: juan }), true);
  assert.equal(matchesHistoryFilters({ keyword: "PRD-0002", transaction: ana }), true);
  assert.equal(matchesHistoryFilters({ keyword: "batch-d", transaction: ana }), true);
  assert.equal(matchesHistoryFilters({ keyword: "nobody", transaction: juan }), false);
  assert.equal(matchesHistoryFilters({ keyword: "", status: "VOIDED", transaction: juan }), false);
  assert.equal(matchesHistoryFilters({ keyword: "", status: "VOIDED", transaction: ana }), true);
  assert.equal(matchesHistoryFilters({ keyword: "", status: "ACTIVE", transaction: ana }), false);
});

test("sortTransactions orders newest or oldest first", () => {
  const transactions = groupHistoryByTransaction(historyRows);

  assert.deepEqual(
    sortTransactions(transactions, "newest").map((transaction) => transaction.transactionId),
    ["txn-bbb", "txn-aaa"]
  );
  assert.deepEqual(
    sortTransactions(transactions, "oldest").map((transaction) => transaction.transactionId),
    ["txn-aaa", "txn-bbb"]
  );
});

test("buildDispensingCsv exports one row per batch record with headers", () => {
  const csv = buildDispensingCsv(groupHistoryByTransaction(historyRows));
  const lines = csv.split("\n");

  assert.equal(lines.length, 4);
  assert.match(lines[0], /^date,transaction_id,status/);
  assert.match(csv, /VOIDED/);
  assert.match(csv, /Wrong patient selected\./);
  assert.match(csv, /Tinaan Health Center/);
  assert.match(csv, /Dr\. Santos/);
});

test("follow-up helpers format defaults and labels", () => {
  assert.equal(getDefaultFollowUpDate(new Date("2026-08-10T00:00:00Z")), "2026-08-17");
  assert.equal(
    getFollowUpDisplay({ followUpAction: FOLLOW_UP_ACTIONS.schedule, followUpDate: "2026-08-17" }),
    "Schedule next week - 2026-08-17"
  );
  assert.equal(
    getFollowUpDisplay({
      followUpAction: FOLLOW_UP_ACTIONS.refer,
      referredFacility: { facility_name: "Inayagan Barangay Health Center" },
    }),
    "Refer to barangay - Inayagan Barangay Health Center"
  );
});

test("medicine labels compose generic, dosage, brand and unit", () => {
  const medicine = inventoryRows[0].medicine;

  assert.equal(getMedicineLabel(medicine), "Paracetamol 500mg");
  assert.equal(getMedicineFullLabel(medicine), "Biogesic · tablet");
  assert.equal(getMedicineLabel({ generic_name: null }), "No generic name");
});

test("getTransactionTotalQuantity sums row quantities", () => {
  assert.equal(getTransactionTotalQuantity(historyRows.slice(0, 2)), 30);
});

test("getBlockedPatientIdsFromClaimRows ignores history-only records and includes barangay logs", () => {
  const rows = [
    { is_manual_record: true, medicine_id: "m1", needed_quantity: 10, patient_id: "p1", quantity: 10, record_type: "HISTORY_ONLY" },
    { is_manual_record: true, medicine_id: "m1", needed_quantity: 10, patient_id: "p4", quantity: 10, record_type: "BARANGAY_DISPENSING_LOG" },
    { is_manual_record: false, medicine_id: "m1", needed_quantity: 10, patient_id: "p2", quantity: 10 },
    { is_manual_record: false, medicine_id: "m2", needed_quantity: 10, patient_id: "p3", quantity: 4 },
  ];

  assert.deepEqual(getBlockedPatientIdsFromClaimRows(rows), ["p4", "p2"]);
});

test("formatDispensingDayParts splits a date into card parts", () => {
  const parts = formatDispensingDayParts("2026-08-10T08:05:00.000Z");

  assert.equal(parts.day, "10");
  assert.equal(parts.month, "AUG");
  assert.match(parts.time, /\d{1,2}:\d{2}/);
});

test("formatDispensingDayParts falls back on missing or invalid values", () => {
  assert.deepEqual(formatDispensingDayParts(null), { day: "—", month: "", time: "—" });
  assert.deepEqual(formatDispensingDayParts("not-a-date"), { day: "—", month: "", time: "—" });
});

test("getDispensingStepBlocker gates each wizard step", () => {
  const base = { claimed: false, hasLineErrors: false, hasPatient: true, lineCount: 2 };

  assert.equal(getDispensingStepBlocker({ ...base, step: 1 }), "");
  assert.equal(getDispensingStepBlocker({ ...base, step: 2 }), "");
  assert.match(getDispensingStepBlocker({ ...base, hasPatient: false, step: 2 }), /patient/i);
  assert.match(getDispensingStepBlocker({ ...base, claimed: true, step: 2 }), /month/i);
  assert.match(getDispensingStepBlocker({ ...base, claimed: true, lineCount: 1, step: 3 }), /month/i);
  assert.match(getDispensingStepBlocker({ ...base, lineCount: 0, step: 3 }), /medicine/i);
  assert.match(getDispensingStepBlocker({ ...base, hasPrescriber: false, lineCount: 1, step: 3 }), /doctor/i);
  assert.match(
    getDispensingStepBlocker({ ...base, hasLineErrors: true, lineCount: 1, step: 3 }),
    /quantit/i
  );
  assert.equal(getDispensingStepBlocker({ ...base, lineCount: 1, step: 3 }), "");
});

test("getPatientMonthlyClaimsBreakdown calculates multi-medicine balances correctly", () => {
  const currentMonthDate = new Date().toISOString();
  const rows = [
    {
      patient_id: "patient-x",
      medicine_id: "med-a",
      medicine: { generic_name: "Amoxicillin" },
      needed_quantity: 30,
      quantity: 30,
      dispense_date: currentMonthDate,
      prescribed_by: "Dr. Reyes",
      dispensing_transaction_id: "txn-1",
    },
    {
      patient_id: "patient-x",
      medicine_id: "med-b",
      medicine: { generic_name: "Paracetamol" },
      needed_quantity: 20,
      quantity: 15,
      follow_up_action: FOLLOW_UP_ACTIONS.schedule,
      follow_up_date: "2026-09-30",
      dispense_date: currentMonthDate,
      prescribed_by: "Dr. Reyes",
      dispensing_transaction_id: "txn-1",
    },
    {
      patient_id: "patient-x",
      medicine_id: "med-c",
      medicine: { generic_name: "Losartan" },
      needed_quantity: 30,
      quantity: 10,
      follow_up_action: FOLLOW_UP_ACTIONS.refer,
      referred_facility: { id: "fac-2", facility_name: "Inarawan Health Center" },
      dispense_date: currentMonthDate,
      prescribed_by: "Dr. Reyes",
      dispensing_transaction_id: "txn-1",
    },
  ];

  const breakdown = getPatientMonthlyClaimsBreakdown(rows, "patient-x");
  assert.equal(breakdown.length, 3);

  const medA = breakdown.find((b) => b.medicine_id === "med-a");
  assert.equal(medA.needed_quantity, 30);
  assert.equal(medA.released_quantity, 30);
  assert.equal(medA.remaining_quantity, 0);
  assert.equal(medA.is_completed, true);

  const medB = breakdown.find((b) => b.medicine_id === "med-b");
  assert.equal(medB.needed_quantity, 20);
  assert.equal(medB.released_quantity, 15);
  assert.equal(medB.remaining_quantity, 5);
  assert.equal(medB.is_completed, false);
  assert.equal(medB.follow_up_action, FOLLOW_UP_ACTIONS.schedule);
  assert.equal(medB.follow_up_date, "2026-09-30");

  const medC = breakdown.find((b) => b.medicine_id === "med-c");
  assert.equal(medC.needed_quantity, 30);
  assert.equal(medC.released_quantity, 10);
  assert.equal(medC.remaining_quantity, 20);
  assert.equal(medC.is_completed, false);
  assert.equal(medC.follow_up_action, FOLLOW_UP_ACTIONS.refer);
  assert.equal(medC.referred_facility.facility_name, "Inarawan Health Center");
});

test("getPatientDispensingStatus returns simple, non-jargon status across all phases", () => {
  // 1. Unclaimed
  const unclaimed = getPatientDispensingStatus({ claimsBreakdown: [] });
  assert.equal(unclaimed.code, "UNCLAIMED");
  assert.equal(unclaimed.label, "Ready to claim");
  assert.equal(unclaimed.isBlocked, false);

  // 2. Partial scheduled in the future (today: 2026-09-23, scheduled: 2026-09-30)
  const scheduledFuture = getPatientDispensingStatus({
    claimsBreakdown: [
      { medicine_id: "m1", is_completed: true, remaining_quantity: 0 },
      {
        medicine_id: "m2",
        is_completed: false,
        remaining_quantity: 5,
        follow_up_action: FOLLOW_UP_ACTIONS.schedule,
        follow_up_date: "2026-09-30",
      },
    ],
    today: "2026-09-23",
  });
  assert.equal(scheduledFuture.code, "PARTIAL_SCHEDULED");
  assert.equal(scheduledFuture.label, "Scheduled for 2026-09-30");
  assert.match(scheduledFuture.description, /7 days left/);
  assert.equal(scheduledFuture.isFutureSchedule, true);

  // 3. Partial scheduled on or after due date (today: 2026-09-30)
  const scheduledDue = getPatientDispensingStatus({
    claimsBreakdown: [
      {
        medicine_id: "m2",
        is_completed: false,
        remaining_quantity: 5,
        follow_up_action: FOLLOW_UP_ACTIONS.schedule,
        follow_up_date: "2026-09-30",
      },
    ],
    today: "2026-09-30",
  });
  assert.equal(scheduledDue.code, "PARTIAL_READY");
  assert.equal(scheduledDue.label, "Ready for pickup");
  assert.equal(scheduledDue.isFutureSchedule, false);

  // 4. Partial referred to barangay
  const referred = getPatientDispensingStatus({
    claimsBreakdown: [
      {
        medicine_id: "m3",
        is_completed: false,
        remaining_quantity: 20,
        follow_up_action: FOLLOW_UP_ACTIONS.refer,
        referred_facility: { facility_name: "Inarawan Health Center" },
      },
    ],
    today: "2026-09-23",
  });
  assert.equal(referred.code, "PARTIAL_REFERRED");
  assert.match(referred.label, /Inarawan Health Center/);

  // 5. Fully Completed
  const completed = getPatientDispensingStatus({
    claimsBreakdown: [
      { medicine_id: "m1", is_completed: true, remaining_quantity: 0 },
      { medicine_id: "m2", is_completed: true, remaining_quantity: 0 },
    ],
  });
  assert.equal(completed.code, "COMPLETED");
  assert.equal(completed.label, "Already received all medicines for this month");
  assert.equal(completed.isBlocked, true);
});

test("getCartLineError caps quantity to remaining balance for active claims", () => {
  const medicineOptions = [{ medicine_id: "med-1", total_quantity: 50 }];
  const patientClaim = {
    medicine_id: "med-1",
    needed_quantity: 20,
    released_quantity: 15,
    remaining_quantity: 5,
    is_completed: false,
  };

  // Valid release within balance (5 units)
  assert.equal(
    getCartLineError({
      line: { medicine_id: "med-1", needed_quantity: 20, quantity: 5 },
      medicineOptions,
      patientClaim,
    }),
    ""
  );

  // Invalid: exceeds remaining balance (6 units)
  assert.match(
    getCartLineError({
      line: { medicine_id: "med-1", needed_quantity: 20, quantity: 6 },
      medicineOptions,
      patientClaim,
    }),
    /remaining balance of 5 units/i
  );

  // Invalid: already completed medicine
  assert.match(
    getCartLineError({
      line: { medicine_id: "med-1", needed_quantity: 20, quantity: 1 },
      medicineOptions,
      patientClaim: { ...patientClaim, is_completed: true, remaining_quantity: 0 },
    }),
    /already completed/i
  );
});

test("groupHistoryByTransaction assigns SCHEDULED, REFERRED, and COMPLETED statuses", () => {
  const rows = [
    {
      dispensing_transaction_id: "tx-sched",
      medicine_id: "m1",
      needed_quantity: 20,
      quantity: 15,
      follow_up_action: FOLLOW_UP_ACTIONS.schedule,
      follow_up_date: "2026-09-30",
    },
    {
      dispensing_transaction_id: "tx-ref",
      medicine_id: "m2",
      needed_quantity: 30,
      quantity: 10,
      follow_up_action: FOLLOW_UP_ACTIONS.refer,
    },
    {
      dispensing_transaction_id: "tx-done",
      medicine_id: "m3",
      needed_quantity: 10,
      quantity: 10,
    },
  ];

  const grouped = groupHistoryByTransaction(rows);
  const schedTx = grouped.find((g) => g.transactionId === "tx-sched");
  const refTx = grouped.find((g) => g.transactionId === "tx-ref");
  const doneTx = grouped.find((g) => g.transactionId === "tx-done");

  assert.equal(schedTx.status, "SCHEDULED");
  assert.equal(refTx.status, "REFERRED");
  assert.equal(doneTx.status, "COMPLETED");

  assert.equal(matchesHistoryFilters({ status: "SCHEDULED", transaction: schedTx }), true);
  assert.equal(matchesHistoryFilters({ status: "SCHEDULED", transaction: doneTx }), false);
  assert.equal(matchesHistoryFilters({ status: "COMPLETED", transaction: doneTx }), true);
  assert.equal(matchesHistoryFilters({ status: "REFERRED", transaction: refTx }), true);
});

