import * as XLSX from "xlsx";
import { downloadExportFile } from "../../frontend/services/downloadManager.js";
import {
  formatReportDate,
  toDateKey,
  extractCompletedRequestItems,
  formatItemDescription,
} from "./reportUtils.js";
import { getSnapshot, STORAGE_KEYS } from "../../backend/database/snapshotStore.js";
import {
  RIS_TEMPLATE_BASE64,
  INVENTORY_FORM_TEMPLATE_BASE64,
} from "../../frontend/assets/templates-excel/reportTemplateBase64.js";

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
 * Safely decodes XML content from a CFB entry across both Node.js (Buffer/Uint8Array)
 * and browser/WebView environments where CFB entry content is a regular Array of byte values.
 */
export function decodeXmlContent(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  const bytes =
    content instanceof Uint8Array
      ? content
      : Array.isArray(content)
      ? new Uint8Array(content)
      : typeof Buffer !== "undefined" && Buffer.isBuffer(content)
      ? new Uint8Array(content.buffer, content.byteOffset, content.byteLength)
      : new Uint8Array(content);
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Matches an exact spreadsheet cell element (<c r="REF".../> or <c r="REF"...>...</c>)
 * without accidentally crossing into subsequent cell or row nodes.
 */
export const cellRegex = (cellRef) =>
  new RegExp(`<c r="${cellRef}"(?: [^>]*?)?(?:\\/>|>[\\s\\S]*?<\\/c>)`);

/**
 * Shifts row and cell indices in an XML chunk by an offset
 */
function shiftRowXml(rowXml, offset) {
  return rowXml
    .replace(/r="(\d+)"/g, (_, r) => `r="${Number(r) + offset}"`)
    .replace(/([D-I])(\d+)/g, (_, col, r) => `${col}${Number(r) + offset}`);
}

/**
 * Shifts merge cell ranges starting at or after row 18 by an offset
 */
function updateMergeCellsXml(mergeCellsXml, offset) {
  return mergeCellsXml.replace(/ref="([D-I])(\d+):([D-I])(\d+)"/g, (_, c1, r1, c2, r2) => {
    const row1 = Number(r1);
    const row2 = Number(r2);
    if (row1 >= 18) {
      return `ref="${c1}${row1 + offset}:${c2}${row2 + offset}"`;
    }
    return `ref="${c1}${row1}:${c2}${row2}"`;
  });
}

/**
 * Builds Sheet 1 (CHO) XML directly inside the template package, preserving:
 * - D1:I1 title header & D2:I2 subtitle
 * - D4:E4 date & D5:E5 RIS NO
 * - Row 7 navy blue column headers and cell borders
 * - Rows 8-17 (10 rows) data grid with exact cell borders
 * - Rows 18-30 Pharmacist & City Health Officer signature section
 */
function buildSheet1Xml(originalXml, items = [], dateStr = "", risNo = "") {
  let xml = originalXml;

  // Replace E4 date
  xml = xml.replace(
    cellRegex("E4"),
    `<c r="E4" s="5" t="inlineStr"><is><t>${escapeXml(dateStr)}</t></is></c>`
  );
  // Replace E5 RIS NO if provided; otherwise retain clean underline cell style
  if (risNo) {
    xml = xml.replace(
      cellRegex("E5"),
      `<c r="E5" s="5" t="inlineStr"><is><t>${escapeXml(risNo)}</t></is></c>`
    );
  } else {
    xml = xml.replace(cellRegex("E5"), `<c r="E5" s="5"/>`);
  }

  const itemCount = items.length;
  const numGridRows = Math.max(10, itemCount);
  const offset = numGridRows - 10;

  let dataRowsXml = "";
  for (let i = 0; i < numGridRows; i++) {
    const rowNum = 8 + i;
    const item = items[i];

    dataRowsXml += `<row r="${rowNum}" spans="4:9" x14ac:dyDescent="0.25">`;
    if (item) {
      dataRowsXml += `<c r="D${rowNum}" s="7"><v>${i + 1}</v></c>`;
      dataRowsXml += `<c r="E${rowNum}" s="7" t="inlineStr"><is><t>${escapeXml(item.description)}</t></is></c>`;
      dataRowsXml += `<c r="F${rowNum}" s="7" t="inlineStr"><is><t>${escapeXml(item.brand || "-")}</t></is></c>`;
      dataRowsXml += `<c r="G${rowNum}" s="7" t="inlineStr"><is><t>${escapeXml(item.unit || "")}</t></is></c>`;
      dataRowsXml += `<c r="H${rowNum}" s="7"><v>${Number(item.quantity) || 0}</v></c>`;
      dataRowsXml += `<c r="I${rowNum}" s="7" t="inlineStr"><is><t>${escapeXml(item.area || "PHARMACY DISPENSING")}</t></is></c>`;
    } else {
      // Empty row preserving exact borders & alignment
      dataRowsXml += `<c r="D${rowNum}" s="7"/><c r="E${rowNum}" s="7"/><c r="F${rowNum}" s="7"/><c r="G${rowNum}" s="7"/><c r="H${rowNum}" s="7"/><c r="I${rowNum}" s="7"/>`;
    }
    dataRowsXml += `</row>`;
  }

  if (offset === 0) {
    // Exactly 10 rows: replace rows 8 through 17 while keeping rows 18-30 intact
    const oldRowsRegex = /<row r="8"[\s\S]*?<row r="17"[^>]*>[\s\S]*?<\/row>/;
    xml = xml.replace(oldRowsRegex, dataRowsXml);
  } else {
    // Dynamic expansion if > 10 items: shift spacer and signature rows (rows 18 to 30) down by offset
    const sigRowsMatch = xml.match(/(<row r="18"[\s\S]*?<\/sheetData>)/);
    if (sigRowsMatch) {
      const sigRowsWithoutEnd = sigRowsMatch[1].replace("</sheetData>", "");
      const shiftedSigRows = shiftRowXml(sigRowsWithoutEnd, offset);

      const oldRowsRegex = /<row r="8"[\s\S]*?<\/sheetData>/;
      xml = xml.replace(oldRowsRegex, `${dataRowsXml}${shiftedSigRows}</sheetData>`);
    }

    xml = xml.replace(/<dimension ref="D1:I\d+"/, `<dimension ref="D1:I${30 + offset}"`);

    xml = xml.replace(/<mergeCells count="\d+">([\s\S]*?)<\/mergeCells>/, (match, inner) => {
      const updatedInner = updateMergeCellsXml(inner, offset);
      return `<mergeCells count="26">${updatedInner}</mergeCells>`;
    });
  }

  return xml;
}

/**
 * Builds Sheet 2 (BHW) XML directly inside the template package, preserving:
 * - D1:I1 title header & D2:I2 subtitle
 * - D4:E4 date & D5:E5 RIS NO
 * - Row 7 navy blue column headers and cell borders
 * - Rows 8-17 (10 rows) data grid with exact cell borders
 * - Rows 18-27 Midwife & Pharmacist signature section with borders
 */
function buildSheet2Xml(originalXml, items = [], dateStr = "", risNo = "") {
  let xml = originalXml;

  // Replace E4 date
  xml = xml.replace(
    cellRegex("E4"),
    `<c r="E4" s="5" t="inlineStr"><is><t>${escapeXml(dateStr)}</t></is></c>`
  );
  // Replace E5 RIS NO if provided; otherwise retain clean underline cell style
  if (risNo) {
    xml = xml.replace(
      cellRegex("E5"),
      `<c r="E5" s="5" t="inlineStr"><is><t>${escapeXml(risNo)}</t></is></c>`
    );
  } else {
    xml = xml.replace(cellRegex("E5"), `<c r="E5" s="5"/>`);
  }

  const itemCount = items.length;
  const numGridRows = Math.max(10, itemCount);
  const offset = numGridRows - 10;

  let dataRowsXml = "";
  for (let i = 0; i < numGridRows; i++) {
    const rowNum = 8 + i;
    const item = items[i];

    dataRowsXml += `<row r="${rowNum}" spans="4:9" x14ac:dyDescent="0.25">`;
    if (item) {
      dataRowsXml += `<c r="D${rowNum}" s="35"><v>${i + 1}</v></c>`;
      dataRowsXml += `<c r="E${rowNum}" s="7" t="inlineStr"><is><t>${escapeXml(item.description)}</t></is></c>`;
      dataRowsXml += `<c r="F${rowNum}" s="35" t="inlineStr"><is><t>${escapeXml(item.brand || "-")}</t></is></c>`;
      dataRowsXml += `<c r="G${rowNum}" s="35" t="inlineStr"><is><t>${escapeXml(item.unit || "")}</t></is></c>`;
      dataRowsXml += `<c r="H${rowNum}" s="35"><v>${Number(item.quantity) || 0}</v></c>`;
      dataRowsXml += `<c r="I${rowNum}" s="35" t="inlineStr"><is><t>${escapeXml(item.area || "BARANGAY HEALTH CENTER")}</t></is></c>`;
    } else {
      // Empty row preserving exact borders & alignment
      dataRowsXml += `<c r="D${rowNum}" s="35"/><c r="E${rowNum}" s="7"/><c r="F${rowNum}" s="35"/><c r="G${rowNum}" s="35"/><c r="H${rowNum}" s="35"/><c r="I${rowNum}" s="35"/>`;
    }
    dataRowsXml += `</row>`;
  }

  if (offset === 0) {
    const oldRowsRegex = /<row r="8"[\s\S]*?<row r="17"[^>]*>[\s\S]*?<\/row>/;
    xml = xml.replace(oldRowsRegex, dataRowsXml);
  } else {
    const sigRowsMatch = xml.match(/(<row r="18"[\s\S]*?<\/sheetData>)/);
    if (sigRowsMatch) {
      const sigRowsWithoutEnd = sigRowsMatch[1].replace("</sheetData>", "");
      const shiftedSigRows = shiftRowXml(sigRowsWithoutEnd, offset);

      const oldRowsRegex = /<row r="8"[\s\S]*?<\/sheetData>/;
      xml = xml.replace(oldRowsRegex, `${dataRowsXml}${shiftedSigRows}</sheetData>`);
    }

    xml = xml.replace(/<dimension ref="D1:I\d+"/, `<dimension ref="D1:I${27 + offset}"`);

    xml = xml.replace(/<mergeCells count="\d+">([\s\S]*?)<\/mergeCells>/, (match, inner) => {
      const updatedInner = updateMergeCellsXml(inner, offset);
      return `<mergeCells count="20">${updatedInner}</mergeCells>`;
    });
  }

  return xml;
}

/**
 * Builds the Excel XLSX binary buffer directly into the client's official template package.
 * Guarantees 100% preservation of:
 * - Font faces, sizes, and colors (Dark Navy headers)
 * - All cell border outlines (header and data grids)
 * - Exact column widths and row heights
 * - Centered / left alignment
 */
export function buildDailyRisBuffer({
  dispensingRows = [],
  requestRows = [],
  selectedDate = new Date(),
  risNo = "",
  facilityName = "",
}) {
  const defaultExport = Reflect.get(XLSX, "default");
  const cfb =
    XLSX.CFB ||
    defaultExport?.CFB ||
    (typeof window !== "undefined" ? window.XLSX?.CFB || window.CFB : null);

  if (!cfb || !RIS_TEMPLATE_BASE64) {
    const wb = buildDailyRisWorkbook({ dispensingRows, requestRows, selectedDate, risNo, facilityName });
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }

  try {
    const zip = cfb.read(RIS_TEMPLATE_BASE64, { type: "base64" });
    const s1Entry = cfb.find(zip, "sheet1.xml") || cfb.find(zip, "/xl/worksheets/sheet1.xml");
    const s2Entry = cfb.find(zip, "sheet2.xml") || cfb.find(zip, "/xl/worksheets/sheet2.xml");

    if (!s1Entry || !s2Entry) {
      const wb = buildDailyRisWorkbook({ dispensingRows, requestRows, selectedDate, risNo, facilityName });
      return XLSX.write(wb, { bookType: "xlsx", type: "array" });
    }

    const dateFormatted = formatReportDate(selectedDate).toUpperCase();
    const targetDateKey = toDateKey(selectedDate);
    const medicinesSnapshot = getSnapshot(STORAGE_KEYS.MEDICINES, []);
    const medicinesMap = new Map(medicinesSnapshot.map((m) => [String(m.id), m]));

    // 1. Sheet 1 (CHO/BHS): Dispensing record in the dispensing module
    const choRows = dispensingRows.filter((r) => {
      if (r.voided_at) return false;
      return toDateKey(r.dispense_date || r.created_at) === targetDateKey;
    });

    const choMap = new Map();
    choRows.forEach((r) => {
      const med =
        r.medicine ||
        (r.medicine_id ? medicinesMap.get(String(r.medicine_id)) : null) ||
        {};
      const generic = (med.generic_name || r.generic_name || "").trim();
      const dosage = (med.dosage || r.dosage || "").trim();
      const desc = formatItemDescription(generic, dosage);
      const brand = (med.brand_name || r.brand_name || "-").trim().toUpperCase();
      const unit = (med.unit_of_measure || r.unit_of_measure || "UNIT").trim().toUpperCase();
      const key = `${desc}__${brand}__${unit}`;
      const qty = Number(r.quantity) || 0;

      if (!choMap.has(key)) {
        choMap.set(key, {
          description: desc,
          brand,
          unit,
          quantity: qty,
          area: facilityName ? `${facilityName.toUpperCase()} DISPENSING` : "PHARMACY DISPENSING",
        });
      } else {
        choMap.get(key).quantity += qty;
      }
    });
    const choItems = Array.from(choMap.values());

    // 2. Sheet 2 (BHW): Completed Requests to Barangay Health Stations
    const bhwRawItems = extractCompletedRequestItems(requestRows, targetDateKey, medicinesMap);
    const bhwMap = new Map();
    bhwRawItems.forEach((item) => {
      const med =
        item.medicine ||
        (item.medicine_id ? medicinesMap.get(String(item.medicine_id)) : null) ||
        {};
      const generic = (med.generic_name || item.generic_name || "").trim();
      const dosage = (med.dosage || item.dosage || "").trim();
      const desc = item.description || formatItemDescription(generic, dosage);
      const brand = (med.brand_name || item.brand || "-").trim().toUpperCase();
      const unit = (med.unit_of_measure || item.unit || "UNIT").trim().toUpperCase();
      const area = (item.facilityName || "BARANGAY HEALTH CENTER").trim().toUpperCase();
      const key = `${desc}__${brand}__${unit}__${area}`;
      const qty = Number(item.quantity) || 0;

      if (!bhwMap.has(key)) {
        bhwMap.set(key, {
          description: desc,
          brand,
          unit,
          quantity: qty,
          area,
        });
      } else {
        bhwMap.get(key).quantity += qty;
      }
    });
    const bhwItems = Array.from(bhwMap.values());

    const origS1Xml = decodeXmlContent(s1Entry.content);
    const origS2Xml = decodeXmlContent(s2Entry.content);

    const newS1Xml = buildSheet1Xml(origS1Xml, choItems, dateFormatted, risNo);
    const newS2Xml = buildSheet2Xml(origS2Xml, bhwItems, dateFormatted, risNo);

    s1Entry.content = new TextEncoder().encode(newS1Xml);
    s1Entry.size = s1Entry.content.length;

    s2Entry.content = new TextEncoder().encode(newS2Xml);
    s2Entry.size = s2Entry.content.length;

    return cfb.write(zip, { fileType: "zip", type: "array" });
  } catch (err) {
    console.warn("Failed to inject into template CFB, falling back to XLSX.write:", err);
    const wb = buildDailyRisWorkbook({ dispensingRows, requestRows, selectedDate, risNo, facilityName });
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }
}

/**
 * Builds the 2-Sheet Request and Issuance Slip (RIS) Workbook using the official template:
 * - Sheet 1: CHO (Pharmacy Dispensing - Walk-ins)
 * - Sheet 2: BHW (Medicine Requests fulfilled to Barangay Health Stations)
 * Fallback workbook builder when binary CFB package is not available.
 */
export function buildDailyRisWorkbook({
  dispensingRows = [],
  requestRows = [],
  selectedDate = new Date(),
  risNo = "",
  facilityName = "",
}) {
  let wb;

  try {
    if (RIS_TEMPLATE_BASE64) {
      wb = XLSX.read(RIS_TEMPLATE_BASE64, {
        type: "base64",
        cellStyles: true,
      });
    }
  } catch (err) {
    console.warn("Could not load RIS base64 template, falling back to clean workbook:", err);
  }

  // Fallback if template loading failed
  if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
    wb = XLSX.utils.book_new();
  }

  const dateFormatted = formatReportDate(selectedDate).toUpperCase();
  const targetDateKey = toDateKey(selectedDate);
  const medicinesSnapshot = getSnapshot(STORAGE_KEYS.MEDICINES, []);
  const medicinesMap = new Map(medicinesSnapshot.map((m) => [String(m.id), m]));

  // ----------------------------------------------------
  // SHEET 1: CHO / BHS (Pharmacy/Station Dispensing from dispensing module)
  // ----------------------------------------------------
  const choRows = dispensingRows.filter((r) => {
    if (r.voided_at) return false;
    return toDateKey(r.dispense_date || r.created_at) === targetDateKey;
  });

  const choMap = new Map();
  choRows.forEach((r) => {
    const med =
      r.medicine ||
      (r.medicine_id ? medicinesMap.get(String(r.medicine_id)) : null) ||
      {};
    const generic = (med.generic_name || r.generic_name || "").trim();
    const dosage = (med.dosage || r.dosage || "").trim();
    const desc = formatItemDescription(generic, dosage);
    const brand = (med.brand_name || r.brand_name || "-").trim().toUpperCase();
    const unit = (med.unit_of_measure || r.unit_of_measure || "UNIT").trim().toUpperCase();
    const key = `${desc}__${brand}__${unit}`;
    const qty = Number(r.quantity) || 0;

    if (!choMap.has(key)) {
      choMap.set(key, {
        description: desc,
        brand,
        unit,
        quantity: qty,
        area: facilityName ? `${facilityName.toUpperCase()} DISPENSING` : "PHARMACY DISPENSING",
      });
    } else {
      choMap.get(key).quantity += qty;
    }
  });
  const choItems = Array.from(choMap.values());

  let choWs = wb.Sheets["CHO"];
  if (!choWs) {
    choWs = {};
    wb.SheetNames.push("CHO");
    wb.Sheets["CHO"] = choWs;
  }

  // Set Header Title & Date (Cells D1, D2, D4, E4, D5, E5)
  choWs["D1"] = { t: "s", v: facilityName ? facilityName.toUpperCase() : "VICENTE MENDIOLA CENTER FOR HEALTH" };
  choWs["D2"] = { t: "s", v: facilityName ? `REQUEST ISSUANCE SLIP - ${facilityName.toUpperCase()}` : "REQUEST ISSUANCE SLIP" };
  choWs["D4"] = { t: "s", v: "DATE: " };
  choWs["E4"] = { t: "s", v: dateFormatted };
  choWs["D5"] = { t: "s", v: "RIS NO." };
  choWs["E5"] = { t: "s", v: risNo || "" };

  // Set Table Column Headers (Row 7)
  choWs["D7"] = { t: "s", v: "ITEM NO" };
  choWs["E7"] = { t: "s", v: "ITEM DESCRIPTION" };
  choWs["F7"] = { t: "s", v: "BRAND" };
  choWs["G7"] = { t: "s", v: "UNIT" };
  choWs["H7"] = { t: "s", v: "QTY" };
  choWs["I7"] = { t: "s", v: "AREA " };

  // Populate data rows starting at Row 8 (10 rows in template: 8-17)
  const maxTemplateRows = Math.max(10, choItems.length);
  for (let i = 0; i < maxTemplateRows; i++) {
    const rowNum = 8 + i;
    const item = choItems[i];

    if (item) {
      choWs[`D${rowNum}`] = { t: "n", v: i + 1 };
      choWs[`E${rowNum}`] = { t: "s", v: item.description };
      choWs[`F${rowNum}`] = { t: "s", v: item.brand };
      choWs[`G${rowNum}`] = { t: "s", v: item.unit };
      choWs[`H${rowNum}`] = { t: "n", v: item.quantity };
      choWs[`I${rowNum}`] = { t: "s", v: item.area };
    } else if (i < 10) {
      // Clear sample placeholder if no data, leaving cells empty for blank template export
      choWs[`D${rowNum}`] = { t: "s", v: "" };
      choWs[`E${rowNum}`] = { t: "s", v: "" };
      choWs[`F${rowNum}`] = { t: "s", v: "" };
      choWs[`G${rowNum}`] = { t: "s", v: "" };
      choWs[`H${rowNum}`] = { t: "s", v: "" };
      choWs[`I${rowNum}`] = { t: "s", v: "" };
    }
  }

  // ----------------------------------------------------
  // SHEET 2: BHW (Completed Medicine Requests to Barangays)
  // ----------------------------------------------------
  const bhwRawItems = extractCompletedRequestItems(requestRows, targetDateKey, medicinesMap);
  const bhwMap = new Map();
  bhwRawItems.forEach((item) => {
    const med =
      item.medicine ||
      (item.medicine_id ? medicinesMap.get(String(item.medicine_id)) : null) ||
      {};
    const generic = (med.generic_name || item.generic_name || "").trim();
    const dosage = (med.dosage || item.dosage || "").trim();
    const desc = item.description || formatItemDescription(generic, dosage);
    const brand = (med.brand_name || item.brand || "-").trim().toUpperCase();
    const unit = (med.unit_of_measure || item.unit || "UNIT").trim().toUpperCase();
    const area = (item.facilityName || "BARANGAY HEALTH CENTER").trim().toUpperCase();
    const key = `${desc}__${brand}__${unit}__${area}`;
    const qty = Number(item.quantity) || 0;

    if (!bhwMap.has(key)) {
      bhwMap.set(key, {
        description: desc,
        brand,
        unit,
        quantity: qty,
        area,
      });
    } else {
      bhwMap.get(key).quantity += qty;
    }
  });
  const bhwItems = Array.from(bhwMap.values());

  let bhwWs = wb.Sheets["BHW"];
  if (!bhwWs) {
    bhwWs = {};
    wb.SheetNames.push("BHW");
    wb.Sheets["BHW"] = bhwWs;
  }

  bhwWs["D1"] = { t: "s", v: "VICENTE MENDIOLA CENTER FOR HEALTH" };
  bhwWs["D2"] = { t: "s", v: "REQUEST ISSUANCE SLIP" };
  bhwWs["D4"] = { t: "s", v: "DATE: " };
  bhwWs["E4"] = { t: "s", v: dateFormatted };
  bhwWs["D5"] = { t: "s", v: "RIS NO." };
  bhwWs["E5"] = { t: "s", v: risNo || "" };

  // Set Table Column Headers (Row 7)
  bhwWs["D7"] = { t: "s", v: "ITEM NO" };
  bhwWs["E7"] = { t: "s", v: "ITEM DESCRIPTION" };
  bhwWs["F7"] = { t: "s", v: "BRAND" };
  bhwWs["G7"] = { t: "s", v: "UNIT" };
  bhwWs["H7"] = { t: "s", v: "QTY" };
  bhwWs["I7"] = { t: "s", v: "AREA " };

  const maxBhwRows = Math.max(10, bhwItems.length);
  for (let i = 0; i < maxBhwRows; i++) {
    const rowNum = 8 + i;
    const item = bhwItems[i];

    if (item) {
      bhwWs[`D${rowNum}`] = { t: "n", v: i + 1 };
      bhwWs[`E${rowNum}`] = { t: "s", v: item.description };
      bhwWs[`F${rowNum}`] = { t: "s", v: item.brand };
      bhwWs[`G${rowNum}`] = { t: "s", v: item.unit };
      bhwWs[`H${rowNum}`] = { t: "n", v: item.quantity };
      bhwWs[`I${rowNum}`] = { t: "s", v: item.area };
    } else if (i < 10) {
      bhwWs[`D${rowNum}`] = { t: "s", v: "" };
      bhwWs[`E${rowNum}`] = { t: "s", v: "" };
      bhwWs[`F${rowNum}`] = { t: "s", v: "" };
      bhwWs[`G${rowNum}`] = { t: "s", v: "" };
      bhwWs[`H${rowNum}`] = { t: "s", v: "" };
      bhwWs[`I${rowNum}`] = { t: "s", v: "" };
    }
  }

  return wb;
}

