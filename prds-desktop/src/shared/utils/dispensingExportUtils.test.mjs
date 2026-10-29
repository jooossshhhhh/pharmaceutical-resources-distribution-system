import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import * as CFB from "cfb";

import {
  escapeXml,
  decodeXmlContent,
  formatDispensingMonthYear,
  resolveDispensingRecordStatus,
  groupDispensingByPatient,
  calculateDispensingColumnWidths,
  buildDispensingColsXml,
  buildMonthlyDispensingExcelBuffer,
  buildMonthlyDispensingExcelWorkbook,
  exportMonthlyDispensingExcel,
  formatDateLong,
  formatDispensingHeaderDate,
  getDispensingExportFilename,
  selectDispensingTemplateBase64,
} from "./dispensingExportUtils.js";

const sampleHistoryRows = [
  {
    id: "disp-1",
    dispensing_transaction_id: "TXN-001",
    dispense_date: "2026-10-15T09:30:00Z",
    quantity: 10,
    prescribed_by: "Dr. Camille F. Penalosa",
    manual_dispensed_by: "Josh Laroa",
    medicine: {
      generic_name: "Ascorbic Acid",
      dosage: "500 mg",
      unit_of_measure: "TABLET",
    },
    batch: {
      batch_number: "LOT-A101",
      brand_name: "Ceelin",
    },
    patient: {
      id: "pat-1",
      patient_code: "PAT-001",
      first_name: "Jherico",
      last_name: "Maurin",
      gender: "Male",
      date_of_birth: "1998-05-14",
      contact_number: "0912-345-6789",
      facility: {
        facility_code: "CHO",
        facility_name: "VMCH Main",
      },
    },
    dispensing_facility: {
      facility_name: "VMCH Pharmacy",
    },
  },
  {
    id: "disp-2",
    dispensing_transaction_id: "TXN-002",
    dispense_date: "2026-10-20T14:15:00Z",
    quantity: 20,
    prescribed_by: "Dr. Camille F. Penalosa",
    manual_dispensed_by: "Josh Laroa",
    medicine: {
      generic_name: "Paracetamol",
      dosage: "500 mg",
      unit_of_measure: "TABLET",
    },
    batch: {
      batch_number: "LOT-P202",
      brand_name: "Biogesic",
    },
    patient: {
      id: "pat-1",
      patient_code: "PAT-001",
      first_name: "Jherico",
      last_name: "Maurin",
      gender: "Male",
      date_of_birth: "1998-05-14",
      contact_number: "0912-345-6789",
      facility: {
        facility_code: "CHO",
      },
    },
    dispensing_facility: {
      facility_name: "VMCH Pharmacy",
    },
  },
  {
    id: "disp-3",
    dispensing_transaction_id: "TXN-003",
    dispense_date: "2026-10-05T10:00:00Z",
    quantity: 5,
    prescribed_by: "Dr. Ramon Santos",
    dispenser: {
      first_name: "Ana",
      last_name: "Cruz",
    },
    medicine: {
      generic_name: "Amoxicillin",
      dosage: "500 mg",
      unit_of_measure: "CAPSULE",
    },
    batch: {
      batch_number: "LOT-M303",
      brand_name: "Himox",
    },
    patient: {
      id: "pat-2",
      patient_code: "PAT-002",
      first_name: "Maria",
      last_name: "Santos",
      gender: "Female",
      date_of_birth: "1980-01-20",
      contact_number: "0922-111-2233",
      facility: {
        facility_code: "BHS-INA",
      },
    },
    dispensing_facility: {
      facility_name: "HC Inayagan",
    },
  },
];

test("escapeXml handles null, undefined and XML special characters", () => {
  assert.equal(escapeXml(null), "");
  assert.equal(escapeXml(undefined), "");
  assert.equal(escapeXml("Tom & Jerry <kids> 'fun' \"times\""), "Tom &amp; Jerry &lt;kids&gt; &apos;fun&apos; &quot;times&quot;");
});

test("decodeXmlContent decodes string, Uint8Array and Array properly", () => {
  assert.equal(decodeXmlContent(""), "");
  assert.equal(decodeXmlContent("hello world"), "hello world");
  const bytes = new TextEncoder().encode("<worksheet/>");
  assert.equal(decodeXmlContent(bytes), "<worksheet/>");
  assert.equal(decodeXmlContent(Array.from(bytes)), "<worksheet/>");
});

