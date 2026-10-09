import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  buildDailyRisWorkbook,
  buildDailyRisBuffer,
  buildMonthlyInventoryWorkbook,
  buildMonthlyInventoryBuffer,
  processMonthlyInventoryData,
  consolidateInventoryRows,
} from "./reportExportUtils.js";

test("buildDailyRisWorkbook creates valid 2-sheet workbook with records", () => {
  const selectedDate = new Date(2026, 8, 25);
  const dispensingRows = [
    {
      quantity: 120,
      dispense_date: "2026-09-25",
      medicine: { generic_name: "Losartan", dosage: "50mg", brand_name: "Episartan", unit_of_measure: "Tablet" },
    },
  ];
  const requestRows = [
    {
      status: "COMPLETED",
      approved_at: "2026-09-25",
      facility: { facility_name: "Barangay Colon Health Center" },
      items: [
        {
          quantity: 60,
          medicine: { generic_name: "Valproic Acid", dosage: "500mg", brand_name: "Valparin", unit_of_measure: "Tablet" },
        },
      ],
    },
  ];

  const wb = buildDailyRisWorkbook({ dispensingRows, requestRows, selectedDate });

  assert.deepEqual(wb.SheetNames, ["CHO", "BHW"]);

  const choSheet = wb.Sheets["CHO"];
  assert.equal(choSheet["D1"]?.v, "VICENTE MENDIOLA CENTER FOR HEALTH");
  assert.equal(choSheet["D2"]?.v, "REQUEST ISSUANCE SLIP");
  assert.equal(choSheet["D4"]?.v, "DATE: ");
  assert.equal(choSheet["E4"]?.v, "SEPTEMBER 25, 2026");
  assert.equal(choSheet["D5"]?.v, "RIS NO.");
  assert.equal(choSheet["E5"]?.v, ""); // RIS NO blank
  assert.equal(choSheet["D7"]?.v, "ITEM NO");
  assert.equal(choSheet["E7"]?.v, "ITEM DESCRIPTION");
  assert.equal(choSheet["F7"]?.v, "BRAND");
  assert.equal(choSheet["G7"]?.v, "UNIT");
  assert.equal(choSheet["H7"]?.v, "QTY");
  assert.equal(choSheet["I7"]?.v.trim(), "AREA");
  assert.equal(choSheet["D8"]?.v, 1);
  assert.equal(choSheet["E8"]?.v, "Losartan 50mg");
  assert.equal(choSheet["I8"]?.v, "PHARMACY DISPENSING");

  const bhwSheet = wb.Sheets["BHW"];
  assert.equal(bhwSheet["D1"]?.v, "VICENTE MENDIOLA CENTER FOR HEALTH");
  assert.equal(bhwSheet["D4"]?.v, "DATE: ");
  assert.equal(bhwSheet["E4"]?.v, "SEPTEMBER 25, 2026");
  assert.equal(bhwSheet["D5"]?.v, "RIS NO.");
  assert.equal(bhwSheet["D7"]?.v, "ITEM NO");
  assert.equal(bhwSheet["E7"]?.v, "ITEM DESCRIPTION");
  assert.equal(bhwSheet["F7"]?.v, "BRAND");
  assert.equal(bhwSheet["G7"]?.v, "UNIT");
  assert.equal(bhwSheet["H7"]?.v, "QTY");
  assert.equal(bhwSheet["I7"]?.v.trim(), "AREA");
  assert.equal(bhwSheet["D8"]?.v, 1);
  assert.equal(bhwSheet["E8"]?.v, "Valproic Acid 500mg");
  assert.equal(bhwSheet["I8"]?.v, "BARANGAY COLON HEALTH CENTER");
});

test("buildDailyRisWorkbook dynamically headers Sheet 1 when facilityName is provided for BHW", () => {
  const selectedDate = new Date(2026, 8, 25);
  const dispensingRows = [
    {
      dispense_date: "2026-09-25",
      quantity: 15,
      medicine: { generic_name: "Amoxicillin", dosage: "500mg", brand_name: "Amoxil", unit_of_measure: "Capsule" },
    },
  ];

  const wb = buildDailyRisWorkbook({
    dispensingRows,
    requestRows: [],
    selectedDate,
    facilityName: "Barangay Inoburan Health Center",
  });

  const choSheet = wb.Sheets["CHO"];
  assert.equal(choSheet["D1"]?.v, "BARANGAY INOBURAN HEALTH CENTER");
  assert.equal(choSheet["D2"]?.v, "REQUEST ISSUANCE SLIP - BARANGAY INOBURAN HEALTH CENTER");
  assert.equal(choSheet["I8"]?.v, "BARANGAY INOBURAN HEALTH CENTER DISPENSING");
});

