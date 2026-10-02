import * as XLSX from "xlsx";
import { MEDICINE_TEMPLATE_BASE64 } from "../../frontend/assets/templates-excel/medicineTemplateBase64.js";
import {
  downloadExportFile,
} from "../../frontend/services/downloadManager.js";
import { formatMedicineCategories } from "./medicineUtils.js";

/**
 * Formats a date object to "Month, Date, Year" (e.g. "September 24, 2026")
 */
export function formatMedicineExportDate(date = new Date()) {
  const validDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(validDate);
}

/**
 * Column width specifications matching src/frontend/assets/templates-excel/list-of-medicine.xlsx
 */
export const MEDICINE_TEMPLATE_COLS = [
  null, // Col A (empty in template)
  null, // Col B (empty in template)
  null, // Col C (empty in template)
  { width: 58.71, customwidth: "1", wpx: 411, wch: 58, MDW: 7 }, // Col D: Generic Name
  { width: 11.85, customwidth: "1", wpx: 83, wch: 11.14, MDW: 7 }, // Col E: Brand Name
  { width: 47.0, customwidth: "1", wpx: 329, wch: 46.29, MDW: 7 }, // Col F: Dosage
  { width: 15.85, customwidth: "1", wpx: 111, wch: 15.14, MDW: 7 }, // Col G: Unit of Measure
  { width: 38.71, customwidth: "1", wpx: 271, wch: 38, MDW: 7 }, // Col H: Category
  { width: 9.42, customwidth: "1", wpx: 66, wch: 8.71, MDW: 7 }, // Col I: Unit Cost
];

/**
 * Builds a workbook matching the template layout:
 * - Row 1 (D1:I1 merged): "List of Medicines (As of [Month, Date, Year])"
 * - Row 2 (D2:I2): Headers
 * - Row 3+ (D3:I...): Medicines data
 */
export function buildMedicineExcelWorkbook(medicines = [], date = new Date()) {
  let workbook;

  try {
    if (MEDICINE_TEMPLATE_BASE64) {
      workbook = XLSX.read(MEDICINE_TEMPLATE_BASE64, {
        type: "base64",
        cellStyles: true,
      });
    }
  } catch (err) {
    console.warn("Failed to load base64 template, creating from scratch:", err);
  }

  if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
    workbook = XLSX.utils.book_new();
    const ws = {};
    XLSX.utils.book_append_sheet(workbook, ws, "Sheet1");
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const dateStamp = formatMedicineExportDate(date);
  const titleText = `List of Medicines (As of ${dateStamp})`;

  // Row 1 Title Banner (Merged D1:I1) - Bold & Center Aligned
  sheet["D1"] = {
    t: "s",
    v: titleText,
    s: { font: { bold: true }, alignment: { horizontal: "center", vertical: "center" } },
  };
  sheet["E1"] = { t: "z" };
  sheet["F1"] = { t: "z" };
  sheet["G1"] = { t: "z" };
  sheet["H1"] = { t: "z" };
  sheet["I1"] = { t: "z" };

  // Row 2 Column Headers - Bold
  const headerStyle = { font: { bold: true } };
  sheet["D2"] = { t: "s", v: "Generic Name", s: headerStyle };
  sheet["E2"] = { t: "s", v: "Brand Name", s: headerStyle };
  sheet["F2"] = { t: "s", v: "Dosage", s: headerStyle };
  sheet["G2"] = { t: "s", v: "Unit of Measure", s: headerStyle };
  sheet["H2"] = { t: "s", v: "Category", s: headerStyle };
  sheet["I2"] = { t: "s", v: "Unit Cost", s: headerStyle };

  // Data rows starting from Row 3 (1-indexed row 3)
  medicines.forEach((med, index) => {
    const rowNum = index + 3;

    sheet[`D${rowNum}`] = { t: "s", v: med.generic_name || "" };
    sheet[`E${rowNum}`] = { t: "s", v: med.brand_name || "" };
    sheet[`F${rowNum}`] = { t: "s", v: med.dosage || "" };
    sheet[`G${rowNum}`] = { t: "s", v: med.unit_of_measure || "" };
    sheet[`H${rowNum}`] = {
      t: "s",
      v: Array.isArray(med.categories)
        ? formatMedicineCategories(med.categories)
        : String(med.categories || ""),
    };

    if (
      med.unit_cost !== null &&
      med.unit_cost !== undefined &&
      med.unit_cost !== "" &&
      !isNaN(Number(med.unit_cost))
    ) {
      sheet[`I${rowNum}`] = { t: "n", v: Number(med.unit_cost) };
    } else {
      sheet[`I${rowNum}`] = { t: "s", v: "" };
    }
  });

  const lastRow = Math.max(2, medicines.length + 2);
  sheet["!ref"] = `D1:I${lastRow}`;
  sheet["!merges"] = [{ s: { c: 3, r: 0 }, e: { c: 8, r: 0 } }];
  sheet["!cols"] = [...MEDICINE_TEMPLATE_COLS];

  sheet["!rows"] = [
    { hpt: 26, hpx: 35 },
    { hpt: 22, hpx: 30 },
    ...medicines.map(() => ({ hpt: 20, hpx: 26 })),
  ];

  return workbook;
}