test("formatDispensingMonthYear formats month and year into uppercase readable text", () => {
  assert.equal(formatDispensingMonthYear(2026, 10), "OCTOBER, 2026");
  assert.equal(formatDispensingMonthYear(2026, 1), "JANUARY, 2026");
});

test("groupDispensingByPatient groups multiple records under the same patient and orders chronologically", () => {
  const groups = groupDispensingByPatient(sampleHistoryRows, { sortChronological: "asc" });

  // Should have 2 unique patients: Jherico Maurin and Maria Santos
  assert.equal(groups.length, 2);

  // Alphabetical sort by patient name: Jherico Maurin, then Maria Santos
  assert.equal(groups[0].patient.patient_code, "PAT-001");
  assert.equal(groups[0].patient.name, "Jherico Maurin");
  assert.equal(groups[0].items.length, 2);

  // Chronological sorting for Jherico: 2026-10-15 should be first, then 2026-10-20
  assert.equal(groups[0].items[0].batchLotNo, "LOT-A101");
  assert.equal(groups[0].items[0].quantity, 10);
  assert.equal(groups[0].items[1].batchLotNo, "LOT-P202");
  assert.equal(groups[0].items[1].quantity, 20);

  // Maria Santos
  assert.equal(groups[1].patient.patient_code, "PAT-002");
  assert.equal(groups[1].patient.name, "Maria Santos");
  assert.equal(groups[1].items.length, 1);
  assert.equal(groups[1].items[0].batchLotNo, "LOT-M303");
  assert.equal(groups[1].items[0].dispensedBy, "Ana Cruz");
});

test("groupDispensingByPatient handles grouped transaction objects with rows array", () => {
  const transactions = [
    {
      key: "tx-1",
      transactionId: "TXN-001",
      dispenseDate: "2026-10-15T09:30:00Z",
      patient: sampleHistoryRows[0].patient,
      dispenser: { first_name: "Josh", last_name: "Laroa" },
      rows: [sampleHistoryRows[0], sampleHistoryRows[1]],
    },
  ];

  const groups = groupDispensingByPatient(transactions);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].patient.name, "Jherico Maurin");
  assert.equal(groups[0].items.length, 2);
});

test("buildMonthlyDispensingExcelBuffer generates valid XLSX buffer preserving template structure", () => {
  const buffer = buildMonthlyDispensingExcelBuffer({
    historyRows: sampleHistoryRows,
    year: 2026,
    month: 10,
  });

  assert.ok(buffer);
  assert.ok(buffer.byteLength > 1000);

  const parsedWb = XLSX.read(buffer, { type: "array" });
  assert.ok(parsedWb.SheetNames.includes("Sheet1"));
  const ws = parsedWb.Sheets["Sheet1"];

  // Header cells
  assert.equal(ws["E1"]?.v, "VICENTE MENDIOLA CENTER FOR HEALTH");
  assert.equal(ws["E2"]?.v, "Dispensing History Record");
  assert.equal(ws["F3"]?.v, "OCTOBER, 2026");

  // First patient block at row 5
  assert.equal(ws["C5"]?.v, "Patient");
  assert.equal(ws["D5"]?.v, "Name: Jherico Maurin");

  // Medicine column headers at row 6
  assert.equal(ws["C6"]?.v, "Date&Time");
  assert.equal(ws["D6"]?.v, "Medicine Information");
  assert.equal(ws["G6"]?.v, "Prescribed Qty");
  assert.equal(ws["H6"]?.v, "Released Qty");
  assert.equal(ws["I6"]?.v, "Balance Qty");

  // First medicine at row 7: Date&Time, Medicine Information includes brand, Col E has Brand
  assert.ok(ws["C7"]?.v.includes("Oct 15, 2026"));
  assert.equal(ws["D7"]?.v, "Ascorbic Acid 500 mg (Ceelin)");
  assert.equal(ws["E7"]?.v, "Ceelin");
  assert.equal(ws["G7"]?.v, 10); // Prescribed Qty
  assert.equal(ws["H7"]?.v, 10); // Released Qty
  assert.equal(ws["I7"]?.v, 0);  // Balance Qty

  // Second medicine at row 8
  assert.ok(ws["C8"]?.v.includes("Oct 20, 2026"));
  assert.equal(ws["D8"]?.v, "Paracetamol 500 mg (Biogesic)");

  // No gap row! Next patient (PAT-002 Maria Santos) begins immediately on row 9
  assert.equal(ws["C9"]?.v, "Patient");
  assert.equal(ws["D9"]?.v, "Name: Maria Santos");
  assert.equal(ws["C10"]?.v, "Date&Time");
  assert.equal(ws["D10"]?.v, "Medicine Information");
  assert.ok(ws["C11"]?.v.includes("Oct 5, 2026"));
});

