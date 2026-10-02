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
    brand_name: "Medimox",
    dosage: "500mg",
    unit_of_measure: "capsule",
    unit_cost: 12.5,
    categories: ["Anti-Infectives", "HIV Program"],
  },
  {
    id: "med-2",
    generic_name: "Paracetamol",
    brand_name: "",
    dosage: "500mg",
    unit_of_measure: "tablet",
    unit_cost: null,
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
  assert.equal(MEDICINE_TEMPLATE_COLS.length, 9);
  assert.equal(MEDICINE_TEMPLATE_COLS[3].width, 58.71); // Col D
  assert.equal(MEDICINE_TEMPLATE_COLS[4].width, 11.85); // Col E
  assert.equal(MEDICINE_TEMPLATE_COLS[5].width, 47.0);  // Col F
  assert.equal(MEDICINE_TEMPLATE_COLS[6].width, 15.85); // Col G
  assert.equal(MEDICINE_TEMPLATE_COLS[7].width, 38.71); // Col H
  assert.equal(MEDICINE_TEMPLATE_COLS[8].width, 9.42);  // Col I
});

test("buildMedicineExcelWorkbook creates sheet matching template structure", () => {
  const exportDate = new Date("2026-09-24T00:00:00Z");
  const workbook = buildMedicineExcelWorkbook(sampleMedicines, exportDate);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // D1 Title banner with date stamp
  assert.equal(sheet["D1"].v, "List of Medicines (As of September 24, 2026)");

  // D1:I1 merge
  assert.deepEqual(sheet["!merges"], [{ s: { c: 3, r: 0 }, e: { c: 8, r: 0 } }]);

  // Row 2 Headers
  assert.equal(sheet["D2"].v, "Generic Name");
  assert.equal(sheet["E2"].v, "Brand Name");
  assert.equal(sheet["F2"].v, "Dosage");
  assert.equal(sheet["G2"].v, "Unit of Measure");
  assert.equal(sheet["H2"].v, "Category");
  assert.equal(sheet["I2"].v, "Unit Cost");

  // Row 3 (med-1 with values)
  assert.equal(sheet["D3"].v, "Amoxicillin");
  assert.equal(sheet["E3"].v, "Medimox");
  assert.equal(sheet["F3"].v, "500mg");
  assert.equal(sheet["G3"].v, "capsule");
  assert.equal(sheet["H3"].v, "Anti-Infectives, HIV Program");
  assert.equal(sheet["I3"].t, "n");
  assert.equal(sheet["I3"].v, 12.5);

  // Row 4 (med-2 with empty brand and null unit cost - must be blank "")
  assert.equal(sheet["D4"].v, "Paracetamol");
  assert.equal(sheet["E4"].t, "s");
  assert.equal(sheet["E4"].v, "");
  assert.equal(sheet["F4"].v, "500mg");
  assert.equal(sheet["G4"].v, "tablet");
  assert.equal(sheet["H4"].v, "Analgesic");
  assert.equal(sheet["I4"].t, "s");
  assert.equal(sheet["I4"].v, "");

  // Column widths and ref
  assert.ok(sheet["!cols"]);
  assert.equal(sheet["!ref"], "D1:I4");
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
  // Verify D2..I2 have s="2" (Bold in template styles.xml)
  assert.ok(xmlText.includes('<c r="D2" s="2"'), "D2 must have style s=\"2\" (bold)");
  assert.ok(xmlText.includes('<c r="E2" s="2"'), "E2 must have style s=\"2\" (bold)");
  assert.ok(xmlText.includes('<c r="F2" s="2"'), "F2 must have style s=\"2\" (bold)");
  assert.ok(xmlText.includes('<c r="G2" s="2"'), "G2 must have style s=\"2\" (bold)");
  assert.ok(xmlText.includes('<c r="H2" s="2"'), "H2 must have style s=\"2\" (bold)");
  assert.ok(xmlText.includes('<c r="I2" s="2"'), "I2 must have style s=\"2\" (bold)");

  // Read back with XLSX to verify sheet structure and data
  const readBack = XLSX.read(buffer, { type: "array", cellStyles: true });
  const sheet = readBack.Sheets[readBack.SheetNames[0]];

  assert.equal(sheet["D1"].v, "List of Medicines (As of September 24, 2026)");
  assert.equal(sheet["D2"].v, "Generic Name");
  assert.equal(sheet["E2"].v, "Brand Name");
  assert.equal(sheet["F2"].v, "Dosage");
  assert.equal(sheet["G2"].v, "Unit of Measure");
  assert.equal(sheet["H2"].v, "Category");
  assert.equal(sheet["I2"].v, "Unit Cost");

  assert.equal(sheet["D3"].v, "Amoxicillin");
  assert.equal(sheet["E3"].v, "Medimox");
  assert.equal(sheet["I3"].v, 12.5);

  assert.equal(sheet["D4"].v, "Paracetamol");
  assert.equal(sheet["E4"], undefined, "Empty brand name should be blank/omitted");
  assert.equal(sheet["I4"], undefined, "Null unit cost should be blank/omitted");
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
  assert.equal(sheet["E4"].v, "");
  assert.equal(sheet["I4"].v, "");
});

test("buildMedicineCsv formats CSV with title banner and headers", () => {
  const exportDate = new Date("2026-09-24T00:00:00Z");
  const csv = buildMedicineCsv(sampleMedicines, exportDate);

  assert.ok(csv.includes("List of Medicines (As of September 24, 2026)"));
  assert.ok(csv.includes("Generic Name,Brand Name,Dosage,Unit of Measure,Category,Unit Cost"));
  assert.ok(csv.includes("Amoxicillin,Medimox,500mg,capsule,\"Anti-Infectives, HIV Program\",12.5"));
  assert.ok(csv.includes("Paracetamol,,500mg,tablet,Analgesic,"));
});
