import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  escapeXml,
  getPatientRegistrarName,
  calculatePatientColumnWidths,
  buildPatientColsXml,
  buildPatientListSheetXml,
  buildPatientArchivedSheetXml,
  buildPatientExcelBuffer,
  buildPatientExcelWorkbook,
} from "./patientExportUtils.js";

const sampleActivePatients = [
  {
    patient_code: "PRD-0001",
    first_name: "Cassandra Jade",
    middle_name: "M.",
    last_name: "Ponce",
    gender: "FEMALE",
    date_of_birth: "2001-01-18",
    contact_number: "09171234567",
    address: "Purok 1, Barangay Central",
    created_at: "2026-01-15T08:30:00Z",
    registered_by: { first_name: "Juan", last_name: "Dela Cruz", role: "PHARMA_II" },
    facility: { facility_name: "City Health Office" },
  },
  {
    patient_code: "PRD-0002",
    first_name: "Mark",
    last_name: "Santos",
    gender: "MALE",
    date_of_birth: "1995-07-22",
    contact_number: "09189876543",
    address: "Purok 4, Barangay San",
    created_at: "2026-02-10T10:00:00Z",
    registered_by: "BHW Maria",
    facility: { facility_name: "San Health Center" },
  },
];

const sampleArchivedPatients = [
  {
    patient_code: "PRD-0003",
    first_name: "Pedro",
    last_name: "Penduko",
    gender: "MALE",
    date_of_birth: "1980-03-12",
    contact_number: "09191112233",
    address: "Purok 2, Barangay Norte",
    created_at: "2025-11-01T09:00:00Z",
    archived_at: "2026-03-01T14:00:00Z",
    archive_reason: "Transferred residence",
    registered_by: "Admin",
    facility: { facility_name: "Norte Barangay Station" },
  },
];

test("escapeXml properly escapes XML special characters", () => {
  assert.equal(escapeXml("Tom & Jerry <cartoon> 'special' \"quotes\""), "Tom &amp; Jerry &lt;cartoon&gt; &apos;special&apos; &quot;quotes&quot;");
  assert.equal(escapeXml(null), "");
  assert.equal(escapeXml(undefined), "");
  assert.equal(escapeXml(123), "123");
});

test("getPatientRegistrarName resolves registrar from object, string, or fallback users", () => {
  const patientWithObj = {
    registered_by: { first_name: "Juan", last_name: "Dela Cruz", role: "PHARMA_II" },
  };
  assert.equal(getPatientRegistrarName(patientWithObj), "Juan Dela Cruz (Pharmacist II)");

  const patientWithStr = { registered_by: "Dr. Reyes" };
  assert.equal(getPatientRegistrarName(patientWithStr), "Dr. Reyes");

  const patientWithId = {
    created_by: "user-1",
  };
  const fallbackUsers = [{ id: "user-1", first_name: "Ana", last_name: "Santos", role: "BHW" }];
  assert.equal(getPatientRegistrarName(patientWithId, fallbackUsers), "Ana Santos (Barangay Health Worker)");

  const patientEmpty = {};
  assert.equal(getPatientRegistrarName(patientEmpty), "-");
});

test("buildPatientExcelBuffer produces a valid 2-sheet Excel file with List and Archived", () => {
  const allPatients = [...sampleActivePatients, ...sampleArchivedPatients];

  const buffer = buildPatientExcelBuffer({
    patients: allPatients,
  });

  assert.ok(buffer, "Buffer should be generated");
  const wb = XLSX.read(buffer, { type: "buffer" });

  assert.deepEqual(wb.SheetNames, ["List", "Archived"], "Must contain both List and Archived sheets");

  // Sheet 1: List (Active patients)
  const listRows = XLSX.utils.sheet_to_json(wb.Sheets["List"], { header: 1 });
  assert.ok(listRows.length >= 4, "List sheet should contain title, headers, and data rows");

  // Headers in row 3 (0-indexed 2, Excel row 6)
  const listHeaders = listRows[2];
  assert.equal(listHeaders[0], "No.");
  assert.equal(listHeaders[1], "Name");
  assert.equal(listHeaders[2], "Gender");
  assert.equal(listHeaders[3], "Age");
  assert.equal(listHeaders[4], "DOB");
  assert.equal(listHeaders[5], "Contact Number");
  assert.equal(listHeaders[6], "Address");
  assert.equal(listHeaders[7], "Registered");
  assert.equal(listHeaders[8], "Registered By");
  assert.equal(listHeaders[9], "Facility");

  // First active patient row (Row 4 in 0-indexed json, Excel row 7)
  const patient1Row = listRows[3];
  assert.equal(patient1Row[0], 1, "No. column must be auto-incremented integer 1, not patient ID");
  assert.equal(patient1Row[1], "Cassandra Jade M. Ponce");
  assert.equal(patient1Row[2], "FEMALE");
  assert.equal(patient1Row[5], "09171234567");
  assert.equal(patient1Row[6], "Purok 1, Barangay Central");
  assert.equal(patient1Row[8], "Juan Dela Cruz (Pharmacist II)");
  assert.equal(patient1Row[9], "City Health Office");

  // Second active patient row
  const patient2Row = listRows[4];
  assert.equal(patient2Row[0], 2, "No. column must be auto-incremented integer 2, not patient ID");
  assert.equal(patient2Row[1], "Mark Santos");
  assert.equal(patient2Row[2], "MALE");

  // Sheet 2: Archived (Archived patients)
  const archivedRows = XLSX.utils.sheet_to_json(wb.Sheets["Archived"], { header: 1 });
  assert.ok(archivedRows.length >= 4, "Archived sheet should contain title, headers, and data rows");

  // Headers in row 3 (0-indexed 2, Excel row 5)
  const archivedHeaders = archivedRows[2];
  assert.equal(archivedHeaders[0], "No.");
  assert.equal(archivedHeaders[1], "Name");

  // First archived patient row
  const archivedPatient1Row = archivedRows[3];
  assert.equal(archivedPatient1Row[0], 1, "Archived No. column must be auto-incremented integer 1");
  assert.equal(archivedPatient1Row[1], "Pedro Penduko");
  assert.equal(archivedPatient1Row[2], "MALE");
  assert.equal(archivedPatient1Row[9], "Norte Barangay Station");
});