/**
 * Escapes characters for XML text nodes
 */
export function escapeXml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Builds an Excel XLSX binary buffer matching the official list-of-medicine template.
 * Injects worksheet XML directly into the template package so that:
 * - D1:I1 title banner uses template style s="1" (Bold + Center-aligned)
 * - D2:I2 column headers use template style s="2" (Bold)
 * - Exact column widths and row heights are preserved from the template package.
 */
export function buildMedicineExcelBuffer(medicines = [], date = new Date()) {
  const defaultExport = Reflect.get(XLSX, "default");
  const cfb = XLSX.CFB || defaultExport?.CFB;
  if (!cfb || !MEDICINE_TEMPLATE_BASE64) {
    const wb = buildMedicineExcelWorkbook(medicines, date);
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }

  try {
    const zip = cfb.read(MEDICINE_TEMPLATE_BASE64, { type: "base64" });
    const sheetEntry = cfb.find(zip, "/xl/worksheets/sheet1.xml");
    if (!sheetEntry) {
      const wb = buildMedicineExcelWorkbook(medicines, date);
      return XLSX.write(wb, { bookType: "xlsx", type: "array" });
    }

    const dateStamp = formatMedicineExportDate(date);
    const titleText = `List of Medicines (As of ${dateStamp})`;
    const lastRow = Math.max(2, medicines.length + 2);

    let rowsXml = "";
    // Row 1 Title Banner (Merged D1:I1, Bold + Center Aligned s="1")
    rowsXml += '<row r="1" spans="4:9" ht="26" customHeight="1" x14ac:dyDescent="0.25">';
    rowsXml += `<c r="D1" s="1" t="inlineStr"><is><t>${escapeXml(titleText)}</t></is></c>`;
    rowsXml += '<c r="E1" s="1"/><c r="F1" s="1"/><c r="G1" s="1"/><c r="H1" s="1"/><c r="I1" s="1"/>';
    rowsXml += "</row>";

    // Row 2 Column Headers (Bold s="2")
    rowsXml += '<row r="2" spans="4:9" ht="22" customHeight="1" x14ac:dyDescent="0.25">';
    rowsXml += '<c r="D2" s="2" t="inlineStr"><is><t>Generic Name</t></is></c>';
    rowsXml += '<c r="E2" s="2" t="inlineStr"><is><t>Brand Name</t></is></c>';
    rowsXml += '<c r="F2" s="2" t="inlineStr"><is><t>Dosage</t></is></c>';
    rowsXml += '<c r="G2" s="2" t="inlineStr"><is><t>Unit of Measure</t></is></c>';
    rowsXml += '<c r="H2" s="2" t="inlineStr"><is><t>Category</t></is></c>';
    rowsXml += '<c r="I2" s="2" t="inlineStr"><is><t>Unit Cost</t></is></c>';
    rowsXml += "</row>";

    // Data rows starting at row 3
    medicines.forEach((med, index) => {
      const rowNum = index + 3;
      const categoriesStr = Array.isArray(med.categories)
        ? formatMedicineCategories(med.categories)
        : String(med.categories || "");

      rowsXml += `<row r="${rowNum}" spans="4:9" ht="20" customHeight="1" x14ac:dyDescent="0.25">`;
      // D: Generic Name
      rowsXml += `<c r="D${rowNum}" t="inlineStr"><is><t>${escapeXml(med.generic_name || "")}</t></is></c>`;
      // E: Brand Name (leave blank when no entry)
      if (med.brand_name) {
        rowsXml += `<c r="E${rowNum}" t="inlineStr"><is><t>${escapeXml(med.brand_name)}</t></is></c>`;
      }
      // F: Dosage
      rowsXml += `<c r="F${rowNum}" t="inlineStr"><is><t>${escapeXml(med.dosage || "")}</t></is></c>`;
      // G: Unit of Measure
      rowsXml += `<c r="G${rowNum}" t="inlineStr"><is><t>${escapeXml(med.unit_of_measure || "")}</t></is></c>`;
      // H: Category
      rowsXml += `<c r="H${rowNum}" t="inlineStr"><is><t>${escapeXml(categoriesStr)}</t></is></c>`;
      // I: Unit Cost (leave blank when no entry)
      if (
        med.unit_cost !== null &&
        med.unit_cost !== undefined &&
        med.unit_cost !== "" &&
        !isNaN(Number(med.unit_cost))
      ) {
        rowsXml += `<c r="I${rowNum}"><v>${Number(med.unit_cost)}</v></c>`;
      }
      rowsXml += "</row>";
    });

    const newSheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x14ac xr xr2 xr3" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac" xmlns:xr="http://schemas.microsoft.com/office/spreadsheetml/2014/revision" xmlns:xr2="http://schemas.microsoft.com/office/spreadsheetml/2015/revision2" xmlns:xr3="http://schemas.microsoft.com/office/spreadsheetml/2016/revision3" xr:uid="{86CC83FB-3750-417C-ADAC-B83CEFDC8E52}"><dimension ref="D1:I${lastRow}"/><sheetViews><sheetView tabSelected="1" zoomScale="70" zoomScaleNormal="70" workbookViewId="0"><selection activeCell="D3" sqref="D3"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15" x14ac:dyDescent="0.25"/><cols><col min="4" max="4" width="58.7109375" customWidth="1"/><col min="5" max="5" width="11.85546875" customWidth="1"/><col min="6" max="6" width="47" customWidth="1"/><col min="7" max="7" width="15.85546875" customWidth="1"/><col min="8" max="8" width="38.7109375" customWidth="1"/><col min="9" max="9" width="9.42578125" customWidth="1"/></cols><sheetData>${rowsXml}</sheetData><mergeCells count="1"><mergeCell ref="D1:I1"/></mergeCells><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup orientation="portrait" horizontalDpi="0" verticalDpi="0" r:id="rId1"/></worksheet>`;

    sheetEntry.content = new TextEncoder().encode(newSheetXml);
    sheetEntry.size = sheetEntry.content.length;

    return cfb.write(zip, { fileType: "zip", type: "array" });
  } catch (err) {
    console.warn("Failed to inject into template CFB, falling back to XLSX.write:", err);
    const wb = buildMedicineExcelWorkbook(medicines, date);
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }
}