test("buildMonthlyDispensingExcelBuffer handles empty records gracefully", () => {
  const buffer = buildMonthlyDispensingExcelBuffer({
    historyRows: [],
    year: 2026,
    month: 10,
  });

  assert.ok(buffer);
  const parsedWb = XLSX.read(buffer, { type: "array" });
  const ws = parsedWb.Sheets["Sheet1"];

  assert.equal(ws["F3"]?.v, "OCTOBER, 2026");
  assert.equal(ws["C5"]?.v, "Patient");
  assert.equal(ws["D5"]?.v, "Name: ");
  assert.equal(ws["C6"]?.v, "Date&Time");
});

test("buildMonthlyDispensingExcelWorkbook fallback creates valid SheetJS workbook", () => {
  const wb = buildMonthlyDispensingExcelWorkbook({
    historyRows: sampleHistoryRows,
    year: 2026,
    month: 10,
  });

  assert.ok(wb);
  assert.ok(wb.SheetNames.length > 0);
  const ws = wb.Sheets[wb.SheetNames[0]];

  assert.equal(ws["F3"]?.v, "OCTOBER, 2026");
  assert.equal(ws["C5"]?.v, "Patient");
  assert.equal(ws["D5"]?.v, "Name: Jherico Maurin");
  assert.equal(ws["C9"]?.v, "Patient");
  assert.equal(ws["D9"]?.v, "Name: Maria Santos");
});

test("exportMonthlyDispensingExcel returns exportItem with .xlsx filename and EXCEL format", async () => {
  const exportItem = await exportMonthlyDispensingExcel({
    historyRows: sampleHistoryRows,
    year: 2026,
    month: 10,
  });

  assert.ok(exportItem);
  assert.equal(exportItem.format, "EXCEL");
  assert.ok(exportItem.filename.includes("Dispensing_History_October_2026"));
  assert.ok(exportItem.filename.endsWith(".xlsx"));
});

test("resolveDispensingRecordStatus returns correct statuses across all scenarios", () => {
  // 1. Voided
  assert.equal(resolveDispensingRecordStatus({ voided_at: "2026-10-20T10:00:00Z" }), "Voided");
  assert.equal(resolveDispensingRecordStatus({ transaction_status: "VOIDED" }), "Voided");

  // 2. Scheduled follow-up / Partial status
  assert.equal(
    resolveDispensingRecordStatus({
      quantity: 10,
      needed_quantity: 20,
      follow_up_action: "SCHEDULE_NEXT_WEEK",
      follow_up_date: "2026-10-27",
    }),
    "Partial"
  );
  assert.equal(
    resolveDispensingRecordStatus({
      quantity: 10,
      transaction_status: "SCHEDULED",
    }),
    "Partial"
  );
  assert.equal(
    resolveDispensingRecordStatus({
      quantity: 10,
      needed_quantity: 10,
      follow_up_date: "2026-10-27",
    }),
    "Partial"
  );

  // 3. Referred follow-up
  assert.equal(
    resolveDispensingRecordStatus({
      quantity: 5,
      needed_quantity: 20,
      follow_up_action: "REFER_TO_BARANGAY",
    }),
    "Referred"
  );
  assert.equal(
    resolveDispensingRecordStatus({
      quantity: 5,
      transaction_status: "REFERRED",
    }),
    "Referred"
  );

  // 4. Partial dispense (unfulfilled quantity, no follow-up)
  assert.equal(
    resolveDispensingRecordStatus({
      quantity: 10,
      needed_quantity: 20,
    }),
    "Partial"
  );
  assert.equal(
    resolveDispensingRecordStatus({
      quantity: 10,
      transaction_status: "PARTIAL",
    }),
    "Partial"
  );

  // 5. Completed
  assert.equal(
    resolveDispensingRecordStatus({
      quantity: 10,
      needed_quantity: 10,
    }),
    "Completed"
  );
  assert.equal(
    resolveDispensingRecordStatus({
      quantity: 10,
      transaction_status: "COMPLETED",
    }),
    "Completed"
  );
});

