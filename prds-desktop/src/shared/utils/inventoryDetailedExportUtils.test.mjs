import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import * as CFB from "cfb";
const cfb = CFB.default || CFB;

import {
  escapeXml,
  decodeXmlContent,
  formatDetailedCurrency,
  formatDetailedSubtitleDate,
  getDetailedInventoryExportFilename,
  buildAutoFitColsXml,
  extractInventoryMovements,
  buildSheet1Xml,
  buildSheet2Xml,
  buildSheet3Xml,
  buildSheet4Xml,
  buildSheet5Xml,
  buildDetailedInventoryBuffer,
  buildDetailedInventoryWorkbookFallback,
  resolveMedicineBatchDetails,
  resolveMovementTimestamp,
  formatMovementDateTime,
} from "./inventoryDetailedExportUtils.js";

const sampleMedicines = [
  { id: "med-1", generic_name: "Amoxicillin", dosage: "500mg", unit_of_measure: "CAPSULE", brand_name: "Amoxil", unit_cost: 8.5 },
  { id: "med-2", generic_name: "Paracetamol", dosage: "500mg", unit_of_measure: "TABLET", brand_name: "Biogesic", unit_cost: 5.0 },
];

const sampleFacilities = [
  { id: "fac-cho", facility_name: "City Health Office - Main Pharmacy" },
  { id: "fac-tinaan", facility_name: "Tina-an Barangay Health Station" },
];

const sampleInventory = [
  {
    id: "inv-1",
    medicine_id: "med-1",
    facility_id: "fac-cho",
    quantity: 500,
    batch_number: "LOT-AMX-2026",
    po_number: "PO-2026-001",
    unit_cost: 8.5,
    date_received: "2026-11-02",
    expiration_date: "2028-11-02",
    status: "ACTIVE",
  },
  {
    id: "inv-2",
    medicine_id: "med-2",
    facility_id: "fac-cho",
    quantity: 120,
    batch_number: "LOT-PARA-EXP",
    po_number: "PO-2025-089",
    unit_cost: 5.0,
    date_received: "2025-01-10",
    expiration_date: "2026-01-10", // expired
    status: "EXPIRED",
  },
];

const sampleDispensing = [
  {
    id: "disp-1",
    dispense_date: "2026-11-02T10:00:00Z",
    items: [
      {
        medicine_id: "med-1",
        quantity: 20,
        batch_number: "LOT-AMX-2026",
        expiration_date: "2028-11-02",
        unit_cost: 8.5,
      },
    ],
  },
];

const sampleStockReturns = [
  {
    id: "ret-1",
    facility_id: "fac-tinaan",
    medicine_id: "med-2",
    medicine_name: "Paracetamol",
    dosage: "500mg",
    unit_of_measure: "TABLET",
    brand_name: "Biogesic",
    lot_no: "LOT-RET-555",
    quantity: 50,
    unit_cost: 5.0,
    expiration_date: "2027-05-15",
    reason: "Excess stock rebalancing",
    confirmed_at: "2026-11-02T14:30:00Z",
  },
];

const sampleOtherPrograms = [
  {
    id: "prog-1",
    program_name: "Maternal Health & Nutrition",
    program_date: "2026-11-02",
    items: [
      {
        medicine_id: "med-1",
        generic_name: "Amoxicillin",
        dosage: "500mg",
        brand_name: "Amoxil",
        unit_of_measure: "CAPSULE",
        batch_number: "LOT-AMX-2026",
        expiration_date: "2028-11-02",
        quantity: 30,
        unit_cost: 8.5,
      },
    ],
  },
];

test("formatDetailedCurrency formats PHP amounts with peso symbol", () => {
  assert.equal(formatDetailedCurrency(120), "₱120.00");
  assert.equal(formatDetailedCurrency(288000), "₱288,000.00");
  assert.equal(formatDetailedCurrency(0), "₱0.00");
  assert.equal(formatDetailedCurrency(null), "₱0.00");
});

test("formatDetailedSubtitleDate returns 'as of Month Day, Year' for recent mode", () => {
  const result = formatDetailedSubtitleDate({
    mode: "recent",
    selectedDate: "2026-11-02",
  });
  assert.equal(result, "as of November 2, 2026");
});

