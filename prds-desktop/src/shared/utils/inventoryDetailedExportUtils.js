/* global Buffer */
import * as XLSX from "xlsx";
import * as CFB from "cfb";
import { downloadExportFile } from "../../frontend/services/downloadManager.js";
import {
  INVENTORY_DETAILED_RECENT_TEMPLATE_BASE64,
  INVENTORY_DETAILED_MONTHLY_TEMPLATE_BASE64,
} from "../../frontend/assets/templates-excel/inventoryDetailedTemplateBase64.js";
import { formatItemDescription, formatReportDate, toDateKey } from "./reportUtils.js";

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
 * Returns the CFB zip archive utility from cfb package or XLSX
 */
export function getCfb() {
  const defaultExport = Reflect.get(XLSX, "default");
  return (
    XLSX?.CFB ||
    defaultExport?.CFB ||
    (CFB && typeof CFB.read === "function" ? CFB : null) ||
    (CFB?.default && typeof CFB.default.read === "function" ? CFB.default : null) ||
    (typeof window !== "undefined" ? window.XLSX?.CFB || window.CFB : null)
  );
}

/**
 * Formats a currency amount with the Philippine Peso symbol: ₱120.00
 */
export function formatDetailedCurrency(amount = 0) {
  const valid = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return `₱${valid.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formats header subtitle date for row 5 of the detailed reports:
 * - Recent: "as of Month Day, Year" (e.g. "as of November 2, 2026")
 * - Monthly: "Month Year" (e.g. "October 2026")
 */
export function formatDetailedSubtitleDate({
  mode = "recent",
  selectedDate = new Date(),
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
} = {}) {
  if (mode === "monthly") {
    const y = Number(year) || new Date().getFullYear();
    const m = Number(month) || new Date().getMonth() + 1;
    const dateObj = new Date(y, m - 1, 1);
    const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(dateObj);
    return `${monthName} ${y}`;
  }

  let d = selectedDate;
  if (typeof selectedDate === "string") {
    const match = selectedDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    } else {
      d = new Date(selectedDate);
    }
  }
  const dateStr = formatReportDate(d);
  return `as of ${dateStr}`;
}

/**
 * Builds export filename for Detailed Inventory Report:
 * 1. Recent: Inventory_Detailed_Report_Month_Day_Year.xlsx (e.g. Inventory_Detailed_Report_November_2_2026.xlsx)
 * 2. Monthly: Inventory_Detailed_Report_Month_Year.xlsx (e.g. Inventory_Detailed_Report_October_2026.xlsx)
 */
export function getDetailedInventoryExportFilename({
  mode = "recent",
  selectedDate = new Date(),
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
} = {}) {
  if (mode === "monthly") {
    const y = Number(year) || new Date().getFullYear();
    const m = Number(month) || new Date().getMonth() + 1;
    const dateObj = new Date(y, m - 1, 1);
    const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(dateObj);
    return `Inventory_Detailed_Report_${monthName}_${y}.xlsx`;
  }

  let d = selectedDate;
  if (typeof selectedDate === "string") {
    const match = selectedDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    } else {
      d = new Date(selectedDate);
    }
  } else if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    d = new Date();
  }

  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(d);
  const day = d.getDate();
  const y = d.getFullYear();
  return `Inventory_Detailed_Report_${monthName}_${day}_${y}.xlsx`;
}

/**
 * Header styles mapping for both monthly and recent templates
 */
export function getHeaderStyles(isMonthly) {
  if (isMonthly) {
    return {
      // Monthly headers (matched to monthly styles.xml cellXfs)
      peachCenter: 18,
      peachLeft: 11,
      peachDefault: 9,

      // Sheet 1 (inventory)
      s1H1_base: 20,
      s1H1_dateCost: 20,
      s1H1_qty: 18,
      s1H1_desc: 16,
      s1H2_base: 20,
      s1H2_dateCost: 20,
      s1H2_stockIn: 18,
      s1H2_stockOut: 18,
      s1H2_desc: 16,

      // Sheet 2 (stock-return)
      s2Center: 18,
      s2Left: 11,
      s2Header: 11,

      // Sheet 3 (additional-deliveries-summation)
      s3H1_no: 18,
      s3H1_poDate: 10,
      s3H1_base: 16,
      s3H1_expiry: 18,
      s3H2_no: 18,
      s3H2_itemBrand: 11,
      s3H2_base: 16,

      // Sheet 4 (other-program)
      s4H1_no: 18,
      s4H1_prog: 16,
      s4H2_no: 18,
      s4H2_col: 11,
      s4H2_center: 18,
      s4H2_total: 18,

      // Sheet 5 (expired-stock)
      s5Header: 11,
      s5Center: 18,
      s5Left: 11,
    };
  }

  return {
    // Recent headers (matched to recent styles.xml cellXfs)
    peachCenter: 17,
    peachLeft: 10,
    peachDefault: 9,

    // Sheet 1 (inventory)
    s1H1_base: 19,
    s1H1_dateCost: 19,
    s1H1_qty: 17,
    s1H1_desc: 15,
    s1H2_base: 19,
    s1H2_dateCost: 19,
    s1H2_stockIn: 17,
    s1H2_stockOut: 17,
    s1H2_desc: 15,

    // Sheet 2 (stock-return)
    s2Center: 17,
    s2Left: 10,
    s2Header: 10,

    // Sheet 3 (additional-deliveries-summation)
    s3H1_no: 17,
    s3H1_poDate: 9,
    s3H1_base: 15,
    s3H1_expiry: 17,
    s3H2_no: 17,
    s3H2_itemBrand: 10,
    s3H2_base: 15,

    // Sheet 4 (other-program)
    s4H1_no: 17,
    s4H1_prog: 15,
    s4H2_no: 17,
    s4H2_col: 10,
    s4H2_center: 17,
    s4H2_total: 17,

    // Sheet 5 (expired-stock)
    s5Header: 10,
    s5Center: 17,
    s5Left: 10,
  };
}

/**
 * Injects OpenXML <ignoredErrors> element to eliminate Excel "Number stored as text" warning triangles
 */
export function injectIgnoredErrors(xml, sqref = "C7:N500") {
  const ignoredXml = `<ignoredErrors><ignoredError sqref="${sqref}" numberStoredAsText="1"/></ignoredErrors>`;
  if (xml.includes("<ignoredErrors")) {
    return xml.replace(/<ignoredErrors>[\s\S]*?<\/ignoredErrors>/, ignoredXml);
  }
  return xml.replace("</worksheet>", `${ignoredXml}</worksheet>`);
}

/**
 * Prepares styles.xml by:
 * 1. Injecting custom Philippine Peso number format (numFmtId 164) before <fonts
 * 2. Resolving existing style indices for textLeft, textCenter, subtitle, title, and headers across templates
 * 3. Appending a dedicated currency right-aligned cellXf with numFmtId 164
 */
export function prepareStyles(stylesXml) {
  let xml = stylesXml;

  // 1. Insert numFmts before <fonts if not present
  if (!xml.includes("<numFmts")) {
    const numFmt =
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="[$₱-464]\\ #,##0.00;[Red]\\([$₱-464]\\ #,##0.00\\);&quot;₱&quot;\\ 0.00"/></numFmts>';
    xml = xml.replace("<fonts", `${numFmt}<fonts`);
  }

  // 2. Parse existing cellXfs
  const cellXfsMatch = xml.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
  if (!cellXfsMatch) {
    return {
      xml,
      styles: {
        isMonthly: false,
        textLeft: 11,
        textCenter: 12,
        subtitle: 13,
        title: 16,
        currencyRight: 22,
        numberCenter: 12,
        headers: getHeaderStyles(false),
      },
    };
  }

  let count = Number(cellXfsMatch[1]);
  let content = cellXfsMatch[2];

  // In the raw templates: recent has 22 cellXfs, monthly has 23 cellXfs
  const isMonthly = count >= 23;

  let textLeft = -1;
  let textCenter = -1;
  let subtitle = -1;
  let title = -1;
  let currencyRight = -1;

  const xfs = [...content.matchAll(/<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)];
  xfs.forEach((xf, idx) => {
    const attrs = xf[1];
    const inner = xf[2] || "";
    const isFont1 = /fontId="1"/.test(attrs);
    const isFont2 = /fontId="2"/.test(attrs);
    const isFont3 = /fontId="3"/.test(attrs);
    const isFill0 = /fillId="0"/.test(attrs);
    const isBorder0 = /borderId="0"/.test(attrs);
    const isBorder1 = /borderId="1"/.test(attrs);
    const isNumFmt164 = /numFmtId="164"/.test(attrs);
    const isLeft = /horizontal="left"/.test(inner);
    const isCenter = /horizontal="center"/.test(inner);
    const isRight = /horizontal="right"/.test(inner);

    if (isFont1 && isFill0 && isBorder1 && !isNumFmt164) {
      if (isLeft && textLeft === -1) textLeft = idx;
      if (isCenter && textCenter === -1) textCenter = idx;
    }
    if (isFont3 && isFill0 && isBorder0 && isCenter && subtitle === -1) {
      subtitle = idx;
    }
    if (isFont2 && isFill0 && isBorder0 && isCenter && title === -1) {
      title = idx;
    }
    if (isFont1 && isBorder1 && isNumFmt164 && isRight) {
      currencyRight = idx;
    }
  });

  if (textLeft === -1) textLeft = isMonthly ? 12 : 11;
  if (textCenter === -1) textCenter = isMonthly ? 13 : 12;
  if (subtitle === -1) subtitle = isMonthly ? 14 : 13;
  if (title === -1) title = isMonthly ? 17 : 16;

  if (currencyRight === -1) {
    currencyRight = count;
    const newXf =
      '<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>';
    content += newXf;
    count += 1;
    xml = xml.replace(cellXfsMatch[0], `<cellXfs count="${count}">${content}</cellXfs>`);
  }

  return {
    xml,
    styles: {
      isMonthly,
      textLeft,
      textCenter,
      subtitle,
      title,
      currencyRight,
      numberCenter: textCenter,
      headers: getHeaderStyles(isMonthly),
    },
  };
}

/**
 * Calculates auto-fitting column widths and produces openxml <cols> block
 */
export function buildAutoFitColsXml(colSpecs = [], textLengthsByCol = {}) {
  const parts = ['<cols><col min="1" max="2" width="9.140625" style="1"/>'];
  let maxColIndex = 2;
  colSpecs.forEach(({ col, minCol, maxCol, defaultWidth = 12 }) => {
    const longest = textLengthsByCol[col] || 0;
    const computed = Math.max(defaultWidth, Math.ceil(longest * 1.15) + 3);
    parts.push(
      `<col min="${minCol}" max="${maxCol}" width="${computed}" style="1" customWidth="1"/>`
    );
    if (maxCol > maxColIndex) maxColIndex = maxCol;
  });
  parts.push(`<col min="${maxColIndex + 1}" max="16384" width="9.140625" style="1"/></cols>`);
  return parts.join("");
}

/**
 * Normalizes batch number or lot number
 */
function cleanLotNumber(val) {
  if (!val) return "-";
  const s = String(val).trim();
  return s || "-";
}

/**
 * Checks if a date string falls inside the given target date (for recent) or month/year (for monthly)
 */
function matchesTargetPeriod(dateStr, mode, selectedDate, year, month) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;

  const targetY = Number(year) || (selectedDate ? new Date(selectedDate).getFullYear() : new Date().getFullYear());
  const targetM = Number(month) || (selectedDate ? new Date(selectedDate).getMonth() + 1 : new Date().getMonth() + 1);

  if (mode === "monthly") {
    return d.getFullYear() === targetY && d.getMonth() + 1 === targetM;
  }

  // Recent mode (current month): include all movements in the target month up to the selected date
  if (d.getFullYear() !== targetY || d.getMonth() + 1 !== targetM) {
    return false;
  }
  if (selectedDate) {
    const targetKey = toDateKey(selectedDate);
    const itemKey = toDateKey(d);
    return itemKey <= targetKey;
  }
  return true;
}

/**
 * Resolves medicine, batch, expiration date, brand, unit cost, and unit of measure
 * by cross-referencing available inventory batches using FEFO (First-Expired, First-Out)
 * and catalog medicines.
 */
export function resolveMedicineBatchDetails({
  item = {},
  inventoryRows = [],
  medicinesMap = new Map(),
} = {}) {
  const medId = String(item.medicine_id || item.medicine?.id || "");
  const catMed = (medId ? medicinesMap.get(medId) : null) || item.medicine || {};

  const rawBatch = (item.batch_number || item.lot_no || item.batch?.batch_number || "").trim();
  const rawBrand = (item.brand_name || item.brand || item.medicine?.brand_name || catMed.brand_name || "").trim();
  const rawExp = item.expiration_date ? String(item.expiration_date).slice(0, 10) : "";
  const rawUnit = (item.unit_of_measure || item.unit || item.medicine?.unit_of_measure || catMed.unit_of_measure || catMed.form || "").trim();
  const rawCost = Number(item.unit_cost ?? item.unit_cost_at_dispense ?? item.medicine?.unit_cost ?? item.batch?.unit_cost ?? 0);

  // Check if we need to resolve batch, brand, expiry, or unit cost from inventoryRows
  let invMatch = null;

  // 1. If batch number is explicitly given, look for exact batch in inventoryRows
  if (rawBatch && rawBatch !== "-") {
    const targetUpper = rawBatch.toUpperCase();
    invMatch = inventoryRows.find((inv) => {
      const invBatch = (inv.batch_number || inv.lot_no || inv.batch?.batch_number || "").trim().toUpperCase();
      if (invBatch !== targetUpper) return false;
      if (medId && inv.medicine_id) {
        return String(inv.medicine_id) === medId;
      }
      return true;
    });
  }

  // 2. If no exact batch match (or no batch specified), find candidates by medicine_id or generic_name
  if (!invMatch) {
    let candidates = [];
    if (medId) {
      candidates = inventoryRows.filter((inv) => String(inv.medicine_id) === medId);
    }
    if (candidates.length === 0) {
      const genTarget = (item.generic_name || item.medicine_name || item.medicine?.generic_name || catMed.generic_name || "").trim().toLowerCase();
      if (genTarget) {
        candidates = inventoryRows.filter((inv) => {
          const invGen = (inv.generic_name || inv.medicine?.generic_name || "").trim().toLowerCase();
          return invGen === genTarget;
        });
      }
    }

    if (candidates.length > 0) {
      // Sort candidates by:
      // 1) Unit cost > 0
      // 2) Active stock quantity > 0
      // 3) Expiration date ASC (FEFO: earliest valid expiration first)
      // 4) Date received ASC (FIFO)
      candidates.sort((a, b) => {
        const aHasCost = (Number(a.unit_cost) > 0 || Number(a.medicine?.unit_cost) > 0) ? 1 : 0;
        const bHasCost = (Number(b.unit_cost) > 0 || Number(b.medicine?.unit_cost) > 0) ? 1 : 0;
        if (aHasCost !== bHasCost) return bHasCost - aHasCost;

        const aHasQty = (Number(a.quantity) > 0) ? 1 : 0;
        const bHasQty = (Number(b.quantity) > 0) ? 1 : 0;
        if (aHasQty !== bHasQty) return bHasQty - aHasQty;

        const aExp = a.expiration_date || "9999-99-99";
        const bExp = b.expiration_date || "9999-99-99";
        const expCmp = aExp.localeCompare(bExp);
        if (expCmp !== 0) return expCmp;

        const aDate = a.date_received || a.created_at || "";
        const bDate = b.date_received || b.created_at || "";
        return aDate.localeCompare(bDate);
      });

      invMatch = candidates[0];
    }
  }

  const finalGeneric =
    catMed.generic_name ||
    item.generic_name ||
    item.medicine_name ||
    item.medicine?.generic_name ||
    invMatch?.generic_name ||
    invMatch?.medicine?.generic_name ||
    "";

  const finalDosage =
    catMed.dosage ||
    item.dosage ||
    item.medicine?.dosage ||
    invMatch?.dosage ||
    invMatch?.medicine?.dosage ||
    "";

  const itemDescription = formatItemDescription(finalGeneric, finalDosage);

  const brand =
    (rawBrand && rawBrand !== "-")
      ? rawBrand
      : (invMatch?.brand_name || invMatch?.brand || invMatch?.medicine?.brand_name || catMed.brand_name || "-");

  const batchNo =
    (rawBatch && rawBatch !== "-")
      ? cleanLotNumber(rawBatch)
      : cleanLotNumber(invMatch?.batch_number || invMatch?.lot_no || invMatch?.batch?.batch_number);

  const expirationDate =
    (rawExp && rawExp !== "-")
      ? rawExp
      : (invMatch?.expiration_date ? String(invMatch.expiration_date).slice(0, 10) : "-");

  const unit = (
    (rawUnit && rawUnit !== "-")
      ? rawUnit
      : (invMatch?.unit_of_measure || invMatch?.medicine?.unit_of_measure || catMed.unit_of_measure || catMed.form || "UNIT")
  ).toUpperCase();

  const unitCost =
    rawCost > 0
      ? rawCost
      : Number(invMatch?.unit_cost ?? invMatch?.medicine?.unit_cost ?? catMed.unit_cost ?? catMed.unit_price ?? 0);

  return {
    itemDescription,
    brand: brand || "-",
    batchNo: batchNo || "-",
    expirationDate: expirationDate || "-",
    unit: unit || "UNIT",
    unitCost,
    invMatch,
  };
}

/**
 * Resolves a reliable Date object and numeric timestamp for an inventory movement event.
 * If rawDate has a time component (contains 'T' or ':'), uses that.
 * If rawDate is date-only, but fallbackTimestamp (e.g. created_at) is on the same day or available,
 * uses the exact time from fallbackTimestamp.
 */
export function resolveMovementTimestamp(primaryDate, fallbackTimestamp) {
  if (
    primaryDate &&
    typeof primaryDate === "string" &&
    primaryDate.trim().length > 10 &&
    (primaryDate.includes("T") || primaryDate.includes(":"))
  ) {
    const d = new Date(primaryDate);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (
    fallbackTimestamp &&
    typeof fallbackTimestamp === "string" &&
    fallbackTimestamp.trim().length > 10 &&
    (fallbackTimestamp.includes("T") || fallbackTimestamp.includes(":"))
  ) {
    const fb = new Date(fallbackTimestamp);
    if (!Number.isNaN(fb.getTime())) {
      if (!primaryDate) return fb;
      const primaryKey = toDateKey(primaryDate);
      const fbKey = toDateKey(fallbackTimestamp);
      if (primaryKey === fbKey) {
        return fb;
      }
      const match = primaryKey.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return new Date(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
          fb.getHours(),
          fb.getMinutes(),
          fb.getSeconds(),
          fb.getMilliseconds()
        );
      }
      return fb;
    }
  }

  if (primaryDate) {
    const d = new Date(primaryDate);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (fallbackTimestamp) {
    const d = new Date(fallbackTimestamp);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * Formats date and time for the Date&Time column in Sheet 1 (inventory logs record).
 * If the record contains an explicit time component, returns "YYYY-MM-DD hh:mm A" (e.g. "2026-11-03 08:30 AM").
 * If the record is date-only with no time information, returns "YYYY-MM-DD" (e.g. "2026-11-03").
 */
export function formatMovementDateTime(dateInput, rawString = "") {
  if (!dateInput) return "-";
  const sourceStr = typeof rawString === "string" && rawString.trim()
    ? rawString.trim()
    : (typeof dateInput === "string" ? dateInput.trim() : "");

  let hasExplicitTime = false;
  if (sourceStr) {
    hasExplicitTime = sourceStr.length > 10 && (sourceStr.includes("T") || sourceStr.includes(":"));
  } else if (dateInput instanceof Date) {
    const isLocalZero = dateInput.getHours() === 0 && dateInput.getMinutes() === 0 && dateInput.getSeconds() === 0;
    const isUtcZero = dateInput.getUTCHours() === 0 && dateInput.getUTCMinutes() === 0 && dateInput.getUTCSeconds() === 0;
    hasExplicitTime = !isLocalZero && !isUtcZero;
  }

  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "-";

  const dateMatch = sourceStr.match(/^(\d{4}-\d{2}-\d{2})/);
  const dateKey = dateMatch ? dateMatch[1] : toDateKey(d);

  if (!hasExplicitTime) {
    return dateKey;
  }

  const timeStr = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);

  return `${dateKey} ${timeStr}`;
}

/**
 * Extracts all stock movements for Sheet 1 (inventory)
 */
export function extractInventoryMovements({
  inventoryRows = [],
  dispensingRows = [],
  requestRows = [],
  stockReturnsRows = [],
  otherProgramsRows = [],
  facilities = [],
  medicines = [],
  mode = "recent",
  selectedDate = new Date(),
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
} = {}) {
  const facilityMap = new Map();
  (facilities || []).forEach((f) => facilityMap.set(f.id, f.facility_name || f.name));

  const choFacility = (facilities || []).find(
    (f) => f.facility_type === "CHO" || f.is_warehouse || String(f.facility_name || "").includes("City Health")
  );
  const choFacilityId = choFacility ? String(choFacility.id) : null;

  const medicinesMap = new Map();
  (medicines || []).forEach((m) => medicinesMap.set(m.id, m));

  const movements = [];

  // 1. Stock In: Deliveries from inventory rows
  (inventoryRows || []).forEach((inv) => {
    // If facility_id is specified, only count deliveries directly to CHO central warehouse
    // (excludes barangay health station receiving stock transferred/allocated from CHO)
    if (choFacilityId && inv.facility_id && String(inv.facility_id) !== choFacilityId) {
      return;
    }
    const rawDate = inv.date_received || inv.created_at || inv.updated_at;

    if (matchesTargetPeriod(rawDate, mode, selectedDate, year, month)) {
      const qty = Number(inv.received_quantity ?? inv.initial_quantity ?? inv.quantity) || 0;
      if (qty > 0) {
        const details = resolveMedicineBatchDetails({ item: inv, inventoryRows, medicinesMap });
        const unitCost = details.unitCost;
        const timestampObj = resolveMovementTimestamp(inv.date_received, inv.created_at || inv.updated_at);
        const dateKey = toDateKey(rawDate);
        const dateTimeStr = formatMovementDateTime(timestampObj, inv.created_at || inv.date_received);

        movements.push({
          timestamp: timestampObj ? timestampObj.getTime() : 0,
          date: dateKey,
          dateTime: dateTimeStr,
          rawDate,
          itemDescription: details.itemDescription,
          brand: details.brand,
          batchNo: details.batchNo,
          expirationDate: details.expirationDate,
          unitCost,
          totalCost: qty * unitCost,
          stockIn: qty,
          stockOut: "",
          description: inv.po_number
            ? `Procurement Delivery (PO: ${inv.po_number})`
            : "Stock Intake Delivery",
        });
      }
    }
  });

  // 2. Stock In: Confirmed Stock Returns from barangays
  (stockReturnsRows || []).forEach((ret) => {
    const status = String(ret.status || "").toUpperCase();
    if (status && status !== "CONFIRMED" && status !== "VERIFIED") return;
    const rawDate = ret.return_date || ret.date || ret.confirmed_at || ret.submitted_at || ret.created_at;
    if (matchesTargetPeriod(rawDate, mode, selectedDate, year, month)) {
      const details = resolveMedicineBatchDetails({ item: ret, inventoryRows, medicinesMap });
      const qty = Number(ret.quantity) || 0;
      const unitCost = details.unitCost;
      const originName =
        facilityMap.get(ret.facility_id) || ret.facility_name || "Barangay Health Center";
      const timestampObj = resolveMovementTimestamp(
        ret.confirmed_at || ret.submitted_at || ret.return_date || ret.date,
        ret.created_at || ret.submitted_at
      );
      const dateKey = toDateKey(rawDate);
      const dateTimeStr = formatMovementDateTime(
        timestampObj,
        ret.confirmed_at || ret.submitted_at || ret.created_at || ret.return_date
      );

      movements.push({
        timestamp: timestampObj ? timestampObj.getTime() : 0,
        date: dateKey,
        dateTime: dateTimeStr,
        rawDate,
        itemDescription: details.itemDescription,
        brand: details.brand,
        batchNo: details.batchNo,
        expirationDate: details.expirationDate,
        unitCost,
        totalCost: qty * unitCost,
        stockIn: qty,
        stockOut: "",
        description: `Returned Stock from ${originName}`,
      });
    }
  });

  // 3. Stock Out: Walk-in dispensing transactions
  (dispensingRows || []).forEach((disp) => {
    if (disp.voided_at) return;
    // Exclude BHS/BHW station dispensing if CHO facility is identified, since CHO report covers CHO warehouse/clinic
    if (choFacilityId && disp.facility_id && String(disp.facility_id) !== choFacilityId) {
      return;
    }
    const rawDate = disp.dispense_date || disp.created_at;
    if (matchesTargetPeriod(rawDate, mode, selectedDate, year, month)) {
      const items = Array.isArray(disp.items)
        ? disp.items
        : [disp];

      const timestampObj = resolveMovementTimestamp(disp.dispense_date, disp.created_at);
      const dateKey = toDateKey(rawDate);
      const dateTimeStr = formatMovementDateTime(timestampObj, disp.dispense_date || disp.created_at);

      items.forEach((item) => {
        const details = resolveMedicineBatchDetails({ item, inventoryRows, medicinesMap });
        const qty = Number(item.quantity) || 0;
        const unitCost = details.unitCost;

        movements.push({
          timestamp: timestampObj ? timestampObj.getTime() : 0,
          date: dateKey,
          dateTime: dateTimeStr,
          rawDate,
          itemDescription: details.itemDescription,
          brand: details.brand,
          batchNo: details.batchNo,
          expirationDate: details.expirationDate,
          unitCost,
          totalCost: qty * unitCost,
          stockIn: "",
          stockOut: qty,
          description: "Walk-in Patient Dispensing",
        });
      });
    }
  });

  // 4. Stock Out: Completed Barangay Request Fulfillments
  (requestRows || []).forEach((req) => {
    const isCompleted =
      String(req.status || "").toUpperCase() === "COMPLETED" ||
      String(req.status || "").toUpperCase() === "FULFILLED";
    const rawDate =
      req.approved_at ||
      req.received_at ||
      req.completed_at ||
      req.updated_at ||
      req.request_date ||
      req.created_at;

    if (isCompleted && matchesTargetPeriod(rawDate, mode, selectedDate, year, month)) {
      const targetName =
        facilityMap.get(req.facility_id) || req.facility_name || "Barangay Health Station";
      const items = Array.isArray(req.items)
        ? req.items
        : Array.isArray(req.data_json?.items)
        ? req.data_json.items
        : [];

      const timestampObj = resolveMovementTimestamp(
        req.completed_at || req.approved_at || req.received_at || req.request_date,
        req.created_at || req.updated_at
      );
      const dateKey = toDateKey(rawDate);
      const dateTimeStr = formatMovementDateTime(
        timestampObj,
        req.completed_at || req.approved_at || req.received_at || req.created_at
      );

      items.forEach((item) => {
        const details = resolveMedicineBatchDetails({ item, inventoryRows, medicinesMap });
        const qty = Number(item.approved_quantity ?? item.quantity) || 0;
        const unitCost = details.unitCost;

        movements.push({
          timestamp: timestampObj ? timestampObj.getTime() : 0,
          date: dateKey,
          dateTime: dateTimeStr,
          rawDate,
          itemDescription: details.itemDescription,
          brand: details.brand,
          batchNo: details.batchNo,
          expirationDate: details.expirationDate,
          unitCost,
          totalCost: qty * unitCost,
          stockIn: "",
          stockOut: qty,
          description: `Stock Request Fulfilled (${targetName})`,
        });
      });
    }
  });

  // 5. Stock Out: Other Programs transfers
  (otherProgramsRows || []).forEach((prog) => {
    if (String(prog.status || "").toUpperCase() === "CANCELLED") return;
    const rawDate =
      prog.completed_at ||
      prog.distribution_date ||
      prog.program_date ||
      prog.date ||
      prog.created_at ||
      prog.updated_at;
    if (matchesTargetPeriod(rawDate, mode, selectedDate, year, month)) {
      let items = prog.medicines;
      if (!Array.isArray(items) && prog.items) items = prog.items;
      if (!Array.isArray(items) && prog.data_json) {
        try {
          const parsed = typeof prog.data_json === "string" ? JSON.parse(prog.data_json) : prog.data_json;
          items = parsed?.medicines || parsed?.items || [];
        } catch {
          items = [];
        }
      }
      if (!Array.isArray(items)) items = [];

      const timestampObj = resolveMovementTimestamp(
        prog.completed_at || prog.distribution_date || prog.program_date,
        prog.created_at || prog.updated_at
      );
      const dateKey = toDateKey(rawDate);
      const dateTimeStr = formatMovementDateTime(
        timestampObj,
        prog.completed_at || prog.created_at || prog.program_date
      );

      items.forEach((item) => {
        const details = resolveMedicineBatchDetails({ item, inventoryRows, medicinesMap });
        const qty = Number(item.quantity_used ?? item.quantity) || 0;
        const unitCost = details.unitCost;

        movements.push({
          timestamp: timestampObj ? timestampObj.getTime() : 0,
          date: dateKey,
          dateTime: dateTimeStr,
          rawDate,
          itemDescription: details.itemDescription,
          brand: details.brand,
          batchNo: details.batchNo,
          expirationDate: details.expirationDate,
          unitCost,
          totalCost: qty * unitCost,
          stockIn: "",
          stockOut: qty,
          description: `Transferred to Program: ${prog.program_name || "Health Program"}`,
        });
      });
    }
  });

  // If no transactions exist for the selected date, fall back to active dispensable stock snapshot only in recent mode
  if (mode === "recent" && movements.length === 0 && Array.isArray(inventoryRows) && inventoryRows.length > 0) {
    inventoryRows.forEach((inv) => {
      const qty = Number(inv.quantity) || 0;
      if (qty > 0) {
        const details = resolveMedicineBatchDetails({ item: inv, inventoryRows, medicinesMap });
        const unitCost = details.unitCost;
        const timestampObj = resolveMovementTimestamp(inv.date_received, inv.created_at);
        const dateKey = inv.date_received ? toDateKey(inv.date_received) : toDateKey(new Date());
        const dateTimeStr = formatMovementDateTime(timestampObj, inv.created_at || inv.date_received);

        movements.push({
          timestamp: timestampObj ? timestampObj.getTime() : 0,
          date: dateKey,
          dateTime: dateTimeStr,
          rawDate: inv.date_received,
          itemDescription: details.itemDescription,
          brand: details.brand,
          batchNo: details.batchNo,
          expirationDate: details.expirationDate,
          unitCost,
          totalCost: qty * unitCost,
          stockIn: qty,
          stockOut: "",
          description: "Active Dispensable Stock",
        });
      }
    });
  }

  // Sort movements chronologically from most recent to oldest (descending: latest at top, oldest at bottom)
  movements.sort((a, b) => {
    const timeA = a.timestamp || 0;
    const timeB = b.timestamp || 0;
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    // For same timestamp, subsequent stock-out comes before stock-in in reverse chronological order
    const aIsStockOut = a.stockOut !== "" && a.stockOut != null;
    const bIsStockOut = b.stockOut !== "" && b.stockOut != null;
    if (aIsStockOut && !bIsStockOut) return -1;
    if (!aIsStockOut && bIsStockOut) return 1;

    return (a.itemDescription || "").localeCompare(b.itemDescription || "");
  });

  return movements;
}

/**
 * Builds Sheet 1 (inventory) XML
 */
export function buildSheet1Xml(
  originalXml,
  movements = [],
  subtitleDate = "",
  styles = { textLeft: 11, textCenter: 12, currencyRight: 22, numberCenter: 12 }
) {
  let xml = originalXml;

  const titleStyle = styles.title || (styles.isMonthly ? 17 : 16);
  const subtitleStyle = styles.subtitle || (styles.isMonthly ? 14 : 13);
  const h = styles.headers || getHeaderStyles(styles.isMonthly);

  // Clean unbordered title rows (removes any stray peach cells in Row 3)
  const row3Xml = `<row r="3" spans="3:13" x14ac:dyDescent="0.25"><c r="D3" s="${titleStyle}" t="inlineStr"><is><t>VICENTE MENDIOLA FOR HEALTH</t></is></c><c r="E3" s="${titleStyle}"/><c r="F3" s="${titleStyle}"/><c r="G3" s="${titleStyle}"/><c r="H3" s="${titleStyle}"/><c r="I3" s="${titleStyle}"/><c r="J3" s="${titleStyle}"/><c r="K3" s="${titleStyle}"/><c r="L3" s="${titleStyle}"/><c r="M3" s="${titleStyle}"/></row>`;
  xml = xml.replace(/<row r="3"[\s\S]*?<\/row>/, row3Xml);

  const row4Xml = `<row r="4" spans="3:13" x14ac:dyDescent="0.25"><c r="D4" s="${titleStyle}" t="inlineStr"><is><t>Inventory Logs Record</t></is></c><c r="E4" s="${titleStyle}"/><c r="F4" s="${titleStyle}"/><c r="G4" s="${titleStyle}"/><c r="H4" s="${titleStyle}"/><c r="I4" s="${titleStyle}"/><c r="J4" s="${titleStyle}"/><c r="K4" s="${titleStyle}"/><c r="L4" s="${titleStyle}"/><c r="M4" s="${titleStyle}"/></row>`;
  xml = xml.replace(/<row r="4"[\s\S]*?<\/row>/, row4Xml);

  // Replace subtitle row 5 without borders
  const row5Xml = `<row r="5" spans="3:13" x14ac:dyDescent="0.25"><c r="D5" s="${subtitleStyle}" t="inlineStr"><is><t>${escapeXml(subtitleDate)}</t></is></c><c r="E5" s="${subtitleStyle}"/><c r="F5" s="${subtitleStyle}"/><c r="G5" s="${subtitleStyle}"/><c r="H5" s="${subtitleStyle}"/><c r="I5" s="${subtitleStyle}"/><c r="J5" s="${subtitleStyle}"/><c r="K5" s="${subtitleStyle}"/><c r="L5" s="${subtitleStyle}"/><c r="M5" s="${subtitleStyle}"/></row>`;
  xml = xml.replace(/<row r="5"[\s\S]*?<\/row>/, row5Xml);

  // Replace row 7 and row 8 with peach headers
  const row7Xml = `<row r="7" spans="3:13" ht="19" customHeight="1" x14ac:dyDescent="0.25">` +
    `<c r="C7" s="${h.s1H1_base}" t="inlineStr"><is><t>No.</t></is></c>` +
    `<c r="D7" s="${h.s1H1_base}" t="inlineStr"><is><t>Date</t></is></c>` +
    `<c r="E7" s="${h.s1H1_base}" t="inlineStr"><is><t>Item Description</t></is></c>` +
    `<c r="F7" s="${h.s1H1_base}" t="inlineStr"><is><t>Brand</t></is></c>` +
    `<c r="G7" s="${h.s1H1_base}" t="inlineStr"><is><t>Batch/Lot No.</t></is></c>` +
    `<c r="H7" s="${h.s1H1_dateCost}" t="inlineStr"><is><t>Expiration Date</t></is></c>` +
    `<c r="I7" s="${h.s1H1_dateCost}" t="inlineStr"><is><t>Unit Cost</t></is></c>` +
    `<c r="J7" s="${h.s1H1_base}" t="inlineStr"><is><t>Total Cost</t></is></c>` +
    `<c r="K7" s="${h.s1H1_qty}" t="inlineStr"><is><t>Quantity</t></is></c>` +
    `<c r="L7" s="${h.s1H1_qty}"/>` +
    `<c r="M7" s="${h.s1H1_desc}" t="inlineStr"><is><t>Description</t></is></c>` +
    `</row>`;
  xml = xml.replace(/<row r="7"[^>]*?(?:>[\s\S]*?<\/row>|\/>)/, row7Xml);

  const row8Xml = `<row r="8" spans="3:13" ht="18" customHeight="1" x14ac:dyDescent="0.25">` +
    `<c r="C8" s="${h.s1H2_base}"/>` +
    `<c r="D8" s="${h.s1H2_base}"/>` +
    `<c r="E8" s="${h.s1H2_base}"/>` +
    `<c r="F8" s="${h.s1H2_base}"/>` +
    `<c r="G8" s="${h.s1H2_base}"/>` +
    `<c r="H8" s="${h.s1H2_dateCost}"/>` +
    `<c r="I8" s="${h.s1H2_dateCost}"/>` +
    `<c r="J8" s="${h.s1H2_base}"/>` +
    `<c r="K8" s="${h.s1H2_stockIn}" t="inlineStr"><is><t>Stock In</t></is></c>` +
    `<c r="L8" s="${h.s1H2_stockOut}" t="inlineStr"><is><t>Stock Out</t></is></c>` +
    `<c r="M8" s="${h.s1H2_desc}"/>` +
    `</row>`;
  xml = xml.replace(/<row r="8"[^>]*?(?:>[\s\S]*?<\/row>|\/>)/, row8Xml);

  // Compute text lengths for auto-fitting columns C to M
  const colLengths = {
    C: 4, // No.
    D: 12, // Date
    E: 16, // Item Description
    F: 10, // Brand
    G: 14, // Batch/Lot No.
    H: 15, // Expiration Date
    I: 12, // Unit Cost
    J: 12, // Total Cost
    K: 10, // Stock In
    L: 10, // Stock Out
    M: 18, // Description
  };

  const rowsXml = [];
  const startRow = 9;

  movements.forEach((m, idx) => {
    const r = startRow + idx;
    const no = String(idx + 1);
    const dateStr = m.date || "-";
    const itemDesc = m.itemDescription || "-";
    const brand = m.brand || "-";
    const batchNo = m.batchNo || "-";
    const expDate = m.expirationDate || "-";
    const unitCost = Number(m.unitCost) || 0;
    const totalCost = Number(m.totalCost) || 0;
    const unitCostStr = formatDetailedCurrency(unitCost);
    const totalCostStr = formatDetailedCurrency(totalCost);
    const stockInStr = m.stockIn !== "" && m.stockIn != null ? String(m.stockIn) : "";
    const stockOutStr = m.stockOut !== "" && m.stockOut != null ? String(m.stockOut) : "";
    const desc = m.description || "-";

    // Track text lengths
    colLengths.C = Math.max(colLengths.C, no.length);
    colLengths.D = Math.max(colLengths.D, dateStr.length);
    colLengths.E = Math.max(colLengths.E, itemDesc.length);
    colLengths.F = Math.max(colLengths.F, brand.length);
    colLengths.G = Math.max(colLengths.G, batchNo.length);
    colLengths.H = Math.max(colLengths.H, expDate.length);
    colLengths.I = Math.max(colLengths.I, unitCostStr.length);
    colLengths.J = Math.max(colLengths.J, totalCostStr.length);
    colLengths.K = Math.max(colLengths.K, stockInStr.length);
    colLengths.L = Math.max(colLengths.L, stockOutStr.length);
    colLengths.M = Math.max(colLengths.M, desc.length);

    let rowXml = `<row r="${r}" spans="3:13" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
    rowXml += `<c r="C${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(no)}</t></is></c>`;
    rowXml += `<c r="D${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(dateStr)}</t></is></c>`;
    rowXml += `<c r="E${r}" s="${styles.textLeft}" t="inlineStr"><is><t>${escapeXml(itemDesc)}</t></is></c>`;
    rowXml += `<c r="F${r}" s="${styles.textLeft}" t="inlineStr"><is><t>${escapeXml(brand)}</t></is></c>`;
    rowXml += `<c r="G${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(batchNo)}</t></is></c>`;
    rowXml += `<c r="H${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(expDate)}</t></is></c>`;
    rowXml += `<c r="I${r}" s="${styles.currencyRight}"><v>${unitCost}</v></c>`;
    rowXml += `<c r="J${r}" s="${styles.currencyRight}"><v>${totalCost}</v></c>`;
    if (stockInStr !== "") {
      rowXml += `<c r="K${r}" s="${styles.numberCenter}"><v>${Number(stockInStr) || 0}</v></c>`;
    } else {
      rowXml += `<c r="K${r}" s="${styles.numberCenter}"/>`;
    }
    if (stockOutStr !== "") {
      rowXml += `<c r="L${r}" s="${styles.numberCenter}"><v>${Number(stockOutStr) || 0}</v></c>`;
    } else {
      rowXml += `<c r="L${r}" s="${styles.numberCenter}"/>`;
    }
    rowXml += `<c r="M${r}" s="${styles.textLeft}" t="inlineStr"><is><t>${escapeXml(desc)}</t></is></c>`;
    rowXml += `</row>`;
    rowsXml.push(rowXml);
  });

  // Pad table with clean bordered empty rows up to at least 10 rows
  const minRows = 10;
  for (let i = movements.length; i < minRows; i++) {
    const r = startRow + i;
    let emptyRow = `<row r="${r}" spans="3:13" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
    emptyRow += `<c r="C${r}" s="${styles.textCenter}"/>`;
    emptyRow += `<c r="D${r}" s="${styles.textCenter}"/>`;
    emptyRow += `<c r="E${r}" s="${styles.textLeft}"/>`;
    emptyRow += `<c r="F${r}" s="${styles.textLeft}"/>`;
    emptyRow += `<c r="G${r}" s="${styles.textCenter}"/>`;
    emptyRow += `<c r="H${r}" s="${styles.textCenter}"/>`;
    emptyRow += `<c r="I${r}" s="${styles.currencyRight}"/>`;
    emptyRow += `<c r="J${r}" s="${styles.currencyRight}"/>`;
    emptyRow += `<c r="K${r}" s="${styles.numberCenter}"/>`;
    emptyRow += `<c r="L${r}" s="${styles.numberCenter}"/>`;
    emptyRow += `<c r="M${r}" s="${styles.textLeft}"/>`;
    emptyRow += `</row>`;
    rowsXml.push(emptyRow);
  }

  // Replace rows starting at row 9
  const row9TailRegex = /<row r="9"[\s\S]*?<\/sheetData>/;
  xml = xml.replace(row9TailRegex, `${rowsXml.join("")}</sheetData>`);

  // Update dynamic cols
  const colSpecs = [
    { col: "C", minCol: 3, maxCol: 3, defaultWidth: 6 },
    { col: "D", minCol: 4, maxCol: 4, defaultWidth: 12 },
    { col: "E", minCol: 5, maxCol: 5, defaultWidth: 35 },
    { col: "F", minCol: 6, maxCol: 6, defaultWidth: 16 },
    { col: "G", minCol: 7, maxCol: 7, defaultWidth: 16 },
    { col: "H", minCol: 8, maxCol: 8, defaultWidth: 16 },
    { col: "I", minCol: 9, maxCol: 9, defaultWidth: 12 },
    { col: "J", minCol: 10, maxCol: 10, defaultWidth: 14 },
    { col: "K", minCol: 11, maxCol: 11, defaultWidth: 11 },
    { col: "L", minCol: 12, maxCol: 12, defaultWidth: 11 },
    { col: "M", minCol: 13, maxCol: 13, defaultWidth: 30 },
  ];
  const colsXml = buildAutoFitColsXml(colSpecs, colLengths);
  xml = xml.replace(/<cols>[\s\S]*?<\/cols>/, colsXml);

  // Update dimension
  const lastRow = startRow + Math.max(movements.length, 10) - 1;
  xml = xml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="C3:M${lastRow}"/>`);

  // Suppress "Number stored as text" warning triangles
  xml = injectIgnoredErrors(xml, "C7:M500");

  return xml;
}