test("buildDailyRisWorkbook exports blank template when no data exists for the day", () => {
  const selectedDate = new Date(2026, 8, 26);
  // Empty data for the day
  const wb = buildDailyRisWorkbook({ dispensingRows: [], requestRows: [], selectedDate });

  assert.deepEqual(wb.SheetNames, ["CHO", "BHW"]);

  const choSheet = wb.Sheets["CHO"];
  assert.equal(choSheet["D1"]?.v, "VICENTE MENDIOLA CENTER FOR HEALTH");
  assert.equal(choSheet["D4"]?.v, "DATE: ");
  assert.equal(choSheet["E4"]?.v, "SEPTEMBER 26, 2026");
  assert.equal(choSheet["D5"]?.v, "RIS NO.");
  assert.equal(choSheet["E5"]?.v, ""); // RIS NO blank
  assert.equal(choSheet["D7"]?.v, "ITEM NO");
  assert.equal(choSheet["E7"]?.v, "ITEM DESCRIPTION");
  // Row 8 data cells are empty string
  assert.equal(choSheet["D8"]?.v, "");
  assert.equal(choSheet["E8"]?.v, "");

  const bhwSheet = wb.Sheets["BHW"];
  assert.equal(bhwSheet["D1"]?.v, "VICENTE MENDIOLA CENTER FOR HEALTH");
  assert.equal(bhwSheet["D4"]?.v, "DATE: ");
  assert.equal(bhwSheet["E4"]?.v, "SEPTEMBER 26, 2026");
  assert.equal(bhwSheet["D5"]?.v, "RIS NO.");
  assert.equal(bhwSheet["D7"]?.v, "ITEM NO");
  assert.equal(bhwSheet["E7"]?.v, "ITEM DESCRIPTION");
  assert.equal(bhwSheet["D8"]?.v, "");
  assert.equal(bhwSheet["E8"]?.v, "");
});

test("buildMonthlyInventoryWorkbook creates valid physical count inventory form", () => {
  const inventoryRows = [
    {
      quantity: 52,
      batch_number: "ZMN073",
      expiration_date: "2026-12-31",
      medicine: { generic_name: "Dicycloverine", dosage: "10mg/5mL", brand_name: "Myrentyl", unit_of_measure: "Bottle", unit_cost: 35.0 },
    },
  ];

  const wb = buildMonthlyInventoryWorkbook({ inventoryRows, year: 2026, month: 7 });

  const sheet = wb.Sheets[wb.SheetNames[0]];

  // Title and Facility Headers (C3)
  assert.ok(sheet["C3"]?.v.includes("REPORT ON PHYSICAL COUNT OF INVENTORIES"));
  assert.ok(sheet["C3"]?.v.includes("VMCH MEDICINE SUPPLIES"));
  // Month header check in C5, I5, AG5
  assert.equal(sheet["C5"]?.v, "MONTH : JULY 31, 2026");
  assert.ok(sheet["I5"]?.v.includes("JUNE 30, 2026"));
  assert.ok(sheet["AG5"]?.v.includes("JULY 31, 2026"));

  // First item starting at Row 7, columns C to AI
  assert.equal(sheet["C7"]?.v, 1); // ITEM NO
  assert.equal(sheet["D7"]?.v, "Dicycloverine 10mg/5mL"); // ITEM DESCRIPTION
  assert.equal(sheet["E7"]?.v, "BOTTLE"); // UNIT
  assert.equal(sheet["F7"]?.v, "MYRENTYL"); // BRAND
  assert.equal(sheet["G7"]?.v, "ZMN073"); // LOT NO
  assert.equal(sheet["H7"]?.v, "2026-12-31"); // EXPIRY DATE
  assert.equal(sheet["I7"]?.v, 52); // Beginning balance quantity
  assert.equal(sheet["J7"]?.v, 35); // Unit cost
  assert.equal(sheet["K7"]?.f, "I7*J7"); // Formula
  assert.equal(sheet["K7"]?.v, 1820);
  assert.equal(sheet["P7"]?.f, "L7+I7"); // Gross Available
  assert.equal(sheet["P7"]?.v, 52);
  assert.equal(sheet["AG7"]?.f, "P7-(T7+X7+AC7)"); // Remaining Ending Balance formula
  assert.equal(sheet["AG7"]?.v, 52);
  assert.equal(sheet["AH7"]?.f, "U7");
  assert.equal(sheet["AI7"]?.f, "AH7*AG7");
  assert.equal(sheet["AI7"]?.v, 1820);

  // Total Row at Row 10 (at least 3 data rows: 7, 8, 9, then total at 10)
  assert.equal(sheet["D10"]?.v, "TOTAL");
  assert.equal(sheet["K10"]?.f, "SUM(K7:K9)");
  assert.equal(sheet["K10"]?.v, 1820);
  assert.equal(sheet["AI10"]?.f, "SUM(AI7:AI9)");
  assert.equal(sheet["AI10"]?.v, 1820);
});