test("formatDetailedSubtitleDate returns 'Month Year' for monthly mode", () => {
  const result = formatDetailedSubtitleDate({
    mode: "monthly",
    year: 2026,
    month: 10,
  });
  assert.equal(result, "October 2026");
});

test("getDetailedInventoryExportFilename formats correct filenames", () => {
  assert.equal(
    getDetailedInventoryExportFilename({ mode: "recent", selectedDate: "2026-11-02" }),
    "Inventory_Detailed_Report_November_2_2026.xlsx"
  );
  assert.equal(
    getDetailedInventoryExportFilename({ mode: "monthly", year: 2026, month: 10 }),
    "Inventory_Detailed_Report_October_2026.xlsx"
  );
  assert.equal(
    getDetailedInventoryExportFilename({ mode: "monthly", year: 2026, month: 8 }),
    "Inventory_Detailed_Report_August_2026.xlsx"
  );
});

test("buildAutoFitColsXml computes dynamic column widths based on max text length", () => {
  const colSpecs = [
    { col: "C", minCol: 3, maxCol: 3, defaultWidth: 6 },
    { col: "E", minCol: 5, maxCol: 5, defaultWidth: 35 },
  ];
  const textLengths = {
    C: 1,
    E: 45, // very long text
  };
  const xml = buildAutoFitColsXml(colSpecs, textLengths);
  assert.match(xml, /min="3" max="3" width="6"/);
  assert.match(xml, /min="5" max="5" width="55"/);
});

test("extractInventoryMovements gathers stock-in and stock-out correctly", () => {
  const movements = extractInventoryMovements({
    inventoryRows: sampleInventory,
    dispensingRows: sampleDispensing,
    stockReturnsRows: sampleStockReturns,
    otherProgramsRows: sampleOtherPrograms,
    facilities: sampleFacilities,
    medicines: sampleMedicines,
    mode: "recent",
    selectedDate: "2026-11-02",
  });

  assert.ok(movements.length >= 3);
  const stockIn = movements.filter((m) => m.stockIn !== "");
  const stockOut = movements.filter((m) => m.stockOut !== "");

  assert.ok(stockIn.length >= 2, "Should have deliveries and returns as stock in");
  assert.ok(stockOut.length >= 2, "Should have dispensing and program transfers as stock out");
});

test("buildDetailedInventoryBuffer creates a valid 5-sheet Excel buffer for recent mode", () => {
  const buffer = buildDetailedInventoryBuffer({
    inventoryRows: sampleInventory,
    dispensingRows: sampleDispensing,
    stockReturnsRows: sampleStockReturns,
    otherProgramsRows: sampleOtherPrograms,
    facilities: sampleFacilities,
    medicines: sampleMedicines,
    mode: "recent",
    selectedDate: "2026-11-02",
  });

  assert.ok(buffer);
  const nodeBuf = Buffer.from(buffer);
  const wb = XLSX.read(nodeBuf, { type: "buffer" });
  assert.deepEqual(wb.SheetNames, [
    "inventory",
    "stock-return",
    "additional-deliveries-summation",
    "other-program",
    "expired-stock",
  ]);

  // Check Sheet 1 subtitle
  const s1 = wb.Sheets["inventory"];
  const s1Text = JSON.stringify(s1);
  assert.ok(s1Text.includes("November 2, 2026") || s1Text.includes("as of"));

  // Check Sheet 5 has expired batch
  const s5 = wb.Sheets["expired-stock"];
  const s5Text = JSON.stringify(s5);
  assert.ok(s5Text.includes("LOT-PARA-EXP") || s5Text.includes("Paracetamol"));
});

