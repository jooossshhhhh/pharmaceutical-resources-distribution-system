import * as XLSX from "xlsx";
import * as CFB from "cfb";
import { downloadExportFile } from "../../frontend/services/downloadManager.js";
import {
  DISPENSING_HISTORY_TEMPLATE_BASE64,
  DISPENSING_HISTORY_DAILY_TEMPLATE_BASE64,
  DISPENSING_HISTORY_WEEKLY_TEMPLATE_BASE64,
  DISPENSING_HISTORY_CUSTOM_TEMPLATE_BASE64,
  DISPENSING_HISTORY_ALL_TEMPLATE_BASE64,
  DISPENSING_HISTORY_MONTHLY_TEMPLATE_BASE64,
} from "../../frontend/assets/templates-excel/dispensingHistoryTemplateBase64.js";
import { formatPatientName, formatPatientDateOfBirth } from "./patientUtils.js";
import { formatItemDescription } from "./reportUtils.js";
import {
  formatDispensingDate,
  formatDispensingDateTime,
  formatTransactionNumber,
} from "./dispensingUtils.js";

/**
 * Formats time string (e.g. "11:32 AM")
 */
export function formatDispensingTime(value) {
  if (!value) return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
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
 * Formats Month, Year title banner (e.g. "OCTOBER, 2026")
 */
export function formatDispensingMonthYear(year, month) {
  const y = Number(year) || new Date().getFullYear();
  const m = Number(month) || new Date().getMonth() + 1;
  const targetDate = new Date(y, m - 1, 1);
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(targetDate).toUpperCase();
  return `${monthName}, ${y}`;
}

/**
 * Formats a date value into "Month Day, Year" (e.g. "October 27, 2026")
 * Handles ISO strings, timestamps, and Date objects safely without timezone shift.
 */
export function formatDateLong(dateInput) {
  if (!dateInput) return "";
  let d;
  if (typeof dateInput === "string") {
    const m = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    } else {
      d = new Date(dateInput);
    }
  } else if (dateInput instanceof Date) {
    d = dateInput;
  } else {
    d = new Date(dateInput);
  }
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

/**
 * Formats the Date header banner (Row 3, Merged F3:H3) depending on active filter:
 * - TODAY: "October 27, 2026"
 * - THIS_WEEK: "October 20, 2026 to October 27, 2026"
 * - CUSTOM: "October 1, 2026 to October 27, 2026"
 * - ALL: "As of October 27, 2026"
 * - THIS_MONTH / default: "OCTOBER, 2026"
 */
export function formatDispensingHeaderDate({
  dateFilter = "THIS_MONTH",
  year,
  month,
  startDate,
  endDate,
  now = new Date(),
} = {}) {
  const normFilter = String(dateFilter || "").toUpperCase();

  if (normFilter === "TODAY") {
    return formatDateLong(startDate || now);
  }

  if (normFilter === "THIS_WEEK") {
    const end = endDate ? (typeof endDate === "string" ? new Date(endDate + "T12:00:00") : new Date(endDate)) : new Date(now);
    const start = startDate
      ? (typeof startDate === "string" ? new Date(startDate + "T12:00:00") : new Date(startDate))
      : new Date(end.getFullYear(), end.getMonth(), end.getDate() - 7);
    return `${formatDateLong(start)} to ${formatDateLong(end)}`;
  }

  if (normFilter === "CUSTOM") {
    const startStr = startDate ? formatDateLong(startDate) : "";
    const endStr = endDate ? formatDateLong(endDate) : "";
    if (startStr && endStr) {
      return `${startStr} to ${endStr}`;
    }
    if (startStr) {
      return `${startStr} to ${formatDateLong(now)}`;
    }
    if (endStr) {
      return `As of ${endStr}`;
    }
    return formatDateLong(now);
  }

  if (normFilter === "ALL") {
    return `As of ${formatDateLong(now)}`;
  }

  return formatDispensingMonthYear(year, month);
}

/**
 * Selects the official Excel base64 template matching the active UI date filter
 */
export function selectDispensingTemplateBase64(dateFilter = "THIS_MONTH") {
  const norm = String(dateFilter || "").toUpperCase();
  switch (norm) {
    case "TODAY":
      return DISPENSING_HISTORY_DAILY_TEMPLATE_BASE64 || DISPENSING_HISTORY_TEMPLATE_BASE64;
    case "THIS_WEEK":
      return DISPENSING_HISTORY_WEEKLY_TEMPLATE_BASE64 || DISPENSING_HISTORY_TEMPLATE_BASE64;
    case "CUSTOM":
      return DISPENSING_HISTORY_CUSTOM_TEMPLATE_BASE64 || DISPENSING_HISTORY_TEMPLATE_BASE64;
    case "ALL":
      return DISPENSING_HISTORY_ALL_TEMPLATE_BASE64 || DISPENSING_HISTORY_TEMPLATE_BASE64;
    case "THIS_MONTH":
    default:
      return DISPENSING_HISTORY_MONTHLY_TEMPLATE_BASE64 || DISPENSING_HISTORY_TEMPLATE_BASE64;
  }
}

/**
 * Generates a descriptive filename based on active date filter and range
 */
export function getDispensingExportFilename({
  dateFilter = "THIS_MONTH",
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  startDate,
  endDate,
  now = new Date(),
} = {}) {
  const norm = String(dateFilter || "").toUpperCase();
  const y = Number(year) || now.getFullYear();
  const m = Number(month) || now.getMonth() + 1;
  const targetDate = new Date(y, m - 1, 1);
  const monthKey = new Intl.DateTimeFormat("en-US", { month: "long" }).format(targetDate);
  const todayStr = now.toISOString().slice(0, 10);

  if (norm === "TODAY") {
    const dStr = startDate || todayStr;
    return `Dispensing_History_Daily_${dStr}.xlsx`;
  }
  if (norm === "THIS_WEEK") {
    const endStr = endDate || todayStr;
    const startObj = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const startStr = startObj.toISOString().slice(0, 10);
    return `Dispensing_History_Weekly_${startStr}_to_${endStr}.xlsx`;
  }
  if (norm === "CUSTOM") {
    const s = startDate || "start";
    const e = endDate || todayStr;
    return `Dispensing_History_Custom_${s}_to_${e}.xlsx`;
  }
  if (norm === "ALL") {
    return `Dispensing_History_All_Time_${todayStr}.xlsx`;
  }
  return `Dispensing_History_${monthKey}_${y}.xlsx`;
}

/**
 * Resolves the display status for an exported dispensing record:
 * - "Voided" if transaction or row is voided
 * - "Referred" if follow-up is referral to barangay or transaction is marked as referred
 * - "Partial" if quantity is partial, status is partial, or follow-up is scheduled (matches PRDS UI)
 * - "Completed" if all prescribed units were dispensed
 *
 * @param {Object} row - Dispensing record or row with quantity/status info
 * @returns {string} Human-readable status label
 */
export function resolveDispensingRecordStatus(row = {}) {
  // 1. Voided check (highest precedence)
  if (
    row.voided_at ||
    row.voidedAt ||
    String(row.status).toUpperCase() === "VOIDED" ||
    String(row.transaction_status).toUpperCase() === "VOIDED"
  ) {
    return "Voided";
  }

  const followUp = (
    row.follow_up_action ||
    row.followUpAction ||
    row.follow_up ||
    ""
  ).trim().toUpperCase();

  const txStatus = (
    row.transaction_status ||
    row.status ||
    ""
  ).trim().toUpperCase();

  const neededQty = Number(
    row.needed_quantity ??
    row.neededQuantity ??
    row.prescribed_needed ??
    row.prescribedNeeded ??
    0
  );
  const releasedQty = Number(row.quantity ?? row.releasedQuantity ?? 0);
  const isQtyPartial = neededQty > 0 && releasedQty < neededQty;

  // 2. Referred follow-up check
  if (
    followUp === "REFER_TO_BARANGAY" ||
    followUp === "REFER" ||
    txStatus === "REFERRED" ||
    txStatus === "PARTIAL_REFERRED" ||
    Boolean(row.hasReferred) ||
    Boolean(row.referred_facility) ||
    Boolean(row.referred_facility_id)
  ) {
    return "Referred";
  }

  // 3. Partial dispense check (matches PRDS UI: Partial for scheduled follow-ups, partial claims, or unfulfilled balance)
  if (
    txStatus === "PARTIAL" ||
    txStatus === "SCHEDULED" ||
    txStatus === "PARTIAL_SCHEDULED" ||
    txStatus === "PARTIAL_CLAIM" ||
    txStatus === "PARTIAL_READY" ||
    txStatus === "PARTIAL DISPENSE" ||
    followUp === "SCHEDULE_NEXT_WEEK" ||
    followUp === "SCHEDULE" ||
    Boolean(row.hasPendingScheduled) ||
    Boolean(row.follow_up_date) ||
    Boolean(row.followUpDate) ||
    isQtyPartial
  ) {
    return "Partial";
  }

  // 4. Completed
  return "Completed";
}

/**
 * Calculates adaptive column widths for columns C through L (indices 3 to 12).
 * When text doesn't fit in a specific cell, extends the column width with comfortable padding.
 *
 * @param {Array} patientGroups - Patient groups returned by groupDispensingByPatient
 * @returns {Object} Column widths map keyed by 1-based column index (3 to 12)
 */
export function calculateDispensingColumnWidths(patientGroups = [], { isDaily = false, is12Col = false } = {}) {
  if (is12Col) {
    const baseWidths = {
      3: 16,    // Col C: Date&Time / Time / Patient Code
      4: 30,    // Col D: Medicine Information / Dispensing ID
      5: 14,    // Col E: Brand / Name
      6: 18,    // Col F: Batch/Lot No.
      7: 15,    // Col G: Prescribed Qty / Sex
      8: 15,    // Col H: Released Qty
      9: 15,    // Col I: Balance Qty / DOB
      10: 10,   // Col J: Unit
      11: 18,   // Col K: Prescribed By / Facility
      12: 18,   // Col L: Dispensed By
      13: 22,   // Col M: Dispensing Facility / Contact Number
      14: 15,   // Col N: Status
    };

    const maxLens = {
      3: 12, // "Date&Time", "Patient"
      4: 20, // "Medicine Information", "Dispensing ID: ..."
      5: 8,  // "Brand", "Name: ..."
      6: 14, // "Batch/Lot No."
      7: 14, // "Prescribed Qty", "Sex: ..."
      8: 12, // "Released Qty"
      9: 12, // "Balance Qty", "DOB: ..."
      10: 5, // "Unit"
      11: 14,// "Prescribed By", "Facility: ..."
      12: 13,// "Dispensed By"
      13: 20,// "Dispensing Facility", "Contact Number: ..."
      14: 8, // "Status"
    };

    for (const group of patientGroups) {
      const p = group.patient || {};
      const name = `Name: ${p.name || ""}`;
      const sex = `Sex: ${p.gender || ""}`;
      const fac = `Facility: ${p.facility_code || ""}`;
      const contact = `Contact Number: ${p.contact_number || ""}`;

      if (name.length > maxLens[4]) maxLens[4] = name.length;
      if (sex.length > maxLens[6]) maxLens[6] = sex.length;
      if (fac.length > maxLens[10]) maxLens[10] = fac.length;
      if (contact.length > maxLens[12]) maxLens[12] = contact.length;

      for (const item of group.items || []) {
        const timeOrDate = isDaily ? String(item.timeFormatted || "") : String(item.dateTimeFormatted || "");
        const desc = String(item.medicineInfo || "");
        const brand = String(item.brand || "");
        const batch = String(item.batchLotNo || "");
        const presQty = String(item.prescribedQuantity ?? "");
        const relQty = String(item.releasedQuantity ?? item.quantity ?? "");
        const balQty = String(item.balanceQuantity ?? "");
        const unit = String(item.unit || "");
        const pres = String(item.prescribedBy || "");
        const disp = String(item.dispensedBy || "");
        const facility = String(item.facilityName || "");
        const status = String(item.status || "");

        if (timeOrDate.length > maxLens[3]) maxLens[3] = timeOrDate.length;
        if (desc.length > maxLens[4]) maxLens[4] = desc.length;
        if (brand.length > maxLens[5]) maxLens[5] = brand.length;
        if (batch.length > maxLens[6]) maxLens[6] = batch.length;
        if (presQty.length > maxLens[7]) maxLens[7] = presQty.length;
        if (relQty.length > maxLens[8]) maxLens[8] = relQty.length;
        if (balQty.length > maxLens[9]) maxLens[9] = balQty.length;
        if (unit.length > maxLens[10]) maxLens[10] = unit.length;
        if (pres.length > maxLens[11]) maxLens[11] = pres.length;
        if (disp.length > maxLens[12]) maxLens[12] = disp.length;
        if (facility.length > maxLens[13]) maxLens[13] = facility.length;
        if (status.length > maxLens[14]) maxLens[14] = status.length;
      }
    }

    const widths = {};
    for (const col of Object.keys(baseWidths)) {
      const needed = maxLens[col] + 3.5;
      widths[col] = Math.min(85, Math.max(baseWidths[col], needed));
    }
    return widths;
  }

  // 10-column layout (indices 3 to 12)
  const baseWidths = {
    3: 15,    // Col C: Date / Patient Code
    4: 30,    // Col D: Medicine Information / Patient Name
    5: 14,    // Col E: Brand / Sex
    6: 18,    // Col F: Batch/Lot No. / DOB
    7: 15,    // Col G: Qty / Facility
    8: 15,    // Col H: Unit / Contact No
    9: 18,    // Col I: Prescribed By
    10: 18,   // Col J: Dispensed By
    11: 22,   // Col K: Dispensing Facility
    12: 18,   // Col L: Status
  };

  const maxLens = {
    3: 10, // "Date", "PRD-0000"
    4: 20, // "Medicine Information"
    5: 8,  // "Brand", "Sex: MALE"
    6: 14, // "Batch/Lot No.", "DOB: Aug 2, 2008"
    7: 5,  // "Qty"
    8: 5,  // "Unit"
    9: 14, // "Prescribed By"
    10: 13,// "Dispensed By"
    11: 20,// "Dispensing Facility"
    12: 8, // "Status"
  };

  for (const group of patientGroups) {
    const p = group.patient || {};
    const code = String(p.patient_code || "");
    const name = `Name: ${p.name || ""}`;
    const sex = `Sex: ${p.gender || ""}`;
    const dob = `DOB: ${p.date_of_birth || ""}`;
    const fac = `Facility: ${p.facility_code || ""}`;
    const contact = `Contact No: ${p.contact_number || ""}`;

    if (code.length > maxLens[3]) maxLens[3] = code.length;
    if (name.length > maxLens[4]) maxLens[4] = name.length;
    if (sex.length > maxLens[5]) maxLens[5] = sex.length;
    if (dob.length > maxLens[6]) maxLens[6] = dob.length;
    if (fac.length > maxLens[7]) maxLens[7] = fac.length;
    if (contact.length > maxLens[8]) maxLens[8] = contact.length;

    for (const item of group.items || []) {
      const date = String(item.dateFormatted || item.dispenseDate || "");
      const desc = String(item.medicineInfo || "");
      const brand = String(item.brand || "");
      const batch = String(item.batchLotNo || "");
      const qty = String(item.quantity || "");
      const unit = String(item.unit || "");
      const pres = String(item.prescribedBy || "");
      const disp = String(item.dispensedBy || "");
      const facility = String(item.facilityName || "");
      const status = String(item.status || "");

      if (!isDaily && date.length > maxLens[3]) maxLens[3] = date.length;
      if (desc.length > maxLens[4]) maxLens[4] = desc.length;
      if (brand.length > maxLens[5]) maxLens[5] = brand.length;
      if (batch.length > maxLens[6]) maxLens[6] = batch.length;
      if (qty.length > maxLens[7]) maxLens[7] = qty.length;
      if (unit.length > maxLens[8]) maxLens[8] = unit.length;
      if (pres.length > maxLens[9]) maxLens[9] = pres.length;
      if (disp.length > maxLens[10]) maxLens[10] = disp.length;
      if (facility.length > maxLens[11]) maxLens[11] = facility.length;
      if (status.length > maxLens[12]) maxLens[12] = status.length;
    }
  }

  // Calculate final widths: Math.max(baseWidth, maxLen + 3.5), capped at 85 to prevent runaway columns
  const widths = {};
  for (const col of Object.keys(baseWidths)) {
    const needed = maxLens[col] + 3.5;
    widths[col] = Math.min(85, Math.max(baseWidths[col], needed));
  }
  return widths;
}

/**
 * Builds the <cols> XML block with extended widths for sheet1.xml
 */
export function buildDispensingColsXml(colWidths, is12Col = false) {
  let cols = "<cols>";
  const maxCol = is12Col ? 14 : 12;
  for (let c = 3; c <= maxCol; c++) {
    const w = colWidths[c] || 15;
    cols += `<col min="${c}" max="${c}" width="${w}" customWidth="1"/>`;
  }
  cols += "</cols>";
  return cols;
}

/**
 * Normalizes and groups dispensing history records patient-by-patient.
 * Within each patient group, individual medicine records are sorted chronologically.
 *
 * @param {Array} historyRowsOrTransactions - Array of raw dispensing rows or grouped transaction objects
 * @param {Object} options - Sorting and filter options
 * @returns {Array} List of patient groups with chronological items
 */
export function groupDispensingByPatient(historyRowsOrTransactions = [], { sortChronological = "asc" } = {}) {
  const rows = [];

  // Flatten if transactions with .rows was passed in
  for (const item of historyRowsOrTransactions || []) {
    if (Array.isArray(item?.rows) && item.rows.length > 0) {
      item.rows.forEach((r) => {
        rows.push({
          ...r,
          patient: r.patient || item.patient,
          dispenser: r.dispenser || item.dispenser,
          dispensing_facility: r.dispensing_facility || item.dispensingFacility,
          dispense_date: r.dispense_date || item.dispenseDate,
          dispensing_transaction_id: r.dispensing_transaction_id || item.transactionId || item.key,
          voided_at: r.voided_at || item.voidedAt,
          void_reason: r.void_reason || item.voidReason,
          transaction_status: item.status,
          hasPendingScheduled: item.hasPendingScheduled,
          hasReferred: item.hasReferred,
          isCompleted: item.isCompleted,
          is_follow_up: r.is_follow_up ?? item.isFollowUp ?? false,
          isFollowUp: r.is_follow_up ?? item.isFollowUp ?? false,
          prescribed_needed: r.prescribed_needed ?? item.prescribedNeeded,
          previously_claimed: r.previously_claimed ?? item.previouslyClaimed,
          needed_this_visit: r.needed_this_visit ?? item.neededThisVisit,
          released_this_visit: r.released_this_visit ?? item.releasedThisVisit,
          balance_remaining: r.balance_remaining ?? item.balanceRemaining,
          initial_transaction_id: r.initial_transaction_id ?? item.initialTransactionId,
        });
      });
    } else if (item) {
      rows.push(item);
    }
  }

  const patientMap = new Map();

  rows.forEach((row) => {
    const patientObj = row.patient || {};
    const patientId =
      patientObj.id ||
      row.patient_id ||
      patientObj.patient_code ||
      `${patientObj.last_name || ""}_${patientObj.first_name || ""}`.trim() ||
      "UNKNOWN_PATIENT";

    let patientName = "";
    try {
      patientName = formatPatientName(patientObj);
    } catch {
      patientName = [patientObj.first_name, patientObj.last_name].filter(Boolean).join(" ");
    }
    if (!patientName || patientName === "—") {
      patientName = "Unnamed Patient";
    }

    let dobStr = "—";
    try {
      const dob = formatPatientDateOfBirth(patientObj.date_of_birth);
      dobStr = dob && dob !== "—" ? dob : (patientObj.date_of_birth || "—");
    } catch {
      dobStr = patientObj.date_of_birth || "—";
    }

    if (!patientMap.has(patientId)) {
      patientMap.set(patientId, {
        patient: {
          id: patientId,
          patient_code: patientObj.patient_code || "—",
          dispensing_id: "—",
          name: patientName,
          gender: patientObj.gender ? String(patientObj.gender).toUpperCase() : "—",
          date_of_birth: dobStr,
          facility_code:
            patientObj.facility?.facility_code ||
            patientObj.facility?.facility_name ||
            row.dispensing_facility?.facility_code ||
            "—",
          contact_number: patientObj.contact_number || "—",
        },
        items: [],
      });
    }

    const group = patientMap.get(patientId);

    const generic = (row.medicine?.generic_name || row.generic_name || "").trim();
    const dosage = (row.medicine?.dosage || row.dosage || "").trim();
    const brand = (
      row.batch?.brand_name ||
      row.inventory?.brand_name ||
      row.medicine?.brand_name ||
      row.brand_name ||
      "—"
    ).trim();

    const baseDesc = formatItemDescription(generic, dosage) || "Medicine";
    const desc =
      brand && brand !== "—" && !baseDesc.toLowerCase().includes(brand.toLowerCase())
        ? `${baseDesc} (${brand})`
        : baseDesc;
    const batchNo = (row.batch?.batch_number || row.batch_number || "—").trim();
    const qty = Number(row.quantity) || 0;
    const unit = (row.medicine?.unit_of_measure || row.unit_of_measure || "UNIT").trim().toUpperCase();

    let dispenserName = "—";
    if (row.dispenser) {
      dispenserName = [row.dispenser.first_name, row.dispenser.last_name].filter(Boolean).join(" ").trim();
    }
    if (!dispenserName || dispenserName === "—") {
      dispenserName = row.manual_dispensed_by || "—";
    }

    const facilityName =
      row.dispensing_facility?.facility_name ||
      row.dispensing_facility?.facility_code ||
      "VMCH Pharmacy";

    const dateVal = row.dispense_date || row.created_at || "";
    let dateFormatted = "";
    let timeFormatted = "";
    let dateTimeFormatted = "";
    try {
      dateFormatted = formatDispensingDate(dateVal);
    } catch {
      dateFormatted = String(dateVal || "—");
    }
    try {
      timeFormatted = formatDispensingTime(dateVal);
    } catch {
      timeFormatted = "—";
    }
    try {
      dateTimeFormatted = formatDispensingDateTime(dateVal);
    } catch {
      dateTimeFormatted = String(dateVal || "—");
    }

    const rawTxId = row.dispensing_transaction_id || row.transaction_id || row.key || "";
    const txIdFormatted = rawTxId ? formatTransactionNumber(rawTxId) : "—";
    if (rawTxId) {
      if (!group.txIds) group.txIds = new Set();
      group.txIds.add(txIdFormatted);
    }

    group.items.push({
      rawRow: row,
      dispenseDate: dateVal,
      dateFormatted: dateFormatted || "—",
      timeFormatted: timeFormatted || "—",
      dateTimeFormatted: dateTimeFormatted || "—",
      transactionId: txIdFormatted || "—",
      dispensingId: txIdFormatted || "—",
      medicineInfo: desc,
      brand: brand || "—",
      batchLotNo: batchNo || "—",
      quantity: qty,
      unit: unit || "UNIT",
      prescribedBy: (row.prescribed_by || "—").trim(),
      dispensedBy: dispenserName || "—",
      facilityName: facilityName || "—",
      status: resolveDispensingRecordStatus(row),
    });
  });

  const patientGroups = Array.from(patientMap.values());

  // 1. Sort medicines inside each patient group chronologically and resolve multi-step prescription cycles
  patientGroups.forEach((group) => {
    // Sort oldest first initially to process prescription cycles and remaining balance accurately
    group.items.sort((a, b) => {
      const timeA = new Date(a.dispenseDate || 0).getTime();
      const timeB = new Date(b.dispenseDate || 0).getTime();
      return timeA - timeB;
    });

    const activeCycles = new Map();

    for (const item of group.items) {
      const raw = item.rawRow || {};
      const medKey = String(raw.medicine_id || raw.medicine?.id || item.medicineInfo || "");
      const isVoided = Boolean(
        raw.voided_at ||
        raw.voidedAt ||
        String(raw.status).toUpperCase() === "VOIDED" ||
        String(raw.transaction_status).toUpperCase() === "VOIDED"
      );

      const followUp = (
        raw.follow_up_action ||
        raw.followUpAction ||
        ""
      ).trim().toUpperCase();

      const hasScheduled =
        followUp === "SCHEDULE_NEXT_WEEK" ||
        followUp === "SCHEDULE" ||
        String(raw.transaction_status).toUpperCase() === "SCHEDULED" ||
        Boolean(raw.hasPendingScheduled) ||
        Boolean(raw.follow_up_date);

      const hasReferred =
        followUp === "REFER_TO_BARANGAY" ||
        followUp === "REFER" ||
        String(raw.transaction_status).toUpperCase() === "REFERRED" ||
        Boolean(raw.hasReferred) ||
        Boolean(raw.referred_facility);

      const rawNeeded = Number(
        raw.needed_quantity ??
        raw.neededQuantity ??
        raw.prescribed_needed ??
        raw.prescribedNeeded ??
        0
      );
      const releasedQty = Number(item.quantity ?? 0);
      const neededQty = rawNeeded > 0 ? rawNeeded : releasedQty;

      item.releasedQuantity = releasedQty;

      const isExplicitFollowUp = Boolean(
        raw.is_follow_up === true ||
        raw.isFollowUp === true ||
        Number(raw.previously_claimed || raw.previouslyClaimed || 0) > 0
      );

      const isExplicitInitial = Boolean(
        (raw.is_follow_up === false || raw.isFollowUp === false) &&
        Number(raw.previously_claimed || raw.previouslyClaimed || 0) === 0
      );

      const cycle = activeCycles.get(medKey);
      const isCycleFollowUp = !isExplicitInitial && (Boolean(cycle && cycle.remaining > 0) || isExplicitFollowUp);

      // Option 1: On follow-up claims belonging to an active prescription cycle,
      // display " — " so that the prescribed quantity is only counted once on the initial release.
      item.prescribedQuantity = isCycleFollowUp ? "—" : neededQty;

      if (isVoided) {
        item.status = "Voided";
        item.balanceQuantity = raw.balance_remaining != null ? Number(raw.balance_remaining) : neededQty;
      } else if (isCycleFollowUp) {
        const prevRemaining = cycle
          ? cycle.remaining
          : (raw.needed_this_visit != null
              ? Number(raw.needed_this_visit)
              : (raw.balance_remaining != null
                  ? Number(raw.balance_remaining) + releasedQty
                  : neededQty));

        const newRemaining = raw.balance_remaining != null
          ? Number(raw.balance_remaining)
          : Math.max(0, prevRemaining - releasedQty);

        item.balanceQuantity = newRemaining;

        if (hasReferred) {
          item.status = "Referred";
          activeCycles.set(medKey, { remaining: newRemaining });
        } else if (newRemaining === 0) {
          item.status = "Completed";
          activeCycles.delete(medKey);
        } else {
          item.status = "Partial";
          activeCycles.set(medKey, { remaining: newRemaining });
        }
      } else {
        const newRemaining = raw.balance_remaining != null
          ? Number(raw.balance_remaining)
          : Math.max(0, neededQty - releasedQty);

        item.balanceQuantity = newRemaining;

        if (hasReferred) {
          item.status = "Referred";
          activeCycles.set(medKey, { remaining: newRemaining });
        } else if (newRemaining === 0 || String(raw.transaction_status).toUpperCase() === "COMPLETED" || Boolean(raw.isCompleted)) {
          item.status = "Completed";
          activeCycles.delete(medKey);
        } else {
          item.status = "Partial";
          activeCycles.set(medKey, { remaining: newRemaining });
        }
      }
    }

    const formattedIds = group.txIds && group.txIds.size > 0
      ? Array.from(group.txIds).join(", ")
      : (group.items[0]?.dispensingId || "—");
    group.patient.dispensing_id = formattedIds || "—";
    delete group.txIds;

    if (sortChronological === "desc") {
      group.items.reverse();
    }
  });

  // 2. Sort patient groups alphabetically by patient name
  patientGroups.sort((a, b) => (a.patient.name || "").localeCompare(b.patient.name || ""));

  return patientGroups;
}

/**
 * Builds the Monthly Dispensing History XLSX binary buffer directly inside the
 * official template package (dispensing-history-month.xlsx).
 * Injects dynamic patient blocks preserving exact fonts, borders, fills, and column widths.
 */
export function buildMonthlyDispensingExcelBuffer({
  historyRows = [],
  transactions = [],
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  facilityName = "VICENTE MENDIOLA CENTER FOR HEALTH",
  sortChronological = "asc",
  dateFilter = "THIS_MONTH",
  startDate = null,
  endDate = null,
} = {}) {
  const cfb = getCfb();

  const sourceData = (transactions && transactions.length > 0) ? transactions : historyRows;
  const templateBase64 = selectDispensingTemplateBase64(dateFilter);
  const isDaily = String(dateFilter || "").toUpperCase() === "TODAY";

  if (!cfb || !templateBase64) {
    const wb = buildMonthlyDispensingExcelWorkbook({
      historyRows,
      transactions,
      year,
      month,
      facilityName,
      sortChronological,
      dateFilter,
      startDate,
      endDate,
    });
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }

  try {
    const zip = cfb.read(templateBase64, { type: "base64" });
    const s1Entry =
      (typeof cfb.find === "function" ? cfb.find(zip, "sheet1.xml") || cfb.find(zip, "/xl/worksheets/sheet1.xml") : null) ||
      zip.FileIndex?.find((f) => f?.name && (f.name === "sheet1.xml" || f.name.endsWith("/sheet1.xml")));

    if (!s1Entry) {
      const wb = buildMonthlyDispensingExcelWorkbook({
        historyRows,
        transactions,
        year,
        month,
        facilityName,
        sortChronological,
        dateFilter,
        startDate,
        endDate,
      });
      return XLSX.write(wb, { bookType: "xlsx", type: "array" });
    }

    let xml = decodeXmlContent(s1Entry.content);

    // Detect if this template is the updated 12-column template layout (Cols C to N)
    const is12Col =
      xml.includes('spans="3:14"') ||
      xml.includes('r="N6"') ||
      xml.includes('r="M5"');

    // 1. Update Date Header in Row 3 (Merged F3:H3)
    const headerDateText = formatDispensingHeaderDate({
      dateFilter,
      year,
      month,
      startDate,
      endDate,
    });
    // Dynamically preserve cell F3 style from the template (s="11" no fill, center aligned)
    const f3StyleMatch = xml.match(/<c r="F3"[^>]*s="(\d+)"/);
    const f3Style = f3StyleMatch ? f3StyleMatch[1] : "11";
    xml = xml.replace(
      /<c r="F3"[^>]*>[\s\S]*?<\/c>/,
      `<c r="F3" s="${f3Style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(headerDateText)}</t></is></c>`
    );

    // Dynamic style extraction from existing row 5 and row 6
    const row5Match = xml.match(/<row r="5"[^>]*>([\s\S]*?)<\/row>/);
    const row5Xml = row5Match ? row5Match[1] : "";
    const row6Match = xml.match(/<row r="6"[^>]*>([\s\S]*?)<\/row>/);
    const row6Xml = row6Match ? row6Match[1] : "";

    const c5Style = row5Xml.match(/<c r="C5"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "2" : "8");
    const d5Style = row5Xml.match(/<c r="D5"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "2" : "9");
    const e5Style = row5Xml.match(/<c r="E5"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "6" : "8");
    const f5Style = row5Xml.match(/<c r="F5"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "7" : "9");
    const g5Style = row5Xml.match(/<c r="G5"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "6" : "9");
    const h5Style = row5Xml.match(/<c r="H5"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "7" : "9");
    const i5Style = row5Xml.match(/<c r="I5"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "6" : "8");
    const j5Style = row5Xml.match(/<c r="J5"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "7" : "3");
    const k5Style = row5Xml.match(/<c r="K5"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "6" : "3");
    const l5Style = row5Xml.match(/<c r="L5"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "7" : "2");
    const m5Style = row5Xml.match(/<c r="M5"[^>]*s="(\d+)"/)?.[1] || "8";
    const n5Style = row5Xml.match(/<c r="N5"[^>]*s="(\d+)"/)?.[1] || "7";

    const c6Style = row6Xml.match(/<c r="C6"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "3" : "4");
    const d6Style = row6Xml.match(/<c r="D6"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "3" : "5");
    const e6Style = row6Xml.match(/<c r="E6"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "3" : "4");
    const f6Style = row6Xml.match(/<c r="F6"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "3" : "5");
    const g6Style = row6Xml.match(/<c r="G6"[^>]*s="(\d+)"/)?.[1] || "4";
    const h6Style = row6Xml.match(/<c r="H6"[^>]*s="(\d+)"/)?.[1] || "4";
    const i6Style = row6Xml.match(/<c r="I6"[^>]*s="(\d+)"/)?.[1] || "4";
    const j6Style = row6Xml.match(/<c r="J6"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "3" : "4");
    const k6Style = row6Xml.match(/<c r="K6"[^>]*s="(\d+)"/)?.[1] || (is12Col ? "4" : "7");
    const l6Style = row6Xml.match(/<c r="L6"[^>]*s="(\d+)"/)?.[1] || "4";
    const m6Style = row6Xml.match(/<c r="M6"[^>]*s="(\d+)"/)?.[1] || "4";
    const n6Style = row6Xml.match(/<c r="N6"[^>]*s="(\d+)"/)?.[1] || "3";

    // Row 7 data cell style
    const dataStyleMatch = xml.match(/<row r="7"[^>]*>[\s\S]*?<c r="[A-Z]7"[^>]*s="(\d+)"/);
    const dataStyle = dataStyleMatch ? dataStyleMatch[1] : (is12Col ? "5" : "6");

    // 2. Group records patient by patient
    const patientGroups = groupDispensingByPatient(sourceData, { sortChronological });

    let rowsXml = "";
    let currentRow = 5;
    const patientHeaderRows = [];

    if (patientGroups.length === 0) {
      // Empty state: output 1 blank patient section matching template layout
      patientHeaderRows.push(currentRow);
      if (is12Col) {
        rowsXml += `<row r="${currentRow}" spans="3:14" x14ac:dyDescent="0.25">`;
        rowsXml += `<c r="C${currentRow}" s="${c5Style}" t="inlineStr"><is><t>Patient</t></is></c>`;
        rowsXml += `<c r="D${currentRow}" s="${d5Style}" t="inlineStr"><is><t>Name: </t></is></c>`;
        rowsXml += `<c r="E${currentRow}" s="${e5Style}"/>`;
        rowsXml += `<c r="F${currentRow}" s="${f5Style}" t="inlineStr"><is><t>Sex:</t></is></c>`;
        rowsXml += `<c r="G${currentRow}" s="${g5Style}" t="inlineStr"><is><t>DOB:</t></is></c>`;
        rowsXml += `<c r="H${currentRow}" s="${h5Style}"/>`;
        rowsXml += `<c r="I${currentRow}" s="${i5Style}"/>`;
        rowsXml += `<c r="J${currentRow}" s="${j5Style}" t="inlineStr"><is><t>Facility: </t></is></c>`;
        rowsXml += `<c r="K${currentRow}" s="${k5Style}"/>`;
        rowsXml += `<c r="L${currentRow}" s="${l5Style}" t="inlineStr"><is><t>Contact Number:</t></is></c>`;
        rowsXml += `<c r="M${currentRow}" s="${m5Style}"/>`;
        rowsXml += `<c r="N${currentRow}" s="${n5Style}"/>`;
        rowsXml += `</row>`;
        currentRow++;

        const timeOrDateLabel = isDaily ? "Time" : "Date&amp;Time";
        rowsXml += `<row r="${currentRow}" spans="3:14" ht="27.95" customHeight="1" x14ac:dyDescent="0.25">`;
        rowsXml += `<c r="C${currentRow}" s="${c6Style}" t="inlineStr"><is><t>${timeOrDateLabel}</t></is></c>`;
        rowsXml += `<c r="D${currentRow}" s="${d6Style}" t="inlineStr"><is><t>Medicine Information</t></is></c>`;
        rowsXml += `<c r="E${currentRow}" s="${e6Style}" t="inlineStr"><is><t>Brand</t></is></c>`;
        rowsXml += `<c r="F${currentRow}" s="${f6Style}" t="inlineStr"><is><t>Batch/Lot No.</t></is></c>`;
        rowsXml += `<c r="G${currentRow}" s="${g6Style}" t="inlineStr"><is><t>Prescribed Qty</t></is></c>`;
        rowsXml += `<c r="H${currentRow}" s="${h6Style}" t="inlineStr"><is><t>Released Qty</t></is></c>`;
        rowsXml += `<c r="I${currentRow}" s="${i6Style}" t="inlineStr"><is><t>Balance Qty</t></is></c>`;
        rowsXml += `<c r="J${currentRow}" s="${j6Style}" t="inlineStr"><is><t>Unit </t></is></c>`;
        rowsXml += `<c r="K${currentRow}" s="${k6Style}" t="inlineStr"><is><t>Prescribed By</t></is></c>`;
        rowsXml += `<c r="L${currentRow}" s="${l6Style}" t="inlineStr"><is><t>Dispensed By</t></is></c>`;
        rowsXml += `<c r="M${currentRow}" s="${m6Style}" t="inlineStr"><is><t>Dispensing Facility</t></is></c>`;
        rowsXml += `<c r="N${currentRow}" s="${n6Style}" t="inlineStr"><is><t>Status</t></is></c>`;
        rowsXml += `</row>`;
        currentRow++;

        for (let b = 0; b < 5; b++) {
          rowsXml += `<row r="${currentRow}" spans="3:14" x14ac:dyDescent="0.25">`;
          for (const col of ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"]) {
            rowsXml += `<c r="${col}${currentRow}" s="${dataStyle}"/>`;
          }
          rowsXml += `</row>`;
          currentRow++;
        }
      } else {
        rowsXml += `<row r="${currentRow}" spans="3:12" x14ac:dyDescent="0.25">`;
        rowsXml += `<c r="C${currentRow}" s="8" t="inlineStr"><is><t>Patient</t></is></c>`;
        rowsXml += `<c r="D${currentRow}" s="9" t="inlineStr"><is><t>Name: </t></is></c>`;
        rowsXml += `<c r="E${currentRow}" s="8" t="inlineStr"><is><t>Sex:</t></is></c>`;
        rowsXml += `<c r="F${currentRow}" s="9" t="inlineStr"><is><t>DOB:</t></is></c>`;
        rowsXml += `<c r="G${currentRow}" s="9" t="inlineStr"><is><t>Facility: </t></is></c>`;
        rowsXml += `<c r="H${currentRow}" s="9" t="inlineStr"><is><t>Contact Number:</t></is></c>`;
        rowsXml += `<c r="I${currentRow}" s="8"/><c r="J${currentRow}" s="3"/><c r="K${currentRow}" s="3"/><c r="L${currentRow}" s="2"/>`;
        rowsXml += `</row>`;
        currentRow++;

        rowsXml += `<row r="${currentRow}" spans="3:12" x14ac:dyDescent="0.25">`;
        if (isDaily) {
          rowsXml += `<c r="C${currentRow}" s="4"/>`;
        } else {
          rowsXml += `<c r="C${currentRow}" s="4" t="inlineStr"><is><t>Date</t></is></c>`;
        }
        rowsXml += `<c r="D${currentRow}" s="5" t="inlineStr"><is><t>Medicine Information</t></is></c>`;
        rowsXml += `<c r="E${currentRow}" s="4" t="inlineStr"><is><t>Brand</t></is></c>`;
        rowsXml += `<c r="F${currentRow}" s="5" t="inlineStr"><is><t>Batch/Lot No.</t></is></c>`;
        rowsXml += `<c r="G${currentRow}" s="4" t="inlineStr"><is><t>Qty</t></is></c>`;
        rowsXml += `<c r="H${currentRow}" s="4" t="inlineStr"><is><t>Unit </t></is></c>`;
        rowsXml += `<c r="I${currentRow}" s="4" t="inlineStr"><is><t>Prescribed By</t></is></c>`;
        rowsXml += `<c r="J${currentRow}" s="4" t="inlineStr"><is><t>Dispensed By</t></is></c>`;
        rowsXml += `<c r="K${currentRow}" s="7" t="inlineStr"><is><t>Dispensing Facility</t></is></c>`;
        rowsXml += `<c r="L${currentRow}" s="4" t="inlineStr"><is><t>Status</t></is></c>`;
        rowsXml += `</row>`;
        currentRow++;

        for (let b = 0; b < 5; b++) {
          rowsXml += `<row r="${currentRow}" spans="3:12" x14ac:dyDescent="0.25">`;
          for (const col of ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]) {
            rowsXml += `<c r="${col}${currentRow}" s="6"/>`;
          }
          rowsXml += `</row>`;
          currentRow++;
        }
      }
    } else {
      for (const group of patientGroups) {
        patientHeaderRows.push(currentRow);

        const patientName = group.patient.name
          ? (group.patient.name.startsWith("Name: ") ? group.patient.name : `Name: ${group.patient.name}`)
          : "Name: —";
        const patientSex = group.patient.gender
          ? (group.patient.gender.startsWith("Sex: ") ? group.patient.gender : `Sex: ${group.patient.gender}`)
          : "Sex: —";
        const patientDob = group.patient.date_of_birth
          ? (group.patient.date_of_birth.startsWith("DOB: ") ? group.patient.date_of_birth : `DOB: ${group.patient.date_of_birth}`)
          : "DOB: —";
        const patientFacility = group.patient.facility_code
          ? (group.patient.facility_code.startsWith("Facility: ") ? group.patient.facility_code : `Facility: ${group.patient.facility_code}`)
          : "Facility: —";
        const patientContact = group.patient.contact_number
          ? (group.patient.contact_number.startsWith("Contact Number: ")
              ? group.patient.contact_number
              : group.patient.contact_number.startsWith("Contact No: ")
              ? `Contact Number: ${group.patient.contact_number.slice(12)}`
              : `Contact Number: ${group.patient.contact_number}`)
          : "Contact Number: —";

        if (is12Col) {
          // 1. Patient Demographics Header Row (Row 5 style: Soft Teal Banner C through N)
          rowsXml += `<row r="${currentRow}" spans="3:14" x14ac:dyDescent="0.25">`;
          rowsXml += `<c r="C${currentRow}" s="${c5Style}" t="inlineStr"><is><t>Patient</t></is></c>`;
          rowsXml += `<c r="D${currentRow}" s="${d5Style}" t="inlineStr"><is><t>${escapeXml(patientName)}</t></is></c>`;
          rowsXml += `<c r="E${currentRow}" s="${e5Style}"/>`;
          rowsXml += `<c r="F${currentRow}" s="${f5Style}" t="inlineStr"><is><t>${escapeXml(patientSex)}</t></is></c>`;
          rowsXml += `<c r="G${currentRow}" s="${g5Style}" t="inlineStr"><is><t>${escapeXml(patientDob)}</t></is></c>`;
          rowsXml += `<c r="H${currentRow}" s="${h5Style}"/>`;
          rowsXml += `<c r="I${currentRow}" s="${i5Style}"/>`;
          rowsXml += `<c r="J${currentRow}" s="${j5Style}" t="inlineStr"><is><t>${escapeXml(patientFacility)}</t></is></c>`;
          rowsXml += `<c r="K${currentRow}" s="${k5Style}"/>`;
          rowsXml += `<c r="L${currentRow}" s="${l5Style}" t="inlineStr"><is><t>${escapeXml(patientContact)}</t></is></c>`;
          rowsXml += `<c r="M${currentRow}" s="${m5Style}"/>`;
          rowsXml += `<c r="N${currentRow}" s="${n5Style}"/>`;
          rowsXml += `</row>`;
          currentRow++;

          // 2. Medicine Table Column Headers Row (Row 6 style: C through N)
          const timeOrDateLabel = isDaily ? "Time" : "Date&amp;Time";
          rowsXml += `<row r="${currentRow}" spans="3:14" ht="27.95" customHeight="1" x14ac:dyDescent="0.25">`;
          rowsXml += `<c r="C${currentRow}" s="${c6Style}" t="inlineStr"><is><t>${timeOrDateLabel}</t></is></c>`;
          rowsXml += `<c r="D${currentRow}" s="${d6Style}" t="inlineStr"><is><t>Medicine Information</t></is></c>`;
          rowsXml += `<c r="E${currentRow}" s="${e6Style}" t="inlineStr"><is><t>Brand</t></is></c>`;
          rowsXml += `<c r="F${currentRow}" s="${f6Style}" t="inlineStr"><is><t>Batch/Lot No.</t></is></c>`;
          rowsXml += `<c r="G${currentRow}" s="${g6Style}" t="inlineStr"><is><t>Prescribed Qty</t></is></c>`;
          rowsXml += `<c r="H${currentRow}" s="${h6Style}" t="inlineStr"><is><t>Released Qty</t></is></c>`;
          rowsXml += `<c r="I${currentRow}" s="${i6Style}" t="inlineStr"><is><t>Balance Qty</t></is></c>`;
          rowsXml += `<c r="J${currentRow}" s="${j6Style}" t="inlineStr"><is><t>Unit </t></is></c>`;
          rowsXml += `<c r="K${currentRow}" s="${k6Style}" t="inlineStr"><is><t>Prescribed By</t></is></c>`;
          rowsXml += `<c r="L${currentRow}" s="${l6Style}" t="inlineStr"><is><t>Dispensed By</t></is></c>`;
          rowsXml += `<c r="M${currentRow}" s="${m6Style}" t="inlineStr"><is><t>Dispensing Facility</t></is></c>`;
          rowsXml += `<c r="N${currentRow}" s="${n6Style}" t="inlineStr"><is><t>Status</t></is></c>`;
          rowsXml += `</row>`;
          currentRow++;

          // 3. Chronological Dispensing Records for this Patient (Row 7 style)
          for (const item of group.items) {
            const timeOrDateVal = isDaily ? item.timeFormatted : item.dateTimeFormatted;
            rowsXml += `<row r="${currentRow}" spans="3:14" x14ac:dyDescent="0.25">`;
            rowsXml += `<c r="C${currentRow}" s="${dataStyle}" t="inlineStr"><is><t>${escapeXml(timeOrDateVal)}</t></is></c>`;
            rowsXml += `<c r="D${currentRow}" s="${dataStyle}" t="inlineStr"><is><t>${escapeXml(item.medicineInfo)}</t></is></c>`;
            rowsXml += `<c r="E${currentRow}" s="${dataStyle}" t="inlineStr"><is><t>${escapeXml(item.brand)}</t></is></c>`;
            rowsXml += `<c r="F${currentRow}" s="${dataStyle}" t="inlineStr"><is><t>${escapeXml(item.batchLotNo)}</t></is></c>`;
            if (typeof item.prescribedQuantity === "number") {
              rowsXml += `<c r="G${currentRow}" s="${dataStyle}"><v>${item.prescribedQuantity}</v></c>`;
            } else {
              rowsXml += `<c r="G${currentRow}" s="${dataStyle}" t="inlineStr"><is><t>${escapeXml(item.prescribedQuantity || "—")}</t></is></c>`;
            }
            rowsXml += `<c r="H${currentRow}" s="${dataStyle}"><v>${item.releasedQuantity}</v></c>`;
            rowsXml += `<c r="I${currentRow}" s="${dataStyle}"><v>${item.balanceQuantity}</v></c>`;
            rowsXml += `<c r="J${currentRow}" s="${dataStyle}" t="inlineStr"><is><t>${escapeXml(item.unit)}</t></is></c>`;
            rowsXml += `<c r="K${currentRow}" s="${dataStyle}" t="inlineStr"><is><t>${escapeXml(item.prescribedBy)}</t></is></c>`;
            rowsXml += `<c r="L${currentRow}" s="${dataStyle}" t="inlineStr"><is><t>${escapeXml(item.dispensedBy)}</t></is></c>`;
            rowsXml += `<c r="M${currentRow}" s="${dataStyle}" t="inlineStr"><is><t>${escapeXml(item.facilityName)}</t></is></c>`;
            rowsXml += `<c r="N${currentRow}" s="${dataStyle}" t="inlineStr"><is><t>${escapeXml(item.status)}</t></is></c>`;
            rowsXml += `</row>`;
            currentRow++;
          }
        } else {
          // 10-column layout fallback
          rowsXml += `<row r="${currentRow}" spans="3:12" x14ac:dyDescent="0.25">`;
          rowsXml += `<c r="C${currentRow}" s="8" t="inlineStr"><is><t>${escapeXml(patientCode)}</t></is></c>`;
          rowsXml += `<c r="D${currentRow}" s="9" t="inlineStr"><is><t>${escapeXml(patientName)}</t></is></c>`;
          rowsXml += `<c r="E${currentRow}" s="8" t="inlineStr"><is><t>${escapeXml(patientSex)}</t></is></c>`;
          rowsXml += `<c r="F${currentRow}" s="9" t="inlineStr"><is><t>${escapeXml(patientDob)}</t></is></c>`;
          rowsXml += `<c r="G${currentRow}" s="9" t="inlineStr"><is><t>${escapeXml(patientFacility)}</t></is></c>`;
          rowsXml += `<c r="H${currentRow}" s="9" t="inlineStr"><is><t>${escapeXml(patientContact)}</t></is></c>`;
          rowsXml += `<c r="I${currentRow}" s="8"/><c r="J${currentRow}" s="3"/><c r="K${currentRow}" s="3"/><c r="L${currentRow}" s="2"/>`;
          rowsXml += `</row>`;
          currentRow++;

          rowsXml += `<row r="${currentRow}" spans="3:12" x14ac:dyDescent="0.25">`;
          if (isDaily) {
            rowsXml += `<c r="C${currentRow}" s="4"/>`;
          } else {
            rowsXml += `<c r="C${currentRow}" s="4" t="inlineStr"><is><t>Date</t></is></c>`;
          }
          rowsXml += `<c r="D${currentRow}" s="5" t="inlineStr"><is><t>Medicine Information</t></is></c>`;
          rowsXml += `<c r="E${currentRow}" s="4" t="inlineStr"><is><t>Brand</t></is></c>`;
          rowsXml += `<c r="F${currentRow}" s="5" t="inlineStr"><is><t>Batch/Lot No.</t></is></c>`;
          rowsXml += `<c r="G${currentRow}" s="4" t="inlineStr"><is><t>Qty</t></is></c>`;
          rowsXml += `<c r="H${currentRow}" s="4" t="inlineStr"><is><t>Unit </t></is></c>`;
          rowsXml += `<c r="I${currentRow}" s="4" t="inlineStr"><is><t>Prescribed By</t></is></c>`;
          rowsXml += `<c r="J${currentRow}" s="4" t="inlineStr"><is><t>Dispensed By</t></is></c>`;
          rowsXml += `<c r="K${currentRow}" s="7" t="inlineStr"><is><t>Dispensing Facility</t></is></c>`;
          rowsXml += `<c r="L${currentRow}" s="4" t="inlineStr"><is><t>Status</t></is></c>`;
          rowsXml += `</row>`;
          currentRow++;

          for (const item of group.items) {
            rowsXml += `<row r="${currentRow}" spans="3:12" x14ac:dyDescent="0.25">`;
            if (isDaily) {
              rowsXml += `<c r="C${currentRow}" s="6"/>`;
            } else {
              rowsXml += `<c r="C${currentRow}" s="6" t="inlineStr"><is><t>${escapeXml(item.dateFormatted)}</t></is></c>`;
            }
            rowsXml += `<c r="D${currentRow}" s="6" t="inlineStr"><is><t>${escapeXml(item.medicineInfo)}</t></is></c>`;
            rowsXml += `<c r="E${currentRow}" s="6" t="inlineStr"><is><t>${escapeXml(item.brand)}</t></is></c>`;
            rowsXml += `<c r="F${currentRow}" s="6" t="inlineStr"><is><t>${escapeXml(item.batchLotNo)}</t></is></c>`;
            rowsXml += `<c r="G${currentRow}" s="6"><v>${item.quantity}</v></c>`;
            rowsXml += `<c r="H${currentRow}" s="6" t="inlineStr"><is><t>${escapeXml(item.unit)}</t></is></c>`;
            rowsXml += `<c r="I${currentRow}" s="6" t="inlineStr"><is><t>${escapeXml(item.prescribedBy)}</t></is></c>`;
            rowsXml += `<c r="J${currentRow}" s="6" t="inlineStr"><is><t>${escapeXml(item.dispensedBy)}</t></is></c>`;
            rowsXml += `<c r="K${currentRow}" s="6" t="inlineStr"><is><t>${escapeXml(item.facilityName)}</t></is></c>`;
            rowsXml += `<c r="L${currentRow}" s="6" t="inlineStr"><is><t>${escapeXml(item.status)}</t></is></c>`;
            rowsXml += `</row>`;
            currentRow++;
          }
        }
      }
    }

    const lastDataRow = Math.max(7, currentRow - 1);
    const endCol = is12Col ? "N" : "L";

    // 3. Dynamically adjust column widths so content is never truncated
    const colWidths = calculateDispensingColumnWidths(patientGroups, { isDaily, is12Col });
    const colsXml = buildDispensingColsXml(colWidths, is12Col);
    if (xml.includes("<cols>")) {
      xml = xml.replace(/<cols>[\s\S]*?<\/cols>/, colsXml);
    } else if (xml.includes("<sheetData")) {
      xml = xml.replace("<sheetData", `${colsXml}<sheetData`);
    }

    // Replace sheetData starting at row 5
    const sheetDataRegex = /<row r="5"[\s\S]*?<\/sheetData>/;
    xml = xml.replace(sheetDataRegex, `${rowsXml}</sheetData>`);

    // 4. Update Merge Cells for 12-column layout
    if (is12Col) {
      const topMerges = [];
      const mergeMatches = xml.matchAll(/<mergeCell ref="([A-Z0-9:]+)"\/>/g);
      for (const m of mergeMatches) {
        const ref = m[1];
        const rowNum = Number(ref.match(/\d+/)?.[0] || 0);
        if (rowNum > 0 && rowNum <= 4) {
          topMerges.push(ref);
        }
      }
      if (topMerges.length === 0) {
        topMerges.push("E1:I1", "E2:I2", "F3:H3");
      }

      const allMerges = [...topMerges];
      for (const pRow of patientHeaderRows) {
        allMerges.push(`G${pRow}:I${pRow}`);
      }

      const mergeCellsXml = `<mergeCells count="${allMerges.length}">${allMerges
        .map((ref) => `<mergeCell ref="${ref}"/>`)
        .join("")}</mergeCells>`;

      if (xml.includes("<mergeCells")) {
        xml = xml.replace(/<mergeCells[\s\S]*?<\/mergeCells>/, mergeCellsXml);
      } else if (xml.includes("</worksheet>")) {
        xml = xml.replace("</worksheet>", `${mergeCellsXml}</worksheet>`);
      }
    }

    // Update dimensions ref
    xml = xml.replace(/<dimension ref="[A-Z0-9:]+"/, `<dimension ref="C1:${endCol}${lastDataRow}"`);

    // Suppress Excel background formula/number warnings
    const ignoredErrorsXml = `<ignoredErrors>` +
      `<ignoredError sqref="C5:${endCol}${lastDataRow + 100}" numberStoredAsText="1" evalError="1" twoDigitTextYear="1" formula="1" formulaRange="1" unlockedFormula="1" emptyCellReference="1"/>` +
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
    console.warn("Failed to inject into Dispensing History template CFB, falling back to workbook builder:", err);
    const wb = buildMonthlyDispensingExcelWorkbook({
      historyRows,
      transactions,
      year,
      month,
      facilityName,
      sortChronological,
      dateFilter,
      startDate,
      endDate,
    });
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }
}