test("buildMonthlyInventoryWorkbook accurately reconciles issuances and other programs into beginning balance", () => {
  const inventoryRows = [
    {
      quantity: 42,
      batch_number: "ZMN073",
      expiration_date: "2026-12-31",
      medicine: { id: "med-1", generic_name: "Dicycloverine", dosage: "10mg/5mL", brand_name: "Myrentyl", unit_of_measure: "Bottle", unit_cost: 35.0 },
    },
  ];
  const dispensingRows = [
    {
      medicine_id: "med-1",
      batch_number: "ZMN073",
      quantity: 6,
      dispense_date: "2026-07-10",
    },
  ];
  const requestRows = [
    {
      status: "COMPLETED",
      approved_at: "2026-07-15",
      items: [
        { medicine_id: "med-1", batch_number: "ZMN073", quantity: 4 },
      ],
    },
  ];
  const otherProgramsRows = [
    {
      status: "COMPLETED",
      program_name: "Anti-Rabies Mission",
      program_date: "2026-07-20",
      medicines: [
        { medicine_id: "med-1", quantity_used: 2 },
      ],
    },
  ];

  const wb = buildMonthlyInventoryWorkbook({
    inventoryRows,
    dispensingRows,
    requestRows,
    otherProgramsRows,
    year: 2026,
    month: 7,
  });

  const sheet = wb.Sheets[wb.SheetNames[0]];

  // Reconciliation check in row 7:
  // Issued = 6 (walk-in) + 4 (request) = 10
  assert.equal(sheet["T7"]?.v, 10);
  // Programs = 2, Program name = ANTI-RABIES MISSION
  assert.equal(sheet["X7"]?.v, 2);
  assert.equal(sheet["AA7"]?.v, "ANTI-RABIES MISSION");
  // Remaining physical count = 42
  assert.equal(sheet["AG7"]?.v, 42);
  // Beginning balance = 42 + 10 + 2 = 54
  assert.equal(sheet["I7"]?.v, 54);
  assert.equal(sheet["P7"]?.v, 54); // Gross available
  assert.equal(sheet["K7"]?.v, 54 * 35); // Beginning total
  assert.equal(sheet["V7"]?.v, 10 * 35); // Issuance total
  assert.equal(sheet["Z7"]?.v, 2 * 35); // Program total
  assert.equal(sheet["AI7"]?.v, 42 * 35); // Remaining total
});