/**
 * Consolidates inventory records sharing the same medicine, lot/batch number, and expiration date.
 * Merges quantities and retains earliest receipt dates to prevent duplicate rows for identical batches.
 */
export function consolidateInventoryRows(inventoryRows = []) {
  if (!Array.isArray(inventoryRows) || inventoryRows.length === 0) return [];

  // Pre-scan to build batchToPo and batchToCost maps
  const batchToPo = new Map();
  const batchToCost = new Map();
  for (const item of inventoryRows) {
    const batch = (item.batch_number || item.lot_number || item.lot || "").trim().toUpperCase();
    const po = String(item.po_number || item.purchase_order || item.poNumber || item.po_no || "").trim();
    if (batch && po && !batchToPo.has(batch)) {
      batchToPo.set(batch, po);
    }
    const cost = Number(item.unit_cost ?? item.medicine?.unit_cost ?? 0);
    if (batch && cost > 0 && !batchToCost.has(batch)) {
      batchToCost.set(batch, cost);
    }
  }

  const map = new Map();

  for (const item of inventoryRows) {
    const med = item.medicine || {};
    const medId = String(item.medicine_id || med.id || med.generic_name || item.generic_name || "").trim().toLowerCase();
    const batch = (item.batch_number || item.lot_number || item.lot || "").trim().toUpperCase();
    const expiry = item.expiration_date || item.expiry_date || "";
    const expiryKey = expiry ? toDateKey(expiry) : "NO_EXPIRY";
    let unitCost = Number(med.unit_cost ?? item.unit_cost ?? 0);
    if ((!unitCost || unitCost === 0) && batch && batchToCost.has(batch)) {
      unitCost = batchToCost.get(batch);
    }
    let poNumber = String(item.po_number || item.purchase_order || item.poNumber || item.po_no || "").trim();
    if (!poNumber && batch && batchToPo.has(batch)) {
      poNumber = batchToPo.get(batch);
    }

    const groupKey = `${medId}___${batch || "NO_BATCH"}___${expiryKey}___${unitCost}___${poNumber}`;

    if (!map.has(groupKey)) {
      map.set(groupKey, {
        ...item,
        po_number: poNumber,
        poNumber,
        unit_cost: unitCost,
        quantity: Number(item.quantity) || 0,
        received_quantity: item.received_quantity !== undefined ? Number(item.received_quantity) : undefined,
        additional_quantity: item.additional_quantity !== undefined ? Number(item.additional_quantity) : undefined,
        remaining_quantity: item.remaining_quantity !== undefined ? Number(item.remaining_quantity) : undefined,
        beginning_quantity: item.beginning_quantity !== undefined ? Number(item.beginning_quantity) : undefined,
        issued_quantity: item.issued_quantity !== undefined ? Number(item.issued_quantity) : undefined,
        expired_quantity: item.expired_quantity !== undefined ? Number(item.expired_quantity) : undefined,
        program_quantity: item.program_quantity !== undefined ? Number(item.program_quantity) : undefined,
      });
    } else {
      const existing = map.get(groupKey);
      if (!existing.po_number && poNumber) {
        existing.po_number = poNumber;
        existing.poNumber = poNumber;
      }
      existing.quantity = (existing.quantity || 0) + (Number(item.quantity) || 0);
      if (item.received_quantity !== undefined) {
        existing.received_quantity = (existing.received_quantity || 0) + Number(item.received_quantity);
      }
      if (item.additional_quantity !== undefined) {
        existing.additional_quantity = (existing.additional_quantity || 0) + Number(item.additional_quantity);
      }
      if (item.remaining_quantity !== undefined) {
        existing.remaining_quantity = (existing.remaining_quantity || 0) + Number(item.remaining_quantity);
      }
      if (item.beginning_quantity !== undefined) {
        existing.beginning_quantity = (existing.beginning_quantity || 0) + Number(item.beginning_quantity);
      }
      if (item.issued_quantity !== undefined) {
        existing.issued_quantity = (existing.issued_quantity || 0) + Number(item.issued_quantity);
      }
      if (item.expired_quantity !== undefined) {
        existing.expired_quantity = (existing.expired_quantity || 0) + Number(item.expired_quantity);
      }
      if (item.program_quantity !== undefined) {
        existing.program_quantity = (existing.program_quantity || 0) + Number(item.program_quantity);
      }
      if (item.date_received && (!existing.date_received || item.date_received < existing.date_received)) {
        existing.date_received = item.date_received;
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Processes and reconciles monthly inventory data from dispensing, requests, and programs
 */
export function processMonthlyInventoryData({
  inventoryRows = [],
  dispensingRows = [],
  requestRows = [],
  otherProgramsRows = [],
  stockReturnsRows = [],
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
}) {
  const targetMonthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const daysInTargetMonth = new Date(year, month, 0).getDate();
  const targetMonthEnd = `${targetMonthPrefix}-${String(daysInTargetMonth).padStart(2, "0")}`;

  const todayStr = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const isCurrentMonth = year === currentYear && month === currentMonth;
  const isPastMonth = year < currentYear || (year === currentYear && month < currentMonth);

  // If viewing current active month, any batch expired as of today is counted as expired;
  // If viewing a completed past month, any batch expired on or before that month end is counted as expired.
  const expirationCutoff = isCurrentMonth ? todayStr : (isPastMonth ? targetMonthEnd : "");

  // 1. Walk-in Dispensing
  const dispensingByBatch = new Map();
  const dispensingByMed = new Map();
  dispensingRows.forEach((r) => {
    if (r.voided_at) return;
    const dateKey = toDateKey(r.dispense_date || r.created_at);
    if (!dateKey.startsWith(targetMonthPrefix)) return;

    const qty = Number(r.quantity) || 0;
    const medId = String(r.medicine_id || r.medicine?.id || "");
    const batch = (r.batch_number || r.lot_no || "").trim().toUpperCase();

    if (batch) {
      dispensingByBatch.set(batch, (dispensingByBatch.get(batch) || 0) + qty);
    }
    if (medId) {
      dispensingByMed.set(medId, (dispensingByMed.get(medId) || 0) + qty);
    }
  });

  // 2. Completed Barangay Requests
  const requestsByBatch = new Map();
  const requestsByMed = new Map();
  requestRows.forEach((req) => {
    if (req.status !== "COMPLETED") return;
    const dateKey = toDateKey(
      req.approved_at || req.received_at || req.updated_at || req.request_date
    );
    if (!dateKey.startsWith(targetMonthPrefix)) return;

    const items = req.items || [];
    items.forEach((item) => {
      const qty = Number(item.quantity) || 0;
      const medId = String(item.medicine_id || item.medicine?.id || "");
      const batch = (item.batch_number || item.lot_no || "").trim().toUpperCase();

      if (batch) {
        requestsByBatch.set(batch, (requestsByBatch.get(batch) || 0) + qty);
      }
      if (medId) {
        requestsByMed.set(medId, (requestsByMed.get(medId) || 0) + qty);
      }
    });
  });

  // 3. Other Health Programs
  const programsByMed = new Map();
  otherProgramsRows.forEach((prog) => {
    if (prog.status === "CANCELLED") return;
    const dateKey = toDateKey(
      prog.program_date || prog.completed_at || prog.created_at
    );
    if (!dateKey.startsWith(targetMonthPrefix)) return;

    const progName = (prog.program_name || prog.title || "OTHER HEALTH PROGRAM").trim().toUpperCase();
    const meds = prog.medicines || [];
    meds.forEach((m) => {
      const medId = String(m.medicine_id || m.medicine?.id || "");
      const qty = Number(m.quantity_used || m.quantity) || 0;
      if (!medId) return;

      if (!programsByMed.has(medId)) {
        programsByMed.set(medId, { qty, programName: progName });
      } else {
        const existing = programsByMed.get(medId);
        existing.qty += qty;
        if (!existing.programName.includes(progName)) {
          existing.programName += `, ${progName}`;
        }
      }
    });
  });

  // 4. Confirmed Stock Returns (Barangay Health Stations -> CHO Central Warehouse)
  const returnsByBatch = new Map();
  const returnsByMed = new Map();
  (stockReturnsRows || []).forEach((ret) => {
    if (!ret) return;
    const status = String(ret.status || "").toUpperCase();
    if (status !== "CONFIRMED" && status !== "VERIFIED") return;
    const dateKey = toDateKey(ret.confirmed_at || ret.submitted_at || ret.created_at);
    if (!dateKey.startsWith(targetMonthPrefix)) return;

    const qty = Number(ret.quantity) || 0;
    const medId = String(ret.medicine_id || ret.medicine?.id || "");
    const batch = (ret.lot_no || ret.batch_number || "").trim().toUpperCase();

    if (batch) {
      returnsByBatch.set(batch, (returnsByBatch.get(batch) || 0) + qty);
    }
    if (medId) {
      returnsByMed.set(medId, (returnsByMed.get(medId) || 0) + qty);
    }
  });

  // Totals accumulators
  let totalBegVal = 0;
  let totalAddVal = 0;
  let totalGrossVal = 0;
  let totalIssuedVal = 0;
  let totalProgVal = 0;
  let totalExpiredVal = 0;
  let totalRemVal = 0;

  const consolidatedInventory = consolidateInventoryRows(inventoryRows);

  const items = consolidatedInventory.map((item, idx) => {
    const med = item.medicine || {};
    const medId = String(item.medicine_id || med.id || "");
    const batch = (item.batch_number || item.lot_number || item.lot || "").trim().toUpperCase();
    const poNumber = String(item.po_number || item.purchase_order || item.poNumber || item.po_no || "").trim();

    const generic = (med.generic_name || item.generic_name || "").trim();
    const dosage = (med.dosage || item.dosage || "").trim();
    const itemDescription = formatItemDescription(generic, dosage);
    const brandName = (med.brand_name || item.brand_name || "-").trim().toUpperCase();
    const unitOfMeasure = (med.unit_of_measure || item.unit_of_measure || "UNIT").trim().toUpperCase();
    const lotNo = batch || "-";
    const expiryDate = item.expiration_date || item.expiry_date || "-";
    const unitCost = Number(med.unit_cost ?? item.unit_cost ?? 0);

    // Issuances (Walk-in + Barangay Requests)
    let walkInQty = 0;
    if (batch && dispensingByBatch.has(batch)) {
      walkInQty = dispensingByBatch.get(batch);
    } else if (medId && dispensingByMed.has(medId)) {
      walkInQty = dispensingByMed.get(medId);
      dispensingByMed.set(medId, 0);
    }

    let reqQty = 0;
    if (batch && requestsByBatch.has(batch)) {
      reqQty = requestsByBatch.get(batch);
    } else if (medId && requestsByMed.has(medId)) {
      reqQty = requestsByMed.get(medId);
      requestsByMed.set(medId, 0);
    }

    const issuedQty = Number(item.issued_quantity ?? item.issuedQty ?? (walkInQty + reqQty));

    // Other Programs
    let programQty = 0;
    let programName = "";
    if (item.program_quantity !== undefined || item.programQty !== undefined) {
      programQty = Number(item.program_quantity ?? item.programQty ?? 0);
      programName = (item.program_name || item.programName || "").trim().toUpperCase();
    } else if (medId && programsByMed.has(medId)) {
      const prog = programsByMed.get(medId);
      programQty = prog.qty;
      programName = prog.programName;
      programsByMed.set(medId, { qty: 0, programName: "" });
    }

    // Expired Stocks
    let expiredQty = 0;
    const expDateStr = item.expiration_date ? toDateKey(item.expiration_date) : "";
    const isExplicitlyExpired = item.status === "EXPIRED" || Boolean(item.is_expired);
    const isExpiredByDate = Boolean(expirationCutoff && expDateStr && expDateStr <= expirationCutoff);
    const isItemExpired = isExplicitlyExpired || isExpiredByDate;

    if (item.expired_quantity !== undefined || item.expiredQty !== undefined) {
      expiredQty = Number(item.expired_quantity ?? item.expiredQty ?? 0);
    } else if (isItemExpired) {
      expiredQty = Number(item.quantity) || 0;
    }

    // Additional Stocks Received / Returned this Month (Columns L, M, N)
    let additionalQty = 0;
    if (item.additional_quantity !== undefined || item.additionalQty !== undefined) {
      additionalQty = Number(item.additional_quantity ?? item.additionalQty ?? 0);
    } else {
      let procurementDeliveryQty = 0;
      const receivedDateKey = toDateKey(item.date_received || item.created_at);
      if (receivedDateKey.startsWith(targetMonthPrefix) && item.received_quantity) {
        procurementDeliveryQty = Number(item.received_quantity) || 0;
      }

      let returnedQty = 0;
      if (batch && returnsByBatch.has(batch)) {
        returnedQty = returnsByBatch.get(batch) || 0;
        returnsByBatch.set(batch, 0);
      } else if (medId && returnsByMed.has(medId)) {
        returnedQty = returnsByMed.get(medId) || 0;
        returnsByMed.set(medId, 0);
      }

      additionalQty = procurementDeliveryQty + returnedQty;
    }

    // Physical Remaining Count on Hand
    let remainingQty = 0;
    if (item.remaining_quantity !== undefined || item.remainingQty !== undefined) {
      remainingQty = Number(item.remaining_quantity ?? item.remainingQty ?? 0);
    } else {
      remainingQty = isItemExpired ? 0 : (Number(item.quantity) || 0);
    }

    // Reconciled Beginning Balance
    let beginningQty = 0;
    if (item.beginning_quantity !== undefined || item.beginningQty !== undefined) {
      beginningQty = Number(item.beginning_quantity ?? item.beginningQty ?? 0);
    } else {
      beginningQty = Math.max(
        0,
        remainingQty + issuedQty + programQty + expiredQty - additionalQty
      );
    }
    const grossQty = beginningQty + additionalQty;

    const begTotal = beginningQty * unitCost;
    const addTotal = additionalQty * unitCost;
    const grossTotal = grossQty * unitCost;
    const issuedTotal = issuedQty * unitCost;
    const programTotal = programQty * unitCost;
    const expiredTotal = expiredQty * unitCost;
    const remainingTotal = remainingQty * unitCost;

    totalBegVal += begTotal;
    totalAddVal += addTotal;
    totalGrossVal += grossTotal;
    totalIssuedVal += issuedTotal;
    totalProgVal += programTotal;
    totalExpiredVal += expiredTotal;
    totalRemVal += remainingTotal;

    return {
      index: idx + 1,
      poNumber,
      itemDescription,
      unitOfMeasure,
      brandName,
      lotNo,
      expiryDate,
      unitCost,
      beginningQty,
      begTotal,
      additionalQty,
      addTotal,
      grossQty,
      grossTotal,
      issuedQty,
      issuedTotal,
      programQty,
      programTotal,
      programName,
      expiredQty,
      expiredTotal,
      remainingQty,
      remainingTotal,
    };
  });

  // Append any confirmed returns for batches that were not present in CHO inventory rows
  returnsByBatch.forEach((retQty, retBatch) => {
    if (retQty <= 0) return;
    const retRecord = (stockReturnsRows || []).find((r) => {
      const b = (r.lot_no || r.batch_number || "").trim().toUpperCase();
      return b === retBatch;
    });
    if (!retRecord) return;

    const unitCost = Number(retRecord.unit_cost) || 0;
    const generic = (retRecord.medicine_name || retRecord.medicine?.generic_name || "").trim();
    const dosage = (retRecord.dosage || retRecord.medicine?.dosage || "").trim();
    const itemDescription = formatItemDescription(generic, dosage);
    const addTotal = retQty * unitCost;

    items.push({
      index: items.length + 1,
      poNumber: retRecord.return_id || "STOCK-RETURN",
      itemDescription,
      unitOfMeasure: (retRecord.unit_of_measure || retRecord.medicine?.unit_of_measure || "UNIT").trim().toUpperCase(),
      brandName: (retRecord.brand_name || retRecord.medicine?.brand_name || "-").trim().toUpperCase(),
      lotNo: retBatch,
      expiryDate: retRecord.expiration_date || "-",
      unitCost,
      beginningQty: 0,
      begTotal: 0,
      additionalQty: retQty,
      addTotal,
      grossQty: retQty,
      grossTotal: addTotal,
      issuedQty: 0,
      issuedTotal: 0,
      programQty: 0,
      programTotal: 0,
      programName: "",
      expiredQty: 0,
      expiredTotal: 0,
      remainingQty: retQty,
      remainingTotal: addTotal,
    });

    totalAddVal += addTotal;
    totalGrossVal += addTotal;
    totalRemVal += addTotal;
  });

  items.sort((a, b) => {
    const poA = a.poNumber || "";
    const poB = b.poNumber || "";
    if (poA && !poB) return -1;
    if (!poA && poB) return 1;
    if (poA !== poB) {
      return poA.localeCompare(poB, undefined, { numeric: true, sensitivity: "base" });
    }
    const cmp = (a.itemDescription || "").localeCompare(b.itemDescription || "");
    if (cmp !== 0) return cmp;
    return (a.lotNo || "").localeCompare(b.lotNo || "");
  });
  items.forEach((item, i) => {
    item.index = i + 1;
  });

  return {
    items,
    totals: {
      totalBegVal,
      totalAddVal,
      totalGrossVal,
      totalIssuedVal,
      totalProgVal,
      totalExpiredVal,
      totalRemVal,
    },
  };
}

/**
 * Formats the PO Number header label for Column D.
 * For non-empty PO numbers, returns "PO NO. <number>" (normalizing redundant PO prefixes).
 * For empty/unassigned POs, returns strictly "PO NO." so the pharmacist can fill it in manually.
 */
export function formatPoHeader(poNumber) {
  const trimmed = String(poNumber || "").trim();
  if (!trimmed) {
    return "PO NO.";
  }
  if (/^PO\s*NO\.?\s*/i.test(trimmed)) {
    const rest = trimmed.replace(/^PO\s*NO\.?\s*/i, "").trim();
    return rest ? `PO NO. ${rest}` : "PO NO.";
  }
  if (/^PO[\s.:-]*/i.test(trimmed)) {
    const rest = trimmed.replace(/^PO[\s.:-]*/i, "").trim();
    return rest ? `PO NO. ${rest}` : "PO NO.";
  }
  return `PO NO. ${trimmed}`;
}

/**
 * Groups reconciled monthly report items by PO Number.
 * Preserves the sorted item order within each group.
 */
export function groupReportItemsByPo(items = []) {
  if (!items || items.length === 0) {
    return [
      {
        poNumber: "",
        headerText: "PO NO.",
        items: [],
      },
    ];
  }

  const groups = [];
  let currentGroup = null;

  for (const item of items) {
    const itemPo = (item.poNumber || "").trim();
    if (!currentGroup || currentGroup.poNumber !== itemPo) {
      currentGroup = {
        poNumber: itemPo,
        headerText: formatPoHeader(itemPo),
        items: [],
      };
      groups.push(currentGroup);
    }
    currentGroup.items.push(item);
  }

  return groups;
}

/**
 * Builds the Monthly Inventory Physical Count XLSX binary buffer directly into the client's official
 * template package (inventory-report.xlsx).
 * Guarantees 100% preservation of:
 * - Font faces (Aptos Narrow, Amasis MT Pro Light), sizes, colors, and borders
 * - Exact column widths (<cols>) and row heights
 * - Date addressing in Row 3: C3 (Title & Month), I3 (Beginning Balance), AB3 (Remaining Balance)
 * - Row 4 subheaders
 * - Dynamic rows from Row 5 onwards with PO section headers (Option 1) and medicine items
 * - Formulas for quantities, unit costs, total costs, and grand totals
 */
export function buildMonthlyInventoryBuffer({
  inventoryRows = [],
  dispensingRows = [],
  requestRows = [],
  otherProgramsRows = [],
  stockReturnsRows = [],
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  facilityName = "VMCH MEDICINE SUPPLIES",
  pharmacistName = "ROSEMIE ANN GETUTUA",
  choDoctorName = "DR. CAMILLE F. PENALOSA",
}) {
  const defaultExport = Reflect.get(XLSX, "default");
  const cfb =
    XLSX.CFB ||
    defaultExport?.CFB ||
    (typeof window !== "undefined" ? window.XLSX?.CFB || window.CFB : null);

  if (!cfb || !INVENTORY_FORM_TEMPLATE_BASE64) {
    const wb = buildMonthlyInventoryWorkbook({
      inventoryRows,
      dispensingRows,
      requestRows,
      otherProgramsRows,
      stockReturnsRows,
      year,
      month,
      facilityName,
      pharmacistName,
      choDoctorName,
    });
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }

  try {
    const zip = cfb.read(INVENTORY_FORM_TEMPLATE_BASE64, { type: "base64" });
    const s1Entry = cfb.find(zip, "sheet1.xml") || cfb.find(zip, "/xl/worksheets/sheet1.xml");

    if (!s1Entry) {
      const wb = buildMonthlyInventoryWorkbook({
        inventoryRows,
        dispensingRows,
        requestRows,
        otherProgramsRows,
        stockReturnsRows,
        year,
        month,
        facilityName,
        pharmacistName,
        choDoctorName,
      });
      return XLSX.write(wb, { bookType: "xlsx", type: "array" });
    }

    let xml = decodeXmlContent(s1Entry.content);

    // 1. Calculate Dates and Formatted Headers
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;

    const targetDate = new Date(year, month - 1, 1);
    const monthName = new Intl.DateTimeFormat("en-US", { month: "long" })
      .format(targetDate)
      .toUpperCase();
    const monthNameTitle = new Intl.DateTimeFormat("en-US", { month: "long" })
      .format(targetDate);
    const lastDay = new Date(year, month, 0).getDate();
    // Adaptive date: If current in-progress month, stamp active date; if closed past month, stamp month-end
    const effectiveRemDay = isCurrentMonth ? now.getDate() : lastDay;

    const remainingHeader = `REMAINING BALANCE  AS OF \n${monthName} ${effectiveRemDay}, ${year}`;

    const prevDate = new Date(year, month - 1, 0);
    const prevMonthName = new Intl.DateTimeFormat("en-US", { month: "long" })
      .format(prevDate)
      .toUpperCase();
    const prevLastDay = prevDate.getDate();
    const prevYear = prevDate.getFullYear();
    const begBalanceHeader = `BEGINNING BALANCE AS OF \n${prevMonthName} ${prevLastDay}, ${prevYear}`;

    // 2. Update Row 3 Headers: C3 (Title & Month), I3 (Beginning Balance Date), AB3 (Remaining Balance Date)
    const resolvedFacility =
      !facilityName ||
      /VICENTE MENDIOLA|CITY HEALTH OFFICE|\bCHO\b|\bVMCH\b/i.test(facilityName)
        ? "VMCH MEDICINE SUPPLIES"
        : facilityName.toUpperCase().includes("MEDICINE SUPPLIES")
        ? facilityName.toUpperCase()
        : `${facilityName.toUpperCase()} MEDICINE SUPPLIES`;
    const titleHeader = `REPORT ON PHYSICAL COUNT OF INVENTORIES: ${resolvedFacility} MONTH \n${monthNameTitle}, ${year}`;

    xml = xml.replace(
      cellRegex("C3"),
      `<c r="C3" s="20" t="inlineStr"><is><t xml:space="preserve">${escapeXml(titleHeader)}</t></is></c>`
    );
    xml = xml.replace(
      cellRegex("I3"),
      `<c r="I3" s="17" t="inlineStr"><is><t xml:space="preserve">${escapeXml(begBalanceHeader)}</t></is></c>`
    );
    xml = xml.replace(
      cellRegex("AB3"),
      `<c r="AB3" s="14" t="inlineStr"><is><t xml:space="preserve">${escapeXml(remainingHeader)}</t></is></c>`
    );

    // Ensure sheet view starts cleanly at A1 so Column C (ITEM NO) is immediately visible without horizontal scrolling
    xml = xml.replace(/topLeftCell="[A-Z0-9]+"/g, 'topLeftCell="A1"');

    // 3. Reconcile and calculate data rows
    const { items, totals } = processMonthlyInventoryData({
      inventoryRows,
      dispensingRows,
      requestRows,
      otherProgramsRows,
      stockReturnsRows,
      year,
      month,
    });

    const groups = groupReportItemsByPo(items);
    const itemCount = items.length;

    // 4. Auto-adjust column widths for Column D (Item Description), Column F (Brand), and Column G (Lot No)
    // Base template widths: Col D = 41.28515625, Col F = 12.7109375, Col G = 12.7109375
    let maxDescLen = 0;
    let maxBrandLen = 0;
    let maxLotLen = 0;

    for (const group of groups) {
      if (group.headerText) {
        maxDescLen = Math.max(maxDescLen, group.headerText.length);
      }
      for (const it of group.items || []) {
        if (it.itemDescription) {
          maxDescLen = Math.max(maxDescLen, it.itemDescription.length);
        }
        if (it.brandName) {
          maxBrandLen = Math.max(maxBrandLen, it.brandName.length);
        }
        if (it.lotNo) {
          maxLotLen = Math.max(maxLotLen, String(it.lotNo).length);
        }
      }
    }

    const baseColDWidth = 41.28515625;
    const baseColFWidth = 12.7109375;
    const baseColGWidth = 12.7109375;

    // Excel font width calculation: characters + 4 padding
    const colDWidth = Math.max(baseColDWidth, maxDescLen + 4);
    const colFWidth = Math.max(baseColFWidth, maxBrandLen + 4);
    const colGWidth = Math.max(baseColGWidth, maxLotLen + 4);

    const colsXml = `<cols>` +
      `<col min="2" max="2" width="11" customWidth="1"/>` +
      `<col min="4" max="4" width="${colDWidth}" customWidth="1"/>` +
      `<col min="5" max="5" width="15.7109375" customWidth="1"/>` +
      `<col min="6" max="6" width="${colFWidth}" style="2" customWidth="1"/>` +
      `<col min="7" max="7" width="${colGWidth}" customWidth="1"/>` +
      `<col min="8" max="23" width="12.7109375" customWidth="1"/>` +
      `<col min="24" max="24" width="15.7109375" customWidth="1"/>` +
      `<col min="25" max="30" width="12.7109375" customWidth="1"/>` +
      `</cols>`;

    xml = xml.replace(/<cols>[\s\S]*?<\/cols>/, colsXml);

    let rowsXml = "";
    let currentRow = 5;

    if (itemCount === 0) {
      // Empty template state: 1 PO header row ("PO NO." at row 5) followed by 3 empty medicine rows (rows 6, 7, 8)
      const group = groups[0];
      rowsXml += `<row r="${currentRow}" spans="3:30" ht="20.1" customHeight="1" x14ac:dyDescent="0.25">`;
      rowsXml += `<c r="C${currentRow}" s="4"/>`;
      rowsXml += `<c r="D${currentRow}" s="32" t="inlineStr"><is><t>${escapeXml(group.headerText)}</t></is></c>`;
      rowsXml += `<c r="E${currentRow}" s="4"/><c r="F${currentRow}" s="33"/><c r="G${currentRow}" s="4"/><c r="H${currentRow}" s="4"/><c r="I${currentRow}" s="4"/>`;
      rowsXml += `<c r="J${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="K${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
      rowsXml += `<c r="L${currentRow}" s="4"/><c r="M${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="N${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
      rowsXml += `<c r="O${currentRow}" s="4"/><c r="P${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="Q${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
      rowsXml += `<c r="R${currentRow}" s="4"/><c r="S${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="T${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
      rowsXml += `<c r="U${currentRow}" s="4"/><c r="V${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="W${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
      rowsXml += `<c r="X${currentRow}" s="33"/><c r="Y${currentRow}" s="4"/><c r="Z${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="AA${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
      rowsXml += `<c r="AB${currentRow}" s="4"/><c r="AC${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="AD${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
      rowsXml += `</row>`;
      currentRow++;

      for (let b = 0; b < 3; b++) {
        rowsXml += `<row r="${currentRow}" spans="3:30" ht="20.1" customHeight="1" x14ac:dyDescent="0.25">`;
        rowsXml += `<c r="C${currentRow}" s="4"><v>${b + 1}</v></c>`;
        rowsXml += `<c r="D${currentRow}" s="33"/><c r="E${currentRow}" s="4"/><c r="F${currentRow}" s="33"/><c r="G${currentRow}" s="4"/><c r="H${currentRow}" s="4"/><c r="I${currentRow}" s="4"/>`;
        rowsXml += `<c r="J${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="K${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="L${currentRow}" s="4"/><c r="M${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="N${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="O${currentRow}" s="4"/><c r="P${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="Q${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="R${currentRow}" s="4"/><c r="S${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="T${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="U${currentRow}" s="4"/><c r="V${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="W${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="X${currentRow}" s="33"/><c r="Y${currentRow}" s="4"/><c r="Z${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="AA${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="AB${currentRow}" s="4"/><c r="AC${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="AD${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `</row>`;
        currentRow++;
      }
    } else {
      for (const group of groups) {
        // 1. PO Section Header row ABOVE the medicines (D uses s="32" for bright yellow highlight matching official template)
        rowsXml += `<row r="${currentRow}" spans="3:30" ht="20.1" customHeight="1" x14ac:dyDescent="0.25">`;
        rowsXml += `<c r="C${currentRow}" s="4"/>`;
        rowsXml += `<c r="D${currentRow}" s="32" t="inlineStr"><is><t>${escapeXml(group.headerText)}</t></is></c>`;
        rowsXml += `<c r="E${currentRow}" s="4"/><c r="F${currentRow}" s="33"/><c r="G${currentRow}" s="4"/><c r="H${currentRow}" s="4"/><c r="I${currentRow}" s="4"/>`;
        rowsXml += `<c r="J${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="K${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="L${currentRow}" s="4"/><c r="M${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="N${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="O${currentRow}" s="4"/><c r="P${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="Q${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="R${currentRow}" s="4"/><c r="S${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="T${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="U${currentRow}" s="4"/><c r="V${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="W${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="X${currentRow}" s="33"/><c r="Y${currentRow}" s="4"/><c r="Z${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="AA${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="AB${currentRow}" s="4"/><c r="AC${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c><c r="AD${currentRow}" s="36" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `</row>`;
        currentRow++;

        // 2. Medicine Items under this PO: Exact 8pt Amasis MT Pro font with uniform thin borders matching official template
        for (const item of group.items) {
          rowsXml += `<row r="${currentRow}" spans="3:30" ht="20.1" customHeight="1" x14ac:dyDescent="0.25">`;
          rowsXml += `<c r="C${currentRow}" s="4"><v>${item.index}</v></c>`;
          rowsXml += `<c r="D${currentRow}" s="33" t="inlineStr"><is><t>${escapeXml(item.itemDescription)}</t></is></c>`;
          rowsXml += `<c r="E${currentRow}" s="4" t="inlineStr"><is><t>${escapeXml(item.unitOfMeasure)}</t></is></c>`;
          rowsXml += `<c r="F${currentRow}" s="33" t="inlineStr"><is><t>${escapeXml(item.brandName)}</t></is></c>`;
          rowsXml += `<c r="G${currentRow}" s="4" t="inlineStr"><is><t>${escapeXml(item.lotNo)}</t></is></c>`;
          rowsXml += `<c r="H${currentRow}" s="4" t="inlineStr"><is><t>${escapeXml(item.expiryDate)}</t></is></c>`;
          // Beg Balance (I, J, K)
          rowsXml += `<c r="I${currentRow}" s="4"><v>${item.beginningQty}</v></c>`;
          rowsXml += `<c r="J${currentRow}" s="36"><v>${item.unitCost}</v></c>`;
          rowsXml += `<c r="K${currentRow}" s="36"><f>I${currentRow}*J${currentRow}</f><v>${item.begTotal}</v></c>`;
          // Additional Deliveries (L, M, N)
          rowsXml += `<c r="L${currentRow}" s="4"><v>${item.additionalQty}</v></c>`;
          rowsXml += `<c r="M${currentRow}" s="36"><v>${item.additionalQty > 0 ? item.unitCost : 0}</v></c>`;
          rowsXml += `<c r="N${currentRow}" s="36"><f>L${currentRow}*M${currentRow}</f><v>${item.addTotal}</v></c>`;
          // Summation (O, P, Q)
          rowsXml += `<c r="O${currentRow}" s="4"><f>I${currentRow}+L${currentRow}</f><v>${item.grossQty}</v></c>`;
          rowsXml += `<c r="P${currentRow}" s="36"><f>J${currentRow}</f><v>${item.unitCost}</v></c>`;
          rowsXml += `<c r="Q${currentRow}" s="36"><f>O${currentRow}*P${currentRow}</f><v>${item.grossTotal}</v></c>`;
          // Issuances (R, S, T)
          rowsXml += `<c r="R${currentRow}" s="4"><v>${item.issuedQty}</v></c>`;
          rowsXml += `<c r="S${currentRow}" s="36"><f>P${currentRow}</f><v>${item.unitCost}</v></c>`;
          rowsXml += `<c r="T${currentRow}" s="36"><f>R${currentRow}*S${currentRow}</f><v>${item.issuedTotal}</v></c>`;
          // Transferred to Other Programs (U, V, W, X)
          rowsXml += `<c r="U${currentRow}" s="4"><v>${item.programQty}</v></c>`;
          rowsXml += `<c r="V${currentRow}" s="36"><v>${item.programQty > 0 ? item.unitCost : 0}</v></c>`;
          rowsXml += `<c r="W${currentRow}" s="36"><f>U${currentRow}*V${currentRow}</f><v>${item.programTotal}</v></c>`;
          rowsXml += `<c r="X${currentRow}" s="33" t="inlineStr"><is><t>${escapeXml(item.programName)}</t></is></c>`;
          // Expired (Y, Z, AA)
          rowsXml += `<c r="Y${currentRow}" s="4"><v>${item.expiredQty}</v></c>`;
          rowsXml += `<c r="Z${currentRow}" s="36"><v>${item.expiredQty > 0 ? item.unitCost : 0}</v></c>`;
          rowsXml += `<c r="AA${currentRow}" s="36"><f>Y${currentRow}*Z${currentRow}</f><v>${item.expiredTotal}</v></c>`;
          // Remaining Balance (AB, AC, AD)
          rowsXml += `<c r="AB${currentRow}" s="4"><f>O${currentRow}-(R${currentRow}+U${currentRow}+Y${currentRow})</f><v>${item.remainingQty}</v></c>`;
          rowsXml += `<c r="AC${currentRow}" s="36"><f>P${currentRow}</f><v>${item.unitCost}</v></c>`;
          rowsXml += `<c r="AD${currentRow}" s="36"><f>AB${currentRow}*AC${currentRow}</f><v>${item.remainingTotal}</v></c>`;
          rowsXml += `</row>`;
          currentRow++;
        }
      }
    }

    // 5. Total Row
    const lastDataRow = currentRow - 1;
    const totalRow = currentRow;

    const kTotalContent = itemCount > 0 ? `<f>SUM(K5:K${lastDataRow})</f><v>${totals.totalBegVal}</v>` : `<is><t>₱</t></is>`;
    const kTotalType = itemCount > 0 ? "" : ' t="inlineStr"';

    const nTotalContent = itemCount > 0 ? `<f>SUM(N5:N${lastDataRow})</f><v>${totals.totalAddVal}</v>` : `<is><t>₱</t></is>`;
    const nTotalType = itemCount > 0 ? "" : ' t="inlineStr"';

    const qTotalContent = itemCount > 0 ? `<f>SUM(Q5:Q${lastDataRow})</f><v>${totals.totalGrossVal}</v>` : `<is><t>₱</t></is>`;
    const qTotalType = itemCount > 0 ? "" : ' t="inlineStr"';

    const tTotalContent = itemCount > 0 ? `<f>SUM(T5:T${lastDataRow})</f><v>${totals.totalIssuedVal}</v>` : `<is><t>₱</t></is>`;
    const tTotalType = itemCount > 0 ? "" : ' t="inlineStr"';

    const wTotalContent = itemCount > 0 ? `<f>SUM(W5:W${lastDataRow})</f><v>${totals.totalProgVal}</v>` : `<is><t>₱</t></is>`;
    const wTotalType = itemCount > 0 ? "" : ' t="inlineStr"';

    const aaTotalContent = itemCount > 0 ? `<f>SUM(AA5:AA${lastDataRow})</f><v>${totals.totalExpiredVal}</v>` : `<is><t>₱</t></is>`;
    const aaTotalType = itemCount > 0 ? "" : ' t="inlineStr"';

    const adTotalContent = itemCount > 0 ? `<f>SUM(AD5:AD${lastDataRow})</f><v>${totals.totalRemVal}</v>` : `<is><t>₱</t></is>`;
    const adTotalType = itemCount > 0 ? "" : ' t="inlineStr"';

    let totalRowXml = `<row r="${totalRow}" spans="3:30" ht="20.1" customHeight="1" x14ac:dyDescent="0.25">`;
    totalRowXml += `<c r="C${totalRow}" s="4"/>`;
    totalRowXml += `<c r="D${totalRow}" s="3" t="inlineStr"><is><t>TOTAL</t></is></c>`;
    totalRowXml += `<c r="E${totalRow}" s="3"/><c r="F${totalRow}" s="3"/><c r="G${totalRow}" s="3"/><c r="H${totalRow}" s="3"/><c r="I${totalRow}" s="37"/>`;
    totalRowXml += `<c r="J${totalRow}" s="37"/>`;
    totalRowXml += `<c r="K${totalRow}" s="37"${kTotalType}>${kTotalContent}</c>`;
    totalRowXml += `<c r="L${totalRow}" s="3"/><c r="M${totalRow}" s="37"/>`;
    totalRowXml += `<c r="N${totalRow}" s="37"${nTotalType}>${nTotalContent}</c>`;
    totalRowXml += `<c r="O${totalRow}" s="3"/><c r="P${totalRow}" s="37"/>`;
    totalRowXml += `<c r="Q${totalRow}" s="37"${qTotalType}>${qTotalContent}</c>`;
    totalRowXml += `<c r="R${totalRow}" s="3"/><c r="S${totalRow}" s="37"/>`;
    totalRowXml += `<c r="T${totalRow}" s="37"${tTotalType}>${tTotalContent}</c>`;
    totalRowXml += `<c r="U${totalRow}" s="3"/><c r="V${totalRow}" s="37"/>`;
    totalRowXml += `<c r="W${totalRow}" s="37"${wTotalType}>${wTotalContent}</c>`;
    totalRowXml += `<c r="X${totalRow}" s="3"/><c r="Y${totalRow}" s="3"/><c r="Z${totalRow}" s="37"/>`;
    totalRowXml += `<c r="AA${totalRow}" s="37"${aaTotalType}>${aaTotalContent}</c>`;
    totalRowXml += `<c r="AB${totalRow}" s="3"/><c r="AC${totalRow}" s="37"/>`;
    totalRowXml += `<c r="AD${totalRow}" s="37"${adTotalType}>${adTotalContent}</c>`;
    totalRowXml += `</row>`;

    // 6. Replace sheetData from row 5 onwards
    const sheetDataTailRegex = /<row r="5"[\s\S]*?<\/sheetData>/;
    xml = xml.replace(sheetDataTailRegex, `${rowsXml}${totalRowXml}</sheetData>`);

    // 7. Update dimensions
    xml = xml.replace(/<dimension ref="C3:AD\d+"/, `<dimension ref="C3:AD${totalRow}"`);

    // 8. Suppress all Excel background warnings (numbers stored as text, formula range, empty cells, etc.)
    const ignoredErrorsXml = `<ignoredErrors>` +
      `<ignoredError sqref="C3:AD${totalRow + 100}" numberStoredAsText="1" evalError="1" twoDigitTextYear="1" formula="1" formulaRange="1" unlockedFormula="1" emptyCellReference="1"/>` +
      `</ignoredErrors>`;
    if (xml.includes("</ignoredErrors>")) {
      xml = xml.replace(/<ignoredErrors>[\s\S]*?<\/ignoredErrors>/, ignoredErrorsXml);
    } else {
      xml = xml.replace("</worksheet>", `${ignoredErrorsXml}</worksheet>`);
    }

    s1Entry.content = new TextEncoder().encode(xml);
    s1Entry.size = s1Entry.content.length;

    return cfb.write(zip, { fileType: "zip", type: "array" });
  } catch (err) {
    console.warn("Failed to inject into Inventory Form template CFB, falling back to XLSX.write:", err);
    const wb = buildMonthlyInventoryWorkbook({
      inventoryRows,
      dispensingRows,
      requestRows,
      otherProgramsRows,
      year,
      month,
      facilityName,
      pharmacistName,
      choDoctorName,
    });
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }
}

/**
 * Builds the Monthly Inventory Physical Count Workbook using InventoryForm.xlsx template
 * (Fallback object builder for SheetJS runtime compatibility)
 */
export function buildMonthlyInventoryWorkbook({
  inventoryRows = [],
  dispensingRows = [],
  requestRows = [],
  otherProgramsRows = [],
  stockReturnsRows = [],
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  facilityName = "VMCH MEDICINE SUPPLIES",
  pharmacistName = "ROSEMIE ANN GETUTUA",
  choDoctorName = "DR. CAMILLE F. PENALOSA",
}) {
  let wb;

  try {
    if (INVENTORY_FORM_TEMPLATE_BASE64) {
      wb = XLSX.read(INVENTORY_FORM_TEMPLATE_BASE64, {
        type: "base64",
        cellStyles: true,
      });
    }
  } catch (err) {
    console.warn("Could not load Inventory Form base64 template, creating from scratch:", err);
  }

  if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
    wb = XLSX.utils.book_new();
  }

  const sheetName = wb.SheetNames[0] || "Inventory";
  let ws = wb.Sheets[sheetName];
  if (!ws) {
    ws = {};
    wb.SheetNames.push(sheetName);
    wb.Sheets[sheetName] = ws;
  }

  // Calculate Dates and Formatted Headers
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;

  const targetDate = new Date(year, month - 1, 1);
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" })
    .format(targetDate)
    .toUpperCase();
  const monthNameTitle = new Intl.DateTimeFormat("en-US", { month: "long" })
    .format(targetDate);
  const lastDay = new Date(year, month, 0).getDate();
  // Adaptive date: If current in-progress month, stamp active date; if closed past month, stamp month-end
  const effectiveRemDay = isCurrentMonth ? now.getDate() : lastDay;

  const remainingHeader = `REMAINING BALANCE  AS OF \n${monthName} ${effectiveRemDay}, ${year}`;

  const prevDate = new Date(year, month - 1, 0);
  const prevMonthName = new Intl.DateTimeFormat("en-US", { month: "long" })
    .format(prevDate)
    .toUpperCase();
  const prevLastDay = prevDate.getDate();
  const prevYear = prevDate.getFullYear();
  const begBalanceHeader = `BEGINNING BALANCE AS OF \n${prevMonthName} ${prevLastDay}, ${prevYear}`;

  const resolvedFacilityName =
    !facilityName ||
    /VICENTE MENDIOLA|CITY HEALTH OFFICE|\bCHO\b|\bVMCH\b/i.test(facilityName)
      ? "VMCH MEDICINE SUPPLIES"
      : facilityName.toUpperCase().includes("MEDICINE SUPPLIES")
      ? facilityName.toUpperCase()
      : `${facilityName.toUpperCase()} MEDICINE SUPPLIES`;

  // Section Headers & Titles (Row 3)
  const titleText = `REPORT ON PHYSICAL COUNT OF INVENTORIES: ${resolvedFacilityName} MONTH \n${monthNameTitle}, ${year}`;
  ws["C3"] = { t: "s", v: titleText };
  ws["I3"] = { t: "s", v: begBalanceHeader };
  ws["L3"] = { t: "s", v: "ADDITIONAL DELIVERIES/RETURNS" };
  ws["O3"] = { t: "s", v: "SUMMATION ( BEGINNING BALANCE + \nADDITIONAL DELIVERY)" };
  ws["R3"] = { t: "s", v: " ISSUANCES" };
  ws["U3"] = { t: "s", v: "TRANSFERRED TO OTHER \nPROGRAM" };
  ws["X3"] = { t: "s", v: "AREA/\nPROGRAM" };
  ws["Y3"] = { t: "s", v: "EXPIRED ITEMS" };
  ws["AB3"] = { t: "s", v: remainingHeader };

  // Sub-headers in Row 4
  ws["C4"] = { t: "s", v: "ITEM NO" };
  ws["D4"] = { t: "s", v: "ITEM DESCRIPTION" };
  ws["E4"] = { t: "s", v: "UNIT " };
  ws["F4"] = { t: "s", v: "BRAND" };
  ws["G4"] = { t: "s", v: "LOT NO" };
  ws["H4"] = { t: "s", v: "EXPIRY DATE" };
  ws["I4"] = { t: "s", v: "QUANTITY" };
  ws["J4"] = { t: "s", v: "UNIT COST" };
  ws["K4"] = { t: "s", v: "TOTAL COST" };
  ws["L4"] = { t: "s", v: "QUANTITY" };
  ws["M4"] = { t: "s", v: "UNIT COST" };
  ws["N4"] = { t: "s", v: "TOTAL COST" };
  ws["O4"] = { t: "s", v: "QUANTITY" };
  ws["P4"] = { t: "s", v: "UNIT COST" };
  ws["Q4"] = { t: "s", v: "TOTAL COST" };
  ws["R4"] = { t: "s", v: "QUANTITY" };
  ws["S4"] = { t: "s", v: "UNIT COST" };
  ws["T4"] = { t: "s", v: "TOTAL COST" };
  ws["U4"] = { t: "s", v: "QUANTITY" };
  ws["V4"] = { t: "s", v: "UNIT COST" };
  ws["W4"] = { t: "s", v: "TOTAL COST" };
  ws["X4"] = { t: "s", v: "AREA/\nPROGRAM" };
  ws["Y4"] = { t: "s", v: "QUANTITY" };
  ws["Z4"] = { t: "s", v: "UNIT COST" };
  ws["AA4"] = { t: "s", v: "TOTAL COST" };
  ws["AB4"] = { t: "s", v: "QUANTITY" };
  ws["AC4"] = { t: "s", v: "UNIT COST" };
  ws["AD4"] = { t: "s", v: "TOTAL COST" };

  // Clear existing template data cells (rows >= 5)
  for (const k of Object.keys(ws)) {
    if (k.startsWith("!")) continue;
    const match = k.match(/^[A-Z]+(\d+)$/);
    if (match && parseInt(match[1], 10) >= 5) {
      delete ws[k];
    }
  }

  // Reconcile and calculate
  const { items, totals } = processMonthlyInventoryData({
    inventoryRows,
    dispensingRows,
    requestRows,
    otherProgramsRows,
    stockReturnsRows,
    year,
    month,
  });

  const groups = groupReportItemsByPo(items);
  const itemCount = items.length;

  let currentRow = 5;

  if (itemCount === 0) {
    const group = groups[0];
    ws[`D${currentRow}`] = { t: "s", v: group.headerText };
    ws[`J${currentRow}`] = { t: "s", v: "₱" };
    ws[`K${currentRow}`] = { t: "s", v: "₱" };
    ws[`M${currentRow}`] = { t: "s", v: "₱" };
    ws[`N${currentRow}`] = { t: "s", v: "₱" };
    ws[`P${currentRow}`] = { t: "s", v: "₱" };
    ws[`Q${currentRow}`] = { t: "s", v: "₱" };
    ws[`S${currentRow}`] = { t: "s", v: "₱" };
    ws[`T${currentRow}`] = { t: "s", v: "₱" };
    ws[`V${currentRow}`] = { t: "s", v: "₱" };
    ws[`W${currentRow}`] = { t: "s", v: "₱" };
    ws[`Z${currentRow}`] = { t: "s", v: "₱" };
    ws[`AA${currentRow}`] = { t: "s", v: "₱" };
    ws[`AC${currentRow}`] = { t: "s", v: "₱" };
    ws[`AD${currentRow}`] = { t: "s", v: "₱" };
    currentRow++;

    for (let b = 0; b < 3; b++) {
      ws[`C${currentRow}`] = { t: "n", v: b + 1 };
      ws[`D${currentRow}`] = { t: "s", v: "" };
      ws[`J${currentRow}`] = { t: "s", v: "₱" };
      ws[`K${currentRow}`] = { t: "s", v: "₱" };
      ws[`M${currentRow}`] = { t: "s", v: "₱" };
      ws[`N${currentRow}`] = { t: "s", v: "₱" };
      ws[`P${currentRow}`] = { t: "s", v: "₱" };
      ws[`Q${currentRow}`] = { t: "s", v: "₱" };
      ws[`S${currentRow}`] = { t: "s", v: "₱" };
      ws[`T${currentRow}`] = { t: "s", v: "₱" };
      ws[`V${currentRow}`] = { t: "s", v: "₱" };
      ws[`W${currentRow}`] = { t: "s", v: "₱" };
      ws[`Z${currentRow}`] = { t: "s", v: "₱" };
      ws[`AA${currentRow}`] = { t: "s", v: "₱" };
      ws[`AC${currentRow}`] = { t: "s", v: "₱" };
      ws[`AD${currentRow}`] = { t: "s", v: "₱" };
      currentRow++;
    }
  } else {
    for (const group of groups) {
      // 1. PO Header Row above the medicines (Option 1)
      ws[`D${currentRow}`] = { t: "s", v: group.headerText };
      ws[`J${currentRow}`] = { t: "s", v: "₱" };
      ws[`K${currentRow}`] = { t: "s", v: "₱" };
      ws[`M${currentRow}`] = { t: "s", v: "₱" };
      ws[`N${currentRow}`] = { t: "s", v: "₱" };
      ws[`P${currentRow}`] = { t: "s", v: "₱" };
      ws[`Q${currentRow}`] = { t: "s", v: "₱" };
      ws[`S${currentRow}`] = { t: "s", v: "₱" };
      ws[`T${currentRow}`] = { t: "s", v: "₱" };
      ws[`V${currentRow}`] = { t: "s", v: "₱" };
      ws[`W${currentRow}`] = { t: "s", v: "₱" };
      ws[`Z${currentRow}`] = { t: "s", v: "₱" };
      ws[`AA${currentRow}`] = { t: "s", v: "₱" };
      ws[`AC${currentRow}`] = { t: "s", v: "₱" };
      ws[`AD${currentRow}`] = { t: "s", v: "₱" };
      currentRow++;

      // 2. Medicine Items under this PO
      for (const item of group.items) {
        ws[`C${currentRow}`] = { t: "n", v: item.index };
        ws[`D${currentRow}`] = { t: "s", v: item.itemDescription };
        ws[`E${currentRow}`] = { t: "s", v: item.unitOfMeasure };
        ws[`F${currentRow}`] = { t: "s", v: item.brandName };
        ws[`G${currentRow}`] = { t: "s", v: item.lotNo };
        ws[`H${currentRow}`] = { t: "s", v: item.expiryDate };
        ws[`I${currentRow}`] = { t: "n", v: item.beginningQty };
        ws[`J${currentRow}`] = { t: "n", v: item.unitCost, z: "₱#,##0.00" };
        ws[`K${currentRow}`] = { t: "n", f: `I${currentRow}*J${currentRow}`, v: item.begTotal, z: "₱#,##0.00" };
        ws[`L${currentRow}`] = { t: "n", v: item.additionalQty };
        ws[`M${currentRow}`] = { t: "n", v: item.additionalQty > 0 ? item.unitCost : 0, z: "₱#,##0.00" };
        ws[`N${currentRow}`] = { t: "n", f: `L${currentRow}*M${currentRow}`, v: item.addTotal, z: "₱#,##0.00" };
        ws[`O${currentRow}`] = { t: "n", f: `I${currentRow}+L${currentRow}`, v: item.grossQty };
        ws[`P${currentRow}`] = { t: "n", f: `J${currentRow}`, v: item.unitCost, z: "₱#,##0.00" };
        ws[`Q${currentRow}`] = { t: "n", f: `O${currentRow}*P${currentRow}`, v: item.grossTotal, z: "₱#,##0.00" };
        ws[`R${currentRow}`] = { t: "n", v: item.issuedQty };
        ws[`S${currentRow}`] = { t: "n", f: `P${currentRow}`, v: item.unitCost, z: "₱#,##0.00" };
        ws[`T${currentRow}`] = { t: "n", f: `R${currentRow}*S${currentRow}`, v: item.issuedTotal, z: "₱#,##0.00" };
        ws[`U${currentRow}`] = { t: "n", v: item.programQty };
        ws[`V${currentRow}`] = { t: "n", v: item.programQty > 0 ? item.unitCost : 0, z: "₱#,##0.00" };
        ws[`W${currentRow}`] = { t: "n", f: `U${currentRow}*V${currentRow}`, v: item.programTotal, z: "₱#,##0.00" };
        ws[`X${currentRow}`] = { t: "s", v: item.programName };
        ws[`Y${currentRow}`] = { t: "n", v: item.expiredQty };
        ws[`Z${currentRow}`] = { t: "n", v: item.expiredQty > 0 ? item.unitCost : 0, z: "₱#,##0.00" };
        ws[`AA${currentRow}`] = { t: "n", f: `Y${currentRow}*Z${currentRow}`, v: item.expiredTotal, z: "₱#,##0.00" };
        ws[`AB${currentRow}`] = { t: "n", f: `O${currentRow}-(R${currentRow}+U${currentRow}+Y${currentRow})`, v: item.remainingQty };
        ws[`AC${currentRow}`] = { t: "n", f: `P${currentRow}`, v: item.unitCost, z: "₱#,##0.00" };
        ws[`AD${currentRow}`] = { t: "n", f: `AB${currentRow}*AC${currentRow}`, v: item.remainingTotal, z: "₱#,##0.00" };
        currentRow++;
      }
    }
  }

  // TOTAL Row
  const lastDataRow = currentRow - 1;
  const totalRow = currentRow;

  ws[`D${totalRow}`] = { t: "s", v: "TOTAL" };
  ws[`K${totalRow}`] = { t: "n", f: `SUM(K5:K${lastDataRow})`, v: totals.totalBegVal, z: "₱#,##0.00" };
  ws[`N${totalRow}`] = { t: "n", f: `SUM(N5:N${lastDataRow})`, v: totals.totalAddVal, z: "₱#,##0.00" };
  ws[`Q${totalRow}`] = { t: "n", f: `SUM(Q5:Q${lastDataRow})`, v: totals.totalGrossVal, z: "₱#,##0.00" };
  ws[`T${totalRow}`] = { t: "n", f: `SUM(T5:T${lastDataRow})`, v: totals.totalIssuedVal, z: "₱#,##0.00" };
  ws[`W${totalRow}`] = { t: "n", f: `SUM(W5:W${lastDataRow})`, v: totals.totalProgVal, z: "₱#,##0.00" };
  ws[`AA${totalRow}`] = { t: "n", f: `SUM(AA5:AA${lastDataRow})`, v: totals.totalExpiredVal, z: "₱#,##0.00" };
  ws[`AD${totalRow}`] = { t: "n", f: `SUM(AD5:AD${lastDataRow})`, v: totals.totalRemVal, z: "₱#,##0.00" };



  ws["!ref"] = `C3:AD${totalRow}`;
  ws["!merges"] = [
    { s: { r: 2, c: 24 }, e: { r: 2, c: 26 } }, // Y3:AA3
    { s: { r: 2, c: 27 }, e: { r: 2, c: 29 } }, // AB3:AD3
    { s: { r: 2, c: 8 },  e: { r: 2, c: 10 } }, // I3:K3
    { s: { r: 2, c: 2 },  e: { r: 2, c: 7 } },  // C3:H3
    { s: { r: 2, c: 11 }, e: { r: 2, c: 13 } }, // L3:N3
    { s: { r: 2, c: 14 }, e: { r: 2, c: 16 } }, // O3:Q3
    { s: { r: 2, c: 17 }, e: { r: 2, c: 19 } }, // R3:T3
    { s: { r: 2, c: 20 }, e: { r: 2, c: 22 } }, // U3:W3
  ];

  let maxDescLen = 0;
  let maxBrandLen = 0;
  let maxLotLen = 0;

  for (const group of groups) {
    if (group.headerText) {
      maxDescLen = Math.max(maxDescLen, group.headerText.length);
    }
    for (const it of group.items || []) {
      if (it.itemDescription) {
        maxDescLen = Math.max(maxDescLen, it.itemDescription.length);
      }
      if (it.brandName) {
        maxBrandLen = Math.max(maxBrandLen, it.brandName.length);
      }
      if (it.lotNo) {
        maxLotLen = Math.max(maxLotLen, String(it.lotNo).length);
      }
    }
  }

  const colDWch = Math.max(42, Math.min(85, maxDescLen + 4));
  const colFWch = Math.max(13, Math.min(45, maxBrandLen + 4));
  const colGWch = Math.max(13, Math.min(30, maxLotLen + 4));

  ws["!cols"] = [
    { wch: 4 },  // A
    { wch: 11 }, // B
    { wch: 8 },  // C (ITEM NO)
    { wch: colDWch }, // D (ITEM DESCRIPTION)
    { wch: 16 }, // E (UNIT)
    { wch: colFWch }, // F (BRAND)
    { wch: colGWch }, // G (LOT NO)
    { wch: 13 }, // H (EXPIRY DATE)
    { wch: 13 }, // I (QUANTITY)
    { wch: 13 }, // J (UNIT COST)
    { wch: 13 }, // K (TOTAL COST)
    { wch: 13 }, // L (QUANTITY)
    { wch: 13 }, // M (UNIT COST)
    { wch: 13 }, // N (TOTAL COST)
    { wch: 13 }, // O (QUANTITY)
    { wch: 13 }, // P (UNIT COST)
    { wch: 13 }, // Q (TOTAL COST)
    { wch: 13 }, // R (QUANTITY)
    { wch: 13 }, // S (UNIT COST)
    { wch: 13 }, // T (TOTAL COST)
    { wch: 13 }, // U (QUANTITY)
    { wch: 13 }, // V (UNIT COST)
    { wch: 13 }, // W (TOTAL COST)
    { wch: 16 }, // X (AREA/PROGRAM)
    { wch: 13 }, // Y (QUANTITY)
    { wch: 13 }, // Z (UNIT COST)
    { wch: 13 }, // AA (TOTAL COST)
    { wch: 13 }, // AB (QUANTITY)
    { wch: 13 }, // AC (UNIT COST)
    { wch: 13 }, // AD (TOTAL COST)
  ];

  return wb;
}

/**
 * Triggers export download for Daily RIS (2 Sheets)
 */
export async function exportDailyRisExcel({
  dispensingRows = [],
  requestRows = [],
  selectedDate = new Date(),
  risNo = "",
  facilityName = "",
}) {
  const buffer = buildDailyRisBuffer({ dispensingRows, requestRows, selectedDate, risNo, facilityName });
  const dateKey = toDateKey(selectedDate);
  const prefix = facilityName ? `${facilityName.replace(/\s+/g, "_")}_` : "";
  const filename = `${prefix}Request_Issuance_Slip_${dateKey}.xlsx`;

  return downloadExportFile({
    filename,
    buffer,
    format: "xlsx",
  });
}

/**
 * Triggers export download for Monthly Inventory Form
 */
export async function exportMonthlyInventoryExcel({
  inventoryRows = [],
  dispensingRows = [],
  requestRows = [],
  otherProgramsRows = [],
  stockReturnsRows = [],
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  facilityName = "VMCH MEDICINE SUPPLIES",
  pharmacistName = "ROSEMIE ANN GETUTUA",
  choDoctorName = "DR. CAMILLE F. PENALOSA",
}) {
  const buffer = buildMonthlyInventoryBuffer({
    inventoryRows,
    dispensingRows,
    requestRows,
    otherProgramsRows,
    stockReturnsRows,
    year,
    month,
    facilityName,
    pharmacistName,
    choDoctorName,
  });
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const filename = `Inventory_Form_${monthKey}.xlsx`;

  return downloadExportFile({
    filename,
    buffer,
    format: "xlsx",
  });
}