test("buildDetailedInventoryBuffer creates a valid 5-sheet Excel buffer for monthly mode", () => {
  const buffer = buildDetailedInventoryBuffer({
    inventoryRows: sampleInventory,
    dispensingRows: sampleDispensing,
    stockReturnsRows: [
      ...sampleStockReturns,
      {
        id: "ret-oct",
        medicine_id: "med-1",
        quantity: 10,
        return_date: "2026-10-15",
        facility_id: "fac-tinaan",
      },
      {
        id: "ret-nov",
        medicine_id: "med-2",
        quantity: 25,
        return_date: "2026-11-04",
        facility_id: "fac-tinaan",
      },
    ],
    otherProgramsRows: [
      {
        id: "prog-nov",
        program_name: "Medical Mission",
        distribution_date: "2026-11-02",
        medicines: [
          {
            medicine_id: "med-1",
            batch_number: "LOT-AMOX-001",
            quantity_used: 120,
            expiration_date: "2027-06-01",
          },
        ],
      },
    ],
    facilities: sampleFacilities,
    medicines: sampleMedicines,
    mode: "monthly",
    year: 2026,
    month: 11,
  });

  assert.ok(buffer);
  const nodeBuf = Buffer.from(buffer);
  const wb = XLSX.read(nodeBuf, { type: "buffer" });
  assert.equal(wb.SheetNames.length, 5);
  const s1 = wb.Sheets["inventory"];
  const s1Text = JSON.stringify(s1);
  assert.ok(s1Text.includes("November 2026"));

  // Verify internal OpenXML structures via CFB
  const zip = cfb.read(nodeBuf, { type: "buffer" });
  function getEntry(name) {
    return zip.FileIndex.find((f) => f.name.toLowerCase().endsWith(name.toLowerCase()));
  }

  // 1. Sheet 1: ignoredErrors present, subtitle clean without black box, Stock In / Out headers
  const s1Xml = new TextDecoder().decode(getEntry("sheet1.xml").content);
  assert.ok(s1Xml.includes("<ignoredErrors>"));
  assert.ok(s1Xml.includes("Stock In"));
  assert.ok(s1Xml.includes("Stock Out"));

  // 2. Sheet 2: ignoredErrors present, October return excluded, November return included
  const s2Xml = new TextDecoder().decode(getEntry("sheet2.xml").content);
  assert.ok(s2Xml.includes("<ignoredErrors>"));
  assert.ok(!s2Xml.includes("2026-10-15"));
  assert.ok(s2Xml.includes("2026-11-04"));

  // 3. Sheet 3: ignoredErrors present, no stray columns R..Y
  const s3Xml = new TextDecoder().decode(getEntry("sheet3.xml").content);
  assert.ok(s3Xml.includes("<ignoredErrors>"));
  assert.ok(!/<c r="[R-Z]\d+"/.test(s3Xml));

  // 4. Sheet 4: ignoredErrors present, Medical Mission medicine populated
  const s4Xml = new TextDecoder().decode(getEntry("sheet4.xml").content);
  assert.ok(s4Xml.includes("<ignoredErrors>"));
  assert.ok(s4Xml.includes("Medical Mission"));
  assert.ok(s4Xml.includes("120"));

  // 5. Sheet 5: ignoredErrors present, expired batch included
  const s5Xml = new TextDecoder().decode(getEntry("sheet5.xml").content);
  assert.ok(s5Xml.includes("<ignoredErrors>"));
  assert.ok(s5Xml.includes("LOT-PARA-EXP"));
});

test("buildDetailedInventoryWorkbookFallback generates valid 5-sheet workbook", () => {
  const wb = buildDetailedInventoryWorkbookFallback({
    movements: [],
    stockReturnsRows: [],
    inventoryRows: sampleInventory,
    otherProgramsRows: sampleOtherPrograms,
    subtitleDate: "as of November 2, 2026",
    facilities: sampleFacilities,
    medicines: sampleMedicines,
  });

  assert.equal(wb.SheetNames.length, 5);
  assert.deepEqual(wb.SheetNames, [
    "inventory",
    "stock-return",
    "additional-deliveries-summation",
    "other-program",
    "expired-stock",
  ]);
});