test("buildMonthlyInventoryBuffer generates a valid XLSX buffer with official template styling", () => {
  const inventoryRows = [
    {
      quantity: 100,
      batch_number: "BATCH001",
      expiration_date: "2027-10-31",
      medicine: { generic_name: "Amoxicillin", dosage: "500mg", brand_name: "Himox", unit_of_measure: "Capsule", unit_cost: 8.5 },
    },
  ];

  const buffer = buildMonthlyInventoryBuffer({
    inventoryRows,
    dispensingRows: [],
    requestRows: [],
    otherProgramsRows: [],
    year: 2026,
    month: 10,
    facilityName: "VMCH MEDICINE SUPPLIES",
  });

  assert.ok(buffer);
  assert.ok(buffer.byteLength > 0);

  const parsedWb = XLSX.read(buffer, { type: "array", cellNF: true, cellText: true, cellFormula: true });
  assert.ok(parsedWb.SheetNames.length > 0);

  const sheet = parsedWb.Sheets[parsedWb.SheetNames[0]];
  assert.ok(sheet["C3"]?.v.includes("REPORT ON PHYSICAL COUNT OF INVENTORIES"));
  const todayDay = new Date().getDate();
  assert.equal(sheet["C5"]?.v, `MONTH : OCTOBER ${todayDay}, 2026`);
  assert.ok(sheet["I5"]?.v.includes("SEPTEMBER 30, 2026"));
  assert.ok(sheet["AG5"]?.v.includes(`OCTOBER ${todayDay}, 2026`));

  assert.equal(sheet["C7"]?.v, 1);
  assert.equal(sheet["D7"]?.v, "Amoxicillin 500mg");
  assert.equal(sheet["E7"]?.v, "CAPSULE");
  assert.equal(sheet["F7"]?.v, "HIMOX");
  assert.equal(sheet["G7"]?.v, "BATCH001");
  assert.equal(sheet["H7"]?.v, "2027-10-31");
  assert.equal(sheet["I7"]?.v, 100);
  assert.equal(sheet["J7"]?.v, 8.5);
  assert.equal(sheet["K7"]?.v, 850);
  assert.equal(sheet["AG7"]?.v, 100);
  assert.equal(sheet["AI7"]?.v, 850);

  // Formatted cost cells MUST display peso sign
  assert.ok(sheet["J7"]?.w?.includes("₱"), "Unit cost should display peso sign");
  assert.ok(sheet["K7"]?.w?.includes("₱"), "Total cost should display peso sign");
  assert.ok(sheet["AI7"]?.w?.includes("₱"), "Remaining total cost should display peso sign");

  assert.equal(sheet["D10"]?.v, "TOTAL");
  assert.equal(sheet["K10"]?.v, 850);
  assert.ok(sheet["K10"]?.w?.includes("₱"), "Overall beginning total cost should display peso sign");
  assert.equal(sheet["AI10"]?.v, 850);
  assert.ok(sheet["AI10"]?.w?.includes("₱"), "Overall remaining total cost should display peso sign");
  // Total row unit cost columns MUST be empty, not a lone stray '₱'
  assert.ok(!sheet["J10"] || sheet["J10"]?.v === "", "Total row Unit Cost must be empty");

  // Verify borders directly in OpenXML package
  const cfbLib = XLSX.CFB || Reflect.get(XLSX, "default")?.CFB;
  const cfb = cfbLib.read(buffer, { type: "array" });
  const s1Entry = cfbLib.find(cfb, "sheet1.xml") || cfbLib.find(cfb, "/xl/worksheets/sheet1.xml");
  const s1Xml = new TextDecoder().decode(s1Entry.content);
  // Column J (UNIT COST) must use s="26" with full border (borderId="1"), NOT borderId="0" (s="27") or header borders (s="56")
  assert.ok(s1Xml.includes('<c r="J7" s="26"'), "Cell J7 must use style s=26 with full thin border");
  assert.ok(s1Xml.includes('<c r="K7" s="26"'), "Cell K7 must use style s=26 with full thin border");
});


test("buildDailyRisWorkbook avoids duplicate dosage repetition in Item Description", () => {
  const selectedDate = new Date(2026, 8, 26);
  const dispensingRows = [
    {
      quantity: 50,
      dispense_date: "2026-09-26",
      medicine: {
        generic_name: "Paracetamol 500mg Tablet",
        dosage: "500mg",
        brand_name: "Biogesic",
        unit_of_measure: "Tablet",
      },
    },
  ];

  const wb = buildDailyRisWorkbook({ dispensingRows, requestRows: [], selectedDate });
  const choSheet = wb.Sheets["CHO"];
  // Should NOT repeat: "Paracetamol 500mg Tablet 500mg"
  assert.equal(choSheet["E8"]?.v, "Paracetamol 500mg Tablet");
});