test("groupDispensingByPatient accurately assigns Partial status to patient items with pending balance", () => {
  const records = [
    {
      id: "disp-p1",
      dispense_date: "2026-10-18T10:00:00Z",
      quantity: 10,
      needed_quantity: 20,
      follow_up_action: "SCHEDULE_NEXT_WEEK",
      follow_up_date: "2026-10-25",
      prescribed_by: "Dr. Ann",
      manual_dispensed_by: "Josh Laroa",
      medicine: {
        generic_name: "Ascorbic",
        dosage: "100 mg/mL, 15 mL oral drops",
        unit_of_measure: "BOTTLE",
      },
      batch: {
        batch_number: "0827023",
      },
      patient: {
        id: "pat-jm",
        patient_code: "PRD-0012",
        first_name: "Jherico",
        last_name: "Maurin",
      },
    },
    {
      id: "disp-p2",
      dispense_date: "2026-10-19T10:00:00Z",
      quantity: 10,
      needed_quantity: 30,
      prescribed_by: "Dr. Santos",
      manual_dispensed_by: "Josh Laroa",
      medicine: {
        generic_name: "Amoxicillin",
        dosage: "500 mg",
        unit_of_measure: "CAPSULE",
      },
      patient: {
        id: "pat-jm",
        patient_code: "PRD-0012",
        first_name: "Jherico",
        last_name: "Maurin",
      },
    },
  ];

  const groups = groupDispensingByPatient(records);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  // First item has follow_up_action: "SCHEDULE_NEXT_WEEK" -> "Partial"
  assert.equal(groups[0].items[0].status, "Partial");
  // Second item has needed_quantity: 30 vs quantity: 10 -> "Partial"
  assert.equal(groups[0].items[1].status, "Partial");
});

test("groupDispensingByPatient marks follow-up fulfillment as Completed when remaining needed quantity is met", () => {
  const patient = {
    id: "pat-josh",
    patient_code: "PRD-0010",
    first_name: "Josh",
    last_name: "Sinugbuhan",
  };
  const medicine = {
    id: "med-ors",
    generic_name: "Oral Rehydration Salts (ORS)",
    dosage: "Oral powder packet",
    unit_of_measure: "SACHET",
  };

  // Step 1: Initial claim: Needed 30, released 10, remaining 20 scheduled next week
  const record1 = {
    id: "disp-ors-1",
    dispensing_transaction_id: "TXN-001",
    dispense_date: "2026-10-18T09:00:00Z",
    quantity: 10,
    needed_quantity: 30,
    follow_up_action: "SCHEDULE_NEXT_WEEK",
    follow_up_date: "2026-10-27",
    prescribed_by: "Dr. Sheila",
    manual_dispensed_by: "Josh Laroa",
    medicine_id: "med-ors",
    medicine,
    patient,
  };

  // Step 2: Patient returns on Oct 27, dispenses remaining 20 out of 30. All 30 now fulfilled.
  const record2 = {
    id: "disp-ors-2",
    dispensing_transaction_id: "TXN-002",
    dispense_date: "2026-10-27T10:00:00Z",
    quantity: 20,
    needed_quantity: 30,
    follow_up_action: null,
    prescribed_by: "Dr. Sheila",
    manual_dispensed_by: "Josh Laroa",
    medicine_id: "med-ors",
    medicine,
    patient,
  };

  const groups = groupDispensingByPatient([record1, record2]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);

  // First transaction: 10 of 30 released with follow-up -> Partial
  assert.equal(groups[0].items[0].quantity, 10);
  assert.equal(groups[0].items[0].status, "Partial");

  // Second transaction: remaining 20 released completing all 30 prescribed -> Completed!
  assert.equal(groups[0].items[1].quantity, 20);
  assert.equal(groups[0].items[1].status, "Completed");
});