/**
 * Fallback workbook builder using SheetJS runtime objects if binary CFB injection is unavailable
 */
export function buildMonthlyDispensingExcelWorkbook({
  historyRows = [],
  transactions = [],
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  sortChronological = "asc",
  dateFilter = "THIS_MONTH",
  startDate = null,
  endDate = null,
} = {}) {
  const templateBase64 = selectDispensingTemplateBase64(dateFilter);
  const isDaily = String(dateFilter || "").toUpperCase() === "TODAY";
  const normFilter = String(dateFilter || "").toUpperCase();
  const is12Col = normFilter !== "THIS_WEEK";

  let wb = null;
  try {
    if (templateBase64) {
      wb = XLSX.read(templateBase64, {
        type: "base64",
        cellStyles: true,
      });
    }
  } catch (err) {
    console.warn("Could not load dispensing base64 template, falling back to clean workbook:", err);
  }

  if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
    wb = XLSX.utils.book_new();
    const ws = {};
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  }

  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName] || {};
  wb.Sheets[sheetName] = ws;

  const headerDateText = formatDispensingHeaderDate({
    dateFilter,
    year,
    month,
    startDate,
    endDate,
  });
  ws["E1"] = { t: "s", v: "VICENTE MENDIOLA CENTER FOR HEALTH" };
  ws["E2"] = { t: "s", v: "Dispensing History Record" };
  ws["F3"] = { t: "s", v: headerDateText };

  const sourceData = (transactions && transactions.length > 0) ? transactions : historyRows;
  const patientGroups = groupDispensingByPatient(sourceData, { sortChronological });

  let rowIdx = 5;
  const merges = [
    { s: { c: 4, r: 0 }, e: { c: 8, r: 0 } },
    { s: { c: 4, r: 1 }, e: { c: 8, r: 1 } },
    { s: { c: 5, r: 2 }, e: { c: 7, r: 2 } },
  ];

  if (patientGroups.length === 0) {
    if (is12Col) {
      ws["C5"] = { t: "s", v: "Patient" };
      ws["D5"] = { t: "s", v: "Name: " };
      ws["F5"] = { t: "s", v: "Sex:" };
      ws["G5"] = { t: "s", v: "DOB:" };
      ws["J5"] = { t: "s", v: "Facility: " };
      ws["L5"] = { t: "s", v: "Contact Number:" };
      merges.push({ s: { c: 6, r: 4 }, e: { c: 8, r: 4 } });
      ws["C6"] = { t: "s", v: isDaily ? "Time" : "Date&Time" };
      ws["D6"] = { t: "s", v: "Medicine Information" };
      ws["E6"] = { t: "s", v: "Brand" };
      ws["F6"] = { t: "s", v: "Batch/Lot No." };
      ws["G6"] = { t: "s", v: "Prescribed Qty" };
      ws["H6"] = { t: "s", v: "Released Qty" };
      ws["I6"] = { t: "s", v: "Balance Qty" };
      ws["J6"] = { t: "s", v: "Unit " };
      ws["K6"] = { t: "s", v: "Prescribed By" };
      ws["L6"] = { t: "s", v: "Dispensed By" };
      ws["M6"] = { t: "s", v: "Dispensing Facility" };
      ws["N6"] = { t: "s", v: "Status" };
      rowIdx = 7;
    }
  }

  for (const group of patientGroups) {
    const pRow = rowIdx;
    const patientName = group.patient.name
      ? (group.patient.name.startsWith("Name: ") ? group.patient.name : `Name: ${group.patient.name}`)
      : "Name: —";
    const patientSex = group.patient.gender
      ? (group.patient.gender.startsWith("Sex: ") ? group.patient.gender : `Sex: ${group.patient.gender}`)
      : "Sex: —";
    const patientDob = group.patient.date_of_birth
      ? (group.patient.date_of_birth.startsWith("DOB: ") ? group.patient.date_of_birth : `DOB: ${group.patient.date_of_birth}`)
      : "DOB: —";
    const patientFacility = group.patient.facility_code
      ? (group.patient.facility_code.startsWith("Facility: ") ? group.patient.facility_code : `Facility: ${group.patient.facility_code}`)
      : "Facility: —";
    const patientContact = group.patient.contact_number
      ? (group.patient.contact_number.startsWith("Contact Number: ")
          ? group.patient.contact_number
          : `Contact Number: ${group.patient.contact_number}`)
      : "Contact Number: —";

    if (is12Col) {
      ws[`C${rowIdx}`] = { t: "s", v: "Patient" };
      ws[`D${rowIdx}`] = { t: "s", v: patientName };
      ws[`F${rowIdx}`] = { t: "s", v: patientSex };
      ws[`G${rowIdx}`] = { t: "s", v: patientDob };
      ws[`J${rowIdx}`] = { t: "s", v: patientFacility };
      ws[`L${rowIdx}`] = { t: "s", v: patientContact };

      merges.push({ s: { c: 6, r: pRow - 1 }, e: { c: 8, r: pRow - 1 } });
      rowIdx++;

      ws[`C${rowIdx}`] = { t: "s", v: isDaily ? "Time" : "Date&Time" };
      ws[`D${rowIdx}`] = { t: "s", v: "Medicine Information" };
      ws[`E${rowIdx}`] = { t: "s", v: "Brand" };
      ws[`F${rowIdx}`] = { t: "s", v: "Batch/Lot No." };
      ws[`G${rowIdx}`] = { t: "s", v: "Prescribed Qty" };
      ws[`H${rowIdx}`] = { t: "s", v: "Released Qty" };
      ws[`I${rowIdx}`] = { t: "s", v: "Balance Qty" };
      ws[`J${rowIdx}`] = { t: "s", v: "Unit " };
      ws[`K${rowIdx}`] = { t: "s", v: "Prescribed By" };
      ws[`L${rowIdx}`] = { t: "s", v: "Dispensed By" };
      ws[`M${rowIdx}`] = { t: "s", v: "Dispensing Facility" };
      ws[`N${rowIdx}`] = { t: "s", v: "Status" };
      rowIdx++;

      for (const item of group.items) {
        ws[`C${rowIdx}`] = { t: "s", v: isDaily ? item.timeFormatted : item.dateTimeFormatted };
        ws[`D${rowIdx}`] = { t: "s", v: item.medicineInfo };
        ws[`E${rowIdx}`] = { t: "s", v: item.brand };
        ws[`F${rowIdx}`] = { t: "s", v: item.batchLotNo };
        if (typeof item.prescribedQuantity === "number") {
          ws[`G${rowIdx}`] = { t: "n", v: item.prescribedQuantity };
        } else {
          ws[`G${rowIdx}`] = { t: "s", v: item.prescribedQuantity || "—" };
        }
        ws[`H${rowIdx}`] = { t: "n", v: item.releasedQuantity };
        ws[`I${rowIdx}`] = { t: "n", v: item.balanceQuantity };
        ws[`J${rowIdx}`] = { t: "s", v: item.unit };
        ws[`K${rowIdx}`] = { t: "s", v: item.prescribedBy };
        ws[`L${rowIdx}`] = { t: "s", v: item.dispensedBy };
        ws[`M${rowIdx}`] = { t: "s", v: item.facilityName };
        ws[`N${rowIdx}`] = { t: "s", v: item.status };
        rowIdx++;
      }
    } else {
      ws[`C${rowIdx}`] = { t: "s", v: patientCode };
      ws[`D${rowIdx}`] = { t: "s", v: patientName };
      ws[`E${rowIdx}`] = { t: "s", v: patientSex };
      ws[`F${rowIdx}`] = { t: "s", v: patientDob };
      ws[`G${rowIdx}`] = { t: "s", v: patientFacility };
      ws[`H${rowIdx}`] = { t: "s", v: patientContact };
      rowIdx++;

      ws[`C${rowIdx}`] = { t: "s", v: isDaily ? "" : "Date" };
      ws[`D${rowIdx}`] = { t: "s", v: "Medicine Information" };
      ws[`E${rowIdx}`] = { t: "s", v: "Brand" };
      ws[`F${rowIdx}`] = { t: "s", v: "Batch/Lot No." };
      ws[`G${rowIdx}`] = { t: "s", v: "Qty" };
      ws[`H${rowIdx}`] = { t: "s", v: "Unit " };
      ws[`I${rowIdx}`] = { t: "s", v: "Prescribed By" };
      ws[`J${rowIdx}`] = { t: "s", v: "Dispensed By" };
      ws[`K${rowIdx}`] = { t: "s", v: "Dispensing Facility" };
      ws[`L${rowIdx}`] = { t: "s", v: "Status" };
      rowIdx++;

      for (const item of group.items) {
        ws[`C${rowIdx}`] = { t: "s", v: isDaily ? "" : item.dateFormatted };
        ws[`D${rowIdx}`] = { t: "s", v: item.medicineInfo };
        ws[`E${rowIdx}`] = { t: "s", v: item.brand };
        ws[`F${rowIdx}`] = { t: "s", v: item.batchLotNo };
        ws[`G${rowIdx}`] = { t: "n", v: item.quantity };
        ws[`H${rowIdx}`] = { t: "s", v: item.unit };
        ws[`I${rowIdx}`] = { t: "s", v: item.prescribedBy };
        ws[`J${rowIdx}`] = { t: "s", v: item.dispensedBy };
        ws[`K${rowIdx}`] = { t: "s", v: item.facilityName };
        ws[`L${rowIdx}`] = { t: "s", v: item.status };
        rowIdx++;
      }
    }
  }

  const endCol = is12Col ? "N" : "L";
  ws["!ref"] = `C1:${endCol}${Math.max(7, rowIdx)}`;
  ws["!merges"] = merges;

  const colWidths = calculateDispensingColumnWidths(patientGroups, { isDaily, is12Col });
  const maxCol = is12Col ? 14 : 12;
  const cols = [{ wch: 4 }, { wch: 4 }];
  for (let c = 3; c <= maxCol; c++) {
    cols.push({ wch: colWidths[c] || 15 });
  }
  ws["!cols"] = cols;

  return wb;
}