test("buildDailyRisBuffer generates a valid XLSX buffer with official 2-sheet template structure", () => {
  const selectedDate = new Date(2026, 8, 26);
  const dispensingRows = [
    {
      quantity: 80,
      dispense_date: "2026-09-26",
      medicine: { generic_name: "Amoxicillin", dosage: "500mg", brand_name: "Himox", unit_of_measure: "Capsule" },
    },
  ];
  const requestRows = [
    {
      status: "COMPLETED",
      approved_at: "2026-09-26",
      facility: { facility_name: "Barangay Poblacion Station" },
      items: [
        {
          quantity: 150,
          medicine: { generic_name: "Cotrimoxazole", dosage: "400mg/80mg", brand_name: "Bactrim", unit_of_measure: "Tablet" },
        },
      ],
    },
  ];

  const buffer = buildDailyRisBuffer({ dispensingRows, requestRows, selectedDate });
  assert.ok(buffer);
  assert.ok(buffer.byteLength > 0);

  // Parse the output buffer with XLSX to verify readability
  const parsedWb = XLSX.read(buffer, { type: "array" });
  assert.deepEqual(parsedWb.SheetNames, ["CHO", "BHW"]);

  const s1 = parsedWb.Sheets["CHO"];
  assert.equal(s1["D4"]?.v, "DATE: ");
  assert.equal(s1["E4"]?.v, "SEPTEMBER 26, 2026");
  assert.equal(s1["D5"]?.v, "RIS NO.");
  assert.equal(s1["E5"]?.v || "", ""); // Blank RIS NO
  assert.equal(s1["D7"]?.v, "ITEM NO");
  assert.equal(s1["E7"]?.v, "ITEM DESCRIPTION");
  assert.equal(s1["F7"]?.v, "BRAND");
  assert.equal(s1["G7"]?.v, "UNIT");
  assert.equal(s1["H7"]?.v, "QTY");
  assert.equal(s1["I7"]?.v.trim(), "AREA");
  assert.equal(s1["E8"]?.v, "Amoxicillin 500mg");
  assert.equal(s1["H8"]?.v, 80);

  const s2 = parsedWb.Sheets["BHW"];
  assert.equal(s2["D4"]?.v, "DATE: ");
  assert.equal(s2["E4"]?.v, "SEPTEMBER 26, 2026");
  assert.equal(s2["D5"]?.v, "RIS NO.");
  assert.equal(s2["D7"]?.v, "ITEM NO");
  assert.equal(s2["E7"]?.v, "ITEM DESCRIPTION");
  assert.equal(s2["F7"]?.v, "BRAND");
  assert.equal(s2["G7"]?.v, "UNIT");
  assert.equal(s2["H7"]?.v, "QTY");
  assert.equal(s2["I7"]?.v.trim(), "AREA");
  assert.equal(s2["E8"]?.v, "Cotrimoxazole 400mg/80mg");
  assert.equal(s2["H8"]?.v, 150);
});

test("buildDailyRisBuffer preserves table headers, RIS NO, and custom risNo if provided", () => {
  const selectedDate = new Date(2026, 8, 26);
  const buffer = buildDailyRisBuffer({
    dispensingRows: [],
    requestRows: [],
    selectedDate,
    risNo: "RIS-2026-0926-001",
  });
  assert.ok(buffer);

  const parsedWb = XLSX.read(buffer, { type: "array" });
  const s1 = parsedWb.Sheets["CHO"];
  assert.equal(s1["D4"]?.v, "DATE: ");
  assert.equal(s1["E4"]?.v, "SEPTEMBER 26, 2026");
  assert.equal(s1["D5"]?.v, "RIS NO.");
  assert.equal(s1["E5"]?.v, "RIS-2026-0926-001");
  assert.equal(s1["D7"]?.v, "ITEM NO");
  assert.equal(s1["E7"]?.v, "ITEM DESCRIPTION");

  const s2 = parsedWb.Sheets["BHW"];
  assert.equal(s2["D4"]?.v, "DATE: ");
  assert.equal(s2["E4"]?.v, "SEPTEMBER 26, 2026");
  assert.equal(s2["D5"]?.v, "RIS NO.");
  assert.equal(s2["E5"]?.v, "RIS-2026-0926-001");
  assert.equal(s2["D7"]?.v, "ITEM NO");
  assert.equal(s2["E7"]?.v, "ITEM DESCRIPTION");
});

