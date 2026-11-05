/**
 * PRDS Desktop Updater Service
 * Powered by @tauri-apps/plugin-updater and @tauri-apps/plugin-process.
 * Safely handles update checks, download progress tracking, cryptographic verification,
 * and seamless application relaunch. Fallback-safe for browser development.
 */

import { isTauriEnvironment } from "../database/sqliteClient.js";

const DEFAULT_FALLBACK_VERSION = "1.0.0";

/**
 * Format raw byte size into human readable string (e.g., "14.2 MB")
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Format release date string into human readable localized string
 * @param {string|Date} dateString
 * @returns {string}
 */
export function formatReleaseDate(dateString) {
  if (!dateString) return "";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

/**
 * Retrieve the current application version dynamically from Tauri or package manifest
 * @returns {Promise<string>}
 */
export async function getAppVersion() {
  if (isTauriEnvironment()) {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      const v = await getVersion();
      if (v) return v;
    } catch (err) {
      console.warn("Unable to get version from @tauri-apps/api/app:", err);
    }
  }
  return DEFAULT_FALLBACK_VERSION;
}

/**
 * Check if a newer version of the application is available.
 * Queries the release endpoint configured in tauri.conf.json.
 * 
 * @param {object} [options]
 * @param {number} [options.timeout=15000]
 * @returns {Promise<{
 *   isTauri: boolean,
 *   available: boolean,
 *   currentVersion: string,
 *   newVersion?: string,
 *   releaseDate?: string,
 *   releaseNotes?: string,
 *   rawUpdate?: any,
 *   error?: string
 * }>}
 */
export async function checkForUpdates(options = {}) {
  const currentVersion = await getAppVersion();

  if (!isTauriEnvironment()) {
    return {
      isTauri: false,
      available: false,
      currentVersion,
      message: "In-app updates are available when running the installed PRDS Desktop application.",
    };
  }

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check({
      timeout: options.timeout || 15000,
    });

    if (!update) {
      return {
        isTauri: true,
        available: false,
        currentVersion,
        message: "You are currently running the latest version of PRDS Naga.",
      };
    }

    return {
      isTauri: true,
      available: true,
      currentVersion: update.currentVersion || currentVersion,
      newVersion: update.version,
      releaseDate: update.date || "",
      releaseNotes: update.body || "Performance enhancements, bug fixes, and security patches.",
      rawUpdate: update,
    };
  } catch (err) {
    console.error("PRDS updater check failed:", err);
    const message = err?.message || String(err);
    let friendlyError = "Unable to check for updates.";

    if (
      message.toLowerCase().includes("failed to fetch") ||
      message.toLowerCase().includes("network") ||
      message.toLowerCase().includes("could not resolve") ||
      message.toLowerCase().includes("dns")
    ) {
      friendlyError = "Unable to reach update servers. Please verify your internet connection and try again.";
    } else if (message.toLowerCase().includes("404")) {
      friendlyError = "No update manifest published yet on GitHub Releases. Current version is up to date.";
    } else {
      friendlyError = `Update check failed: ${message}`;
    }

    return {
      isTauri: true,
      available: false,
      currentVersion,
      error: friendlyError,
    };
  }
}

/**
 * Download and install the update package.
 * Invokes onProgress callback with download statistics.
 * 
 * @param {object} rawUpdate - Update instance returned by checkForUpdates()
 * @param {(progress: {
 *   status: 'starting'|'downloading'|'installing'|'ready_to_restart'|'error',
 *   percent: number,
 *   downloadedBytes: number,
 *   totalBytes: number,
 *   formattedProgress: string,
 *   error?: string
 * }) => void} [onProgress]
 * @returns {Promise<boolean>}
 */
export async function downloadAndInstallUpdate(rawUpdate, onProgress) {
  if (!rawUpdate) {
    throw new Error("Missing update information. Please check for updates first.");
  }

  let totalBytes = 0;
  let downloadedBytes = 0;

  try {
    if (typeof onProgress === "function") {
      onProgress({
        status: "starting",
        percent: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        formattedProgress: "Connecting to update server...",
      });
    }

    await rawUpdate.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started": {
          totalBytes = event.data?.contentLength || 0;
          if (typeof onProgress === "function") {
            onProgress({
              status: "downloading",
              percent: 0,
              downloadedBytes: 0,
              totalBytes,
              formattedProgress: totalBytes > 0
                ? `0% of ${formatBytes(totalBytes)}`
                : "Starting download...",
            });
          }
          break;
        }

        case "Progress": {
          downloadedBytes += event.data?.chunkLength || 0;
          const percent = totalBytes > 0
            ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
            : 0;

          if (typeof onProgress === "function") {
            onProgress({
              status: "downloading",
              percent,
              downloadedBytes,
              totalBytes,
              formattedProgress: totalBytes > 0
                ? `${percent}% (${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)})`
                : `${formatBytes(downloadedBytes)} downloaded`,
            });
          }
          break;
        }

        case "Finished": {
          if (typeof onProgress === "function") {
            onProgress({
              status: "installing",
              percent: 100,
              downloadedBytes: totalBytes || downloadedBytes,
              totalBytes: totalBytes || downloadedBytes,
              formattedProgress: "Verifying signature and applying update...",
            });
          }
          break;
        }

        default:
          break;
      }
    });

    if (typeof onProgress === "function") {
      onProgress({
        status: "ready_to_restart",
        percent: 100,
        downloadedBytes: totalBytes || downloadedBytes,
        totalBytes: totalBytes || downloadedBytes,
        formattedProgress: "Update installed! Restart PRDS Naga to complete.",
      });
    }

    return true;
  } catch (err) {
    console.error("PRDS updater download/install error:", err);
    const errorMsg = err?.message || String(err);
    if (typeof onProgress === "function") {
      onProgress({
        status: "error",
        percent: 0,
        downloadedBytes,
        totalBytes,
        formattedProgress: "Installation interrupted.",
        error: errorMsg,
      });
    }
    throw err;
  }
}

/**
 * Relaunch the desktop application after applying an update.
 * @returns {Promise<void>}
 */
export async function restartApp() {
  if (isTauriEnvironment()) {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (err) {
      console.error("Failed to relaunch application via plugin-process:", err);
      // Fallback to native window reload or exit
      try {
        const { exit } = await import("@tauri-apps/plugin-process");
        await exit(0);
      } catch (exitErr) {
        window.location.reload();
      }
    }
  } else {
    window.location.reload();
  }
}

let hasRunBackgroundCheck = false;

/**
 * Perform a one-time quiet background check for updates after startup.
 * If an update is detected, fires a `prds-update-available` custom event.
 * 
 * @param {number} [delayMs=15000]
 */
export function initBackgroundUpdateCheck(delayMs = 15000) {
  if (hasRunBackgroundCheck || !isTauriEnvironment()) return;
  hasRunBackgroundCheck = true;

  setTimeout(async () => {
    try {
      const result = await checkForUpdates();
      if (result && result.available && result.rawUpdate) {
        if (typeof window !== "undefined") {
          window.__PRDS_PENDING_UPDATE__ = result;
          window.dispatchEvent(
            new CustomEvent("prds-update-available", { detail: result })
          );
        }
      }
    } catch (err) {
      console.warn("PRDS background update check completed without notification:", err);
    }
  }, delayMs);
}