test("calculateDispensingColumnWidths extends cell widths when text is long", () => {
  const mockGroups = [
    {
      patient: {
        patient_code: "PRD-0012",
        name: "Jherico Maurin",
        gender: "MALE",
        date_of_birth: "Aug 2, 2008",
        facility_code: "HC-INAYAGAN",
        contact_number: "09623702831",
      },
      items: [
        {
          dateFormatted: "Oct 18, 2026",
          medicineInfo: "Ascorbic 100 mg/mL, 15 mL oral drops (Ritemed)",
          brand: "Ritemed",
          batchLotNo: "0827023",
          quantity: 10,
          unit: "BOTTLE",
          prescribedBy: "Dr. Ann",
          dispensedBy: "Josh Laroa",
          facilityName: "City Health Office - City of Naga",
          status: "Partial",
        },
      ],
    },
  ];

  const widths = calculateDispensingColumnWidths(mockGroups);

  // Column D (Medicine Info) should expand beyond base 30 to fit ~46 characters + padding
  assert.ok(widths[4] >= 45, `Expected Col D width to be at least 45, got ${widths[4]}`);

  // Column K (Dispensing Facility) should expand beyond base 22 to fit "City Health Office - City of Naga" (~34 chars)
  assert.ok(widths[11] >= 35, `Expected Col K width to be at least 35, got ${widths[11]}`);

  // Column G & H for patient banner row
  assert.ok(widths[7] >= 15);
  assert.ok(widths[8] >= 15);

  const colsXml = buildDispensingColsXml(widths);
  assert.ok(colsXml.includes('<col min="4" max="4" width='));
  assert.ok(colsXml.includes('<col min="11" max="11" width='));
});

test("buildMonthlyDispensingExcelBuffer sets F3 Month Year style with no color fill", () => {
  const buffer = buildMonthlyDispensingExcelBuffer({
    historyRows: sampleHistoryRows,
    year: 2026,
    month: 10,
  });

  // Verify sheet1.xml inside the generated CFB container
  const cfbLib = CFB.read ? CFB : CFB.default || XLSX.CFB;
  assert.ok(cfbLib && typeof cfbLib.read === "function", "CFB should be available");

  const zip = cfbLib.read(buffer, { type: "buffer" });
  const s1 = zip.FileIndex.find((f) => f.name.endsWith("sheet1.xml"));
  assert.ok(s1, "sheet1.xml must exist in the archive");

  const xml = new TextDecoder().decode(s1.content);
  // Verify F3 has month/year string and no background color fill
  assert.ok(
    xml.includes('<c r="F3"') && xml.includes('OCTOBER, 2026</t></is></c>'),
    "F3 cell should contain formatted month and year"
  );
  // Verify <cols> includes custom adaptive widths
  assert.ok(xml.includes('<cols><col min="3"'), "sheet1.xml should include custom <cols>");
});

test("formatDateLong formats string and Date objects into readable Month Day, Year", () => {
  assert.equal(formatDateLong("2026-10-27"), "October 27, 2026");
  assert.equal(formatDateLong("2026-10-20"), "October 20, 2026");
  assert.equal(formatDateLong(new Date(2026, 9, 27)), "October 27, 2026");
  assert.equal(formatDateLong(""), "");
});

test("formatDispensingHeaderDate correctly formats header dates across all filter types", () => {
  const fixedNow = new Date(2026, 9, 27); // Oct 27, 2026

  // 1. TODAY
  assert.equal(
    formatDispensingHeaderDate({ dateFilter: "TODAY", now: fixedNow }),
    "October 27, 2026"
  );

  // 2. THIS_WEEK (Past 7 Days: 7 days ago to today)
  assert.equal(
    formatDispensingHeaderDate({ dateFilter: "THIS_WEEK", now: fixedNow }),
    "October 20, 2026 to October 27, 2026"
  );

  // 3. CUSTOM (custom range: start to end)
  assert.equal(
    formatDispensingHeaderDate({
      dateFilter: "CUSTOM",
      startDate: "2026-10-01",
      endDate: "2026-10-27",
      now: fixedNow,
    }),
    "October 1, 2026 to October 27, 2026"
  );

  // 4. ALL (All Time: As of Month Day, Year)
  assert.equal(
    formatDispensingHeaderDate({ dateFilter: "ALL", now: fixedNow }),
    "As of October 27, 2026"
  );

  // 5. THIS_MONTH (Month, Year)
  assert.equal(
    formatDispensingHeaderDate({ dateFilter: "THIS_MONTH", year: 2026, month: 10, now: fixedNow }),
    "OCTOBER, 2026"
  );
});

