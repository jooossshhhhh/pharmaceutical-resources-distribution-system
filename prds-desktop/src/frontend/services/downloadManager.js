import * as XLSX from "xlsx";

const PREFERENCES_STORAGE_KEY = "prds_system_preferences";
const RECENT_EXPORTS_STORAGE_KEY = "prds_recent_exports";
const DEFAULT_PREFERENCES = {
  downloadPath: "Downloads\\PRDS_Exports",
  defaultFormat: "xlsx",
  notifyOnExport: true,
};

function loadStoredRecentExports() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(RECENT_EXPORTS_STORAGE_KEY) : null;
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      return list.map((item) => ({
        ...item,
        timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
        blob: null,
      }));
    }
  } catch (err) {
    console.warn("Failed to load recent exports from storage:", err);
  }
  return [];
}

function persistRecentExports(exportsList) {
  try {
    if (typeof localStorage === "undefined") return;
    const serializable = (exportsList || []).map((item) => {
      const { blob, ...rest } = item;
      return rest;
    });
    localStorage.setItem(RECENT_EXPORTS_STORAGE_KEY, JSON.stringify(serializable));
  } catch (err) {
    console.warn("Failed to persist recent exports:", err);
  }
}

/**
 * Generates the next available filename by appending (1), (2), etc.
 * if the base name already exists in the given list of filenames.
 * Properly handles cases where filename already has an increment suffix,
 * avoiding duplicate suffixes like "report (1) (1).xlsx".
 */
export function getNextAvailableFilename(filename, existingFilenames = []) {
  if (!filename || typeof filename !== "string") {
    return "prds-export";
  }

  const existingSet = new Set(
    (existingFilenames || [])
      .filter((name) => typeof name === "string" && name.trim())
      .map((name) => name.trim().toLowerCase())
  );

  const cleanFilename = filename.trim();
  if (!existingSet.has(cleanFilename.toLowerCase())) {
    return cleanFilename;
  }

  const dotIndex = cleanFilename.lastIndexOf(".");
  const stem = dotIndex > 0 ? cleanFilename.slice(0, dotIndex) : cleanFilename;
  const ext = dotIndex > 0 ? cleanFilename.slice(dotIndex) : "";

  // Strip existing (N) suffix to get root
  // e.g. "Request_Issuance_Slip_2026-09-26 (1)" -> "Request_Issuance_Slip_2026-09-26"
  const counterMatch = stem.match(/^(.*?)(?:\s+\((\d+)\))$/);
  const baseRoot = counterMatch ? counterMatch[1].trim() : stem;

  let counter = 1;
  while (true) {
    const candidate = `${baseRoot} (${counter})${ext}`;
    if (!existingSet.has(candidate.toLowerCase())) {
      return candidate;
    }
    counter += 1;
  }
}

let recentExports = loadStoredRecentExports();
let isExporting = false;
let openingExportState = null;

export function getOpeningExportState() {
  return openingExportState;
}

export function clearOpeningExportState() {
  openingExportState = null;
  dispatchExportEvent("export-opening-status", null);
}

export function setOpeningExportState(nextState) {
  openingExportState = nextState;
  dispatchExportEvent("export-opening-status", nextState);
}

export function getDownloadPreferences() {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      defaultFormat: "xlsx",
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function saveDownloadPreferences(nextPreferences) {
  try {
    const current = getDownloadPreferences();
    const updated = {
      ...current,
      ...nextPreferences,
      defaultFormat: "xlsx",
    };
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(updated));
    dispatchExportEvent("preferences-changed", updated);
    return updated;
  } catch (err) {
    console.warn("Failed to save download preferences:", err);
    return getDownloadPreferences();
  }
}

/**
 * Builds an export payload (Blob, normalized filename, and format).
 * Always standardizes on Microsoft Excel (.xlsx) format.
 */
export function buildExportPayload({
  filename = "prds-export",
  csv = "",
  headers = [],
  rows = [],
  buffer = null,
  blob = null,
  format,
} = {}) {
  const cleanBase = filename.replace(/\.(csv|xlsx|xls)$/i, "");
  const finalFilename = `${cleanBase}.xlsx`;

  if (buffer) {
    const excelBlob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    return {
      filename: finalFilename,
      format: "EXCEL",
      blob: excelBlob,
      size: excelBlob.size,
    };
  }

  if (blob) {
    return {
      filename: finalFilename,
      format: "EXCEL",
      blob,
      size: blob.size,
    };
  }

  let workbook;

  if (headers.length > 0 || rows.length > 0) {
    const data = headers.length > 0 ? [headers, ...rows] : rows;
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "PRDS Export");
  } else if (csv) {
    workbook = XLSX.read(csv, { type: "string" });
  } else {
    const worksheet = XLSX.utils.aoa_to_sheet([["No data"]]);
    workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "PRDS Export");
  }

  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const excelBlob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  return {
    filename: finalFilename,
    format: "EXCEL",
    blob: excelBlob,
    size: excelBlob.size,
  };
}

/**
 * Detects if app is running inside the Tauri native desktop container
 */
export function isTauriEnvironment() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

