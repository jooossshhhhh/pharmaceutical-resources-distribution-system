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
}) {
  const defaultExport = Reflect.get(XLSX, "default");
  const cfb =
    XLSX.CFB ||
    defaultExport?.CFB ||
    (typeof window !== "undefined" ? window.XLSX?.CFB || window.CFB : null);

  if (!cfb || !RIS_TEMPLATE_BASE64) {
    const wb = buildDailyRisWorkbook({ dispensingRows, requestRows, selectedDate, risNo });
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }

  try {
    const zip = cfb.read(RIS_TEMPLATE_BASE64, { type: "base64" });
    const s1Entry = cfb.find(zip, "sheet1.xml") || cfb.find(zip, "/xl/worksheets/sheet1.xml");
    const s2Entry = cfb.find(zip, "sheet2.xml") || cfb.find(zip, "/xl/worksheets/sheet2.xml");

    if (!s1Entry || !s2Entry) {
      const wb = buildDailyRisWorkbook({ dispensingRows, requestRows, selectedDate, risNo });
      return XLSX.write(wb, { bookType: "xlsx", type: "array" });
    }

    const dateFormatted = formatReportDate(selectedDate).toUpperCase();
    const targetDateKey = toDateKey(selectedDate);
    const medicinesSnapshot = getSnapshot(STORAGE_KEYS.MEDICINES, []);
    const medicinesMap = new Map(medicinesSnapshot.map((m) => [String(m.id), m]));

    // 1. Sheet 1 (CHO): Dispensing record in the dispensing module
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
          area: "PHARMACY DISPENSING",
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

    const origS1Xml = new TextDecoder().decode(s1Entry.content);
    const origS2Xml = new TextDecoder().decode(s2Entry.content);

    const newS1Xml = buildSheet1Xml(origS1Xml, choItems, dateFormatted, risNo);
    const newS2Xml = buildSheet2Xml(origS2Xml, bhwItems, dateFormatted, risNo);

    s1Entry.content = new TextEncoder().encode(newS1Xml);
    s1Entry.size = s1Entry.content.length;

    s2Entry.content = new TextEncoder().encode(newS2Xml);
    s2Entry.size = s2Entry.content.length;

    return cfb.write(zip, { fileType: "zip", type: "array" });
  } catch (err) {
    console.warn("Failed to inject into template CFB, falling back to XLSX.write:", err);
    const wb = buildDailyRisWorkbook({ dispensingRows, requestRows, selectedDate, risNo });
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
  // SHEET 1: CHO (In-House Pharmacy Dispensing from dispensing module)
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
        area: "PHARMACY DISPENSING",
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
  choWs["D1"] = { t: "s", v: "VICENTE MENDIOLA CENTER FOR HEALTH" };
  choWs["D2"] = { t: "s", v: "REQUEST ISSUANCE SLIP" };
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
 * Processes and reconciles monthly inventory data from dispensing, requests, and programs
 */
export function processMonthlyInventoryData({
  inventoryRows = [],
  dispensingRows = [],
  requestRows = [],
  otherProgramsRows = [],
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
}) {
  const targetMonthPrefix = `${year}-${String(month).padStart(2, "0")}`;

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

  // Totals accumulators
  let totalBegVal = 0;
  let totalAddVal = 0;
  let totalGrossVal = 0;
  let totalIssuedVal = 0;
  let totalProgVal = 0;
  let totalExpiredVal = 0;
  let totalRemVal = 0;

  const items = inventoryRows.map((item, idx) => {
    const med = item.medicine || {};
    const medId = String(item.medicine_id || med.id || "");
    const batch = (item.batch_number || item.lot_number || item.lot || "").trim().toUpperCase();

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
    if (item.expired_quantity !== undefined || item.expiredQty !== undefined) {
      expiredQty = Number(item.expired_quantity ?? item.expiredQty ?? 0);
    } else if (item.status === "EXPIRED") {
      expiredQty = Number(item.quantity) || 0;
    }

    // Additional Stocks Received this Month
    let additionalQty = 0;
    if (item.additional_quantity !== undefined || item.additionalQty !== undefined) {
      additionalQty = Number(item.additional_quantity ?? item.additionalQty ?? 0);
    } else {
      const receivedDateKey = toDateKey(item.date_received || item.created_at);
      if (receivedDateKey.startsWith(targetMonthPrefix) && item.received_quantity) {
        additionalQty = Number(item.received_quantity) || 0;
      }
    }

    // Physical Remaining Count on Hand
    let remainingQty = 0;
    if (item.remaining_quantity !== undefined || item.remainingQty !== undefined) {
      remainingQty = Number(item.remaining_quantity ?? item.remainingQty ?? 0);
    } else {
      remainingQty = item.status === "EXPIRED" ? 0 : (Number(item.quantity) || 0);
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
 * Builds the Monthly Inventory Physical Count XLSX binary buffer directly into the client's official
 * template package (inventory-form.xlsx).
 * Guarantees 100% preservation of:
 * - Font faces (Aptos Narrow, Amasis MT Pro Light), sizes, colors, and borders
 * - Exact column widths (<cols>) and row heights
 * - Date addressing in C5 (Month), I5 (Beginning Balance), AG5 (Remaining Balance)
 * - Dynamic rows with Excel formulas (=I*J, =L*M, =L+I, =SUM(...), etc.)
 */
export function buildMonthlyInventoryBuffer({
  inventoryRows = [],
  dispensingRows = [],
  requestRows = [],
  otherProgramsRows = [],
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
        year,
        month,
        facilityName,
        pharmacistName,
        choDoctorName,
      });
      return XLSX.write(wb, { bookType: "xlsx", type: "array" });
    }

    let xml = new TextDecoder().decode(s1Entry.content);

    // 1. Calculate Dates and Formatted Headers
    const targetDate = new Date(year, month - 1, 1);
    const monthName = new Intl.DateTimeFormat("en-US", { month: "long" })
      .format(targetDate)
      .toUpperCase();
    const lastDay = new Date(year, month, 0).getDate();
    const monthHeader = `MONTH : ${monthName} ${lastDay}, ${year}`;
    const remainingHeader = `REMAINING BALANCE  AS OF \n${monthName} ${lastDay}, ${year}`;

    const prevDate = new Date(year, month - 1, 0);
    const prevMonthName = new Intl.DateTimeFormat("en-US", { month: "long" })
      .format(prevDate)
      .toUpperCase();
    const prevLastDay = prevDate.getDate();
    const prevYear = prevDate.getFullYear();
    const begBalanceHeader = `BEGINNING BALANCE AS OF \n${prevMonthName} ${prevLastDay}, ${prevYear}`;

    // 2. Update Title (Row 3, Cell C3)
    const resolvedFacility = facilityName
      ? facilityName.toUpperCase().includes("MEDICINE SUPPLIES")
        ? facilityName.toUpperCase()
        : `${facilityName.toUpperCase()} MEDICINE SUPPLIES`
      : "VMCH MEDICINE SUPPLIES";
    const titleText = `REPORT ON PHYSICAL COUNT OF INVENTORIES\n${resolvedFacility}`;
    xml = xml.replace(
      cellRegex("C3"),
      `<c r="C3" s="36" t="inlineStr"><is><t xml:space="preserve">${escapeXml(titleText)}</t></is></c>`
    );

    // 3. Update Dates in Row 5: C5 (Month), I5 (Beginning Balance), AG5 (Remaining Balance)
    xml = xml.replace(
      cellRegex("C5"),
      `<c r="C5" s="45" t="inlineStr"><is><t xml:space="preserve">${escapeXml(monthHeader)}</t></is></c>`
    );
    xml = xml.replace(
      cellRegex("I5"),
      `<c r="I5" s="42" t="inlineStr"><is><t xml:space="preserve">${escapeXml(begBalanceHeader)}</t></is></c>`
    );
    xml = xml.replace(
      cellRegex("AG5"),
      `<c r="AG5" s="54" t="inlineStr"><is><t xml:space="preserve">${escapeXml(remainingHeader)}</t></is></c>`
    );

    // 4. Reconcile and calculate data rows
    const { items, totals } = processMonthlyInventoryData({
      inventoryRows,
      dispensingRows,
      requestRows,
      otherProgramsRows,
      year,
      month,
    });

    const itemCount = items.length;
    const numDataRows = Math.max(3, itemCount);
    const lastDataRow = 6 + numDataRows;
    const totalRow = lastDataRow + 1;

    let rowsXml = "";
    for (let i = 0; i < numDataRows; i++) {
      const rowNum = 7 + i;
      const item = items[i];
      const isLastData = (i === numDataRows - 1);
      const spacerStyle = isLastData ? 's="20"' : 's="19"';

      rowsXml += `<row r="${rowNum}" spans="3:35" ht="20.1" customHeight="1" x14ac:dyDescent="0.25">`;
      if (item) {
        // C: Item No (Amasis MT Pro Light 8pt, center, border 1)
        rowsXml += `<c r="C${rowNum}" s="7"><v>${item.index}</v></c>`;
        // D: Description (Amasis MT Pro Light 10pt, left, border 1)
        rowsXml += `<c r="D${rowNum}" s="24" t="inlineStr"><is><t>${escapeXml(item.itemDescription)}</t></is></c>`;
        // E: Unit of Measure (Amasis MT Pro Light 10pt, left, border 1)
        rowsXml += `<c r="E${rowNum}" s="24" t="inlineStr"><is><t>${escapeXml(item.unitOfMeasure)}</t></is></c>`;
        // F: Brand (Amasis MT Pro Light 10pt, left, center, border 1)
        rowsXml += `<c r="F${rowNum}" s="25" t="inlineStr"><is><t>${escapeXml(item.brandName)}</t></is></c>`;
        // G: Lot No (Amasis MT Pro Light 10pt, left, border 1)
        rowsXml += `<c r="G${rowNum}" s="24" t="inlineStr"><is><t>${escapeXml(item.lotNo)}</t></is></c>`;
        // H: Expiry Date (Amasis MT Pro Light 10pt, left, border 1)
        rowsXml += `<c r="H${rowNum}" s="24" t="inlineStr"><is><t>${escapeXml(item.expiryDate)}</t></is></c>`;
        // Beginning (I, J, K) - I is quantity (s=28), J & K are costs (s=26 with peso format & border 1)
        rowsXml += `<c r="I${rowNum}" s="28"><v>${item.beginningQty}</v></c>`;
        rowsXml += `<c r="J${rowNum}" s="26"><v>${item.unitCost}</v></c>`;
        rowsXml += `<c r="K${rowNum}" s="26"><f>I${rowNum}*J${rowNum}</f><v>${item.begTotal}</v></c>`;
        // Additional (L, M, N)
        rowsXml += `<c r="L${rowNum}" s="28"><v>${item.additionalQty}</v></c>`;
        rowsXml += `<c r="M${rowNum}" s="26"><v>${item.additionalQty > 0 ? item.unitCost : 0}</v></c>`;
        rowsXml += `<c r="N${rowNum}" s="26"><f>L${rowNum}*M${rowNum}</f><v>${item.addTotal}</v></c>`;
        // Spacer O
        rowsXml += `<c r="O${rowNum}" ${spacerStyle}/>`;
        // Summation (P, Q, R)
        rowsXml += `<c r="P${rowNum}" s="28"><f>L${rowNum}+I${rowNum}</f><v>${item.grossQty}</v></c>`;
        rowsXml += `<c r="Q${rowNum}" s="26"><f>J${rowNum}</f><v>${item.unitCost}</v></c>`;
        rowsXml += `<c r="R${rowNum}" s="26"><f>Q${rowNum}*P${rowNum}</f><v>${item.grossTotal}</v></c>`;
        // Spacer S
        rowsXml += `<c r="S${rowNum}" ${spacerStyle}/>`;
        // Less Issuances (T, U, V)
        rowsXml += `<c r="T${rowNum}" s="28"><v>${item.issuedQty}</v></c>`;
        rowsXml += `<c r="U${rowNum}" s="26"><f>Q${rowNum}</f><v>${item.unitCost}</v></c>`;
        rowsXml += `<c r="V${rowNum}" s="26"><f>U${rowNum}*T${rowNum}</f><v>${item.issuedTotal}</v></c>`;
        // Spacer W
        rowsXml += `<c r="W${rowNum}" ${spacerStyle}/>`;
        // Transferred to Other Programs (X, Y, Z, AA)
        rowsXml += `<c r="X${rowNum}" s="28"><v>${item.programQty}</v></c>`;
        rowsXml += `<c r="Y${rowNum}" s="26"><v>${item.programQty > 0 ? item.unitCost : 0}</v></c>`;
        rowsXml += `<c r="Z${rowNum}" s="26"><f>X${rowNum}*Y${rowNum}</f><v>${item.programTotal}</v></c>`;
        rowsXml += `<c r="AA${rowNum}" s="31" t="inlineStr"><is><t>${escapeXml(item.programName)}</t></is></c>`;
        // Spacer AB
        rowsXml += `<c r="AB${rowNum}" ${spacerStyle}/>`;
        // Expired (AC, AD, AE)
        rowsXml += `<c r="AC${rowNum}" s="28"><v>${item.expiredQty}</v></c>`;
        rowsXml += `<c r="AD${rowNum}" s="26"><v>${item.expiredQty > 0 ? item.unitCost : 0}</v></c>`;
        rowsXml += `<c r="AE${rowNum}" s="26"><f>AC${rowNum}*AD${rowNum}</f><v>${item.expiredTotal}</v></c>`;
        // Spacer AF
        rowsXml += `<c r="AF${rowNum}" ${spacerStyle}/>`;
        // Remaining Balance (AG, AH, AI)
        rowsXml += `<c r="AG${rowNum}" s="28"><f>P${rowNum}-(T${rowNum}+X${rowNum}+AC${rowNum})</f><v>${item.remainingQty}</v></c>`;
        rowsXml += `<c r="AH${rowNum}" s="26"><f>U${rowNum}</f><v>${item.unitCost}</v></c>`;
        rowsXml += `<c r="AI${rowNum}" s="26"><f>AH${rowNum}*AG${rowNum}</f><v>${item.remainingTotal}</v></c>`;
      } else {
        // Blank row preserving exact placeholders & styling with full borders
        rowsXml += `<c r="C${rowNum}" s="7"><v>${i + 1}</v></c>`;
        rowsXml += `<c r="D${rowNum}" s="24"/><c r="E${rowNum}" s="24"/><c r="F${rowNum}" s="25"/><c r="G${rowNum}" s="24"/><c r="H${rowNum}" s="24"/><c r="I${rowNum}" s="28"/>`;
        rowsXml += `<c r="J${rowNum}" s="26" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="K${rowNum}" s="26" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="L${rowNum}" s="28"/>`;
        rowsXml += `<c r="M${rowNum}" s="26" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="N${rowNum}" s="26" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="O${rowNum}" ${spacerStyle}/><c r="P${rowNum}" s="28"/>`;
        rowsXml += `<c r="Q${rowNum}" s="26" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="R${rowNum}" s="26" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="S${rowNum}" ${spacerStyle}/><c r="T${rowNum}" s="28"/>`;
        rowsXml += `<c r="U${rowNum}" s="26" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="V${rowNum}" s="26" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="W${rowNum}" ${spacerStyle}/><c r="X${rowNum}" s="28"/>`;
        rowsXml += `<c r="Y${rowNum}" s="26" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="Z${rowNum}" s="26" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="AA${rowNum}" s="31"/><c r="AB${rowNum}" ${spacerStyle}/><c r="AC${rowNum}" s="28"/>`;
        rowsXml += `<c r="AD${rowNum}" s="26" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="AE${rowNum}" s="26" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="AF${rowNum}" ${spacerStyle}/><c r="AG${rowNum}" s="28"/>`;
        rowsXml += `<c r="AH${rowNum}" s="26" t="inlineStr"><is><t>₱</t></is></c>`;
        rowsXml += `<c r="AI${rowNum}" s="26" t="inlineStr"><is><t>₱</t></is></c>`;
      }
      rowsXml += `</row>`;
    }

    // 5. Total Row (all cost totals have formula + value + peso format; unit cost cells are clean/empty with full borders)
    const kTotalContent = itemCount > 0
      ? `<f>SUM(K7:K${lastDataRow})</f><v>${totals.totalBegVal}</v>`
      : `<is><t>₱</t></is>`;
    const kTotalType = itemCount > 0 ? "" : ' t="inlineStr"';

    const nTotalContent = itemCount > 0
      ? `<f>SUM(N7:N${lastDataRow})</f><v>${totals.totalAddVal}</v>`
      : `<is><t>₱</t></is>`;
    const nTotalType = itemCount > 0 ? "" : ' t="inlineStr"';

    const rTotalContent = itemCount > 0
      ? `<f>SUM(R7:R${lastDataRow})</f><v>${totals.totalGrossVal}</v>`
      : `<is><t>₱</t></is>`;
    const rTotalType = itemCount > 0 ? "" : ' t="inlineStr"';

    const vTotalContent = itemCount > 0
      ? `<f>SUM(V7:V${lastDataRow})</f><v>${totals.totalIssuedVal}</v>`
      : `<is><t>₱</t></is>`;
    const vTotalType = itemCount > 0 ? "" : ' t="inlineStr"';

    const zTotalContent = itemCount > 0
      ? `<f>SUM(Z7:Z${lastDataRow})</f><v>${totals.totalProgVal}</v>`
      : `<is><t>₱</t></is>`;
    const zTotalType = itemCount > 0 ? "" : ' t="inlineStr"';

    const aeTotalContent = itemCount > 0
      ? `<f>SUM(AE7:AE${lastDataRow})</f><v>${totals.totalExpiredVal}</v>`
      : `<is><t>₱</t></is>`;
    const aeTotalType = itemCount > 0 ? "" : ' t="inlineStr"';

    const aiTotalContent = itemCount > 0
      ? `<f>SUM(AI7:AI${lastDataRow})</f><v>${totals.totalRemVal}</v>`
      : `<is><t>₱</t></is>`;
    const aiTotalType = itemCount > 0 ? "" : ' t="inlineStr"';

    let totalRowXml = `<row r="${totalRow}" spans="3:35" ht="20.1" customHeight="1" x14ac:dyDescent="0.25">`;
    totalRowXml += `<c r="C${totalRow}" s="16"/>`;
    totalRowXml += `<c r="D${totalRow}" s="17" t="inlineStr"><is><t>TOTAL</t></is></c>`;
    totalRowXml += `<c r="E${totalRow}" s="21"/><c r="F${totalRow}" s="22"/><c r="G${totalRow}" s="21"/><c r="H${totalRow}" s="21"/><c r="I${totalRow}" s="27"/>`;
    totalRowXml += `<c r="J${totalRow}" s="27"/>`;
    totalRowXml += `<c r="K${totalRow}" s="27"${kTotalType}>${kTotalContent}</c>`;
    totalRowXml += `<c r="L${totalRow}" s="29"/>`;
    totalRowXml += `<c r="M${totalRow}" s="27"/>`;
    totalRowXml += `<c r="N${totalRow}" s="27"${nTotalType}>${nTotalContent}</c>`;
    totalRowXml += `<c r="O${totalRow}" s="23"/><c r="P${totalRow}" s="29"/>`;
    totalRowXml += `<c r="Q${totalRow}" s="27"/>`;
    totalRowXml += `<c r="R${totalRow}" s="27"${rTotalType}>${rTotalContent}</c>`;
    totalRowXml += `<c r="S${totalRow}" s="23"/><c r="T${totalRow}" s="29"/>`;
    totalRowXml += `<c r="U${totalRow}" s="27"/>`;
    totalRowXml += `<c r="V${totalRow}" s="27"${vTotalType}>${vTotalContent}</c>`;
    totalRowXml += `<c r="W${totalRow}" s="23"/><c r="X${totalRow}" s="29"/>`;
    totalRowXml += `<c r="Y${totalRow}" s="27"/>`;
    totalRowXml += `<c r="Z${totalRow}" s="27"${zTotalType}>${zTotalContent}</c>`;
    totalRowXml += `<c r="AA${totalRow}" s="32"/><c r="AB${totalRow}" s="23"/><c r="AC${totalRow}" s="29"/>`;
    totalRowXml += `<c r="AD${totalRow}" s="27"/>`;
    totalRowXml += `<c r="AE${totalRow}" s="27"${aeTotalType}>${aeTotalContent}</c>`;
    totalRowXml += `<c r="AF${totalRow}" s="23"/><c r="AG${totalRow}" s="29"/>`;
    totalRowXml += `<c r="AH${totalRow}" s="27"/>`;
    totalRowXml += `<c r="AI${totalRow}" s="27"${aiTotalType}>${aiTotalContent}</c>`;
    totalRowXml += `</row>`;

    // 6. Replace sheetData from row 7 onwards
    const sheetDataTailRegex = /<row r="7"[\s\S]*?<\/sheetData>/;
    xml = xml.replace(sheetDataTailRegex, `${rowsXml}${totalRowXml}</sheetData>`);

    // 7. Update dimensions
    xml = xml.replace(/<dimension ref="C3:AI\d+"/, `<dimension ref="C3:AI${totalRow}"`);

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

  const sheetName = wb.SheetNames[0] || "Sheet1";
  let ws = wb.Sheets[sheetName];
  if (!ws) {
    ws = {};
    wb.SheetNames.push(sheetName);
    wb.Sheets[sheetName] = ws;
  }

  // Calculate Dates and Formatted Headers
  const targetDate = new Date(year, month - 1, 1);
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" })
    .format(targetDate)
    .toUpperCase();
  const lastDay = new Date(year, month, 0).getDate();
  const monthHeader = `MONTH : ${monthName} ${lastDay}, ${year}`;
  const remainingHeader = `REMAINING BALANCE  AS OF \n${monthName} ${lastDay}, ${year}`;

  const prevDate = new Date(year, month - 1, 0);
  const prevMonthName = new Intl.DateTimeFormat("en-US", { month: "long" })
    .format(prevDate)
    .toUpperCase();
  const prevLastDay = prevDate.getDate();
  const prevYear = prevDate.getFullYear();
  const begBalanceHeader = `BEGINNING BALANCE AS OF \n${prevMonthName} ${prevLastDay}, ${prevYear}`;

  const resolvedFacilityName = facilityName
    ? facilityName.toUpperCase().includes("MEDICINE SUPPLIES")
      ? facilityName.toUpperCase()
      : `${facilityName.toUpperCase()} MEDICINE SUPPLIES`
    : "VMCH MEDICINE SUPPLIES";

  // Section Headers & Titles
  const titleText = `REPORT ON PHYSICAL COUNT OF INVENTORIES\n${resolvedFacilityName}`;
  ws["C3"] = { t: "s", v: titleText };
  ws["C5"] = { t: "s", v: monthHeader };
  ws["I5"] = { t: "s", v: begBalanceHeader };
  ws["L5"] = { t: "s", v: "ADDITIONAL STOCKS ; \nPROCURED ;  RETURNED MEDICINES FROM BARANGAY/MEDICS" };
  ws["P5"] = { t: "s", v: "SUMMATION ( BEGINNING BALANCE + \nADDITIONAL PURCHASES; RETURNED MEDS;DONATIONS)" };
  ws["T5"] = { t: "s", v: "LESS ISSUANCES (PHARMACY DISPENSING & BARANGAY CONSULTATION)" };
  ws["X5"] = { t: "s", v: "TRANSFERRED TO OTHER PROGRAMS" };
  ws["AA5"] = { t: "s", v: "AREA/\nPROGRAM" };
  ws["AC5"] = { t: "s", v: "EXPIRED" };
  ws["AG5"] = { t: "s", v: remainingHeader };

  // Sub-headers in Row 6
  ws["C6"] = { t: "s", v: "ITEM NO" };
  ws["D6"] = { t: "s", v: "ITEM DESCRIPTION" };
  ws["E6"] = { t: "s", v: "UNIT OF \nMEASUREMENT" };
  ws["F6"] = { t: "s", v: "BRAND" };
  ws["G6"] = { t: "s", v: "LOT NO" };
  ws["H6"] = { t: "s", v: "EXPIRY DATE" };
  ws["I6"] = { t: "s", v: "QUANTITY" };
  ws["J6"] = { t: "s", v: "UNIT COST" };
  ws["K6"] = { t: "s", v: "TOTAL COST" };
  ws["L6"] = { t: "s", v: "QUANTITY" };
  ws["M6"] = { t: "s", v: "UNIT COST" };
  ws["N6"] = { t: "s", v: "TOTAL COST" };
  ws["P6"] = { t: "s", v: "QUANTITY" };
  ws["Q6"] = { t: "s", v: "UNIT COST" };
  ws["R6"] = { t: "s", v: "TOTAL COST" };
  ws["T6"] = { t: "s", v: "QUANTITY" };
  ws["U6"] = { t: "s", v: "UNIT COST" };
  ws["V6"] = { t: "s", v: "TOTAL COST" };
  ws["X6"] = { t: "s", v: "QUANTITY" };
  ws["Y6"] = { t: "s", v: "UNIT COST" };
  ws["Z6"] = { t: "s", v: "TOTAL COST" };
  ws["AC6"] = { t: "s", v: "QUANTITY" };
  ws["AD6"] = { t: "s", v: "UNIT COST" };
  ws["AE6"] = { t: "s", v: "TOTAL COST" };
  ws["AG6"] = { t: "s", v: "QUANTITY" };
  ws["AH6"] = { t: "s", v: "UNIT COST" };
  ws["AI6"] = { t: "s", v: "TOTAL COST" };

  // Clear existing template data cells (rows >= 7)
  for (const k of Object.keys(ws)) {
    if (k.startsWith("!")) continue;
    const match = k.match(/^[A-Z]+(\d+)$/);
    if (match && parseInt(match[1], 10) >= 7) {
      delete ws[k];
    }
  }

  // Reconcile and calculate
  const { items, totals } = processMonthlyInventoryData({
    inventoryRows,
    dispensingRows,
    requestRows,
    otherProgramsRows,
    year,
    month,
  });

  const itemCount = items.length;
  const numDataRows = Math.max(3, itemCount);
  const lastDataRow = 6 + numDataRows;
  const totalRow = lastDataRow + 1;

  for (let i = 0; i < numDataRows; i++) {
    const rowNum = 7 + i;
    const item = items[i];

    if (item) {
      ws[`C${rowNum}`] = { t: "n", v: item.index };
      ws[`D${rowNum}`] = { t: "s", v: item.itemDescription };
      ws[`E${rowNum}`] = { t: "s", v: item.unitOfMeasure };
      ws[`F${rowNum}`] = { t: "s", v: item.brandName };
      ws[`G${rowNum}`] = { t: "s", v: item.lotNo };
      ws[`H${rowNum}`] = { t: "s", v: item.expiryDate };
      ws[`I${rowNum}`] = { t: "n", v: item.beginningQty };
      ws[`J${rowNum}`] = { t: "n", v: item.unitCost, z: "₱#,##0.00" };
      ws[`K${rowNum}`] = { t: "n", f: `I${rowNum}*J${rowNum}`, v: item.begTotal, z: "₱#,##0.00" };
      ws[`L${rowNum}`] = { t: "n", v: item.additionalQty };
      ws[`M${rowNum}`] = { t: "n", v: item.additionalQty > 0 ? item.unitCost : 0, z: "₱#,##0.00" };
      ws[`N${rowNum}`] = { t: "n", f: `L${rowNum}*M${rowNum}`, v: item.addTotal, z: "₱#,##0.00" };
      ws[`P${rowNum}`] = { t: "n", f: `L${rowNum}+I${rowNum}`, v: item.grossQty };
      ws[`Q${rowNum}`] = { t: "n", f: `J${rowNum}`, v: item.unitCost, z: "₱#,##0.00" };
      ws[`R${rowNum}`] = { t: "n", f: `Q${rowNum}*P${rowNum}`, v: item.grossTotal, z: "₱#,##0.00" };
      ws[`T${rowNum}`] = { t: "n", v: item.issuedQty };
      ws[`U${rowNum}`] = { t: "n", f: `Q${rowNum}`, v: item.unitCost, z: "₱#,##0.00" };
      ws[`V${rowNum}`] = { t: "n", f: `U${rowNum}*T${rowNum}`, v: item.issuedTotal, z: "₱#,##0.00" };
      ws[`X${rowNum}`] = { t: "n", v: item.programQty };
      ws[`Y${rowNum}`] = { t: "n", v: item.programQty > 0 ? item.unitCost : 0, z: "₱#,##0.00" };
      ws[`Z${rowNum}`] = { t: "n", f: `X${rowNum}*Y${rowNum}`, v: item.programTotal, z: "₱#,##0.00" };
      ws[`AA${rowNum}`] = { t: "s", v: item.programName };
      ws[`AC${rowNum}`] = { t: "n", v: item.expiredQty };
      ws[`AD${rowNum}`] = { t: "n", v: item.expiredQty > 0 ? item.unitCost : 0, z: "₱#,##0.00" };
      ws[`AE${rowNum}`] = { t: "n", f: `AC${rowNum}*AD${rowNum}`, v: item.expiredTotal, z: "₱#,##0.00" };
      ws[`AG${rowNum}`] = { t: "n", f: `P${rowNum}-(T${rowNum}+X${rowNum}+AC${rowNum})`, v: item.remainingQty };
      ws[`AH${rowNum}`] = { t: "n", f: `U${rowNum}`, v: item.unitCost, z: "₱#,##0.00" };
      ws[`AI${rowNum}`] = { t: "n", f: `AH${rowNum}*AG${rowNum}`, v: item.remainingTotal, z: "₱#,##0.00" };
    } else {
      ws[`C${rowNum}`] = { t: "n", v: i + 1 };
      ws[`D${rowNum}`] = { t: "s", v: "" };
      ws[`J${rowNum}`] = { t: "s", v: "₱" };
      ws[`K${rowNum}`] = { t: "s", v: "₱" };
      ws[`M${rowNum}`] = { t: "s", v: "₱" };
      ws[`N${rowNum}`] = { t: "s", v: "₱" };
      ws[`Q${rowNum}`] = { t: "s", v: "₱" };
      ws[`R${rowNum}`] = { t: "s", v: "₱" };
      ws[`U${rowNum}`] = { t: "s", v: "₱" };
      ws[`V${rowNum}`] = { t: "s", v: "₱" };
      ws[`Y${rowNum}`] = { t: "s", v: "₱" };
      ws[`Z${rowNum}`] = { t: "s", v: "₱" };
      ws[`AD${rowNum}`] = { t: "s", v: "₱" };
      ws[`AE${rowNum}`] = { t: "s", v: "₱" };
      ws[`AH${rowNum}`] = { t: "s", v: "₱" };
      ws[`AI${rowNum}`] = { t: "s", v: "₱" };
    }
  }

  // TOTAL Row
  ws[`D${totalRow}`] = { t: "s", v: "TOTAL" };
  ws[`K${totalRow}`] = { t: "n", f: `SUM(K7:K${lastDataRow})`, v: totals.totalBegVal, z: "₱#,##0.00" };
  ws[`N${totalRow}`] = { t: "n", f: `SUM(N7:N${lastDataRow})`, v: totals.totalAddVal, z: "₱#,##0.00" };
  ws[`R${totalRow}`] = { t: "n", f: `SUM(R7:R${lastDataRow})`, v: totals.totalGrossVal, z: "₱#,##0.00" };
  ws[`V${totalRow}`] = { t: "n", f: `SUM(V7:V${lastDataRow})`, v: totals.totalIssuedVal, z: "₱#,##0.00" };
  ws[`Z${totalRow}`] = { t: "n", f: `SUM(Z7:Z${lastDataRow})`, v: totals.totalProgVal, z: "₱#,##0.00" };
  ws[`AE${totalRow}`] = { t: "n", f: `SUM(AE7:AE${lastDataRow})`, v: totals.totalExpiredVal, z: "₱#,##0.00" };
  ws[`AI${totalRow}`] = { t: "n", f: `SUM(AI7:AI${lastDataRow})`, v: totals.totalRemVal, z: "₱#,##0.00" };

  ws["!ref"] = `C3:AI${totalRow}`;
  ws["!merges"] = [
    { s: { r: 2, c: 2 }, e: { r: 3, c: 34 } }, // C3:AI4
    { s: { r: 4, c: 2 }, e: { r: 4, c: 7 } },  // C5:H5 (Month)
    { s: { r: 4, c: 8 }, e: { r: 4, c: 10 } }, // I5:K5 (Beginning)
    { s: { r: 4, c: 11 }, e: { r: 4, c: 13 } },// L5:N5 (Additional)
    { s: { r: 4, c: 15 }, e: { r: 4, c: 17 } },// P5:R5 (Summation)
    { s: { r: 4, c: 19 }, e: { r: 4, c: 21 } },// T5:V5 (Issuances)
    { s: { r: 4, c: 23 }, e: { r: 4, c: 25 } },// X5:Z5 (Transferred)
    { s: { r: 4, c: 28 }, e: { r: 4, c: 30 } },// AC5:AE5 (Expired)
    { s: { r: 4, c: 32 }, e: { r: 4, c: 34 } },// AG5:AI5 (Remaining)
  ];
  ws["!cols"] = [
    { wch: 4 },  // A
    { wch: 11 }, // B
    { wch: 8 },  // C (ITEM NO)
    { wch: 26 }, // D (ITEM DESCRIPTION)
    { wch: 16 }, // E (UNIT OF MEASURE)
    { wch: 13 }, // F (BRAND)
    { wch: 13 }, // G (LOT NO)
    { wch: 13 }, // H (EXPIRY DATE)
    { wch: 13 }, // I (QUANTITY)
    { wch: 13 }, // J (UNIT COST)
    { wch: 13 }, // K (TOTAL COST)
    { wch: 13 }, // L (QUANTITY)
    { wch: 13 }, // M (UNIT COST)
    { wch: 13 }, // N (TOTAL COST)
    { wch: 6 },  // O
    { wch: 13 }, // P (QUANTITY)
    { wch: 13 }, // Q (UNIT COST)
    { wch: 13 }, // R (TOTAL COST)
    { wch: 6 },  // S
    { wch: 13 }, // T (QUANTITY)
    { wch: 13 }, // U (UNIT COST)
    { wch: 13 }, // V (TOTAL COST)
    { wch: 6 },  // W
    { wch: 13 }, // X (QUANTITY)
    { wch: 13 }, // Y (UNIT COST)
    { wch: 13 }, // Z (TOTAL COST)
    { wch: 16 }, // AA (AREA / PROGRAM)
    { wch: 6 },  // AB
    { wch: 13 }, // AC (QUANTITY)
    { wch: 13 }, // AD (UNIT COST)
    { wch: 13 }, // AE (TOTAL COST)
    { wch: 6 },  // AF
    { wch: 13 }, // AG (QUANTITY)
    { wch: 13 }, // AH (UNIT COST)
    { wch: 13 }, // AI (TOTAL COST)
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
}) {
  const buffer = buildDailyRisBuffer({ dispensingRows, requestRows, selectedDate, risNo });
  const dateKey = toDateKey(selectedDate);
  const filename = `Request_Issuance_Slip_${dateKey}.xlsx`;

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