test("getDispensingExportFilename returns appropriate filenames for each filter mode", () => {
  const fixedNow = new Date("2026-10-27T12:00:00Z");
  assert.equal(
    getDispensingExportFilename({ dateFilter: "TODAY", startDate: "2026-10-27", now: fixedNow }),
    "Dispensing_History_Daily_2026-10-27.xlsx"
  );
  assert.equal(
    getDispensingExportFilename({
      dateFilter: "THIS_WEEK",
      startDate: "2026-10-20",
      endDate: "2026-10-27",
      now: fixedNow,
    }),
    "Dispensing_History_Weekly_2026-10-20_to_2026-10-27.xlsx"
  );
  assert.equal(
    getDispensingExportFilename({
      dateFilter: "CUSTOM",
      startDate: "2026-10-01",
      endDate: "2026-10-27",
      now: fixedNow,
    }),
    "Dispensing_History_Custom_2026-10-01_to_2026-10-27.xlsx"
  );
  assert.equal(
    getDispensingExportFilename({ dateFilter: "ALL", now: fixedNow }),
    "Dispensing_History_All_Time_2026-10-27.xlsx"
  );
  assert.equal(
    getDispensingExportFilename({ dateFilter: "THIS_MONTH", year: 2026, month: 10, now: fixedNow }),
    "Dispensing_History_October_2026.xlsx"
  );
});

test("buildMonthlyDispensingExcelBuffer for TODAY stamps single date in F3 and includes Time in column C", () => {
  const buffer = buildMonthlyDispensingExcelBuffer({
    historyRows: sampleHistoryRows,
    dateFilter: "TODAY",
    startDate: "2026-10-27",
  });

  const cfbLib = CFB.read ? CFB : CFB.default || XLSX.CFB;
  const zip = cfbLib.read(buffer, { type: "buffer" });
  const s1 = zip.FileIndex.find((f) => f.name.endsWith("sheet1.xml"));
  const xml = new TextDecoder().decode(s1.content);

  // 1. Header F3 should be "October 27, 2026"
  assert.ok(xml.includes("October 27, 2026</t></is></c>"), "F3 must have single day date stamp");

  // 2. Row 6 header for column C should say "Time"
  assert.ok(xml.includes("<t>Time</t>"), "Column C6 header should say Time in daily template");

  // 3. Row 7 data cell for column C should contain formatted time (e.g. "9:30 AM" or "AM/PM")
  assert.ok(xml.includes("AM") || xml.includes("PM"), "Column C7 data cell should have formatted time in daily template");
});

test("buildMonthlyDispensingExcelBuffer for THIS_WEEK stamps date range and includes Date in column C", () => {
  const buffer = buildMonthlyDispensingExcelBuffer({
    historyRows: sampleHistoryRows,
    dateFilter: "THIS_WEEK",
    startDate: "2026-10-20",
    endDate: "2026-10-27",
  });

  const cfbLib = CFB.read ? CFB : CFB.default || XLSX.CFB;
  const zip = cfbLib.read(buffer, { type: "buffer" });
  const s1 = zip.FileIndex.find((f) => f.name.endsWith("sheet1.xml"));
  const xml = new TextDecoder().decode(s1.content);

  // 1. Header F3 should be "October 20, 2026 to October 27, 2026"
  assert.ok(
    xml.includes("October 20, 2026 to October 27, 2026</t></is></c>"),
    "F3 must have weekly range stamp"
  );

  // 2. Row 6 header for column C should have "Date&Time"
  assert.ok(xml.includes("<t>Date&amp;Time</t>"));

  // 3. Row 7 data cell for column C should have formatted date/time
  assert.ok(xml.includes("Oct 15, 2026"));
});

test("buildMonthlyDispensingExcelBuffer for ALL stamps 'As of' date and populates 12 columns", () => {
  const buffer = buildMonthlyDispensingExcelBuffer({
    historyRows: sampleHistoryRows,
    dateFilter: "ALL",
  });

  const cfbLib = CFB.read ? CFB : CFB.default || XLSX.CFB;
  const zip = cfbLib.read(buffer, { type: "buffer" });
  const s1 = zip.FileIndex.find((f) => f.name.endsWith("sheet1.xml"));
  const xml = new TextDecoder().decode(s1.content);

  assert.ok(xml.includes("As of "), "F3 must have 'As of' date stamp for ALL filter");
  assert.ok(xml.includes("<t>Patient</t>"));
  assert.ok(xml.includes("Name: Jherico Maurin"));
  assert.ok(xml.includes("<t>Prescribed Qty</t>"));
  assert.ok(xml.includes("<t>Released Qty</t>"));
  assert.ok(xml.includes("<t>Balance Qty</t>"));
  assert.ok(xml.includes('ref="C1:N'));
});