test("resolveMedicineBatchDetails populates missing batch, brand, expiry, and unit cost using FEFO", () => {
  const inv = [
    {
      id: "inv-ascorbic",
      medicine_id: "med-ascorbic",
      brand_name: "Ritemed",
      batch_number: "0827023",
      expiration_date: "2027-01-27",
      unit_of_measure: "BOTTLE",
      unit_cost: 45.0,
      quantity: 100,
      date_received: "2026-08-01",
    },
  ];
  const medsMap = new Map([
    ["med-ascorbic", { id: "med-ascorbic", generic_name: "Ascorbic", dosage: "100 mg/mL, 15 mL oral drops", unit_of_measure: "BOTTLE" }],
  ]);

  // An item that only has medicine_id and quantity_used (like in other_programs table)
  const item = {
    medicine_id: "med-ascorbic",
    quantity_used: 26,
  };

  const details = resolveMedicineBatchDetails({ item, inventoryRows: inv, medicinesMap: medsMap });
  assert.equal(details.brand, "Ritemed");
  assert.equal(details.batchNo, "0827023");
  assert.equal(details.expirationDate, "2027-01-27");
  assert.equal(details.unit, "BOTTLE");
  assert.equal(details.unitCost, 45.0);
  assert.equal(details.itemDescription, "Ascorbic 100 mg/mL, 15 mL oral drops");
});

test("buildDetailedInventoryBuffer populates non-empty cells for other-program items in monthly report", () => {
  const inventoryRows = [
    {
      id: "inv-ascorbic",
      medicine_id: "med-ascorbic",
      brand_name: "Ritemed",
      batch_number: "0827023",
      expiration_date: "2027-01-27",
      unit_of_measure: "BOTTLE",
      unit_cost: 45.0,
      quantity: 100,
    },
    {
      id: "inv-folic",
      medicine_id: "med-folic",
      brand_name: "Ritemed",
      batch_number: "0827028",
      expiration_date: "2026-12-31",
      unit_of_measure: "TABLET",
      unit_cost: 3.92,
      quantity: 200,
    },
  ];

  const medicines = [
    { id: "med-ascorbic", generic_name: "Ascorbic", dosage: "100 mg/mL, 15 mL oral drops", unit_of_measure: "BOTTLE" },
    { id: "med-folic", generic_name: "Folic acid", dosage: "5 mg", unit_of_measure: "TABLET" },
  ];

  // Program medicines lacking batch, brand, expiry, and cost
  const otherProgramsRows = [
    {
      id: "prog-1",
      program_name: "Medical Mission",
      program_date: "2026-11-02",
      medicines: [
        { medicine_id: "med-ascorbic", quantity_used: 26 },
        { medicine_id: "med-folic", quantity_used: 32 },
      ],
    },
  ];

  const buffer = buildDetailedInventoryBuffer({
    inventoryRows,
    dispensingRows: [],
    requestRows: [],
    stockReturnsRows: [],
    otherProgramsRows,
    facilities: sampleFacilities,
    medicines,
    mode: "monthly",
    year: 2026,
    month: 11,
  });

  assert.ok(buffer);
  const nodeBuf = Buffer.from(buffer);
  const zip = cfb.read(nodeBuf, { type: "buffer" });
  function getEntry(name) {
    return zip.FileIndex.find((f) => f.name.toLowerCase().endsWith(name.toLowerCase()));
  }

  // Check Sheet 1 (inventory)
  const s1Xml = new TextDecoder().decode(getEntry("sheet1.xml").content);
  assert.ok(s1Xml.includes("0827023"), "Sheet 1 should contain batch 0827023");
  assert.ok(s1Xml.includes("0827028"), "Sheet 1 should contain batch 0827028");
  assert.ok(s1Xml.includes("2027-01-27"), "Sheet 1 should contain expiry 2027-01-27");
  assert.ok(s1Xml.includes("2026-12-31"), "Sheet 1 should contain expiry 2026-12-31");
  assert.ok(s1Xml.includes("Ritemed"), "Sheet 1 should contain brand Ritemed");
  assert.ok(s1Xml.includes("1170"), "Sheet 1 should calculate 26 * 45 = 1170");
  assert.ok(s1Xml.includes("125.44"), "Sheet 1 should calculate 32 * 3.92 = 125.44");

  // Check Sheet 4 (other-program)
  const s4Xml = new TextDecoder().decode(getEntry("sheet4.xml").content);
  assert.ok(s4Xml.includes("0827023"), "Sheet 4 should contain batch 0827023");
  assert.ok(s4Xml.includes("0827028"), "Sheet 4 should contain batch 0827028");
  assert.ok(s4Xml.includes("2027-01-27"), "Sheet 4 should contain expiry 2027-01-27");
  assert.ok(s4Xml.includes("2026-12-31"), "Sheet 4 should contain expiry 2026-12-31");
  assert.ok(s4Xml.includes("Ritemed"), "Sheet 4 should contain brand Ritemed");
  assert.ok(s4Xml.includes("BOTTLE"), "Sheet 4 should contain unit BOTTLE");
  assert.ok(s4Xml.includes("<t>No.</t>"), "Sheet 4 header should have label No.");
  assert.ok(s4Xml.includes("<t>1</t>"), "Sheet 4 first item row should have No. 1");
  assert.ok(s4Xml.includes("<t>2</t>"), "Sheet 4 second item row should have No. 2");
  assert.ok(s4Xml.includes("1170"), "Sheet 4 should calculate total cost 1170");
  assert.ok(s4Xml.includes("125.44"), "Sheet 4 should calculate total cost 125.44");
});