test("buildDailyRisBuffer generates blank rows preserving cell styling when no data exists", () => {
  const selectedDate = new Date(2026, 8, 26);
  const buffer = buildDailyRisBuffer({ dispensingRows: [], requestRows: [], selectedDate });
  assert.ok(buffer);

  const parsedWb = XLSX.read(buffer, { type: "array" });
  assert.deepEqual(parsedWb.SheetNames, ["CHO", "BHW"]);

  const s1 = parsedWb.Sheets["CHO"];
  assert.equal(s1["D4"]?.v, "DATE: ");
  assert.equal(s1["E4"]?.v, "SEPTEMBER 26, 2026");
  assert.equal(s1["D5"]?.v, "RIS NO.");
  assert.equal(s1["E5"]?.v || "", "");
  assert.equal(s1["D7"]?.v, "ITEM NO");
  assert.equal(s1["E7"]?.v, "ITEM DESCRIPTION");

  const s2 = parsedWb.Sheets["BHW"];
  assert.equal(s2["D4"]?.v, "DATE: ");
  assert.equal(s2["E4"]?.v, "SEPTEMBER 26, 2026");
  assert.equal(s2["D5"]?.v, "RIS NO.");
  assert.equal(s2["D7"]?.v, "ITEM NO");
  assert.equal(s2["E7"]?.v, "ITEM DESCRIPTION");
});

test("processMonthlyInventoryData reconciles 6-stage flow and area programs accurately for the UI", () => {
  const inventoryRows = [
    {
      quantity: 100,
      batch_number: "LOT-RABIES-01",
      expiration_date: "2027-05-30",
      medicine: {
        id: "med-rabies",
        generic_name: "Rabies Vaccine",
        dosage: "2.5 IU",
        brand_name: "Verorab",
        unit_of_measure: "Vial",
        unit_cost: 400.0,
      },
    },
    {
      quantity: 50,
      batch_number: "LOT-AMOX-02",
      expiration_date: "2026-10-31",
      medicine: {
        id: "med-amox",
        generic_name: "Amoxicillin",
        dosage: "500mg",
        brand_name: "Amoxil",
        unit_of_measure: "Capsule",
        unit_cost: 5.0,
      },
    },
  ];

  const dispensingRows = [
    {
      medicine_id: "med-rabies",
      batch_number: "LOT-RABIES-01",
      quantity: 15,
      dispense_date: "2026-10-05T09:00:00Z",
    },
  ];

  const requestRows = [
    {
      status: "COMPLETED",
      approved_at: "2026-10-12T14:00:00Z",
      items: [
        {
          medicine_id: "med-rabies",
          batch_number: "LOT-RABIES-01",
          quantity: 10,
        },
      ],
    },
  ];

  const otherProgramsRows = [
    {
      status: "COMPLETED",
      program_name: "City Anti-Rabies Campaign",
      program_date: "2026-10-18T10:00:00Z",
      medicines: [
        {
          medicine_id: "med-rabies",
          quantity_used: 25,
        },
      ],
    },
  ];

  const { items, totals } = processMonthlyInventoryData({
    inventoryRows,
    dispensingRows,
    requestRows,
    otherProgramsRows,
    year: 2026,
    month: 10,
  });

  assert.equal(items.length, 2);

  // Rabies batch item checks:
  const rabiesItem = items.find((i) => i.lotNo === "LOT-RABIES-01");
  assert.ok(rabiesItem);
  assert.equal(rabiesItem.issuedQty, 25); // 15 walk-in + 10 request
  assert.equal(rabiesItem.issuedTotal, 25 * 400);
  assert.equal(rabiesItem.programQty, 25);
  assert.equal(rabiesItem.programTotal, 25 * 400);
  assert.equal(rabiesItem.programName, "CITY ANTI-RABIES CAMPAIGN");
  assert.equal(rabiesItem.remainingQty, 100);
  assert.equal(rabiesItem.remainingTotal, 100 * 400);
  // Reconciled Beginning = 100 (remaining) + 25 (issued) + 25 (program) = 150
  assert.equal(rabiesItem.beginningQty, 150);
  assert.equal(rabiesItem.begTotal, 150 * 400);

  // Totals verification
  assert.equal(totals.totalIssuedVal, 25 * 400);
  assert.equal(totals.totalProgVal, 25 * 400);
  assert.equal(totals.totalRemVal, (100 * 400) + (50 * 5));
  assert.equal(totals.totalBegVal, (150 * 400) + (50 * 5));
});

