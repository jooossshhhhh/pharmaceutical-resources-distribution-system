import * as XLSX from "xlsx";
import * as CFB from "cfb";
import { downloadExportFile } from "../../frontend/services/downloadManager.js";
import { PATIENT_TEMPLATE_BASE64 } from "../../frontend/assets/templates-excel/patientTemplateBase64.js";
import { getSnapshot, getCachedUserSession, STORAGE_KEYS } from "../../backend/database/snapshotStore.js";
import {
  calculateAge,
  formatPatientDateOfBirth,
  formatPatientName,
  formatPatientRegisteredAt,
  formatPatientRegisteredBy,
} from "./patientUtils.js";

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
 * Resolves registrar name from patient record with user snapshot fallbacks
 */
export function getPatientRegistrarName(patient = {}, fallbackUsers = []) {
  let users = [];
  try {
    users = fallbackUsers && fallbackUsers.length ? fallbackUsers : getSnapshot(STORAGE_KEYS.USERS, []);
  } catch {
    users = fallbackUsers || [];
  }
  let sessionProfile = null;
  try {
    const session = getCachedUserSession();
    sessionProfile = session?.profile;
  } catch {
    // ignore in environments without localStorage
  }
  const list = Array.isArray(users) ? [...users] : [];
  if (sessionProfile && !list.some((u) => u?.id === sessionProfile.id)) {
    list.push(sessionProfile);
  }
  try {
    const formatted = formatPatientRegisteredBy(patient.registered_by, patient.created_by, list);
    return formatted && formatted !== "—" ? formatted : "-";
  } catch {
    return "-";
  }
}

/**
 * Returns the CFB zip archive utility from cfb package or XLSX
 */
export function getCfb() {
  if (CFB && typeof CFB.read === "function") return CFB;
  if (CFB?.default && typeof CFB.default.read === "function") return CFB.default;
  const defaultExport = Reflect.get(XLSX, "default");
  return (
    XLSX?.CFB ||
    defaultExport?.CFB ||
    (typeof window !== "undefined" ? window.XLSX?.CFB || window.CFB : null)
  );
}

/**
 * Calculates adaptive column widths so that long cell contents (such as address,
 * facility name, or registrar) extend the column width automatically to prevent clipping.
 * Preserves the template base widths as minimum values.
 */