/**
 * Triggers Excel export for Dispensing History Record and registers with recent exports.
 * Adapts template, header date stamp, table columns, and filename according to active UI date filter.
 */
export async function exportMonthlyDispensingExcel({
  historyRows = [],
  transactions = [],
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  facilityName = "VICENTE MENDIOLA CENTER FOR HEALTH",
  sortChronological = "asc",
  dateFilter = "THIS_MONTH",
  startDate = null,
  endDate = null,
} = {}) {
  const y = Number(year) || new Date().getFullYear();
  const m = Number(month) || new Date().getMonth() + 1;
  const filename = getDispensingExportFilename({
    dateFilter,
    year: y,
    month: m,
    startDate,
    endDate,
  });

  const sourceData = (transactions && transactions.length > 0) ? transactions : historyRows;
  const buffer = buildMonthlyDispensingExcelBuffer({
    historyRows,
    transactions,
    year: y,
    month: m,
    facilityName,
    sortChronological,
    dateFilter,
    startDate,
    endDate,
  });

  return downloadExportFile({
    filename,
    buffer,
    recordCount: sourceData.length,
    format: "EXCEL",
  });
}

/**
 * Semantic alias for exportMonthlyDispensingExcel to support all date filter exports
 */
export const exportDispensingHistoryExcel = exportMonthlyDispensingExcel;