test("buildPatientExcelBuffer handles empty active or empty archived lists cleanly", () => {
  const buffer = buildPatientExcelBuffer({
    activePatients: [],
    archivedPatients: [],
  });

  assert.ok(buffer);
  const wb = XLSX.read(buffer, { type: "buffer" });
  assert.deepEqual(wb.SheetNames, ["List", "Archived"]);

  const listRows = XLSX.utils.sheet_to_json(wb.Sheets["List"], { header: 1 });
  const archivedRows = XLSX.utils.sheet_to_json(wb.Sheets["Archived"], { header: 1 });

  assert.equal(listRows[2][0], "No.");
  assert.equal(archivedRows[2][0], "No.");
});

test("buildPatientExcelWorkbook fallback creates 2-sheet workbook structure", () => {
  const wb = buildPatientExcelWorkbook({
    activePatients: sampleActivePatients,
    archivedPatients: sampleArchivedPatients,
  });

  assert.deepEqual(wb.SheetNames, ["List", "Archived"]);
  assert.equal(wb.Sheets["List"]["E5"].v, "No.");
  assert.equal(wb.Sheets["List"]["E6"].v, 1);
  assert.equal(wb.Sheets["List"]["F6"].v, "Cassandra Jade M. Ponce");
  assert.equal(wb.Sheets["Archived"]["E5"].v, "No.");
  assert.equal(wb.Sheets["Archived"]["E6"].v, 1);
  assert.equal(wb.Sheets["Archived"]["F6"].v, "Pedro Penduko");
});

test("calculatePatientColumnWidths extends width for long address and facility without shrinking base widths", () => {
  const shortPatients = [
    {
      first_name: "Ana",
      last_name: "Cruz",
      address: "Purok 1",
      facility: "CHO",
    },
  ];
  const shortWidths = calculatePatientColumnWidths(shortPatients);
  assert.equal(shortWidths.E, 5.7109375, "Col E base width preserved");
  assert.equal(shortWidths.F, 30.7109375, "Col F base width preserved");
  assert.equal(shortWidths.K, 30.7109375, "Col K (Address) base width preserved");
  assert.equal(shortWidths.N, 25.7109375, "Col N (Facility) base width preserved");

  const longPatients = [
    {
      first_name: "Maria Victoria Consuelo De Los Santos",
      last_name: "Ponce",
      address: "Purok Diamond, West Poblacion, City of Naga, Cebu",
      registered_by: "Greg Lawrence (Barangay Health Worker)",
      facility: "West Poblacion Barangay Health Center",
    },
  ];
  const longWidths = calculatePatientColumnWidths(longPatients);
  assert.ok(longWidths.F > 35, `Col F (Name) extended to at least 35, got ${longWidths.F}`);
  assert.ok(longWidths.K >= 50, `Col K (Address) extended to at least 50, got ${longWidths.K}`);
  assert.ok(longWidths.M >= 40, `Col M (Registered By) extended to at least 40, got ${longWidths.M}`);
  assert.ok(longWidths.N >= 40, `Col N (Facility) extended to at least 40, got ${longWidths.N}`);

  const colsXml = buildPatientColsXml(longWidths);
  assert.ok(colsXml.includes(`width="${longWidths.K}"`), "colsXml must include extended address width");
  assert.ok(colsXml.includes(`width="${longWidths.N}"`), "colsXml must include extended facility width");
});

test("buildPatientListSheetXml and buildPatientArchivedSheetXml inject ignoredErrors for contact numbers", () => {
  const dummyXml = `<worksheet><cols></cols><sheetData></sheetData><pageMargins/><pageSetup/></worksheet>`;
  const listXml = buildPatientListSheetXml(dummyXml, sampleActivePatients);
  assert.ok(listXml.includes("<ignoredErrors>"), "Must include ignoredErrors");
  assert.ok(listXml.includes('numberStoredAsText="1"'), "Must suppress numberStoredAsText");
  assert.ok(listXml.includes('sqref="J6:J'), "Must target column J");

  const archivedXml = buildPatientArchivedSheetXml(dummyXml, sampleArchivedPatients);
  assert.ok(archivedXml.includes("<ignoredErrors>"), "Must include ignoredErrors");
  assert.ok(archivedXml.includes('numberStoredAsText="1"'), "Must suppress numberStoredAsText in archived sheet");
  assert.ok(archivedXml.includes('sqref="J6:J'), "Must target column J in archived sheet");
});