export function calculatePatientColumnWidths(patients = [], fallbackUsers = []) {
  const baseWidths = {
    E: 5.7109375,  // No.
    F: 30.7109375, // Name
    G: 8.7109375,  // Gender
    H: 5.7109375,  // Age
    I: 20.7109375, // DOB
    J: 20.7109375, // Contact Number
    K: 30.7109375, // Address
    L: 15.7109375, // Registered
    M: 20.7109375, // Registered By
    N: 25.7109375, // Facility
  };

  const maxLens = {
    E: 0,  // "No." fits in base width 5.71
    F: 4,  // "Name"
    G: 6,  // "Gender"
    H: 0,  // "Age" fits in base width 5.71
    I: 3,  // "DOB"
    J: 14, // "Contact Number"
    K: 7,  // "Address"
    L: 10, // "Registered"
    M: 13, // "Registered By"
    N: 8,  // "Facility"
  };

  for (let i = 0; i < patients.length; i++) {
    const p = patients[i];
    if (!p) continue;

    const noLen = String(i + 1).length;
    if (noLen > maxLens.E) maxLens.E = noLen;

    let name = "";
    try {
      name = formatPatientName(p);
    } catch {
      name = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" ") || "";
    }
    if (name.length > maxLens.F) maxLens.F = name.length;

    const gender = String(p.gender || "");
    if (gender.length > maxLens.G) maxLens.G = gender.length;

    let ageStr = "";
    try {
      const rawAge = calculateAge(p.date_of_birth);
      ageStr = rawAge !== null && rawAge !== undefined ? String(rawAge) : "";
    } catch {
      ageStr = "";
    }
    if (ageStr.length > maxLens.H) maxLens.H = ageStr.length;

    let dobStr = "";
    try {
      const dob = formatPatientDateOfBirth(p.date_of_birth);
      dobStr = dob && dob !== "—" ? dob : (p.date_of_birth || "");
    } catch {
      dobStr = p.date_of_birth || "";
    }
    if (dobStr.length > maxLens.I) maxLens.I = dobStr.length;

    const contact = String(p.contact_number || "");
    if (contact.length > maxLens.J) maxLens.J = contact.length;

    const address = String(p.address || "");
    if (address.length > maxLens.K) maxLens.K = address.length;

    let regAtStr = "";
    try {
      const regAt = formatPatientRegisteredAt(p.created_at);
      regAtStr = regAt && regAt !== "—" ? regAt : (p.created_at || "");
    } catch {
      regAtStr = p.created_at || "";
    }
    if (regAtStr.length > maxLens.L) maxLens.L = regAtStr.length;

    let regByStr = "";
    try {
      regByStr = getPatientRegistrarName(p, fallbackUsers);
    } catch {
      regByStr = "";
    }
    if (regByStr.length > maxLens.M) maxLens.M = regByStr.length;

    const fac = String(p.facility?.facility_name || p.facility || "");
    if (fac.length > maxLens.N) maxLens.N = fac.length;
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
 * Builds the <cols> XML block with extended widths for sheet1/sheet2.
 */
export function buildPatientColsXml(colWidths) {
  return `<cols><col min="1" max="4" width="9.140625" style="3"/><col min="5" max="5" width="${colWidths.E}" style="3" customWidth="1"/><col min="6" max="6" width="${colWidths.F}" style="3" customWidth="1"/><col min="7" max="7" width="${colWidths.G}" style="3" customWidth="1"/><col min="8" max="8" width="${colWidths.H}" style="3" customWidth="1"/><col min="9" max="9" width="${colWidths.I}" style="3" customWidth="1"/><col min="10" max="10" width="${colWidths.J}" style="3" customWidth="1"/><col min="11" max="11" width="${colWidths.K}" style="3" customWidth="1"/><col min="12" max="12" width="${colWidths.L}" style="3" customWidth="1"/><col min="13" max="13" width="${colWidths.M}" style="3" customWidth="1"/><col min="14" max="14" width="${colWidths.N}" style="3" customWidth="1"/><col min="15" max="16384" width="9.140625" style="3"/></cols>`;
}

/**
 * Builds Sheet 1 (List / Active patients) XML inside the template package.
 * Preserves:
 * - Row 3-4 merged title banner (E3:N4) with styles s="5" to s="10"
 * - Row 5 headers (E5:N5) with style s="1" (Amasis MT Pro Light 9pt Bold, thin border, centered)
 * - Exact Amasis MT Pro Light 9pt Regular, thin borders (s="4"), left aligned
 * - Dynamic adaptive column widths extending whenever content exceeds default width
 * - Standard row heights (no distortion)
 */
export function buildPatientListSheetXml(originalXml, patients = [], fallbackUsers = []) {
  let xml = originalXml;

  // Dynamically adapt column widths if text in cells is longer than template defaults
  const colWidths = calculatePatientColumnWidths(patients, fallbackUsers);
  const colsXml = buildPatientColsXml(colWidths);
  xml = xml.replace(/<cols>[\s\S]*?<\/cols>/, colsXml);

  // Title rows 3 and 4 (merged E3:N4 in template)
  let sheetDataXml = `
  <row r="3" spans="5:14" ht="15" customHeight="1" x14ac:dyDescent="0.25">
    <c r="E3" s="5" t="s"><v>10</v></c>
    <c r="F3" s="6"/><c r="G3" s="6"/><c r="H3" s="6"/><c r="I3" s="6"/><c r="J3" s="6"/><c r="K3" s="6"/><c r="L3" s="6"/><c r="M3" s="6"/><c r="N3" s="7"/>
  </row>
  <row r="4" spans="5:14" ht="15" customHeight="1" x14ac:dyDescent="0.25">
    <c r="E4" s="8"/><c r="F4" s="9"/><c r="G4" s="9"/><c r="H4" s="9"/><c r="I4" s="9"/><c r="J4" s="9"/><c r="K4" s="9"/><c r="L4" s="9"/><c r="M4" s="9"/><c r="N4" s="10"/>
  </row>
  <row r="5" spans="5:14" x14ac:dyDescent="0.25">
    <c r="E5" s="1" t="s"><v>0</v></c>
    <c r="F5" s="1" t="s"><v>1</v></c>
    <c r="G5" s="1" t="s"><v>2</v></c>
    <c r="H5" s="1" t="s"><v>3</v></c>
    <c r="I5" s="1" t="s"><v>4</v></c>
    <c r="J5" s="1" t="s"><v>5</v></c>
    <c r="K5" s="1" t="s"><v>6</v></c>
    <c r="L5" s="1" t="s"><v>8</v></c>
    <c r="M5" s="1" t="s"><v>9</v></c>
    <c r="N5" s="1" t="s"><v>7</v></c>
  </row>`;

  const rowCount = Math.max(patients.length, 7);
  for (let i = 0; i < rowCount; i++) {
    const rowNum = 6 + i;
    const p = patients[i];

    sheetDataXml += `<row r="${rowNum}" spans="5:14" x14ac:dyDescent="0.25">`;
    if (p) {
      const autoNum = i + 1;
      let name = "-";
      try {
        name = formatPatientName(p);
      } catch {
        name = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" ") || "-";
      }

      const gender = p.gender || "-";

      let age = "-";
      try {
        const rawAge = calculateAge(p.date_of_birth);
        if (rawAge !== null && rawAge !== undefined && !Number.isNaN(Number(rawAge))) {
          age = Number(rawAge);
        }
      } catch {
        age = "-";
      }

      let cleanDob = "-";
      try {
        const dob = formatPatientDateOfBirth(p.date_of_birth);
        cleanDob = dob && dob !== "—" ? dob : (p.date_of_birth || "-");
      } catch {
        cleanDob = p.date_of_birth || "-";
      }

      const contact = p.contact_number || "-";
      const address = p.address || "-";

      let cleanRegistered = "-";
      try {
        const registeredAt = formatPatientRegisteredAt(p.created_at);
        cleanRegistered = registeredAt && registeredAt !== "—" ? registeredAt : "-";
      } catch {
        cleanRegistered = p.created_at || "-";
      }

      let registeredBy = "-";
      try {
        registeredBy = getPatientRegistrarName(p, fallbackUsers);
      } catch {
        registeredBy = "-";
      }

      const facility = p.facility?.facility_name || p.facility || "-";

      sheetDataXml += `<c r="E${rowNum}" s="4"><v>${autoNum}</v></c>`;
      sheetDataXml += `<c r="F${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(name)}</t></is></c>`;
      sheetDataXml += `<c r="G${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(gender)}</t></is></c>`;
      if (typeof age === "number") {
        sheetDataXml += `<c r="H${rowNum}" s="4"><v>${age}</v></c>`;
      } else {
        sheetDataXml += `<c r="H${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(age)}</t></is></c>`;
      }
      sheetDataXml += `<c r="I${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(cleanDob)}</t></is></c>`;
      sheetDataXml += `<c r="J${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(contact)}</t></is></c>`;
      sheetDataXml += `<c r="K${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(address)}</t></is></c>`;
      sheetDataXml += `<c r="L${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(cleanRegistered)}</t></is></c>`;
      sheetDataXml += `<c r="M${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(registeredBy)}</t></is></c>`;
      sheetDataXml += `<c r="N${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(facility)}</t></is></c>`;
    } else {
      // Empty grid row preserving exact template border (s="4") and alignment
      sheetDataXml += `<c r="E${rowNum}" s="4"/><c r="F${rowNum}" s="4"/><c r="G${rowNum}" s="4"/><c r="H${rowNum}" s="4"/><c r="I${rowNum}" s="4"/><c r="J${rowNum}" s="4"/><c r="K${rowNum}" s="4"/><c r="L${rowNum}" s="4"/><c r="M${rowNum}" s="4"/><c r="N${rowNum}" s="4"/>`;
    }
    sheetDataXml += `</row>`;
  }

  xml = xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${sheetDataXml}</sheetData>`);
  xml = xml.replace(/<dimension ref="[^"]*"/, `<dimension ref="E3:N${5 + rowCount}"`);
  xml = xml.replace(/<selection activeCell="[^"]*" sqref="[^"]*"\/>/, `<selection activeCell="E5" sqref="E5"/>`);

  const endRow = Math.max(5 + rowCount, 100);
  const ignoredErrorsXml = `<ignoredErrors><ignoredError sqref="J6:J${endRow}" numberStoredAsText="1"/></ignoredErrors>`;
  if (xml.includes("<ignoredErrors>")) {
    xml = xml.replace(/<ignoredErrors>[\s\S]*?<\/ignoredErrors>/, ignoredErrorsXml);
  } else {
    xml = xml.replace("</worksheet>", `${ignoredErrorsXml}</worksheet>`);
  }
  return xml;
}

/**
 * Builds Sheet 2 (Archived patients) XML inside the template package.
 * Preserves:
 * - Row 3-4 merged title banner (E3:N4) with styles s="5" to s="10"
 * - Row 5 headers (E5:N5) with style s="1" (Amasis MT Pro Light 9pt Bold, thin border, centered)
 * - Exact Amasis MT Pro Light 9pt Regular, thin borders (s="4"), left aligned
 * - Dynamic adaptive column widths extending whenever content exceeds default width
 * - Standard row heights (no distortion)
 */
export function buildPatientArchivedSheetXml(originalXml, patients = [], fallbackUsers = []) {
  let xml = originalXml;

  // Dynamically adapt column widths if text in cells is longer than template defaults
  const colWidths = calculatePatientColumnWidths(patients, fallbackUsers);
  const colsXml = buildPatientColsXml(colWidths);
  xml = xml.replace(/<cols>[\s\S]*?<\/cols>/, colsXml);

  // Title rows 3 and 4 (merged E3:N4 in template)
  let sheetDataXml = `
  <row r="3" spans="5:14" x14ac:dyDescent="0.25">
    <c r="E3" s="5" t="s"><v>12</v></c>
    <c r="F3" s="6"/><c r="G3" s="6"/><c r="H3" s="6"/><c r="I3" s="6"/><c r="J3" s="6"/><c r="K3" s="6"/><c r="L3" s="6"/><c r="M3" s="6"/><c r="N3" s="7"/>
  </row>
  <row r="4" spans="5:14" x14ac:dyDescent="0.25">
    <c r="E4" s="8"/><c r="F4" s="9"/><c r="G4" s="9"/><c r="H4" s="9"/><c r="I4" s="9"/><c r="J4" s="9"/><c r="K4" s="9"/><c r="L4" s="9"/><c r="M4" s="9"/><c r="N4" s="10"/>
  </row>
  <row r="5" spans="5:14" x14ac:dyDescent="0.25">
    <c r="E5" s="1" t="s"><v>0</v></c>
    <c r="F5" s="1" t="s"><v>1</v></c>
    <c r="G5" s="1" t="s"><v>2</v></c>
    <c r="H5" s="1" t="s"><v>3</v></c>
    <c r="I5" s="1" t="s"><v>4</v></c>
    <c r="J5" s="1" t="s"><v>5</v></c>
    <c r="K5" s="1" t="s"><v>6</v></c>
    <c r="L5" s="1" t="s"><v>8</v></c>
    <c r="M5" s="1" t="s"><v>9</v></c>
    <c r="N5" s="1" t="s"><v>7</v></c>
  </row>`;

  const rowCount = Math.max(patients.length, 7);
  for (let i = 0; i < rowCount; i++) {
    const rowNum = 6 + i;
    const p = patients[i];

    sheetDataXml += `<row r="${rowNum}" spans="5:14" x14ac:dyDescent="0.25">`;
    if (p) {
      const autoNum = i + 1;
      let name = "-";
      try {
        name = formatPatientName(p);
      } catch {
        name = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" ") || "-";
      }

      const gender = p.gender || "-";

      let age = "-";
      try {
        const rawAge = calculateAge(p.date_of_birth);
        if (rawAge !== null && rawAge !== undefined && !Number.isNaN(Number(rawAge))) {
          age = Number(rawAge);
        }
      } catch {
        age = "-";
      }

      let cleanDob = "-";
      try {
        const dob = formatPatientDateOfBirth(p.date_of_birth);
        cleanDob = dob && dob !== "—" ? dob : (p.date_of_birth || "-");
      } catch {
        cleanDob = p.date_of_birth || "-";
      }

      const contact = p.contact_number || "-";
      const address = p.address || "-";

      let cleanRegistered = "-";
      try {
        const registeredAt = formatPatientRegisteredAt(p.created_at);
        cleanRegistered = registeredAt && registeredAt !== "—" ? registeredAt : "-";
      } catch {
        cleanRegistered = p.created_at || "-";
      }

      let registeredBy = "-";
      try {
        registeredBy = getPatientRegistrarName(p, fallbackUsers);
      } catch {
        registeredBy = "-";
      }

      const facility = p.facility?.facility_name || p.facility || "-";

      sheetDataXml += `<c r="E${rowNum}" s="4"><v>${autoNum}</v></c>`;
      sheetDataXml += `<c r="F${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(name)}</t></is></c>`;
      sheetDataXml += `<c r="G${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(gender)}</t></is></c>`;
      if (typeof age === "number") {
        sheetDataXml += `<c r="H${rowNum}" s="4"><v>${age}</v></c>`;
      } else {
        sheetDataXml += `<c r="H${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(age)}</t></is></c>`;
      }
      sheetDataXml += `<c r="I${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(cleanDob)}</t></is></c>`;
      sheetDataXml += `<c r="J${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(contact)}</t></is></c>`;
      sheetDataXml += `<c r="K${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(address)}</t></is></c>`;
      sheetDataXml += `<c r="L${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(cleanRegistered)}</t></is></c>`;
      sheetDataXml += `<c r="M${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(registeredBy)}</t></is></c>`;
      sheetDataXml += `<c r="N${rowNum}" s="4" t="inlineStr"><is><t>${escapeXml(facility)}</t></is></c>`;
    } else {
      // Empty grid row preserving exact template border (s="4") and alignment
      sheetDataXml += `<c r="E${rowNum}" s="4"/><c r="F${rowNum}" s="4"/><c r="G${rowNum}" s="4"/><c r="H${rowNum}" s="4"/><c r="I${rowNum}" s="4"/><c r="J${rowNum}" s="4"/><c r="K${rowNum}" s="4"/><c r="L${rowNum}" s="4"/><c r="M${rowNum}" s="4"/><c r="N${rowNum}" s="4"/>`;
    }
    sheetDataXml += `</row>`;
  }

  xml = xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${sheetDataXml}</sheetData>`);
  xml = xml.replace(/<dimension ref="[^"]*"/, `<dimension ref="E3:N${5 + rowCount}"`);
  xml = xml.replace(/<selection activeCell="[^"]*" sqref="[^"]*"\/>/, `<selection activeCell="E5" sqref="E5"/>`);

  const endRow = Math.max(5 + rowCount, 100);
  const ignoredErrorsXml = `<ignoredErrors><ignoredError sqref="J6:J${endRow}" numberStoredAsText="1"/></ignoredErrors>`;
  if (xml.includes("<ignoredErrors>")) {
    xml = xml.replace(/<ignoredErrors>[\s\S]*?<\/ignoredErrors>/, ignoredErrorsXml);
  } else {
    xml = xml.replace("</worksheet>", `${ignoredErrorsXml}</worksheet>`);
  }
  return xml;
}

/**
 * Builds the Excel XLSX binary buffer directly inside the user's official template package.
 * Guarantees 100% preservation of:
 * - Font face: Amasis MT Pro Light
 * - Font size: 9pt
 * - Thin cell border outlines on all table cells (s="4" and s="1")
 * - Content aligned to left (s="4") with headers centered (s="1")
 * - Automatically extended column widths when content is long
 * - Two distinct sheets: Sheet 1 "List" (Active), Sheet 2 "Archived" (Archived)
 */
export function buildPatientExcelBuffer({
  patients = [],
  activePatients = null,
  archivedPatients = null,
  fallbackUsers = [],
} = {}) {
  const cfb = getCfb();

  const activeList = Array.isArray(activePatients)
    ? activePatients
    : patients.filter((p) => !p.archived_at);

  const archivedList = Array.isArray(archivedPatients)
    ? archivedPatients
    : patients.filter((p) => Boolean(p.archived_at));

  if (!cfb || !PATIENT_TEMPLATE_BASE64) {
    const wb = buildPatientExcelWorkbook({
      activePatients: activeList,
      archivedPatients: archivedList,
      fallbackUsers,
    });
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }

  try {
    const zip = cfb.read(PATIENT_TEMPLATE_BASE64, { type: "base64" });
    const s1Entry =
      cfb.find(zip, "sheet1.xml") ||
      cfb.find(zip, "/xl/worksheets/sheet1.xml") ||
      cfb.find(zip, "xl/worksheets/sheet1.xml") ||
      zip.FileIndex?.find((f) => f?.name && (f.name === "sheet1.xml" || f.name.endsWith("/sheet1.xml") || f.name.endsWith("\\sheet1.xml")));

    const s2Entry =
      cfb.find(zip, "sheet2.xml") ||
      cfb.find(zip, "/xl/worksheets/sheet2.xml") ||
      cfb.find(zip, "xl/worksheets/sheet2.xml") ||
      zip.FileIndex?.find((f) => f?.name && (f.name === "sheet2.xml" || f.name.endsWith("/sheet2.xml") || f.name.endsWith("\\sheet2.xml")));

    if (!s1Entry || !s2Entry) {
      console.warn("Could not find worksheet entries in patient template zip, using workbook fallback");
      const wb = buildPatientExcelWorkbook({
        activePatients: activeList,
        archivedPatients: archivedList,
        fallbackUsers,
      });
      return XLSX.write(wb, { bookType: "xlsx", type: "array" });
    }


    const s1Xml = decodeXmlContent(s1Entry.content);
    const s2Xml = decodeXmlContent(s2Entry.content);

    const newS1Xml = buildPatientListSheetXml(s1Xml, activeList, fallbackUsers);
    const newS2Xml = buildPatientArchivedSheetXml(s2Xml, archivedList, fallbackUsers);

    s1Entry.content = new TextEncoder().encode(newS1Xml);
    s1Entry.size = s1Entry.content.length;

    s2Entry.content = new TextEncoder().encode(newS2Xml);
    s2Entry.size = s2Entry.content.length;

    return cfb.write(zip, { fileType: "zip", type: "array" });
  } catch (err) {
    console.error("Failed to inject into patient template CFB, falling back to workbook:", err);
    const wb = buildPatientExcelWorkbook({
      activePatients: activeList,
      archivedPatients: archivedList,
      fallbackUsers,
    });
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }
}

/**
 * Fallback workbook builder when binary CFB package is unavailable
 */
export function buildPatientExcelWorkbook({
  patients = [],
  activePatients = null,
  archivedPatients = null,
  fallbackUsers = [],
} = {}) {
  const activeList = Array.isArray(activePatients)
    ? activePatients
    : patients.filter((p) => !p.archived_at);

  const archivedList = Array.isArray(archivedPatients)
    ? archivedPatients
    : patients.filter((p) => Boolean(p.archived_at));

  let wb = null;
  try {
    if (PATIENT_TEMPLATE_BASE64) {
      wb = XLSX.read(PATIENT_TEMPLATE_BASE64, {
        type: "base64",
        cellStyles: true,
      });
    }
  } catch (err) {
    console.warn("Could not load patient base64 template, falling back to clean workbook:", err);
  }

  if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
    wb = XLSX.utils.book_new();
  }

  const populateSheet = (sheetName, list) => {
    let ws = wb.Sheets[sheetName];
    if (!ws) {
      ws = {};
      wb.Sheets[sheetName] = ws;
      if (!wb.SheetNames.includes(sheetName)) {
        wb.SheetNames.push(sheetName);
      }
    }
    const isArchived = sheetName === "Archived";
    const title = isArchived
      ? "VICENTE MENDIOLA CENTER FOR HEALTH (City Health Office)\r\nPatient List (Archived)"
      : "VICENTE MENDIOLA CENTER FOR HEALTH (City Health Office)\r\nPatient List";
    ws["E3"] = { t: "s", v: title, s: ws["E3"]?.s };
    const headers = [
      "No.",
      "Name",
      "Gender",
      "Age",
      "DOB",
      "Contact Number",
      "Address",
      "Registered",
      "Registered By",
      "Facility",
    ];
    const colLetters = ["E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];

    headers.forEach((h, idx) => {
      const cellRef = `${colLetters[idx]}5`;
      ws[cellRef] = { t: "s", v: h, s: ws[cellRef]?.s };
    });

    const rowHeights = [
      null,
      null,
      { hpt: 15 },
      { hpt: 15 },
      { hpt: 18 },
    ];

    const numRows = Math.max(list.length, 7);
    for (let idx = 0; idx < numRows; idx++) {
      const rowNum = 6 + idx;
      const p = list[idx];
      const templateRowRef = `E${Math.min(6 + idx, 12)}`;
      const baseStyle = ws[templateRowRef]?.s;

      if (p) {
        const rawAge = calculateAge(p.date_of_birth);
        const ageVal =
          rawAge !== null && rawAge !== undefined && !Number.isNaN(Number(rawAge))
            ? Number(rawAge)
            : "-";
        const dob = formatPatientDateOfBirth(p.date_of_birth);
        const regAt = formatPatientRegisteredAt(p.created_at);
        const name = formatPatientName(p);
        const regBy = getPatientRegistrarName(p, fallbackUsers);
        const facName = p.facility?.facility_name || p.facility || "-";

        ws[`E${rowNum}`] = { t: "n", v: idx + 1, s: baseStyle };
        ws[`F${rowNum}`] = { t: "s", v: name, s: baseStyle };
        ws[`G${rowNum}`] = { t: "s", v: p.gender || "-", s: baseStyle };
        ws[`H${rowNum}`] =
          typeof ageVal === "number" ? { t: "n", v: ageVal, s: baseStyle } : { t: "s", v: ageVal, s: baseStyle };
        ws[`I${rowNum}`] = {
          t: "s",
          v: dob && dob !== "—" ? dob : p.date_of_birth || "-",
          s: baseStyle,
        };
        ws[`J${rowNum}`] = { t: "s", v: p.contact_number || "-", s: baseStyle };
        ws[`K${rowNum}`] = { t: "s", v: p.address || "-", s: baseStyle };
        ws[`L${rowNum}`] = { t: "s", v: regAt && regAt !== "—" ? regAt : "-", s: baseStyle };
        ws[`M${rowNum}`] = { t: "s", v: regBy, s: baseStyle };
        ws[`N${rowNum}`] = {
          t: "s",
          v: facName,
          s: baseStyle,
        };
        rowHeights.push({ hpt: 18 });
      } else {
        ws[`E${rowNum}`] = { t: "s", v: "", s: baseStyle };
        rowHeights.push({ hpt: 18 });
      }
    }

    const colWidths = calculatePatientColumnWidths(list, fallbackUsers);

    ws["!ref"] = `E3:N${5 + numRows}`;
    if (!ws["!merges"] || ws["!merges"].length === 0) {
      ws["!merges"] = [{ s: { r: 2, c: 4 }, e: { r: 3, c: 13 } }];
    }
    ws["!rows"] = rowHeights;
    ws["!cols"] = [
      null, null, null, null,
      { wch: colWidths.E }, // E: No.
      { wch: colWidths.F }, // F: Name
      { wch: colWidths.G }, // G: Gender
      { wch: colWidths.H }, // H: Age
      { wch: colWidths.I }, // I: DOB
      { wch: colWidths.J }, // J: Contact Number
      { wch: colWidths.K }, // K: Address
      { wch: colWidths.L }, // L: Registered
      { wch: colWidths.M }, // M: Registered By
      { wch: colWidths.N }, // N: Facility
    ];
    return ws;
  };

  populateSheet("List", activeList);
  populateSheet("Archived", archivedList);
  return wb;
}

/**
 * Triggers Excel file export download for the Patient Registry.
 */
export async function exportPatientsExcel({
  patients = [],
  activePatients = null,
  archivedPatients = null,
  fallbackUsers = [],
  facilityName = "",
} = {}) {
  const buffer = buildPatientExcelBuffer({
    patients,
    activePatients,
    archivedPatients,
    fallbackUsers,
  });

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateKey = `${year}-${month}-${day}`;

  const prefix = facilityName ? `${facilityName.replace(/\s+/g, "_")}_` : "";
  const filename = `${prefix}Patient_List_${dateKey}.xlsx`;

  const totalPatients =
    (activePatients ? activePatients.length : patients.filter((p) => !p.archived_at).length) +
    (archivedPatients ? archivedPatients.length : patients.filter((p) => Boolean(p.archived_at)).length);

  return downloadExportFile({
    filename,
    buffer,
    format: "xlsx",
    recordCount: totalPatients,
  });
}