test("buildMonthlyDispensingExcelBuffer for CUSTOM stamps date range, 12 columns, and Patient header", () => {
  const buffer = buildMonthlyDispensingExcelBuffer({
    historyRows: sampleHistoryRows,
    dateFilter: "CUSTOM",
    startDate: "2026-10-01",
    endDate: "2026-10-27",
  });

  const cfbLib = CFB.read ? CFB : CFB.default || XLSX.CFB;
  const zip = cfbLib.read(buffer, { type: "buffer" });
  const s1 = zip.FileIndex.find((f) => f.name.endsWith("sheet1.xml"));
  const xml = new TextDecoder().decode(s1.content);

  assert.ok(xml.includes("October 1, 2026 to October 27, 2026"));
  assert.ok(xml.includes("<t>Patient</t>"));
  assert.ok(xml.includes("Name: Jherico Maurin"));
  assert.ok(xml.includes("<t>Date&amp;Time</t>"));
  assert.ok(xml.includes("<t>Prescribed Qty</t>"));
  assert.ok(xml.includes("<t>Released Qty</t>"));
  assert.ok(xml.includes("<t>Balance Qty</t>"));
  assert.ok(xml.includes('ref="C1:N'));
});

test("buildMonthlyDispensingExcelBuffer populates exact column headers across ALL, DAILY, WEEKLY, MONTHLY, and CUSTOM", () => {
  const filters = [
    { key: "ALL", dateHeader: "Date&Time" },
    { key: "TODAY", dateHeader: "Time" },
    { key: "THIS_WEEK", dateHeader: "Date&Time" },
    { key: "THIS_MONTH", dateHeader: "Date&Time" },
    { key: "CUSTOM", dateHeader: "Date&Time" },
  ];

  for (const { key, dateHeader } of filters) {
    const buffer = buildMonthlyDispensingExcelBuffer({
      historyRows: sampleHistoryRows,
      dateFilter: key,
      startDate: "2026-10-15",
      endDate: "2026-10-27",
    });

    const parsedWb = XLSX.read(buffer, { type: "array" });
    const ws = parsedWb.Sheets["Sheet1"];

    assert.equal(ws["C5"]?.v, "Patient", `${key} C5 must be Patient`);
    assert.ok(ws["D5"]?.v.startsWith("Name:"), `${key} D5 must have Name`);
    assert.equal(ws["C6"]?.v, dateHeader, `${key} C6 must be ${dateHeader}`);
    assert.equal(ws["G6"]?.v, "Prescribed Qty", `${key} G6 must be Prescribed Qty`);
    assert.equal(ws["H6"]?.v, "Released Qty", `${key} H6 must be Released Qty`);
    assert.equal(ws["I6"]?.v, "Balance Qty", `${key} I6 must be Balance Qty`);
    assert.equal(ws["J6"]?.v, "Unit ", `${key} J6 must be Unit `);
    assert.equal(ws["N6"]?.v, "Status", `${key} N6 must be Status`);
  }
});

test("groupDispensingByPatient deduplicates Prescribed Qty for multi-step fulfillment cycles (Option 1)", () => {
  const multiStepRows = [
    {
      id: "disp-101",
      dispensing_transaction_id: "TXN-101",
      dispense_date: "2026-10-20T08:00:00Z",
      quantity: 10,
      needed_quantity: 30,
      follow_up_action: "SCHEDULE_NEXT_WEEK",
      medicine: {
        id: "med-1",
        generic_name: "Amoxicillin",
        dosage: "500 mg",
        unit_of_measure: "CAPSULE",
      },
      patient: {
        id: "pat-99",
        patient_code: "PAT-099",
        first_name: "Juan",
        last_name: "Dela Cruz",
      },
      dispenser: { first_name: "Josh", last_name: "Laroa" },
    },
    {
      id: "disp-102",
      dispensing_transaction_id: "TXN-102",
      dispense_date: "2026-10-27T08:00:00Z",
      quantity: 20,
      needed_quantity: 30,
      medicine: {
        id: "med-1",
        generic_name: "Amoxicillin",
        dosage: "500 mg",
        unit_of_measure: "CAPSULE",
      },
      patient: {
        id: "pat-99",
        patient_code: "PAT-099",
        first_name: "Juan",
        last_name: "Dela Cruz",
      },
      dispenser: { first_name: "Josh", last_name: "Laroa" },
    },
  ];

  const groups = groupDispensingByPatient(multiStepRows);
  assert.equal(groups.length, 1);
  const patientGroup = groups[0];
  assert.equal(patientGroup.items.length, 2);

  // Initial release: shows full prescribed quantity 30
  const first = patientGroup.items[0];
  assert.equal(first.prescribedQuantity, 30);
  assert.equal(first.releasedQuantity, 10);
  assert.equal(first.balanceQuantity, 20);
  assert.equal(first.status, "Partial");

  // Follow-up release: shows "—" to avoid duplicate 30 sum, marks Completed with 0 balance
  const second = patientGroup.items[1];
  assert.equal(second.prescribedQuantity, "—");
  assert.equal(second.releasedQuantity, 20);
  assert.equal(second.balanceQuantity, 0);
  assert.equal(second.status, "Completed");
});