/**
 * Converts ArrayBuffer or Uint8Array to base64 string
 */
export function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Saves exported file directly to desktop export directory when running in Tauri
 */
export async function saveExportToDisk({ filename, arrayBuffer = null, blob = null }) {
  if (!isTauriEnvironment()) return null;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    let buf = arrayBuffer;
    if (!buf && blob) {
      buf = await blob.arrayBuffer();
    }
    if (!buf) return null;

    const base64Data = arrayBufferToBase64(buf);
    const prefs = getDownloadPreferences();
    const filePath = await invoke("save_export_file", {
      filename,
      base64Data,
      customFolder: prefs.downloadPath || "Downloads\\PRDS_Exports",
    });
    return filePath;
  } catch (err) {
    console.warn("Failed to save export to disk via Tauri:", err);
    return null;
  }
}

/**
 * Downloads a table/data export in Microsoft Excel format (.xlsx)
 * and registers it in the recent exports queue.
 */
export function downloadExportFile({
  filename = "prds-export",
  csv = "",
  headers = [],
  rows = [],
  buffer = null,
  blob = null,
  format,
  recordCount = null,
} = {}) {
  const payload = buildExportPayload({ filename, csv, headers, rows, buffer, blob, format });

  const existingNames = recentExports.map((e) => e.filename);
  const uniqueFilename = getNextAvailableFilename(payload.filename, existingNames);
  payload.filename = uniqueFilename;

  const exportItem = registerExport({
    filename: payload.filename,
    format: payload.format,
    size: payload.size,
    blob: payload.blob,
    recordCount,
  });

  if (isTauriEnvironment()) {
    saveExportToDisk({
      filename: payload.filename,
      blob: payload.blob,
    })
      .then((filePath) => {
        if (filePath) {
          exportItem.filePath = filePath;
          const diskFilename = filePath.split(/[/\\]/).pop();
          if (diskFilename && diskFilename !== exportItem.filename) {
            exportItem.filename = diskFilename;
            persistRecentExports(recentExports);
            dispatchExportEvent("export-registered", {
              exportItem,
              allExports: recentExports,
            });
          }
        }
      })
      .catch((err) => {
        console.warn("Could not save to disk via Tauri:", err);
      });
  } else if (typeof document !== "undefined") {
    // Only trigger browser download if not running in Tauri desktop
    const url = URL.createObjectURL(payload.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = payload.filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return exportItem;
}

export async function pickDownloadFolder() {
  // 1. Try Tauri native dialog first (real Windows File Explorer dialog, NOT Chromium web sandbox!)
  if (typeof window !== "undefined" && (window.__TAURI_INTERNALS__ || window.__TAURI__)) {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select PRDS Download Folder",
      });
      if (selected) {
        return { path: selected, isNative: true };
      }
      return { error: "ABORTED", message: "Folder selection was cancelled." };
    } catch (err) {
      console.info("Tauri native dialog not yet initialized or fallback needed:", err?.message || err);
    }
  }

  // 2. Avoid Chromium's window.showDirectoryPicker which shows the black native desktop error.
  // Directly trigger the readable PRDS system modal.
  return { needsModal: true };
}

export function getRecentExports() {
  return [...recentExports];
}

export function getIsExporting() {
  return isExporting;
}

export function setIsExporting(exporting) {
  isExporting = Boolean(exporting);
  dispatchExportEvent("export-status-changed", { isExporting });
}

export function clearRecentExports() {
  recentExports = [];
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(RECENT_EXPORTS_STORAGE_KEY);
    }
  } catch (err) {
    console.warn("Failed to clear recent exports storage:", err);
  }
  dispatchExportEvent("exports-cleared", []);
}

function detectFormat(filename = "") {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "EXCEL";
  if (lower.endsWith(".csv")) return "CSV";
  if (lower.endsWith(".json")) return "JSON";
  if (lower.endsWith(".pdf")) return "PDF";
  return "FILE";
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function registerExport({
  filename = "export.xlsx",
  format,
  size = 0,
  blob = null,
  url = null,
  filePath = null,
  recordCount = null,
} = {}) {
  const prefs = getDownloadPreferences();
  const fileFormat = format || detectFormat(filename);

  const exportItem = {
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename,
    format: fileFormat,
    size: typeof size === "number" ? formatBytes(size) : size,
    timestamp: new Date(),
    timeLabel: new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date()),
    downloadPath: prefs.downloadPath,
    blob,
    url,
    filePath,
    recordCount,
  };

  // Keep top 20 recent exports - filter by ID so different versions/downloads of exports coexist cleanly
  recentExports = [exportItem, ...recentExports.filter((e) => e.id !== exportItem.id)].slice(0, 20);
  persistRecentExports(recentExports);

  dispatchExportEvent("export-registered", {
    exportItem,
    allExports: recentExports,
  });

  return exportItem;
}