test("processMonthlyInventoryData identifies expired batches by expiration_date, routes to expiredQty, and clears remainingQty", () => {
  const inventoryRows = [
    {
      medicine_id: "med-expired",
      batch_number: "LOT-EXP-2026-01",
      quantity: 80,
      expiration_date: "2026-05-15", // Expired prior to October 2026
      date_received: "2026-01-10",
      medicine: {
        id: "med-expired",
        generic_name: "Amoxicillin",
        dosage: "500mg",
        brand_name: "Amoxil",
        unit_of_measure: "CAPSULE",
        unit_cost: 8.5,
      },
    },
    {
      medicine_id: "med-active",
      batch_number: "LOT-ACT-2027-01",
      quantity: 120,
      expiration_date: "2027-12-31", // Valid future date
      date_received: "2026-02-15",
      medicine: {
        id: "med-active",
        generic_name: "Paracetamol",
        dosage: "500mg",
        brand_name: "Biogesic",
        unit_of_measure: "TABLET",
        unit_cost: 3.0,
      },
    },
  ];

  const { items, totals } = processMonthlyInventoryData({
    inventoryRows,
    dispensingRows: [],
    requestRows: [],
    otherProgramsRows: [],
    year: 2026,
    month: 10,
  });

  assert.equal(items.length, 2);

  const expItem = items.find((i) => i.lotNo === "LOT-EXP-2026-01");
  assert.ok(expItem);
  assert.equal(expItem.expiredQty, 80);
  assert.equal(expItem.expiredTotal, 80 * 8.5);
  assert.equal(expItem.remainingQty, 0);
  assert.equal(expItem.remainingTotal, 0);
  assert.equal(expItem.beginningQty, 80); // Reconciled: 0 + 0 + 0 + 80 - 0 = 80
  assert.equal(expItem.begTotal, 80 * 8.5);

  const activeItem = items.find((i) => i.lotNo === "LOT-ACT-2027-01");
  assert.ok(activeItem);
  assert.equal(activeItem.expiredQty, 0);
  assert.equal(activeItem.expiredTotal, 0);
  assert.equal(activeItem.remainingQty, 120);
  assert.equal(activeItem.remainingTotal, 120 * 3.0);
  assert.equal(activeItem.beginningQty, 120);

  // Totals verification
  assert.equal(totals.totalExpiredVal, 80 * 8.5);
  assert.equal(totals.totalRemVal, 120 * 3.0);
  assert.equal(totals.totalBegVal, (80 * 8.5) + (120 * 3.0));
});