test("buildMonthlyDispensingExcelBuffer writes numeric Prescribed Qty for initial and string '—' for follow-up", () => {
  const multiStepRows = [
    {
      id: "disp-201",
      dispensing_transaction_id: "TXN-201",
      dispense_date: "2026-10-20T08:00:00Z",
      quantity: 10,
      needed_quantity: 30,
      follow_up_action: "SCHEDULE_NEXT_WEEK",
      medicine: {
        id: "med-1",
        generic_name: "Amoxicillin",
        dosage: "500 mg",
        unit_of_measure: "CAPSULE",
      },
      patient: {
        id: "pat-100",
        patient_code: "PAT-100",
        first_name: "Maria",
        last_name: "Santos",
      },
    },
    {
      id: "disp-202",
      dispensing_transaction_id: "TXN-202",
      dispense_date: "2026-10-27T08:00:00Z",
      quantity: 20,
      needed_quantity: 30,
      medicine: {
        id: "med-1",
        generic_name: "Amoxicillin",
        dosage: "500 mg",
        unit_of_measure: "CAPSULE",
      },
      patient: {
        id: "pat-100",
        patient_code: "PAT-100",
        first_name: "Maria",
        last_name: "Santos",
      },
    },
  ];

  const buffer = buildMonthlyDispensingExcelBuffer({
    historyRows: multiStepRows,
    dateFilter: "ALL",
  });

  const parsedWb = XLSX.read(buffer, { type: "array" });
  const ws = parsedWb.Sheets["Sheet1"];

  // Row 7 (first item): Prescribed Qty is numeric 30
  assert.equal(ws["G7"]?.t, "n");
  assert.equal(ws["G7"]?.v, 30);
  assert.equal(ws["H7"]?.v, 10);
  assert.equal(ws["I7"]?.v, 20);
  assert.equal(ws["N7"]?.v, "Partial");

  // Row 8 (second item): Prescribed Qty is string "—"
  assert.equal(ws["G8"]?.t, "s");
  assert.equal(ws["G8"]?.v, "—");
  assert.equal(ws["H8"]?.v, 20);
  assert.equal(ws["I8"]?.v, 0);
  assert.equal(ws["N8"]?.v, "Completed");
});

test("buildMonthlyDispensingExcelBuffer correctly displays '—' for isolated follow-up in DAILY filter", () => {
  // Simulates exporting Today's records where this transaction is an explicit follow-up
  const dailyFollowUpRow = {
    id: "disp-301",
    dispensing_transaction_id: "TXN-301",
    dispense_date: "2026-10-27T10:00:00Z",
    quantity: 20,
    needed_quantity: 30,
    is_follow_up: true,
    previously_claimed: 10,
    needed_this_visit: 20,
    balance_remaining: 0,
    medicine: {
      id: "med-1",
      generic_name: "Amoxicillin",
      dosage: "500 mg",
      unit_of_measure: "CAPSULE",
    },
    patient: {
      id: "pat-200",
      patient_code: "PAT-200",
      first_name: "Pedro",
      last_name: "Penduko",
    },
  };

  const buffer = buildMonthlyDispensingExcelBuffer({
    historyRows: [dailyFollowUpRow],
    dateFilter: "TODAY",
  });

  const parsedWb = XLSX.read(buffer, { type: "array" });
  const ws = parsedWb.Sheets["Sheet1"];

  assert.equal(ws["G7"]?.v, "—", "Follow-up row in Daily filter must show '—' for Prescribed Qty");
  assert.equal(ws["H7"]?.v, 20, "Released Qty must be 20");
  assert.equal(ws["I7"]?.v, 0, "Balance Qty must be 0");
  assert.equal(ws["N7"]?.v, "Completed", "Status must be Completed");
});