test("matchesTargetPeriod in recent mode includes movements across the current month up to selectedDate", () => {
  const dispensingRows = [
    {
      id: "disp-nov-1",
      dispense_date: "2026-11-01T08:00:00Z",
      items: [{ medicine_id: "med-1", quantity: 5, unit_cost: 8.5 }],
    },
    {
      id: "disp-nov-2",
      dispense_date: "2026-11-02T10:00:00Z",
      items: [{ medicine_id: "med-1", quantity: 10, unit_cost: 8.5 }],
    },
    {
      id: "disp-nov-4",
      dispense_date: "2026-11-04T10:00:00Z", // after selectedDate Nov 3
      items: [{ medicine_id: "med-1", quantity: 8, unit_cost: 8.5 }],
    },
    {
      id: "disp-oct-20",
      dispense_date: "2026-10-20T10:00:00Z", // different month
      items: [{ medicine_id: "med-1", quantity: 15, unit_cost: 8.5 }],
    },
  ];

  const movements = extractInventoryMovements({
    inventoryRows: [],
    dispensingRows,
    requestRows: [],
    stockReturnsRows: [],
    otherProgramsRows: [],
    facilities: sampleFacilities,
    medicines: sampleMedicines,
    mode: "recent",
    selectedDate: "2026-11-03",
    year: 2026,
    month: 11,
  });

  assert.equal(movements.length, 2, "Should include Nov 1 and Nov 2, but exclude Nov 4 and Oct 20");
  assert.equal(movements[0].date, "2026-11-02");
  assert.equal(movements[1].date, "2026-11-01");
});

test("Sheet 4 includes newly recorded other programs across the target month in recent mode", () => {
  const otherProgramsRows = [
    {
      id: "prog-new-1",
      program_name: "Nutrition Outreach Drive",
      program_date: "2026-11-15", // scheduled later in the month
      status: "SCHEDULED",
      medicines: [
        {
          id: "pm-1",
          medicine_id: "med-1",
          quantity: 45,
          unit_cost: 8.5,
          batch_number: "LOT-NOV-PROG",
          expiration_date: "2028-11-15",
          brand_name: "Amoxil",
          unit_of_measure: "CAPSULE",
        },
      ],
    },
    {
      id: "prog-sqlite-json",
      program_name: "Elderly Care Mission",
      program_date: "2026-11-03",
      status: "COMPLETED",
      data_json: JSON.stringify({
        medicines: [
          {
            id: "pm-2",
            medicine_id: "med-2",
            quantity_used: 60,
            unit_cost: 5.0,
            batch_number: "LOT-SQLITE-BATCH",
            expiration_date: "2027-05-15",
            brand_name: "Biogesic",
            unit_of_measure: "TABLET",
          },
        ],
      }),
    },
  ];

  const buffer = buildDetailedInventoryBuffer({
    inventoryRows: sampleInventory,
    dispensingRows: [],
    requestRows: [],
    stockReturnsRows: [],
    otherProgramsRows,
    facilities: sampleFacilities,
    medicines: sampleMedicines,
    mode: "recent",
    selectedDate: new Date("2026-11-03"),
    year: 2026,
    month: 11,
  });

  assert.ok(buffer);
  const nodeBuf = Buffer.from(buffer);
  const zip = cfb.read(nodeBuf, { type: "buffer" });
  function getEntry(name) {
    return zip.FileIndex.find((f) => f.name.toLowerCase().endsWith(name.toLowerCase()));
  }

  const s4Xml = new TextDecoder().decode(getEntry("sheet4.xml").content);
  assert.ok(s4Xml.includes("Nutrition Outreach Drive"), "Sheet 4 should include future scheduled program in target month");
  assert.ok(s4Xml.includes("LOT-NOV-PROG"), "Sheet 4 should include batch of scheduled program");
  assert.ok(s4Xml.includes("Elderly Care Mission"), "Sheet 4 should include SQLite data_json program");
  assert.ok(s4Xml.includes("LOT-SQLITE-BATCH"), "Sheet 4 should include SQLite batch");
});