test("processMonthlyInventoryData consolidates duplicate inventory entries of the same batch into a single row", () => {
  // Simulates fragmented entries like the ones from the user's report (10 rows across facilities/deliveries)
  const inventoryRows = [
    // 3 entries for Acetylcysteine 200mg (Lot 4324FA4) -> 110 + 20 + 39 = 169
    {
      medicine_id: "med-acetyl-200",
      batch_number: "4324FA4",
      quantity: 110,
      expiration_date: "2026-12-31",
      medicine: { id: "med-acetyl-200", generic_name: "Acetylcysteine", dosage: "200 mg", unit_of_measure: "TABLET", unit_cost: 11 },
    },
    {
      medicine_id: "med-acetyl-200",
      batch_number: "4324FA4",
      quantity: 20,
      expiration_date: "2026-12-31",
      medicine: { id: "med-acetyl-200", generic_name: "Acetylcysteine", dosage: "200 mg", unit_of_measure: "TABLET", unit_cost: 11 },
    },
    {
      medicine_id: "med-acetyl-200",
      batch_number: "4324FA4",
      quantity: 39,
      expiration_date: "2026-12-31",
      medicine: { id: "med-acetyl-200", generic_name: "Acetylcysteine", dosage: "200 mg", unit_of_measure: "TABLET", unit_cost: 11 },
    },

    // 2 entries for Irbesartan 150mg (Lot FDCVA232) -> 143 + 67 = 210
    {
      medicine_id: "med-irbesartan-150",
      batch_number: "FDCVA232",
      quantity: 143,
      expiration_date: "2026-12-23",
      medicine: { id: "med-irbesartan-150", generic_name: "Irbesartan", dosage: "150 mg", unit_of_measure: "TABLET", unit_cost: 6 },
    },
    {
      medicine_id: "med-irbesartan-150",
      batch_number: "FDCVA232",
      quantity: 67,
      expiration_date: "2026-12-23",
      medicine: { id: "med-irbesartan-150", generic_name: "Irbesartan", dosage: "150 mg", unit_of_measure: "TABLET", unit_cost: 6 },
    },

    // 3 entries for Amoxicillin Trihydrate 500mg (Lot 445FG2A, Expired 2026-09-30) -> 21 + 200 + 259 = 480
    {
      medicine_id: "med-amox-500",
      batch_number: "445FG2A",
      quantity: 21,
      expiration_date: "2026-09-30",
      medicine: { id: "med-amox-500", generic_name: "Amoxicillin Trihydrate", dosage: "500 mg", unit_of_measure: "CAPSULE", unit_cost: 4 },
    },
    {
      medicine_id: "med-amox-500",
      batch_number: "445FG2A",
      quantity: 200,
      expiration_date: "2026-09-30",
      medicine: { id: "med-amox-500", generic_name: "Amoxicillin Trihydrate", dosage: "500 mg", unit_of_measure: "CAPSULE", unit_cost: 4 },
    },
    {
      medicine_id: "med-amox-500",
      batch_number: "445FG2A",
      quantity: 259,
      expiration_date: "2026-09-30",
      medicine: { id: "med-amox-500", generic_name: "Amoxicillin Trihydrate", dosage: "500 mg", unit_of_measure: "CAPSULE", unit_cost: 4 },
    },

    // 1 entry for Acetylcysteine 600mg (Lot F3FFG54) -> 500
    {
      medicine_id: "med-acetyl-600",
      batch_number: "F3FFG54",
      quantity: 500,
      expiration_date: "2026-10-31",
      medicine: { id: "med-acetyl-600", generic_name: "Acetylcysteine", dosage: "600 mg", unit_of_measure: "SACHET", unit_cost: 24 },
    },

    // 1 entry for Amoxicillin Trihydrate 500mg (Lot FE3242G5) -> 500
    {
      medicine_id: "med-amox-500",
      batch_number: "FE3242G5",
      quantity: 500,
      expiration_date: "2026-10-03",
      medicine: { id: "med-amox-500", generic_name: "Amoxicillin Trihydrate", dosage: "500 mg", unit_of_measure: "CAPSULE", unit_cost: 4 },
    },
  ];

  // Consolidate directly test
  const consolidated = consolidateInventoryRows(inventoryRows);
  assert.equal(consolidated.length, 5, "10 fragmented rows must consolidate down to 5 distinct batches");

  // Reconciled monthly process test
  const { items, totals } = processMonthlyInventoryData({
    inventoryRows,
    dispensingRows: [],
    requestRows: [],
    otherProgramsRows: [],
    year: 2026,
    month: 10,
  });

  assert.equal(items.length, 5, "Should have exactly 5 rows in monthly report items");

  // Check Acetylcysteine 200mg batch (4324FA4)
  const acetyl200 = items.find((i) => i.lotNo === "4324FA4");
  assert.ok(acetyl200);
  assert.equal(acetyl200.remainingQty, 169);
  assert.equal(acetyl200.beginningQty, 169);
  assert.equal(acetyl200.unitCost, 11);
  assert.equal(acetyl200.remainingTotal, 169 * 11);

  // Check Irbesartan 150mg batch (FDCVA232)
  const irbesartan = items.find((i) => i.lotNo === "FDCVA232");
  assert.ok(irbesartan);
  assert.equal(irbesartan.remainingQty, 210);
  assert.equal(irbesartan.beginningQty, 210);
  assert.equal(irbesartan.unitCost, 6);
  assert.equal(irbesartan.remainingTotal, 210 * 6);

  // Check Amoxicillin 500mg expired batch (445FG2A)
  const amoxExpired = items.find((i) => i.lotNo === "445FG2A");
  assert.ok(amoxExpired);
  assert.equal(amoxExpired.expiredQty, 480);
  assert.equal(amoxExpired.remainingQty, 0);
  assert.equal(amoxExpired.beginningQty, 480);
  assert.equal(amoxExpired.unitCost, 4);
  assert.equal(amoxExpired.expiredTotal, 480 * 4);

  // Verify total beginning stock valuation equals all 5 consolidated batches combined
  const expectedTotalBeg = (169 * 11) + (210 * 6) + (480 * 4) + (500 * 24) + (500 * 4);
  assert.equal(totals.totalBegVal, expectedTotalBeg);
});