/**
 * Builds standard CSV fallback if system preferences specifies CSV
 */
export function buildMedicineCsv(medicines = [], date = new Date()) {
  const dateStamp = formatMedicineExportDate(date);
  const escapeCell = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [
    escapeCell(`List of Medicines (As of ${dateStamp})`),
    [
      "Generic Name",
      "Brand Name",
      "Dosage",
      "Unit of Measure",
      "Category",
      "Unit Cost",
    ]
      .map(escapeCell)
      .join(","),
  ];

  medicines.forEach((med) => {
    const categoriesStr = Array.isArray(med.categories)
      ? formatMedicineCategories(med.categories)
      : String(med.categories || "");
    const costStr =
      med.unit_cost !== null && med.unit_cost !== undefined && med.unit_cost !== ""
        ? String(med.unit_cost)
        : "";

    lines.push(
      [
        med.generic_name || "",
        med.brand_name || "",
        med.dosage || "",
        med.unit_of_measure || "",
        categoriesStr,
        costStr,
      ]
        .map(escapeCell)
        .join(",")
    );
  });

  return lines.join("\r\n");
}

/**
 * Executes file download in Microsoft Excel (.xlsx) format and registers with recent exports
 */
export function exportMedicinesList({
  medicines = [],
  date = new Date(),
} = {}) {
  const dateIso = new Date().toISOString().slice(0, 10);
  const arrayBuffer = buildMedicineExcelBuffer(medicines, date);
  const filename = `list-of-medicines-${dateIso}.xlsx`;

  const exportItem = downloadExportFile({
    filename,
    buffer: arrayBuffer,
    recordCount: medicines.length,
  });

  return {
    filename: exportItem.filename,
    format: "EXCEL",
    blob: exportItem.blob,
    size: exportItem.size,
    exportItem,
  };
}