test("resolveMovementTimestamp and formatMovementDateTime format dates with time accurately", () => {
  // Date with ISO timestamp
  const ts1 = resolveMovementTimestamp("2026-11-03T08:30:00Z");
  assert.ok(ts1 > 0);
  const formatted1 = formatMovementDateTime("2026-11-03T08:30:00Z");
  assert.match(formatted1, /^2026-11-03 \d{2}:\d{2} (AM|PM)$/);

  // Date-only string should remain YYYY-MM-DD
  const formatted2 = formatMovementDateTime("2026-11-03");
  assert.equal(formatted2, "2026-11-03");

  // Fallback timestamp when primary date is date-only
  const ts3 = resolveMovementTimestamp("2026-11-03", "2026-11-03T09:15:00Z");
  assert.equal(ts3.getTime(), new Date("2026-11-03T09:15:00Z").getTime());
  const formatted3 = formatMovementDateTime(ts3, "2026-11-03T09:15:00Z");
  assert.match(formatted3, /^2026-11-03 \d{2}:\d{2} (AM|PM)$/);
});

test("extractInventoryMovements sorts chronologically from most recent (top) to oldest (bottom)", () => {
  const deliveries = [
    {
      id: "inv-del-1",
      medicine_id: "med-1",
      facility_id: "fac-cho",
      quantity: 500,
      batch_number: "BATCH-DEL-1",
      po_number: "PO-01",
      unit_cost: 10,
      date_received: "2026-11-03",
      created_at: "2026-11-03T00:30:00Z", // earliest: morning delivery (oldest)
      status: "ACTIVE",
    },
  ];

  const dispensing = [
    {
      id: "disp-walkin",
      dispense_date: "2026-11-03T07:00:00Z", // latest: afternoon dispensing (most recent)
      items: [
        {
          medicine_id: "med-1",
          quantity: 20,
          batch_number: "BATCH-DEL-1",
          unit_cost: 10,
        },
      ],
    },
  ];

  const returns = [
    {
      id: "ret-1",
      facility_id: "fac-tinaan",
      medicine_id: "med-1",
      lot_no: "BATCH-RET",
      quantity: 10,
      unit_cost: 10,
      confirmed_at: "2026-11-03T03:00:00Z", // mid-morning return
    },
  ];

  const programs = [
    {
      id: "prog-midday",
      program_name: "Community Outreach",
      program_date: "2026-11-03T05:30:00Z", // early afternoon program
      items: [
        {
          medicine_id: "med-1",
          batch_number: "BATCH-DEL-1",
          quantity: 50,
          unit_cost: 10,
        },
      ],
    },
  ];

  const movements = extractInventoryMovements({
    inventoryRows: deliveries,
    dispensingRows: dispensing,
    stockReturnsRows: returns,
    otherProgramsRows: programs,
    facilities: sampleFacilities,
    medicines: sampleMedicines,
    mode: "recent",
    selectedDate: "2026-11-03",
  });

  assert.equal(movements.length, 4);

  // Top (index 0) must be the most recent transaction (afternoon dispensing)
  assert.equal(movements[0].stockOut, 20);
  assert.equal(movements[0].description, "Walk-in Patient Dispensing");

  // Second must be the early afternoon program transfer
  assert.equal(movements[1].stockOut, 50);
  assert.ok(movements[1].description.includes("Community Outreach"));

  // Third must be the mid-morning return
  assert.equal(movements[2].batchNo, "BATCH-RET");
  assert.equal(movements[2].stockIn, 10);

  // Bottom (index 3) must be the oldest transaction (morning delivery)
  assert.equal(movements[3].batchNo, "BATCH-DEL-1");
  assert.equal(movements[3].stockIn, 500);

  // Ensure timestamps are strictly non-increasing (most recent -> oldest)
  for (let i = 0; i < movements.length - 1; i++) {
    assert.ok(
      movements[i].timestamp >= movements[i + 1].timestamp,
      `Movement index ${i} should be more recent than or equal to index ${i + 1}`
    );
  }
});