/**
 * Builds Sheet 2 (stock-return) XML
 */
export function buildSheet2Xml(
  originalXml,
  returnRows = [],
  subtitleDate = "",
  facilities = [],
  styles = { textLeft: 11, textCenter: 12, currencyRight: 22, numberCenter: 12 },
  { mode = "recent", selectedDate = new Date(), year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = {},
  inventoryRows = [],
  medicines = []
) {
  let xml = originalXml;

  const titleStyle = styles.title || (styles.isMonthly ? 17 : 16);
  const subtitleStyle = styles.subtitle || (styles.isMonthly ? 14 : 13);
  const h = styles.headers || getHeaderStyles(styles.isMonthly);

  // Clean unbordered title and subtitle rows
  const row3Xml = `<row r="3" spans="3:14" x14ac:dyDescent="0.25"><c r="D3" s="${titleStyle}" t="inlineStr"><is><t>VICENTE MENDIOLA FOR HEALTH</t></is></c><c r="E3" s="${titleStyle}"/><c r="F3" s="${titleStyle}"/><c r="G3" s="${titleStyle}"/><c r="H3" s="${titleStyle}"/><c r="I3" s="${titleStyle}"/><c r="J3" s="${titleStyle}"/><c r="K3" s="${titleStyle}"/><c r="L3" s="${titleStyle}"/><c r="M3" s="${titleStyle}"/><c r="N3" s="${titleStyle}"/></row>`;
  xml = xml.replace(/<row r="3"[\s\S]*?<\/row>/, row3Xml);

  const row4Xml = `<row r="4" spans="3:14" x14ac:dyDescent="0.25"><c r="D4" s="${titleStyle}" t="inlineStr"><is><t>Additional Deliviries/Returns</t></is></c><c r="E4" s="${titleStyle}"/><c r="F4" s="${titleStyle}"/><c r="G4" s="${titleStyle}"/><c r="H4" s="${titleStyle}"/><c r="I4" s="${titleStyle}"/><c r="J4" s="${titleStyle}"/><c r="K4" s="${titleStyle}"/><c r="L4" s="${titleStyle}"/><c r="M4" s="${titleStyle}"/><c r="N4" s="${titleStyle}"/></row>`;
  xml = xml.replace(/<row r="4"[\s\S]*?<\/row>/, row4Xml);

  const row5Xml = `<row r="5" spans="3:14" x14ac:dyDescent="0.25"><c r="D5" s="${subtitleStyle}" t="inlineStr"><is><t>${escapeXml(subtitleDate)}</t></is></c><c r="E5" s="${subtitleStyle}"/><c r="F5" s="${subtitleStyle}"/><c r="G5" s="${subtitleStyle}"/><c r="H5" s="${subtitleStyle}"/><c r="I5" s="${subtitleStyle}"/><c r="J5" s="${subtitleStyle}"/><c r="K5" s="${subtitleStyle}"/><c r="L5" s="${subtitleStyle}"/><c r="M5" s="${subtitleStyle}"/><c r="N5" s="${subtitleStyle}"/></row>`;
  xml = xml.replace(/<row r="5"[\s\S]*?<\/row>/, row5Xml);

  const row7Xml = `<row r="7" spans="3:14" ht="19" customHeight="1" x14ac:dyDescent="0.25">` +
    `<c r="C7" s="${h.s2Center || h.s2Header}" t="inlineStr"><is><t>No.</t></is></c>` +
    `<c r="D7" s="${h.s2Center || h.s2Header}" t="inlineStr"><is><t>Date</t></is></c>` +
    `<c r="E7" s="${h.s2Left || h.s2Header}" t="inlineStr"><is><t>Item Description</t></is></c>` +
    `<c r="F7" s="${h.s2Left || h.s2Header}" t="inlineStr"><is><t>Brand</t></is></c>` +
    `<c r="G7" s="${h.s2Center || h.s2Header}" t="inlineStr"><is><t>Unit</t></is></c>` +
    `<c r="H7" s="${h.s2Center || h.s2Header}" t="inlineStr"><is><t>Batch/Lot No.</t></is></c>` +
    `<c r="I7" s="${h.s2Center || h.s2Header}" t="inlineStr"><is><t>Expiration Date</t></is></c>` +
    `<c r="J7" s="${h.s2Left || h.s2Header}" t="inlineStr"><is><t>Returning Facility</t></is></c>` +
    `<c r="K7" s="${h.s2Center || h.s2Header}" t="inlineStr"><is><t>Unit Cost</t></is></c>` +
    `<c r="L7" s="${h.s2Center || h.s2Header}" t="inlineStr"><is><t>Total Cost</t></is></c>` +
    `<c r="M7" s="${h.s2Center || h.s2Header}" t="inlineStr"><is><t>Quantity</t></is></c>` +
    `<c r="N7" s="${h.s2Left || h.s2Header}" t="inlineStr"><is><t>Description</t></is></c>` +
    `</row>`;
  xml = xml.replace(/<row r="7"[\s\S]*?<\/row>/, row7Xml);

  // Filter returns by selected date or month
  const filteredReturns = (returnRows || []).filter((ret) => {
    const retDate = ret.return_date || ret.date || ret.confirmed_at || ret.submitted_at || ret.created_at;
    return matchesTargetPeriod(retDate, mode, selectedDate, year, month);
  });

  // Sort returns in descending chronological order: most recent return at top, oldest at bottom
  filteredReturns.sort((a, b) => {
    const dateA = a.return_date || a.date || a.confirmed_at || a.submitted_at || a.created_at || "";
    const dateB = b.return_date || b.date || b.confirmed_at || b.submitted_at || b.created_at || "";
    const timeA = new Date(dateA).getTime() || 0;
    const timeB = new Date(dateB).getTime() || 0;
    if (timeA !== timeB) return timeB - timeA;
    return (a.medicine_name || a.generic_name || "").localeCompare(b.medicine_name || b.generic_name || "");
  });

  const facilityMap = new Map();
  (facilities || []).forEach((f) => facilityMap.set(f.id, f.facility_name || f.name));

  const medicinesMap = new Map();
  (medicines || []).forEach((m) => medicinesMap.set(m.id, m));

  const colLengths = {
    C: 4, // No.
    D: 10, // Date
    E: 16, // Item Description
    F: 10, // Brand
    G: 8, // Unit
    H: 14, // Batch/Lot No.
    I: 14, // Expiration Date
    J: 18, // Returning Facility
    K: 12, // Unit Cost
    L: 12, // Total Cost
    M: 10, // Quantity
    N: 18, // Description
  };

  const rowsXml = [];
  const startRow = 8;

  filteredReturns.forEach((ret, idx) => {
    const r = startRow + idx;
    const no = String(idx + 1);
    const dateStr = ret.return_date || ret.date || ret.confirmed_at || ret.submitted_at || ret.created_at || "-";
    const cleanDate = dateStr ? toDateKey(dateStr) : "-";
    const details = resolveMedicineBatchDetails({ item: ret, inventoryRows, medicinesMap });
    const itemDesc = details.itemDescription;
    const brand = details.brand;
    const unit = details.unit;
    const batchNo = details.batchNo;
    const expDate = details.expirationDate;
    const facilityName =
      facilityMap.get(ret.facility_id) || ret.facility_name || "Barangay Health Center";
    const qty = Number(ret.quantity) || 0;
    const unitCost = details.unitCost;
    const totalCost = qty * unitCost;
    const unitCostStr = formatDetailedCurrency(unitCost);
    const totalCostStr = formatDetailedCurrency(totalCost);
    const desc = ret.reason || ret.remarks || "Stock Return";

    colLengths.C = Math.max(colLengths.C, no.length);
    colLengths.D = Math.max(colLengths.D, cleanDate.length);
    colLengths.E = Math.max(colLengths.E, itemDesc.length);
    colLengths.F = Math.max(colLengths.F, brand.length);
    colLengths.G = Math.max(colLengths.G, unit.length);
    colLengths.H = Math.max(colLengths.H, batchNo.length);
    colLengths.I = Math.max(colLengths.I, expDate.length);
    colLengths.J = Math.max(colLengths.J, facilityName.length);
    colLengths.K = Math.max(colLengths.K, unitCostStr.length);
    colLengths.L = Math.max(colLengths.L, totalCostStr.length);
    colLengths.M = Math.max(colLengths.M, String(qty).length);
    colLengths.N = Math.max(colLengths.N, desc.length);

    let rowXml = `<row r="${r}" spans="3:14" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
    rowXml += `<c r="C${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(no)}</t></is></c>`;
    rowXml += `<c r="D${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(cleanDate)}</t></is></c>`;
    rowXml += `<c r="E${r}" s="${styles.textLeft}" t="inlineStr"><is><t>${escapeXml(itemDesc)}</t></is></c>`;
    rowXml += `<c r="F${r}" s="${styles.textLeft}" t="inlineStr"><is><t>${escapeXml(brand)}</t></is></c>`;
    rowXml += `<c r="G${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(unit)}</t></is></c>`;
    rowXml += `<c r="H${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(batchNo)}</t></is></c>`;
    rowXml += `<c r="I${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(expDate)}</t></is></c>`;
    rowXml += `<c r="J${r}" s="${styles.textLeft}" t="inlineStr"><is><t>${escapeXml(facilityName)}</t></is></c>`;
    rowXml += `<c r="K${r}" s="${styles.currencyRight}"><v>${unitCost}</v></c>`;
    rowXml += `<c r="L${r}" s="${styles.currencyRight}"><v>${totalCost}</v></c>`;
    rowXml += `<c r="M${r}" s="${styles.numberCenter}"><v>${qty}</v></c>`;
    rowXml += `<c r="N${r}" s="${styles.textLeft}" t="inlineStr"><is><t>${escapeXml(desc)}</t></is></c>`;
    rowXml += `</row>`;
    rowsXml.push(rowXml);
  });

  // Pad table with clean bordered empty rows up to at least 10 rows
  const minRows = 10;
  for (let i = filteredReturns.length; i < minRows; i++) {
    const r = startRow + i;
    let emptyRow = `<row r="${r}" spans="3:14" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
    emptyRow += `<c r="C${r}" s="${styles.textCenter}"/>`;
    emptyRow += `<c r="D${r}" s="${styles.textCenter}"/>`;
    emptyRow += `<c r="E${r}" s="${styles.textLeft}"/>`;
    emptyRow += `<c r="F${r}" s="${styles.textLeft}"/>`;
    emptyRow += `<c r="G${r}" s="${styles.textCenter}"/>`;
    emptyRow += `<c r="H${r}" s="${styles.textCenter}"/>`;
    emptyRow += `<c r="I${r}" s="${styles.textCenter}"/>`;
    emptyRow += `<c r="J${r}" s="${styles.textLeft}"/>`;
    emptyRow += `<c r="K${r}" s="${styles.currencyRight}"/>`;
    emptyRow += `<c r="L${r}" s="${styles.currencyRight}"/>`;
    emptyRow += `<c r="M${r}" s="${styles.numberCenter}"/>`;
    emptyRow += `<c r="N${r}" s="${styles.textLeft}"/>`;
    emptyRow += `</row>`;
    rowsXml.push(emptyRow);
  }

  const row8TailRegex = /<row r="8"[\s\S]*?<\/sheetData>/;
  xml = xml.replace(row8TailRegex, `${rowsXml.join("")}</sheetData>`);

  const colSpecs = [
    { col: "C", minCol: 3, maxCol: 3, defaultWidth: 6 },
    { col: "D", minCol: 4, maxCol: 4, defaultWidth: 12 },
    { col: "E", minCol: 5, maxCol: 5, defaultWidth: 35 },
    { col: "F", minCol: 6, maxCol: 6, defaultWidth: 16 },
    { col: "G", minCol: 7, maxCol: 7, defaultWidth: 10 },
    { col: "H", minCol: 8, maxCol: 8, defaultWidth: 16 },
    { col: "I", minCol: 9, maxCol: 9, defaultWidth: 16 },
    { col: "J", minCol: 10, maxCol: 10, defaultWidth: 20 },
    { col: "K", minCol: 11, maxCol: 11, defaultWidth: 12 },
    { col: "L", minCol: 12, maxCol: 12, defaultWidth: 14 },
    { col: "M", minCol: 13, maxCol: 13, defaultWidth: 10 },
    { col: "N", minCol: 14, maxCol: 14, defaultWidth: 30 },
  ];
  const colsXml = buildAutoFitColsXml(colSpecs, colLengths);
  xml = xml.replace(/<cols>[\s\S]*?<\/cols>/, colsXml);

  // Update dimension
  const lastRow = startRow + Math.max(filteredReturns.length, 10) - 1;
  xml = xml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="C3:N${lastRow}"/>`);

  // Suppress "Number stored as text" warning triangles
  xml = injectIgnoredErrors(xml, "C7:N500");

  return xml;
}

/**
 * Builds Sheet 3 (additional-deliveries-summation) XML
 */
export function buildSheet3Xml(
  originalXml,
  inventoryRows = [],
  subtitleDate = "",
  medicines = [],
  styles = { textLeft: 11, textCenter: 12, currencyRight: 22, numberCenter: 12 }
) {
  let xml = originalXml;

  const titleStyle = styles.title || (styles.isMonthly ? 17 : 16);
  const subtitleStyle = styles.subtitle || (styles.isMonthly ? 14 : 13);
  const h = styles.headers || getHeaderStyles(styles.isMonthly);

  // Clean rows 1-6 (remove any stray cells in columns R..Y from template)
  xml = xml.replace(/<row r="[126]"[\s\S]*?<\/row>/g, "");

  const row3Xml = `<row r="3" spans="3:11" x14ac:dyDescent="0.25"><c r="C3" s="${titleStyle}" t="inlineStr"><is><t>VICENTE MENDIOLA FOR HEALTH</t></is></c><c r="D3" s="${titleStyle}"/><c r="E3" s="${titleStyle}"/><c r="F3" s="${titleStyle}"/><c r="G3" s="${titleStyle}"/><c r="H3" s="${titleStyle}"/><c r="I3" s="${titleStyle}"/><c r="J3" s="${titleStyle}"/><c r="K3" s="${titleStyle}"/></row>`;
  xml = xml.replace(/<row r="3"[\s\S]*?<\/row>/, row3Xml);

  const row4Xml = `<row r="4" spans="3:11" x14ac:dyDescent="0.25"><c r="C4" s="${titleStyle}" t="inlineStr"><is><t>Summation (Beginning Balance + Additional Deliveries)</t></is></c><c r="D4" s="${titleStyle}"/><c r="E4" s="${titleStyle}"/><c r="F4" s="${titleStyle}"/><c r="G4" s="${titleStyle}"/><c r="H4" s="${titleStyle}"/><c r="I4" s="${titleStyle}"/><c r="J4" s="${titleStyle}"/><c r="K4" s="${titleStyle}"/></row>`;
  xml = xml.replace(/<row r="4"[\s\S]*?<\/row>/, row4Xml);

  const row5Xml = `<row r="5" spans="3:11" x14ac:dyDescent="0.25"><c r="C5" s="${subtitleStyle}" t="inlineStr"><is><t>${escapeXml(subtitleDate)}</t></is></c><c r="D5" s="${subtitleStyle}"/><c r="E5" s="${subtitleStyle}"/><c r="F5" s="${subtitleStyle}"/><c r="G5" s="${subtitleStyle}"/><c r="H5" s="${subtitleStyle}"/><c r="I5" s="${subtitleStyle}"/><c r="J5" s="${subtitleStyle}"/><c r="K5" s="${subtitleStyle}"/></row>`;
  xml = xml.replace(/<row r="5"[\s\S]*?<\/row>/, row5Xml);

  const medicinesMap = new Map();
  (medicines || []).forEach((m) => medicinesMap.set(m.id, m));

  // Group inventory rows by PO Number
  const poGroups = new Map();
  (inventoryRows || []).forEach((inv) => {
    const po = inv.po_number || "INITIAL / PROCUREMENT";
    if (!poGroups.has(po)) {
      poGroups.set(po, {
        poNumber: po,
        date: inv.date_received || inv.created_at || "-",
        items: [],
      });
    }
    poGroups.get(po).items.push(inv);
  });

  const colLengths = {
    C: 5, // No.
    D: 35, // PO NO. / Item Description
    E: 16, // Date / Brand
    F: 10, // Unit
    G: 16, // Batch/Lot No.
    H: 16, // Expiration Date
    I: 10, // Quantity
    J: 12, // Unit Cost
    K: 14, // Total Cost
  };

  const rowsXml = [];
  const mergeCells = [];
  let currentRow = 7;
  let globalItemIndex = 1;

  // Sort PO groups in descending chronological order: most recent PO delivery at top, oldest at bottom
  const sortedPoGroups = Array.from(poGroups.values()).sort((a, b) => {
    const timeA = a.date && a.date !== "-" ? new Date(a.date).getTime() || 0 : 0;
    const timeB = b.date && b.date !== "-" ? new Date(b.date).getTime() || 0 : 0;
    if (timeA !== timeB) return timeB - timeA;
    return a.poNumber.localeCompare(b.poNumber);
  });

  sortedPoGroups.forEach((group) => {
    group.items.sort((a, b) => {
      const dateA = a.date_received || a.created_at || "";
      const dateB = b.date_received || b.created_at || "";
      const timeA = new Date(dateA).getTime() || 0;
      const timeB = new Date(dateB).getTime() || 0;
      if (timeA !== timeB) return timeB - timeA;
      return (a.generic_name || "").localeCompare(b.generic_name || "");
    });

    const rHeader1 = currentRow;
    const rHeader2 = currentRow + 1;
    currentRow += 2;

    const poLabel = `PO NO. ${group.poNumber}`;
    const dateLabel = `Date:  ${group.date ? toDateKey(group.date) : "-"}`;

    colLengths.D = Math.max(colLengths.D, poLabel.length);
    colLengths.E = Math.max(colLengths.E, dateLabel.length);

    // Row 1 of PO Header: All styled with uniform peach headers
    let h1Xml = `<row r="${rHeader1}" spans="3:11" ht="19" customHeight="1" x14ac:dyDescent="0.25">`;
    h1Xml += `<c r="C${rHeader1}" s="${h.s3H1_no}" t="inlineStr"><is><t>No.</t></is></c>`;
    h1Xml += `<c r="D${rHeader1}" s="${h.s3H1_poDate}" t="inlineStr"><is><t>${escapeXml(poLabel)}</t></is></c>`;
    h1Xml += `<c r="E${rHeader1}" s="${h.s3H1_poDate}" t="inlineStr"><is><t>${escapeXml(dateLabel)}</t></is></c>`;
    h1Xml += `<c r="F${rHeader1}" s="${h.s3H1_base}" t="inlineStr"><is><t>Unit</t></is></c>`;
    h1Xml += `<c r="G${rHeader1}" s="${h.s3H1_base}" t="inlineStr"><is><t>Batch/Lot No.</t></is></c>`;
    h1Xml += `<c r="H${rHeader1}" s="${h.s3H1_expiry}" t="inlineStr"><is><t>Expiration Date</t></is></c>`;
    h1Xml += `<c r="I${rHeader1}" s="${h.s3H1_base}" t="inlineStr"><is><t>Quantity</t></is></c>`;
    h1Xml += `<c r="J${rHeader1}" s="${h.s3H1_base}" t="inlineStr"><is><t>Unit Cost</t></is></c>`;
    h1Xml += `<c r="K${rHeader1}" s="${h.s3H1_base}" t="inlineStr"><is><t>Total Cost</t></is></c>`;
    h1Xml += `</row>`;
    rowsXml.push(h1Xml);

    // Row 2 of PO Header: Item Description & Brand under PO & Date
    let h2Xml = `<row r="${rHeader2}" spans="3:11" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
    h2Xml += `<c r="C${rHeader2}" s="${h.s3H2_no}"/>`;
    h2Xml += `<c r="D${rHeader2}" s="${h.s3H2_itemBrand}" t="inlineStr"><is><t>Item Description</t></is></c>`;
    h2Xml += `<c r="E${rHeader2}" s="${h.s3H2_itemBrand}" t="inlineStr"><is><t>Brand</t></is></c>`;
    h2Xml += `<c r="F${rHeader2}" s="${h.s3H2_base}"/>`;
    h2Xml += `<c r="G${rHeader2}" s="${h.s3H2_base}"/>`;
    h2Xml += `<c r="H${rHeader2}" s="${h.s3H2_base}"/>`;
    h2Xml += `<c r="I${rHeader2}" s="${h.s3H2_base}"/>`;
    h2Xml += `<c r="J${rHeader2}" s="${h.s3H2_base}"/>`;
    h2Xml += `<c r="K${rHeader2}" s="${h.s3H2_base}"/>`;
    h2Xml += `</row>`;
    rowsXml.push(h2Xml);

    // Add vertical merge for No., Unit, Batch, Expiry, Qty, Cost, Total
    mergeCells.push(`C${rHeader1}:C${rHeader2}`);
    mergeCells.push(`F${rHeader1}:F${rHeader2}`);
    mergeCells.push(`G${rHeader1}:G${rHeader2}`);
    mergeCells.push(`H${rHeader1}:H${rHeader2}`);
    mergeCells.push(`I${rHeader1}:I${rHeader2}`);
    mergeCells.push(`J${rHeader1}:J${rHeader2}`);
    mergeCells.push(`K${rHeader1}:K${rHeader2}`);

    // Data rows for this PO
    group.items.forEach((item) => {
      const r = currentRow++;
      const no = String(globalItemIndex++);
      const details = resolveMedicineBatchDetails({ item, inventoryRows, medicinesMap });
      const itemDesc = details.itemDescription;
      const brand = details.brand;
      const unit = details.unit;
      const batchNo = details.batchNo;
      const expDate = details.expirationDate;
      const qty = Number(item.quantity) || 0;
      const unitCost = details.unitCost;
      const totalCost = qty * unitCost;
      const unitCostStr = formatDetailedCurrency(unitCost);
      const totalCostStr = formatDetailedCurrency(totalCost);

      colLengths.C = Math.max(colLengths.C, no.length);
      colLengths.D = Math.max(colLengths.D, itemDesc.length);
      colLengths.E = Math.max(colLengths.E, brand.length);
      colLengths.F = Math.max(colLengths.F, unit.length);
      colLengths.G = Math.max(colLengths.G, batchNo.length);
      colLengths.H = Math.max(colLengths.H, expDate.length);
      colLengths.I = Math.max(colLengths.I, String(qty).length);
      colLengths.J = Math.max(colLengths.J, unitCostStr.length);
      colLengths.K = Math.max(colLengths.K, totalCostStr.length);

      let rowXml = `<row r="${r}" spans="3:11" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
      rowXml += `<c r="C${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(no)}</t></is></c>`;
      rowXml += `<c r="D${r}" s="${styles.textLeft}" t="inlineStr"><is><t>${escapeXml(itemDesc)}</t></is></c>`;
      rowXml += `<c r="E${r}" s="${styles.textLeft}" t="inlineStr"><is><t>${escapeXml(brand)}</t></is></c>`;
      rowXml += `<c r="F${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(unit)}</t></is></c>`;
      rowXml += `<c r="G${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(batchNo)}</t></is></c>`;
      rowXml += `<c r="H${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(expDate)}</t></is></c>`;
      rowXml += `<c r="I${r}" s="${styles.numberCenter}"><v>${qty}</v></c>`;
      rowXml += `<c r="J${r}" s="${styles.currencyRight}"><v>${unitCost}</v></c>`;
      rowXml += `<c r="K${r}" s="${styles.currencyRight}"><v>${totalCost}</v></c>`;
      rowXml += `</row>`;
      rowsXml.push(rowXml);
    });
  });

  // If no items, emit clean default headers and 10 bordered empty rows
  if (poGroups.size === 0) {
    const defaultR = 7;
    let h1 = `<row r="${defaultR}" spans="3:11" ht="19" customHeight="1" x14ac:dyDescent="0.25">`;
    h1 += `<c r="C${defaultR}" s="${h.s3H1_no}" t="inlineStr"><is><t>No.</t></is></c>`;
    h1 += `<c r="D${defaultR}" s="${h.s3H1_poDate}" t="inlineStr"><is><t>PO NO.</t></is></c>`;
    h1 += `<c r="E${defaultR}" s="${h.s3H1_poDate}" t="inlineStr"><is><t>Date:</t></is></c>`;
    h1 += `<c r="F${defaultR}" s="${h.s3H1_base}" t="inlineStr"><is><t>Unit</t></is></c>`;
    h1 += `<c r="G${defaultR}" s="${h.s3H1_base}" t="inlineStr"><is><t>Batch/Lot No.</t></is></c>`;
    h1 += `<c r="H${defaultR}" s="${h.s3H1_expiry}" t="inlineStr"><is><t>Expiration Date</t></is></c>`;
    h1 += `<c r="I${defaultR}" s="${h.s3H1_base}" t="inlineStr"><is><t>Quantity</t></is></c>`;
    h1 += `<c r="J${defaultR}" s="${h.s3H1_base}" t="inlineStr"><is><t>Unit Cost</t></is></c>`;
    h1 += `<c r="K${defaultR}" s="${h.s3H1_base}" t="inlineStr"><is><t>Total Cost</t></is></c>`;
    h1 += `</row>`;
    rowsXml.push(h1);

    const defaultR2 = 8;
    let h2 = `<row r="${defaultR2}" spans="3:11" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
    h2 += `<c r="C${defaultR2}" s="${h.s3H2_no}"/>`;
    h2 += `<c r="D${defaultR2}" s="${h.s3H2_itemBrand}" t="inlineStr"><is><t>Item Description</t></is></c>`;
    h2 += `<c r="E${defaultR2}" s="${h.s3H2_itemBrand}" t="inlineStr"><is><t>Brand</t></is></c>`;
    h2 += `<c r="F${defaultR2}" s="${h.s3H2_base}"/>`;
    h2 += `<c r="G${defaultR2}" s="${h.s3H2_base}"/>`;
    h2 += `<c r="H${defaultR2}" s="${h.s3H2_base}"/>`;
    h2 += `<c r="I${defaultR2}" s="${h.s3H2_base}"/>`;
    h2 += `<c r="J${defaultR2}" s="${h.s3H2_base}"/>`;
    h2 += `<c r="K${defaultR2}" s="${h.s3H2_base}"/>`;
    h2 += `</row>`;
    rowsXml.push(h2);

    mergeCells.push("C7:C8", "F7:F8", "G7:G8", "H7:H8", "I7:I8", "J7:J8", "K7:K8");

    for (let i = 0; i < 10; i++) {
      const r = 9 + i;
      let emptyRow = `<row r="${r}" spans="3:11" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
      emptyRow += `<c r="C${r}" s="${styles.textCenter}"/>`;
      emptyRow += `<c r="D${r}" s="${styles.textLeft}"/>`;
      emptyRow += `<c r="E${r}" s="${styles.textLeft}"/>`;
      emptyRow += `<c r="F${r}" s="${styles.textCenter}"/>`;
      emptyRow += `<c r="G${r}" s="${styles.textCenter}"/>`;
      emptyRow += `<c r="H${r}" s="${styles.textCenter}"/>`;
      emptyRow += `<c r="I${r}" s="${styles.numberCenter}"/>`;
      emptyRow += `<c r="J${r}" s="${styles.currencyRight}"/>`;
      emptyRow += `<c r="K${r}" s="${styles.currencyRight}"/>`;
      emptyRow += `</row>`;
      rowsXml.push(emptyRow);
      currentRow = r + 1;
    }
  } else {
    // If fewer than 10 data items in total, pad up to at least 10 rows
    const totalDataRows = globalItemIndex - 1;
    if (totalDataRows < 10) {
      const remaining = 10 - totalDataRows;
      for (let i = 0; i < remaining; i++) {
        const r = currentRow++;
        let emptyRow = `<row r="${r}" spans="3:11" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
        emptyRow += `<c r="C${r}" s="${styles.textCenter}"/>`;
        emptyRow += `<c r="D${r}" s="${styles.textLeft}"/>`;
        emptyRow += `<c r="E${r}" s="${styles.textLeft}"/>`;
        emptyRow += `<c r="F${r}" s="${styles.textCenter}"/>`;
        emptyRow += `<c r="G${r}" s="${styles.textCenter}"/>`;
        emptyRow += `<c r="H${r}" s="${styles.textCenter}"/>`;
        emptyRow += `<c r="I${r}" s="${styles.numberCenter}"/>`;
        emptyRow += `<c r="J${r}" s="${styles.currencyRight}"/>`;
        emptyRow += `<c r="K${r}" s="${styles.currencyRight}"/>`;
        emptyRow += `</row>`;
        rowsXml.push(emptyRow);
      }
    }
  }

  const row7TailRegex = /<row r="7"[\s\S]*?<\/sheetData>/;
  xml = xml.replace(row7TailRegex, `${rowsXml.join("")}</sheetData>`);

  // Update mergeCells
  const baseMerges = ["C3:K3", "C4:K4", "C5:K5"];
  const allMerges = [...baseMerges, ...mergeCells];
  const mergeCellsXml = `<mergeCells count="${allMerges.length}">${allMerges
    .map((ref) => `<mergeCell ref="${ref}"/>`)
    .join("")}</mergeCells>`;
  xml = xml.replace(/<mergeCells[\s\S]*?<\/mergeCells>/, mergeCellsXml);

  const colSpecs = [
    { col: "C", minCol: 3, maxCol: 3, defaultWidth: 6 },
    { col: "D", minCol: 4, maxCol: 4, defaultWidth: 35 },
    { col: "E", minCol: 5, maxCol: 5, defaultWidth: 20 },
    { col: "F", minCol: 6, maxCol: 6, defaultWidth: 14 },
    { col: "G", minCol: 7, maxCol: 7, defaultWidth: 16 },
    { col: "H", minCol: 8, maxCol: 8, defaultWidth: 16 },
    { col: "I", minCol: 9, maxCol: 9, defaultWidth: 12 },
    { col: "J", minCol: 10, maxCol: 10, defaultWidth: 12 },
    { col: "K", minCol: 11, maxCol: 11, defaultWidth: 14 },
  ];
  const colsXml = buildAutoFitColsXml(colSpecs, colLengths);
  xml = xml.replace(/<cols>[\s\S]*?<\/cols>/, colsXml);

  // Update dimension
  const lastRow = Math.max(currentRow - 1, 18);
  xml = xml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="C3:K${lastRow}"/>`);

  // Suppress "Number stored as text" warning triangles
  xml = injectIgnoredErrors(xml, "C7:K500");

  return xml;
}

/**
 * Builds Sheet 4 (other-program) XML
 */
export function buildSheet4Xml(
  originalXml,
  otherPrograms = [],
  subtitleDate = "",
  medicines = [],
  styles = { textLeft: 11, textCenter: 12, currencyRight: 22, numberCenter: 12 },
  { selectedDate = new Date(), year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = {},
  inventoryRows = []
) {
  let xml = originalXml;

  const titleStyle = styles.title || (styles.isMonthly ? 17 : 16);
  const subtitleStyle = styles.subtitle || (styles.isMonthly ? 14 : 13);
  const h = styles.headers || getHeaderStyles(styles.isMonthly);

  // Clean unbordered title and subtitle rows
  const row3Xml = `<row r="3" spans="3:11" x14ac:dyDescent="0.25"><c r="C3" s="${titleStyle}" t="inlineStr"><is><t>VICENTE MENDIOLA FOR HEALTH</t></is></c><c r="D3" s="${titleStyle}"/><c r="E3" s="${titleStyle}"/><c r="F3" s="${titleStyle}"/><c r="G3" s="${titleStyle}"/><c r="H3" s="${titleStyle}"/><c r="I3" s="${titleStyle}"/><c r="J3" s="${titleStyle}"/><c r="K3" s="${titleStyle}"/></row>`;
  xml = xml.replace(/<row r="3"[\s\S]*?<\/row>/, row3Xml);

  const row4Xml = `<row r="4" spans="3:11" x14ac:dyDescent="0.25"><c r="C4" s="${titleStyle}" t="inlineStr"><is><t>Transferred to Other Program</t></is></c><c r="D4" s="${titleStyle}"/><c r="E4" s="${titleStyle}"/><c r="F4" s="${titleStyle}"/><c r="G4" s="${titleStyle}"/><c r="H4" s="${titleStyle}"/><c r="I4" s="${titleStyle}"/><c r="J4" s="${titleStyle}"/><c r="K4" s="${titleStyle}"/></row>`;
  xml = xml.replace(/<row r="4"[\s\S]*?<\/row>/, row4Xml);

  const row5Xml = `<row r="5" spans="3:11" x14ac:dyDescent="0.25"><c r="C5" s="${subtitleStyle}" t="inlineStr"><is><t>${escapeXml(subtitleDate)}</t></is></c><c r="D5" s="${subtitleStyle}"/><c r="E5" s="${subtitleStyle}"/><c r="F5" s="${subtitleStyle}"/><c r="G5" s="${subtitleStyle}"/><c r="H5" s="${subtitleStyle}"/><c r="I5" s="${subtitleStyle}"/><c r="J5" s="${subtitleStyle}"/><c r="K5" s="${subtitleStyle}"/></row>`;
  xml = xml.replace(/<row r="5"[\s\S]*?<\/row>/, row5Xml);

  const medicinesMap = new Map();
  (medicines || []).forEach((m) => medicinesMap.set(m.id, m));

  const targetY = Number(year) || (selectedDate ? new Date(selectedDate).getFullYear() : new Date().getFullYear());
  const targetM = Number(month) || (selectedDate ? new Date(selectedDate).getMonth() + 1 : new Date().getMonth() + 1);

  // Filter programs by target reporting month (includes all active health outreach programs in that month)
  const filteredPrograms = (otherPrograms || []).filter((prog) => {
    if (String(prog.status || "").toUpperCase() === "CANCELLED") return false;
    const progDate =
      prog.program_date ||
      prog.distribution_date ||
      prog.completed_at ||
      prog.date ||
      prog.created_at ||
      prog.updated_at;
    if (!progDate) return false;
    const d = new Date(progDate);
    if (Number.isNaN(d.getTime())) return false;
    return d.getFullYear() === targetY && d.getMonth() + 1 === targetM;
  });

  // Sort programs in descending chronological order: most recent program at top, oldest at bottom
  filteredPrograms.sort((a, b) => {
    const dateA = a.program_date || a.distribution_date || a.completed_at || a.date || a.created_at || "";
    const dateB = b.program_date || b.distribution_date || b.completed_at || b.date || b.created_at || "";
    const timeA = new Date(dateA).getTime() || 0;
    const timeB = new Date(dateB).getTime() || 0;
    if (timeA !== timeB) return timeB - timeA;
    return (a.program_name || "").localeCompare(b.program_name || "");
  });

  const colLengths = {
    C: 5, // No.
    D: 35, // Item Description
    E: 16, // Brand
    F: 10, // Unit
    G: 16, // Batch/Lot No.
    H: 16, // Expiration Date
    I: 10, // Quantity
    J: 12, // Unit Cost
    K: 14, // Total Cost
  };

  const rowsXml = [];
  const mergeCells = [];
  let currentRow = 7;

  filteredPrograms.forEach((prog) => {
    const rHeader1 = currentRow;
    const rHeader2 = currentRow + 1;
    currentRow += 2;

    const progName = prog.program_name || "Health Program";
    const rawProgDate =
      prog.program_date ||
      prog.distribution_date ||
      prog.completed_at ||
      prog.date ||
      prog.created_at ||
      prog.updated_at;
    const progSchedule = rawProgDate ? toDateKey(rawProgDate) : "-";

    colLengths.D = Math.max(colLengths.D, `Program Name: ${progName}`.length);
    colLengths.G = Math.max(colLengths.G, `Program Schedule: ${progSchedule}`.length);

    // Row 1 of Program: C (merged No.), D:F (merged Program Name), G:K (merged Program Schedule)
    let h1Xml = `<row r="${rHeader1}" spans="3:11" ht="19" customHeight="1" x14ac:dyDescent="0.25">`;
    h1Xml += `<c r="C${rHeader1}" s="${h.s4H1_no}" t="inlineStr"><is><t>No.</t></is></c>`;
    h1Xml += `<c r="D${rHeader1}" s="${h.s4H1_prog}" t="inlineStr"><is><t>Program Name: ${escapeXml(progName)}</t></is></c>`;
    h1Xml += `<c r="E${rHeader1}" s="${h.s4H1_prog}"/>`;
    h1Xml += `<c r="F${rHeader1}" s="${h.s4H1_prog}"/>`;
    h1Xml += `<c r="G${rHeader1}" s="${h.s4H1_prog}" t="inlineStr"><is><t>Program Schedule: ${escapeXml(progSchedule)}</t></is></c>`;
    h1Xml += `<c r="H${rHeader1}" s="${h.s4H1_prog}"/>`;
    h1Xml += `<c r="I${rHeader1}" s="${h.s4H1_prog}"/>`;
    h1Xml += `<c r="J${rHeader1}" s="${h.s4H1_prog}"/>`;
    h1Xml += `<c r="K${rHeader1}" s="${h.s4H1_prog}"/>`;
    h1Xml += `</row>`;
    rowsXml.push(h1Xml);

    // Row 2 of Program: Column headers
    let h2Xml = `<row r="${rHeader2}" spans="3:11" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
    h2Xml += `<c r="C${rHeader2}" s="${h.s4H2_no}"/>`;
    h2Xml += `<c r="D${rHeader2}" s="${h.s4H2_col}" t="inlineStr"><is><t>Item Description</t></is></c>`;
    h2Xml += `<c r="E${rHeader2}" s="${h.s4H2_col}" t="inlineStr"><is><t>Brand</t></is></c>`;
    h2Xml += `<c r="F${rHeader2}" s="${h.s4H2_center || h.s4H2_col}" t="inlineStr"><is><t>Unit</t></is></c>`;
    h2Xml += `<c r="G${rHeader2}" s="${h.s4H2_center || h.s4H2_col}" t="inlineStr"><is><t>Batch/Lot No. </t></is></c>`;
    h2Xml += `<c r="H${rHeader2}" s="${h.s4H2_center || h.s4H2_col}" t="inlineStr"><is><t>Expiration Date</t></is></c>`;
    h2Xml += `<c r="I${rHeader2}" s="${h.s4H2_center || h.s4H2_col}" t="inlineStr"><is><t>Quantity </t></is></c>`;
    h2Xml += `<c r="J${rHeader2}" s="${h.s4H2_center || h.s4H2_col}" t="inlineStr"><is><t>Unit Cost </t></is></c>`;
    h2Xml += `<c r="K${rHeader2}" s="${h.s4H2_total}" t="inlineStr"><is><t>Total  Cost</t></is></c>`;
    h2Xml += `</row>`;
    rowsXml.push(h2Xml);

    mergeCells.push(`C${rHeader1}:C${rHeader2}`);
    mergeCells.push(`D${rHeader1}:F${rHeader1}`);
    mergeCells.push(`G${rHeader1}:K${rHeader1}`);

    // Items under this program (support prog.medicines, prog.items, and prog.data_json.items)
    let items = prog.medicines;
    if (!Array.isArray(items) && prog.items) items = prog.items;
    if (!Array.isArray(items) && prog.data_json) {
      try {
        const parsed = typeof prog.data_json === "string" ? JSON.parse(prog.data_json) : prog.data_json;
        items = parsed?.medicines || parsed?.items || [];
      } catch {
        items = [];
      }
    }
    if (!Array.isArray(items)) items = [];

    items.forEach((item, itemIdx) => {
      const r = currentRow++;
      const itemNo = String(itemIdx + 1);
      const details = resolveMedicineBatchDetails({ item, inventoryRows, medicinesMap });
      const itemDesc = details.itemDescription;
      const brand = details.brand;
      const unit = details.unit;
      const batchNo = details.batchNo;
      const expDate = details.expirationDate;
      const qty = Number(item.quantity_used ?? item.quantity) || 0;
      const unitCost = details.unitCost;
      const totalCost = qty * unitCost;
      const unitCostStr = formatDetailedCurrency(unitCost);
      const totalCostStr = formatDetailedCurrency(totalCost);

      colLengths.C = Math.max(colLengths.C, itemNo.length);
      colLengths.D = Math.max(colLengths.D, itemDesc.length);
      colLengths.E = Math.max(colLengths.E, brand.length);
      colLengths.F = Math.max(colLengths.F, unit.length);
      colLengths.G = Math.max(colLengths.G, batchNo.length);
      colLengths.H = Math.max(colLengths.H, expDate.length);
      colLengths.I = Math.max(colLengths.I, String(qty).length);
      colLengths.J = Math.max(colLengths.J, unitCostStr.length);
      colLengths.K = Math.max(colLengths.K, totalCostStr.length);

      let rowXml = `<row r="${r}" spans="3:11" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
      rowXml += `<c r="C${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${itemNo}</t></is></c>`;
      rowXml += `<c r="D${r}" s="${styles.textLeft}" t="inlineStr"><is><t>${escapeXml(itemDesc)}</t></is></c>`;
      rowXml += `<c r="E${r}" s="${styles.textLeft}" t="inlineStr"><is><t>${escapeXml(brand)}</t></is></c>`;
      rowXml += `<c r="F${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(unit)}</t></is></c>`;
      rowXml += `<c r="G${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(batchNo)}</t></is></c>`;
      rowXml += `<c r="H${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(expDate)}</t></is></c>`;
      rowXml += `<c r="I${r}" s="${styles.numberCenter}"><v>${qty}</v></c>`;
      rowXml += `<c r="J${r}" s="${styles.currencyRight}"><v>${unitCost}</v></c>`;
      rowXml += `<c r="K${r}" s="${styles.currencyRight}"><v>${totalCost}</v></c>`;
      rowXml += `</row>`;
      rowsXml.push(rowXml);
    });

    // If program has fewer than 8 items, pad up to at least 8 bordered empty rows
    const padCount = Math.max(0, 8 - items.length);
    for (let i = 0; i < padCount; i++) {
      const r = currentRow++;
      let emptyRow = `<row r="${r}" spans="3:11" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
      emptyRow += `<c r="C${r}" s="${styles.textCenter}"/>`;
      emptyRow += `<c r="D${r}" s="${styles.textLeft}"/>`;
      emptyRow += `<c r="E${r}" s="${styles.textLeft}"/>`;
      emptyRow += `<c r="F${r}" s="${styles.textCenter}"/>`;
      emptyRow += `<c r="G${r}" s="${styles.textCenter}"/>`;
      emptyRow += `<c r="H${r}" s="${styles.textCenter}"/>`;
      emptyRow += `<c r="I${r}" s="${styles.numberCenter}"/>`;
      emptyRow += `<c r="J${r}" s="${styles.currencyRight}"/>`;
      emptyRow += `<c r="K${r}" s="${styles.currencyRight}"/>`;
      emptyRow += `</row>`;
      rowsXml.push(emptyRow);
    }
  });

  // If no programs exist for the period, preserve clean default rows in strict alphabetical order
  if (filteredPrograms.length === 0) {
    let h1 = `<row r="7" spans="3:11" ht="19" customHeight="1" x14ac:dyDescent="0.25">`;
    h1 += `<c r="C7" s="${h.s4H1_no}" t="inlineStr"><is><t>1</t></is></c>`;
    h1 += `<c r="D7" s="${h.s4H1_prog}" t="inlineStr"><is><t>Program Name: </t></is></c>`;
    h1 += `<c r="E7" s="${h.s4H1_prog}"/><c r="F7" s="${h.s4H1_prog}"/>`;
    h1 += `<c r="G7" s="${h.s4H1_prog}" t="inlineStr"><is><t>Program Schedule:</t></is></c>`;
    h1 += `<c r="H7" s="${h.s4H1_prog}"/><c r="I7" s="${h.s4H1_prog}"/><c r="J7" s="${h.s4H1_prog}"/><c r="K7" s="${h.s4H1_prog}"/>`;
    h1 += `</row>`;
    rowsXml.push(h1);

    let h2 = `<row r="8" spans="3:11" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
    h2 += `<c r="C8" s="${h.s4H2_no}"/>`;
    h2 += `<c r="D8" s="${h.s4H2_col}" t="inlineStr"><is><t>Item Description</t></is></c>`;
    h2 += `<c r="E8" s="${h.s4H2_col}" t="inlineStr"><is><t>Brand</t></is></c>`;
    h2 += `<c r="F8" s="${h.s4H2_center || h.s4H2_col}" t="inlineStr"><is><t>Unit</t></is></c>`;
    h2 += `<c r="G8" s="${h.s4H2_center || h.s4H2_col}" t="inlineStr"><is><t>Batch/Lot No. </t></is></c>`;
    h2 += `<c r="H8" s="${h.s4H2_center || h.s4H2_col}" t="inlineStr"><is><t>Expiration Date</t></is></c>`;
    h2 += `<c r="I8" s="${h.s4H2_center || h.s4H2_col}" t="inlineStr"><is><t>Quantity </t></is></c>`;
    h2 += `<c r="J8" s="${h.s4H2_center || h.s4H2_col}" t="inlineStr"><is><t>Unit Cost </t></is></c>`;
    h2 += `<c r="K8" s="${h.s4H2_total}" t="inlineStr"><is><t>Total  Cost</t></is></c>`;
    h2 += `</row>`;
    rowsXml.push(h2);

    mergeCells.push("C7:C8", "D7:F7", "G7:K7");

    for (let i = 0; i < 8; i++) {
      const r = 9 + i;
      let emptyRow = `<row r="${r}" spans="3:11" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
      emptyRow += `<c r="C${r}" s="${styles.textCenter}"/>`;
      emptyRow += `<c r="D${r}" s="${styles.textLeft}"/>`;
      emptyRow += `<c r="E${r}" s="${styles.textLeft}"/>`;
      emptyRow += `<c r="F${r}" s="${styles.textCenter}"/>`;
      emptyRow += `<c r="G${r}" s="${styles.textCenter}"/>`;
      emptyRow += `<c r="H${r}" s="${styles.textCenter}"/>`;
      emptyRow += `<c r="I${r}" s="${styles.numberCenter}"/>`;
      emptyRow += `<c r="J${r}" s="${styles.currencyRight}"/>`;
      emptyRow += `<c r="K${r}" s="${styles.currencyRight}"/>`;
      emptyRow += `</row>`;
      rowsXml.push(emptyRow);
      currentRow = r + 1;
    }
  }

  const row7TailRegex = /<row r="7"[\s\S]*?<\/sheetData>/;
  xml = xml.replace(row7TailRegex, `${rowsXml.join("")}</sheetData>`);

  const baseMerges = ["C3:K3", "C4:K4", "C5:K5"];
  const allMerges = [...baseMerges, ...mergeCells];
  const mergeCellsXml = `<mergeCells count="${allMerges.length}">${allMerges
    .map((ref) => `<mergeCell ref="${ref}"/>`)
    .join("")}</mergeCells>`;
  xml = xml.replace(/<mergeCells[\s\S]*?<\/mergeCells>/, mergeCellsXml);

  const colSpecs = [
    { col: "C", minCol: 3, maxCol: 3, defaultWidth: 6 },
    { col: "D", minCol: 4, maxCol: 4, defaultWidth: 35 },
    { col: "E", minCol: 5, maxCol: 5, defaultWidth: 16 },
    { col: "F", minCol: 6, maxCol: 6, defaultWidth: 10 },
    { col: "G", minCol: 7, maxCol: 7, defaultWidth: 16 },
    { col: "H", minCol: 8, maxCol: 8, defaultWidth: 16 },
    { col: "I", minCol: 9, maxCol: 9, defaultWidth: 12 },
    { col: "J", minCol: 10, maxCol: 10, defaultWidth: 12 },
    { col: "K", minCol: 11, maxCol: 11, defaultWidth: 14 },
  ];
  const colsXml = buildAutoFitColsXml(colSpecs, colLengths);
  xml = xml.replace(/<cols>[\s\S]*?<\/cols>/, colsXml);

  // Update dimension
  const lastRow = Math.max(currentRow - 1, 16);
  xml = xml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="C3:K${lastRow}"/>`);

  // Suppress "Number stored as text" warning triangles
  xml = injectIgnoredErrors(xml, "C7:K500");

  return xml;
}

/**
 * Builds Sheet 5 (expired-stock) XML
 */
export function buildSheet5Xml(
  originalXml,
  inventoryRows = [],
  subtitleDate = "",
  medicines = [],
  styles = { textLeft: 11, textCenter: 12, currencyRight: 22, numberCenter: 12 },
  { mode = "recent", selectedDate = new Date(), year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = {}
) {
  let xml = originalXml;

  const titleStyle = styles.title || (styles.isMonthly ? 17 : 16);
  const subtitleStyle = styles.subtitle || (styles.isMonthly ? 14 : 13);
  const h = styles.headers || getHeaderStyles(styles.isMonthly);

  // Clean unbordered title and subtitle rows
  const row3Xml = `<row r="3" spans="3:11" x14ac:dyDescent="0.25"><c r="C3" s="${titleStyle}" t="inlineStr"><is><t>VICENTE MENDIOLA FOR HEALTH</t></is></c><c r="D3" s="${titleStyle}"/><c r="E3" s="${titleStyle}"/><c r="F3" s="${titleStyle}"/><c r="G3" s="${titleStyle}"/><c r="H3" s="${titleStyle}"/><c r="I3" s="${titleStyle}"/><c r="J3" s="${titleStyle}"/><c r="K3" s="${titleStyle}"/></row>`;
  xml = xml.replace(/<row r="3"[\s\S]*?<\/row>/, row3Xml);

  const row4Xml = `<row r="4" spans="3:11" x14ac:dyDescent="0.25"><c r="C4" s="${titleStyle}" t="inlineStr"><is><t>Expired Stocks</t></is></c><c r="D4" s="${titleStyle}"/><c r="E4" s="${titleStyle}"/><c r="F4" s="${titleStyle}"/><c r="G4" s="${titleStyle}"/><c r="H4" s="${titleStyle}"/><c r="I4" s="${titleStyle}"/><c r="J4" s="${titleStyle}"/><c r="K4" s="${titleStyle}"/></row>`;
  xml = xml.replace(/<row r="4"[\s\S]*?<\/row>/, row4Xml);

  const row5Xml = `<row r="5" spans="3:11" x14ac:dyDescent="0.25"><c r="C5" s="${subtitleStyle}" t="inlineStr"><is><t>${escapeXml(subtitleDate)}</t></is></c><c r="D5" s="${subtitleStyle}"/><c r="E5" s="${subtitleStyle}"/><c r="F5" s="${subtitleStyle}"/><c r="G5" s="${subtitleStyle}"/><c r="H5" s="${subtitleStyle}"/><c r="I5" s="${subtitleStyle}"/><c r="J5" s="${subtitleStyle}"/><c r="K5" s="${subtitleStyle}"/></row>`;
  xml = xml.replace(/<row r="5"[\s\S]*?<\/row>/, row5Xml);

  const row7Xml = `<row r="7" spans="3:11" ht="19" customHeight="1" x14ac:dyDescent="0.25">` +
    `<c r="C7" s="${h.s5Center || h.s5Header}" t="inlineStr"><is><t>No.</t></is></c>` +
    `<c r="D7" s="${h.s5Left || h.s5Header}" t="inlineStr"><is><t>Item Description</t></is></c>` +
    `<c r="E7" s="${h.s5Left || h.s5Header}" t="inlineStr"><is><t>Brand</t></is></c>` +
    `<c r="F7" s="${h.s5Center || h.s5Header}" t="inlineStr"><is><t>Unit</t></is></c>` +
    `<c r="G7" s="${h.s5Center || h.s5Header}" t="inlineStr"><is><t>Batch/Lot No.</t></is></c>` +
    `<c r="H7" s="${h.s5Center || h.s5Header}" t="inlineStr"><is><t>Quantity</t></is></c>` +
    `<c r="I7" s="${h.s5Center || h.s5Header}" t="inlineStr"><is><t>Unit Cost</t></is></c>` +
    `<c r="J7" s="${h.s5Center || h.s5Header}" t="inlineStr"><is><t>Total Cost</t></is></c>` +
    `<c r="K7" s="${h.s5Center || h.s5Header}" t="inlineStr"><is><t>Date Expired</t></is></c>` +
    `</row>`;
  xml = xml.replace(/<row r="7"[\s\S]*?<\/row>/, row7Xml);

  const medicinesMap = new Map();
  (medicines || []).forEach((m) => medicinesMap.set(m.id, m));

  // Determine expiration cutoff: end of target month (monthly) or selected date (recent)
  const targetDate = mode === "monthly"
    ? new Date(Number(year) || new Date().getFullYear(), Number(month) || new Date().getMonth() + 1, 0, 23, 59, 59)
    : (selectedDate ? new Date(selectedDate) : new Date());

  const expiredBatches = [];
  (inventoryRows || []).forEach((inv) => {
    const isStatusExpired = String(inv.status || "").toUpperCase() === "EXPIRED";
    let isPastExpiry = false;
    if (inv.expiration_date) {
      const exp = new Date(inv.expiration_date);
      if (!Number.isNaN(exp.getTime()) && exp <= targetDate) {
        isPastExpiry = true;
      }
    }

    if (isStatusExpired || isPastExpiry) {
      expiredBatches.push(inv);
    }
  });

  // Sort expired batches in descending chronological order: most recent expiration at top, oldest at bottom
  expiredBatches.sort((a, b) => {
    const expA = a.expiration_date ? new Date(a.expiration_date).getTime() || 0 : 0;
    const expB = b.expiration_date ? new Date(b.expiration_date).getTime() || 0 : 0;
    if (expA !== expB) return expB - expA;
    return (a.generic_name || "").localeCompare(b.generic_name || "");
  });

  const colLengths = {
    C: 5, // No.
    D: 35, // Item Description
    E: 16, // Brand
    F: 10, // Unit
    G: 16, // Batch/Lot No.
    H: 10, // Quantity
    I: 12, // Unit Cost
    J: 14, // Total Cost
    K: 16, // Date Expired
  };

  const rowsXml = [];
  const startRow = 8;

  expiredBatches.forEach((item, idx) => {
    const r = startRow + idx;
    const no = String(idx + 1);
    const details = resolveMedicineBatchDetails({ item, inventoryRows, medicinesMap });
    const itemDesc = details.itemDescription;
    const brand = details.brand;
    const unit = details.unit;
    const batchNo = details.batchNo;
    const qty = Number(item.quantity) || 0;
    const unitCost = details.unitCost;
    const totalCost = qty * unitCost;
    const unitCostStr = formatDetailedCurrency(unitCost);
    const totalCostStr = formatDetailedCurrency(totalCost);
    const dateExpired = details.expirationDate;

    colLengths.C = Math.max(colLengths.C, no.length);
    colLengths.D = Math.max(colLengths.D, itemDesc.length);
    colLengths.E = Math.max(colLengths.E, brand.length);
    colLengths.F = Math.max(colLengths.F, unit.length);
    colLengths.G = Math.max(colLengths.G, batchNo.length);
    colLengths.H = Math.max(colLengths.H, String(qty).length);
    colLengths.I = Math.max(colLengths.I, unitCostStr.length);
    colLengths.J = Math.max(colLengths.J, totalCostStr.length);
    colLengths.K = Math.max(colLengths.K, dateExpired.length);

    let rowXml = `<row r="${r}" spans="3:11" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
    rowXml += `<c r="C${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(no)}</t></is></c>`;
    rowXml += `<c r="D${r}" s="${styles.textLeft}" t="inlineStr"><is><t>${escapeXml(itemDesc)}</t></is></c>`;
    rowXml += `<c r="E${r}" s="${styles.textLeft}" t="inlineStr"><is><t>${escapeXml(brand)}</t></is></c>`;
    rowXml += `<c r="F${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(unit)}</t></is></c>`;
    rowXml += `<c r="G${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(batchNo)}</t></is></c>`;
    rowXml += `<c r="H${r}" s="${styles.numberCenter}"><v>${qty}</v></c>`;
    rowXml += `<c r="I${r}" s="${styles.currencyRight}"><v>${unitCost}</v></c>`;
    rowXml += `<c r="J${r}" s="${styles.currencyRight}"><v>${totalCost}</v></c>`;
    rowXml += `<c r="K${r}" s="${styles.textCenter}" t="inlineStr"><is><t>${escapeXml(dateExpired)}</t></is></c>`;
    rowXml += `</row>`;
    rowsXml.push(rowXml);
  });

  // Pad table with clean bordered empty rows up to at least 10 rows
  const minRows = 10;
  for (let i = expiredBatches.length; i < minRows; i++) {
    const r = startRow + i;
    let emptyRow = `<row r="${r}" spans="3:11" ht="18" customHeight="1" x14ac:dyDescent="0.25">`;
    emptyRow += `<c r="C${r}" s="${styles.textCenter}"/>`;
    emptyRow += `<c r="D${r}" s="${styles.textLeft}"/>`;
    emptyRow += `<c r="E${r}" s="${styles.textLeft}"/>`;
    emptyRow += `<c r="F${r}" s="${styles.textCenter}"/>`;
    emptyRow += `<c r="G${r}" s="${styles.textCenter}"/>`;
    emptyRow += `<c r="H${r}" s="${styles.numberCenter}"/>`;
    emptyRow += `<c r="I${r}" s="${styles.currencyRight}"/>`;
    emptyRow += `<c r="J${r}" s="${styles.currencyRight}"/>`;
    emptyRow += `<c r="K${r}" s="${styles.textCenter}"/>`;
    emptyRow += `</row>`;
    rowsXml.push(emptyRow);
  }

  const row8TailRegex = /<row r="8"[\s\S]*?<\/sheetData>/;
  xml = xml.replace(row8TailRegex, `${rowsXml.join("")}</sheetData>`);

  const colSpecs = [
    { col: "C", minCol: 3, maxCol: 3, defaultWidth: 6 },
    { col: "D", minCol: 4, maxCol: 4, defaultWidth: 35 },
    { col: "E", minCol: 5, maxCol: 5, defaultWidth: 16 },
    { col: "F", minCol: 6, maxCol: 6, defaultWidth: 10 },
    { col: "G", minCol: 7, maxCol: 7, defaultWidth: 16 },
    { col: "H", minCol: 8, maxCol: 8, defaultWidth: 12 },
    { col: "I", minCol: 9, maxCol: 9, defaultWidth: 12 },
    { col: "J", minCol: 10, maxCol: 10, defaultWidth: 14 },
    { col: "K", minCol: 11, maxCol: 11, defaultWidth: 16 },
  ];
  const colsXml = buildAutoFitColsXml(colSpecs, colLengths);
  xml = xml.replace(/<cols>[\s\S]*?<\/cols>/, colsXml);

  // Update dimension
  const lastRow = startRow + Math.max(expiredBatches.length, 10) - 1;
  xml = xml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="C3:K${lastRow}"/>`);

  // Suppress "Number stored as text" warning triangles
  xml = injectIgnoredErrors(xml, "C7:K500");

  return xml;
}

/**
 * Builds the full multi-sheet Detailed Inventory Excel Buffer using CFB template injection
 */
export function buildDetailedInventoryBuffer({
  inventoryRows = [],
  dispensingRows = [],
  requestRows = [],
  stockReturnsRows = [],
  otherProgramsRows = [],
  facilities = [],
  medicines = [],
  mode = "recent",
  selectedDate = new Date(),
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
} = {}) {
  const isRecent = mode === "recent";
  const templateBase64 = isRecent
    ? INVENTORY_DETAILED_RECENT_TEMPLATE_BASE64
    : INVENTORY_DETAILED_MONTHLY_TEMPLATE_BASE64;

  const subtitleDate = formatDetailedSubtitleDate({
    mode,
    selectedDate,
    year,
    month,
  });

  const movements = extractInventoryMovements({
    inventoryRows,
    dispensingRows,
    requestRows,
    stockReturnsRows,
    otherProgramsRows,
    facilities,
    medicines,
    mode,
    selectedDate,
    year,
    month,
  });

  const dateCtx = { mode, selectedDate, year, month };

  try {
    const cfb = getCfb();
    if (!cfb || typeof cfb.read !== "function") {
      throw new Error("CFB library not available");
    }

    const templateBytes =
      typeof Buffer !== "undefined"
        ? Buffer.from(templateBase64, "base64")
        : Uint8Array.from(atob(templateBase64), (c) => c.charCodeAt(0));

    const zip = cfb.read(templateBytes, { type: "array" });

    // Helper to find file entry in CFB
    const getEntry = (pattern) =>
      zip.FileIndex.find((f) => f.name === pattern || f.name.endsWith(`/${pattern}`));

    // Prepare styles and inject custom Philippine Peso currency number format and styles
    let styles = { textLeft: 11, textCenter: 12, currencyRight: 22, numberCenter: 12, isMonthly: !isRecent, headers: getHeaderStyles(!isRecent) };
    const stylesEntry = getEntry("styles.xml");
    if (stylesEntry) {
      const stylesXml = decodeXmlContent(stylesEntry.content);
      const res = prepareStyles(stylesXml);
      styles = res.styles;
      stylesEntry.content = new TextEncoder().encode(res.xml);
      stylesEntry.size = stylesEntry.content.length;
    }

    // Update Sheet 1 (inventory)
    const s1Entry = getEntry("sheet1.xml");
    if (s1Entry) {
      const s1Xml = decodeXmlContent(s1Entry.content);
      const updatedS1Xml = buildSheet1Xml(s1Xml, movements, subtitleDate, styles);
      s1Entry.content = new TextEncoder().encode(updatedS1Xml);
      s1Entry.size = s1Entry.content.length;
    }

    // Update Sheet 2 (stock-return)
    const s2Entry = getEntry("sheet2.xml");
    if (s2Entry) {
      const s2Xml = decodeXmlContent(s2Entry.content);
      const updatedS2Xml = buildSheet2Xml(
        s2Xml,
        stockReturnsRows,
        subtitleDate,
        facilities,
        styles,
        dateCtx,
        inventoryRows,
        medicines
      );
      s2Entry.content = new TextEncoder().encode(updatedS2Xml);
      s2Entry.size = s2Entry.content.length;
    }

    // Update Sheet 3 (additional-deliveries-summation)
    const s3Entry = getEntry("sheet3.xml");
    if (s3Entry) {
      const s3Xml = decodeXmlContent(s3Entry.content);
      const updatedS3Xml = buildSheet3Xml(s3Xml, inventoryRows, subtitleDate, medicines, styles, dateCtx);
      s3Entry.content = new TextEncoder().encode(updatedS3Xml);
      s3Entry.size = s3Entry.content.length;
    }

    // Update Sheet 4 (other-program)
    const s4Entry = getEntry("sheet4.xml");
    if (s4Entry) {
      const s4Xml = decodeXmlContent(s4Entry.content);
      const updatedS4Xml = buildSheet4Xml(
        s4Xml,
        otherProgramsRows,
        subtitleDate,
        medicines,
        styles,
        dateCtx,
        inventoryRows
      );
      s4Entry.content = new TextEncoder().encode(updatedS4Xml);
      s4Entry.size = s4Entry.content.length;
    }

    // Update Sheet 5 (expired-stock)
    const s5Entry = getEntry("sheet5.xml");
    if (s5Entry) {
      const s5Xml = decodeXmlContent(s5Entry.content);
      const updatedS5Xml = buildSheet5Xml(s5Xml, inventoryRows, subtitleDate, medicines, styles, dateCtx);
      s5Entry.content = new TextEncoder().encode(updatedS5Xml);
      s5Entry.size = s5Entry.content.length;
    }

    return cfb.write(zip, { fileType: "zip", type: "array" });
  } catch (err) {
    console.warn("CFB injection failed for detailed inventory template, falling back to XLSX builder:", err);
    const wb = buildDetailedInventoryWorkbookFallback({
      movements,
      stockReturnsRows,
      inventoryRows,
      otherProgramsRows,
      subtitleDate,
      facilities,
      medicines,
    });
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }
}

/**
 * Fallback workbook builder using SheetJS aoa_to_sheet
 */
export function buildDetailedInventoryWorkbookFallback({
  movements = [],
  stockReturnsRows = [],
  inventoryRows = [],
  otherProgramsRows = [],
  subtitleDate = "",
  facilities = [],
  medicines = [],
} = {}) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: inventory
  const s1Rows = [
    ["", "VICENTE MENDIOLA FOR HEALTH"],
    ["", "Inventory Logs Record"],
    ["", subtitleDate],
    [],
    ["No.", "Date", "Item Description", "Brand", "Batch/Lot No.", "Expiration Date", "Unit Cost", "Total Cost", "Stock In", "Stock Out", "Description"],
  ];
  movements.forEach((m, idx) => {
    s1Rows.push([
      idx + 1,
      m.date || "-",
      m.itemDescription,
      m.brand,
      m.batchNo,
      m.expirationDate,
      formatDetailedCurrency(m.unitCost),
      formatDetailedCurrency(m.totalCost),
      m.stockIn,
      m.stockOut,
      m.description,
    ]);
  });
  const ws1 = XLSX.utils.aoa_to_sheet(s1Rows);
  XLSX.utils.book_append_sheet(wb, ws1, "inventory");

  const medicinesMap = new Map();
  (medicines || []).forEach((m) => medicinesMap.set(m.id, m));

  // Sheet 2: stock-return
  const facilityMap = new Map();
  (facilities || []).forEach((f) => facilityMap.set(f.id, f.facility_name || f.name));
  const s2Rows = [
    ["", "VICENTE MENDIOLA FOR HEALTH"],
    ["", "Additional Deliviries/Returns"],
    ["", subtitleDate],
    [],
    ["No.", "Date", "Item Description", "Brand", "Unit", "Batch/Lot No.", "Expiration Date", "Returning Facility", "Unit Cost", "Total Cost", "Quantity", "Description"],
  ];
  const sortedReturns = [...(stockReturnsRows || [])].sort((a, b) => {
    const dateA = a.confirmed_at || a.return_date || a.date || a.created_at || "";
    const dateB = b.confirmed_at || b.return_date || b.date || b.created_at || "";
    const timeA = new Date(dateA).getTime() || 0;
    const timeB = new Date(dateB).getTime() || 0;
    return timeB - timeA;
  });
  sortedReturns.forEach((ret, idx) => {
    const details = resolveMedicineBatchDetails({ item: ret, inventoryRows, medicinesMap });
    const qty = Number(ret.quantity) || 0;
    const unitCost = details.unitCost;
    const retDate = ret.confirmed_at || ret.return_date || ret.date || ret.created_at;
    s2Rows.push([
      idx + 1,
      retDate ? toDateKey(retDate) : "-",
      details.itemDescription,
      details.brand,
      details.unit,
      details.batchNo,
      details.expirationDate,
      facilityMap.get(ret.facility_id) || ret.facility_name || "Barangay Health Center",
      formatDetailedCurrency(unitCost),
      formatDetailedCurrency(qty * unitCost),
      qty,
      ret.reason || ret.remarks || "Stock Return",
    ]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(s2Rows);
  XLSX.utils.book_append_sheet(wb, ws2, "stock-return");

  // Sheet 3: additional-deliveries-summation
  const s3Rows = [
    ["VICENTE MENDIOLA FOR HEALTH"],
    ["Summation (Beginning Balance + Additional Deliveries)"],
    [subtitleDate],
    [],
    ["No.", "PO NO.", "Date", "Item Description", "Brand", "Unit", "Batch/Lot No.", "Expiration Date", "Quantity", "Unit Cost", "Total Cost"],
  ];
  const sortedInventory = [...(inventoryRows || [])].sort((a, b) => {
    const dateA = a.date_received || a.created_at || "";
    const dateB = b.date_received || b.created_at || "";
    const timeA = new Date(dateA).getTime() || 0;
    const timeB = new Date(dateB).getTime() || 0;
    return timeB - timeA;
  });
  sortedInventory.forEach((inv, idx) => {
    const details = resolveMedicineBatchDetails({ item: inv, inventoryRows, medicinesMap });
    const qty = Number(inv.quantity) || 0;
    const unitCost = details.unitCost;
    s3Rows.push([
      idx + 1,
      inv.po_number || "BEG-BAL",
      inv.date_received ? toDateKey(inv.date_received) : "-",
      details.itemDescription,
      details.brand,
      details.unit,
      details.batchNo,
      details.expirationDate,
      qty,
      formatDetailedCurrency(unitCost),
      formatDetailedCurrency(qty * unitCost),
    ]);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(s3Rows);
  XLSX.utils.book_append_sheet(wb, ws3, "additional-deliveries-summation");

  // Sheet 4: other-program
  const s4Rows = [
    ["VICENTE MENDIOLA FOR HEALTH"],
    ["Transferred to Other Program"],
    [subtitleDate],
    [],
    ["No.", "Program Name", "Program Schedule", "Item Description", "Brand", "Unit", "Batch/Lot No.", "Expiration Date", "Quantity", "Unit Cost", "Total Cost"],
  ];
  const sortedPrograms = [...(otherProgramsRows || [])].sort((a, b) => {
    const dateA = a.program_date || a.distribution_date || a.completed_at || a.date || a.created_at || "";
    const dateB = b.program_date || b.distribution_date || b.completed_at || b.date || b.created_at || "";
    const timeA = new Date(dateA).getTime() || 0;
    const timeB = new Date(dateB).getTime() || 0;
    return timeB - timeA;
  });
  sortedPrograms.forEach((prog) => {
    if (String(prog.status || "").toUpperCase() === "CANCELLED") return;
    let items = prog.medicines;
    if (!Array.isArray(items) && prog.items) items = prog.items;
    if (!Array.isArray(items) && prog.data_json) {
      try {
        const parsed = typeof prog.data_json === "string" ? JSON.parse(prog.data_json) : prog.data_json;
        items = parsed?.medicines || parsed?.items || [];
      } catch {
        items = [];
      }
    }
    if (!Array.isArray(items)) items = [];

    items.forEach((item, itemIdx) => {
      const details = resolveMedicineBatchDetails({ item, inventoryRows, medicinesMap });
      const qty = Number(item.quantity_used ?? item.quantity) || 0;
      const unitCost = details.unitCost;
      const progDate =
        prog.program_date ||
        prog.distribution_date ||
        prog.completed_at ||
        prog.date ||
        prog.created_at ||
        prog.updated_at;
      s4Rows.push([
        itemIdx + 1,
        prog.program_name || "-",
        progDate ? toDateKey(progDate) : "-",
        details.itemDescription,
        details.brand,
        details.unit,
        details.batchNo,
        details.expirationDate,
        qty,
        formatDetailedCurrency(unitCost),
        formatDetailedCurrency(qty * unitCost),
      ]);
    });
  });
  const ws4 = XLSX.utils.aoa_to_sheet(s4Rows);
  XLSX.utils.book_append_sheet(wb, ws4, "other-program");

  // Sheet 5: expired-stock
  const s5Rows = [
    ["VICENTE MENDIOLA FOR HEALTH"],
    ["Expired Stocks"],
    [subtitleDate],
    [],
    ["No.", "Item Description", "Brand", "Unit", "Batch/Lot No.", "Quantity", "Unit Cost", "Total Cost", "Date Expired"],
  ];
  const now = new Date();
  let expIdx = 1;
  const expiredItems = (inventoryRows || []).filter((inv) => {
    return String(inv.status || "").toUpperCase() === "EXPIRED" || (inv.expiration_date && new Date(inv.expiration_date) < now);
  }).sort((a, b) => {
    const expA = a.expiration_date ? new Date(a.expiration_date).getTime() || 0 : 0;
    const expB = b.expiration_date ? new Date(b.expiration_date).getTime() || 0 : 0;
    return expB - expA;
  });
  expiredItems.forEach((inv) => {
    const details = resolveMedicineBatchDetails({ item: inv, inventoryRows, medicinesMap });
    const qty = Number(inv.quantity) || 0;
    const unitCost = details.unitCost;
    s5Rows.push([
      expIdx++,
      details.itemDescription,
      details.brand,
      details.unit,
      details.batchNo,
      qty,
      formatDetailedCurrency(unitCost),
      formatDetailedCurrency(qty * unitCost),
      details.expirationDate,
    ]);
  });
  const ws5 = XLSX.utils.aoa_to_sheet(s5Rows);
  XLSX.utils.book_append_sheet(wb, ws5, "expired-stock");

  return wb;
}

/**
 * Triggers export download for Detailed Inventory Report (5 Sheets)
 */
export async function exportDetailedInventoryExcel({
  inventoryRows = [],
  dispensingRows = [],
  requestRows = [],
  stockReturnsRows = [],
  otherProgramsRows = [],
  facilities = [],
  medicines = [],
  mode = "recent",
  selectedDate = new Date(),
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
} = {}) {
  const buffer = buildDetailedInventoryBuffer({
    inventoryRows,
    dispensingRows,
    requestRows,
    stockReturnsRows,
    otherProgramsRows,
    facilities,
    medicines,
    mode,
    selectedDate,
    year,
    month,
  });

  const filename = getDetailedInventoryExportFilename({
    mode,
    selectedDate,
    year,
    month,
  });

  return downloadExportFile({
    filename,
    buffer,
    format: "xlsx",
  });
}
