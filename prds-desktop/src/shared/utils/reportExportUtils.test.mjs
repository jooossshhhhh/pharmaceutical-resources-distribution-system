import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  buildDailyRisWorkbook,
  buildDailyRisBuffer,
  buildMonthlyInventoryWorkbook,
  buildMonthlyInventoryBuffer,
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
      expiration_date: "2026-05-15",
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
  assert.equal(sheet["H7"]?.v, "2026-05-15"); // EXPIRY DATE
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
  assert.equal(sheet["C5"]?.v, "MONTH : OCTOBER 31, 2026");
  assert.ok(sheet["I5"]?.v.includes("SEPTEMBER 30, 2026"));
  assert.ok(sheet["AG5"]?.v.includes("OCTOBER 31, 2026"));

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