/**
 * Views or opens the export:
 * - In desktop mode (Tauri):
 *   Directly opens the saved file in Microsoft Excel or compatible spreadsheet app.
 *   If no Excel/spreadsheet app is detected, prompts with the Windows "How do you want to open this file?" (Open With) selection dialog.
 *   Dispatches progress state ("export-opening-status") so the UI can display a loading/progress screen with waiting context.
 *   NEVER re-downloads the file!
 * - In browser mode:
 *   Opens in a new tab if supported, never triggering a download prompt.
 */
export async function viewExport(exportItem, { forceOpenWith = false } = {}) {
  if (!exportItem) return;

  setOpeningExportState({
    exportItem,
    status: "preparing",
    progress: 25,
    message: "Preparing export file...",
    forceOpenWith,
    error: null,
  });

  try {
    if (isTauriEnvironment()) {
      setOpeningExportState({
        exportItem,
        status: "preparing",
        progress: 45,
        message: "Verifying file on disk...",
        forceOpenWith,
        error: null,
      });

      const { invoke } = await import("@tauri-apps/api/core");
      let targetPath = exportItem.filePath;

      // Ensure file exists on disk
      if (!targetPath && exportItem.blob) {
        targetPath = await saveExportToDisk({
          filename: exportItem.filename,
          blob: exportItem.blob,
        });
        if (targetPath) {
          exportItem.filePath = targetPath;
          const diskFilename = targetPath.split(/[/\\]/).pop();
          if (diskFilename && diskFilename !== exportItem.filename) {
            exportItem.filename = diskFilename;
            persistRecentExports(recentExports);
            dispatchExportEvent("export-registered", {
              exportItem,
              allExports: recentExports,
            });
          }
        }
      }

      setOpeningExportState({
        exportItem,
        status: "launching",
        progress: 75,
        message: forceOpenWith
          ? "Launching Windows application selector..."
          : "Detecting Microsoft Excel & launching...",
        forceOpenWith,
        error: null,
      });

      if (targetPath) {
        // Subtle pause so user perceives the progress context smoothly
        await new Promise((resolve) => setTimeout(resolve, 400));

        await invoke("view_export_file", {
          filePath: targetPath,
          forceOpenWith: Boolean(forceOpenWith),
        });

        setOpeningExportState({
          exportItem,
          status: "success",
          progress: 100,
          message: forceOpenWith
            ? "Application selector opened."
            : "File opened in spreadsheet application.",
          forceOpenWith,
          error: null,
        });

        // Automatically clear after a brief success confirmation
        setTimeout(() => {
          if (openingExportState?.exportItem?.id === exportItem.id) {
            clearOpeningExportState();
          }
        }, 850);
        return;
      }
    }

    // Web fallback: never re-download, simply open in a new tab
    setOpeningExportState({
      exportItem,
      status: "launching",
      progress: 85,
      message: "Opening file in browser...",
      forceOpenWith,
      error: null,
    });

    await new Promise((resolve) => setTimeout(resolve, 350));

    if (exportItem.blob) {
      if (typeof URL !== "undefined" && typeof window !== "undefined" && window.open) {
        const url = URL.createObjectURL(exportItem.blob);
        window.open(url, "_blank");
      }
    } else if (exportItem.url) {
      if (typeof window !== "undefined" && window.open) {
        window.open(exportItem.url, "_blank");
      }
    }

    setOpeningExportState({
      exportItem,
      status: "success",
      progress: 100,
      message: "File opened.",
      forceOpenWith,
      error: null,
    });

    setTimeout(() => {
      if (openingExportState?.exportItem?.id === exportItem.id) {
        clearOpeningExportState();
      }
    }, 700);
  } catch (err) {
    console.warn("Failed to view export:", err);
    setOpeningExportState({
      exportItem,
      status: "error",
      progress: 100,
      message: err?.message || "Failed to open export file.",
      error: err?.message || String(err),
      forceOpenWith,
    });
  }
}

/**
 * Explicitly launches the Windows "Open with..." dialog for the export
 */
export async function openWithExport(exportItem) {
  if (!exportItem) return;
  return viewExport(exportItem, { forceOpenWith: true });
}


export function reDownloadExport(exportItem) {
  if (!exportItem) return;

  if (exportItem.url) {
    const anchor = document.createElement("a");
    anchor.href = exportItem.url;
    anchor.download = exportItem.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  }

  if (exportItem.blob) {
    const url = URL.createObjectURL(exportItem.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportItem.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

function dispatchExportEvent(type, payload) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("prds:download-manager-event", {
        detail: { type, payload, timestamp: Date.now() },
      })
    );
  }
}

export function subscribeExports(callback) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event) => {
    callback(event.detail);
  };

  window.addEventListener("prds:download-manager-event", handler);

  return () => {
    window.removeEventListener("prds:download-manager-event", handler);
  };
}

if (typeof window !== "undefined") {
  window.__prdsRegisterExport = registerExport;
  window.__prdsDownloadExportFile = downloadExportFile;
  window.__prdsViewExport = viewExport;
  window.__prdsClearOpeningExportState = clearOpeningExportState;
  window.__prdsGetNextAvailableFilename = getNextAvailableFilename;
  window.addEventListener("prds:register-export", (event) => {
    if (event?.detail) {
      registerExport(event.detail);
    }
  });
}

