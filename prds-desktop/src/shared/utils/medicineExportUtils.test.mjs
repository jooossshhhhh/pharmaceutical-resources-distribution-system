import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import {
  MEDICINE_TEMPLATE_COLS,
  buildMedicineCsv,
  buildMedicineExcelBuffer,
  buildMedicineExcelWorkbook,
  formatMedicineExportDate,
} from "./medicineExportUtils.js";

const sampleMedicines = [
  {
    id: "med-1",
    generic_name: "Amoxicillin",
    dosage: "500mg",
    unit_of_measure: "capsule",
    categories: ["Anti-Infectives", "HIV Program"],
  },
  {
    id: "med-2",
    generic_name: "Paracetamol",
    dosage: "500mg",
    unit_of_measure: "tablet",
    categories: ["Analgesic"],
  },
];

test("formatMedicineExportDate formats date to Month, Date, Year", () => {
  const date = new Date("2026-09-24T12:00:00Z");
  const formatted = formatMedicineExportDate(date);
  assert.equal(formatted, "September 24, 2026");
});

test("formatMedicineExportDate handles fallback for invalid dates", () => {
  const formatted = formatMedicineExportDate(new Date("invalid"));
  assert.equal(typeof formatted, "string");
  assert.ok(formatted.length > 0);
});

test("MEDICINE_TEMPLATE_COLS defines widths matching the template", () => {
  assert.equal(MEDICINE_TEMPLATE_COLS.length, 7);
  assert.equal(MEDICINE_TEMPLATE_COLS[3].width, 58.71); // Col D
  assert.equal(MEDICINE_TEMPLATE_COLS[4].width, 47.0);  // Col E
  assert.equal(MEDICINE_TEMPLATE_COLS[5].width, 15.85); // Col F
  assert.equal(MEDICINE_TEMPLATE_COLS[6].width, 38.71); // Col G
});

test("buildMedicineExcelWorkbook creates sheet matching template structure", () => {
  const exportDate = new Date("2026-09-24T00:00:00Z");
  const workbook = buildMedicineExcelWorkbook(sampleMedicines, exportDate);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // D1 Title banner with date stamp
  assert.equal(sheet["D1"].v, "List of Medicines (As of September 24, 2026)");

  // D1:G1 merge
  assert.deepEqual(sheet["!merges"], [{ s: { c: 3, r: 0 }, e: { c: 6, r: 0 } }]);

  // Row 2 Headers
  assert.equal(sheet["D2"].v, "Generic Name");
  assert.equal(sheet["E2"].v, "Dosage");
  assert.equal(sheet["F2"].v, "Unit of Measure");
  assert.equal(sheet["G2"].v, "Category");

  // Row 3 (med-1 with values)
  assert.equal(sheet["D3"].v, "Amoxicillin");
  assert.equal(sheet["E3"].v, "500mg");
  assert.equal(sheet["F3"].v, "capsule");
  assert.equal(sheet["G3"].v, "Anti-Infectives, HIV Program");

  // Row 4 (med-2)
  assert.equal(sheet["D4"].v, "Paracetamol");
  assert.equal(sheet["E4"].v, "500mg");
  assert.equal(sheet["F4"].v, "tablet");
  assert.equal(sheet["G4"].v, "Analgesic");

  // Column widths and ref
  assert.ok(sheet["!cols"]);
  assert.equal(sheet["!ref"], "D1:G4");
});

test("buildMedicineExcelBuffer generates valid XLSX preserving bold & center alignment styles", () => {
  const exportDate = new Date("2026-09-24T00:00:00Z");
  const buffer = buildMedicineExcelBuffer(sampleMedicines, exportDate);
  assert.ok(buffer);
  assert.ok(buffer.byteLength > 1000);

  // Read back zip to verify XML has style attributes s="1" (bold+centered) and s="2" (bold)
  const cfb = XLSX.CFB || XLSX["default"]?.CFB;
  const zip = cfb.read(buffer, { type: "array" });
  const sheetEntry = cfb.find(zip, "/xl/worksheets/sheet1.xml");
  assert.ok(sheetEntry, "sheet1.xml must exist in workbook archive");

  const xmlText = new TextDecoder().decode(sheetEntry.content);
  // Verify D1 has s="1" (Bold and Center aligned in template styles.xml)
  assert.ok(xmlText.includes('<c r="D1" s="1"'), "D1 must have style s=\"1\" (bold + center)");
  // Verify D2..G2 have s="2" (Bold in template styles.xml)
  assert.ok(xmlText.includes('<c r="D2" s="2"'), "D2 must have style s=\"2\" (bold)");
  assert.ok(xmlText.includes('<c r="E2" s="2"'), "E2 must have style s=\"2\" (bold)");
  assert.ok(xmlText.includes('<c r="F2" s="2"'), "F2 must have style s=\"2\" (bold)");
  assert.ok(xmlText.includes('<c r="G2" s="2"'), "G2 must have style s=\"2\" (bold)");

  // Read back with XLSX to verify sheet structure and data
  const readBack = XLSX.read(buffer, { type: "array", cellStyles: true });
  const sheet = readBack.Sheets[readBack.SheetNames[0]];

  assert.equal(sheet["D1"].v, "List of Medicines (As of September 24, 2026)");
  assert.equal(sheet["D2"].v, "Generic Name");
  assert.equal(sheet["E2"].v, "Dosage");
  assert.equal(sheet["F2"].v, "Unit of Measure");
  assert.equal(sheet["G2"].v, "Category");

  assert.equal(sheet["D3"].v, "Amoxicillin");
  assert.equal(sheet["E3"].v, "500mg");

  assert.equal(sheet["D4"].v, "Paracetamol");
  assert.equal(sheet["E4"].v, "500mg");
});

test("buildMedicineExcelWorkbook serializes and roundtrips with cellStyles", () => {
  const exportDate = new Date("2026-09-24T00:00:00Z");
  const workbook = buildMedicineExcelWorkbook(sampleMedicines, exportDate);
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer", cellStyles: true });
  const readBack = XLSX.read(buffer, { type: "buffer", cellStyles: true });
  const sheet = readBack.Sheets[readBack.SheetNames[0]];

  assert.equal(sheet["D1"].v, "List of Medicines (As of September 24, 2026)");
  assert.equal(sheet["D2"].v, "Generic Name");
  assert.equal(sheet["D3"].v, "Amoxicillin");
  assert.equal(sheet["D4"].v, "Paracetamol");
});

test("buildMedicineCsv formats CSV with title banner and headers", () => {
  const exportDate = new Date("2026-09-24T00:00:00Z");
  const csv = buildMedicineCsv(sampleMedicines, exportDate);

  assert.ok(csv.includes("List of Medicines (As of September 24, 2026)"));
  assert.ok(csv.includes("Generic Name,Dosage,Unit of Measure,Category"));
  assert.ok(csv.includes("Amoxicillin,500mg,capsule,\"Anti-Infectives, HIV Program\""));
  assert.ok(csv.includes("Paracetamol,500mg,tablet,Analgesic"));
});