test("buildSheet1Xml and fallback workbook contain Date column header and date-only values", () => {
  const movements = [
    {
      timestamp: new Date("2026-11-03T16:00:00Z").getTime(),
      date: "2026-11-03",
      itemDescription: "Amoxicillin 500mg CAPSULE",
      brand: "Amoxil",
      batchNo: "LOT-01",
      expirationDate: "2028-11-02",
      unitCost: 8.5,
      totalCost: 170,
      stockIn: "",
      stockOut: 20,
      description: "Walk-in Patient Dispensing",
    },
    {
      timestamp: new Date("2026-11-03T08:00:00Z").getTime(),
      date: "2026-11-03",
      itemDescription: "Amoxicillin 500mg CAPSULE",
      brand: "Amoxil",
      batchNo: "LOT-01",
      expirationDate: "2028-11-02",
      unitCost: 8.5,
      totalCost: 850,
      stockIn: 100,
      stockOut: "",
      description: "Procurement Delivery",
    },
  ];

  // Test buildSheet1Xml with row 7 present
  const mockXml = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="7"><c r="C7"/><c r="D7"/></row><row r="8"/><row r="9"><c r="C9"/><c r="D9"/><c r="E9"/><c r="F9"/><c r="G9"/><c r="H9"/><c r="I9"/><c r="J9"/><c r="K9"/><c r="L9"/><c r="M9"/></row></sheetData></worksheet>`;
  const resultXml = buildSheet1Xml(mockXml, movements, "as of November 3, 2026");

  // Check header has Date
  assert.ok(resultXml.includes("<t>Date</t>"), "Header must be Date");
  // Check rows have date only (2026-11-03)
  assert.ok(resultXml.includes("<t>2026-11-03</t>"));

  // Also verify using actual template buffer via buildDetailedInventoryBuffer
  const buffer = buildDetailedInventoryBuffer({
    inventoryRows: [
      {
        id: "inv-buf-1",
        medicine_id: "med-1",
        quantity: 200,
        batch_number: "LOT-BUF-01",
        unit_cost: 12,
        date_received: "2026-11-03",
        created_at: "2026-11-03T08:30:00Z",
        status: "ACTIVE",
      },
    ],
    dispensingRows: [],
    requestRows: [],
    stockReturnsRows: [],
    otherProgramsRows: [],
    facilities: sampleFacilities,
    medicines: sampleMedicines,
    mode: "recent",
    selectedDate: "2026-11-03",
  });
  const zip = cfb.read(Buffer.from(buffer), { type: "buffer" });
  const sheet1Entry = zip.FileIndex.find((f) => f.name.toLowerCase().endsWith("sheet1.xml"));
  const sheet1Content = new TextDecoder().decode(sheet1Entry.content);
  assert.ok(sheet1Content.includes("<t>Date</t>"), "Template sheet1 must have Date in D7 header");

  // Test buildDetailedInventoryWorkbookFallback
  const fbWb = buildDetailedInventoryWorkbookFallback({
    movements,
    subtitleDate: "as of November 3, 2026",
  });
  const s1 = fbWb.Sheets["inventory"];
  const s1Data = XLSX.utils.sheet_to_json(s1, { header: 1 });
  // Row index 4 is headers (0-indexed)
  assert.equal(s1Data[4][1], "Date");
  // Row index 5 is first movement (most recent)
  assert.equal(s1Data[5][1], "2026-11-03");
  assert.equal(s1Data[5][9], 20); // stockOut 20
});

test("all sheets in Detailed Inventory Report are sorted in descending order (most recent at top)", () => {
  const stockReturnsRows = [
    {
      id: "ret-old",
      medicine_id: "med-1",
      quantity: 5,
      return_date: "2026-11-01",
      facility_id: "fac-tinaan",
    },
    {
      id: "ret-new",
      medicine_id: "med-1",
      quantity: 15,
      return_date: "2026-11-03",
      facility_id: "fac-tinaan",
    },
  ];

  const inventoryRows = [
    {
      id: "inv-old",
      medicine_id: "med-1",
      quantity: 100,
      batch_number: "BATCH-OLD",
      po_number: "PO-OLD",
      date_received: "2026-10-15",
      expiration_date: "2025-01-01", // expired older
      status: "EXPIRED",
    },
    {
      id: "inv-new",
      medicine_id: "med-1",
      quantity: 300,
      batch_number: "BATCH-NEW",
      po_number: "PO-NEW",
      date_received: "2026-11-02",
      expiration_date: "2026-10-31", // expired more recently
      status: "EXPIRED",
    },
  ];

  const otherProgramsRows = [
    {
      id: "prog-old",
      program_name: "Outreach 1",
      program_date: "2026-11-01",
      items: [{ medicine_id: "med-1", quantity: 10 }],
    },
    {
      id: "prog-new",
      program_name: "Outreach 2",
      program_date: "2026-11-03",
      items: [{ medicine_id: "med-1", quantity: 20 }],
    },
  ];

  const buffer = buildDetailedInventoryBuffer({
    inventoryRows,
    dispensingRows: [],
    requestRows: [],
    stockReturnsRows,
    otherProgramsRows,
    facilities: sampleFacilities,
    medicines: sampleMedicines,
    mode: "recent",
    selectedDate: "2026-11-03",
  });

  const zip = cfb.read(Buffer.from(buffer), { type: "buffer" });
  function getSheetXml(sheetName) {
    const entry = zip.FileIndex.find((f) => f.name.toLowerCase().endsWith(sheetName.toLowerCase()));
    return new TextDecoder().decode(entry.content);
  }

  // Sheet 2 (stock-return): Nov 3 return must appear before Nov 1 return
  const s2Xml = getSheetXml("sheet2.xml");
  const idxRetNew = s2Xml.indexOf("2026-11-03");
  const idxRetOld = s2Xml.indexOf("2026-11-01");
  assert.ok(idxRetNew > -1 && idxRetOld > -1);
  assert.ok(idxRetNew < idxRetOld, "Sheet 2: Most recent return must be above older return");

  // Sheet 3 (additional-deliveries-summation): PO-NEW (Nov 2) must appear before PO-OLD (Oct 15)
  const s3Xml = getSheetXml("sheet3.xml");
  const idxPoNew = s3Xml.indexOf("PO NO. PO-NEW");
  const idxPoOld = s3Xml.indexOf("PO NO. PO-OLD");
  assert.ok(idxPoNew > -1 && idxPoOld > -1);
  assert.ok(idxPoNew < idxPoOld, "Sheet 3: Most recent PO delivery must be above older PO delivery");

  // Sheet 4 (other-program): Outreach 2 (Nov 3) must appear before Outreach 1 (Nov 1)
  const s4Xml = getSheetXml("sheet4.xml");
  const idxProgNew = s4Xml.indexOf("Outreach 2");
  const idxProgOld = s4Xml.indexOf("Outreach 1");
  assert.ok(idxProgNew > -1 && idxProgOld > -1);
  assert.ok(idxProgNew < idxProgOld, "Sheet 4: Most recent program must be above older program");

  // Sheet 5 (expired-stock): 2026-10-31 expiry must appear before 2025-01-01 expiry
  const s5Xml = getSheetXml("sheet5.xml");
  const idxExpNew = s5Xml.indexOf("2026-10-31");
  const idxExpOld = s5Xml.indexOf("2025-01-01");
  assert.ok(idxExpNew > -1 && idxExpOld > -1);
  assert.ok(idxExpNew < idxExpOld, "Sheet 5: Most recently expired stock must be above older expired stock");
});

