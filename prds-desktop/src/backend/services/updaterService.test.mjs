import test from "node:test";
import assert from "node:assert/strict";

import {
  formatBytes,
  formatReleaseDate,
  getAppVersion,
  checkForUpdates,
  downloadAndInstallUpdate,
} from "./updaterService.js";

test("formatBytes returns correct units and human readable sizes", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(null), "0 B");
  assert.equal(formatBytes(-100), "0 B");
  assert.equal(formatBytes(512), "512.0 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1048576), "1.0 MB");
  assert.equal(formatBytes(15728640), "15.0 MB");
  assert.equal(formatBytes(1073741824), "1.0 GB");
});

test("formatReleaseDate handles ISO dates and invalid inputs", () => {
  assert.equal(formatReleaseDate(""), "");
  assert.equal(formatReleaseDate(null), "");
  
  const formatted = formatReleaseDate("2026-10-31T09:00:00Z");
  assert.ok(formatted.includes("2026"));
  assert.ok(formatted.toLowerCase().includes("october"));

  assert.equal(formatReleaseDate("invalid-date-format"), "invalid-date-format");
});

test("getAppVersion returns fallback in Node environment", async () => {
  const version = await getAppVersion();
  assert.equal(typeof version, "string");
  assert.ok(version.length > 0);
});

test("checkForUpdates returns non-Tauri status when running outside Tauri", async () => {
  const result = await checkForUpdates();
  assert.equal(result.isTauri, false);
  assert.equal(result.available, false);
  assert.ok(result.message);
});

test("downloadAndInstallUpdate rejects if rawUpdate is missing", async () => {
  await assert.rejects(
    async () => {
      await downloadAndInstallUpdate(null);
    },
    { message: /Missing update information/ }
  );
});

test("downloadAndInstallUpdate tracks download lifecycle and progress events", async () => {
  const progressLogs = [];

  const mockUpdate = {
    downloadAndInstall: async (callback) => {
      // Simulate Started
      callback({
        event: "Started",
        data: { contentLength: 2000 },
      });
      // Simulate Progress 1
      callback({
        event: "Progress",
        data: { chunkLength: 1000 },
      });
      // Simulate Progress 2
      callback({
        event: "Progress",
        data: { chunkLength: 1000 },
      });
      // Simulate Finished
      callback({
        event: "Finished",
      });
    },
  };

  const success = await downloadAndInstallUpdate(mockUpdate, (prog) => {
    progressLogs.push(prog);
  });

  assert.equal(success, true);
  assert.ok(progressLogs.length >= 4);
  assert.equal(progressLogs[0].status, "starting");
  assert.equal(progressLogs[1].status, "downloading");
  assert.equal(progressLogs[1].percent, 0);
  assert.equal(progressLogs[2].status, "downloading");
  assert.equal(progressLogs[2].percent, 50);
  assert.equal(progressLogs[3].status, "downloading");
  assert.equal(progressLogs[3].percent, 100);
  assert.equal(progressLogs[progressLogs.length - 1].status, "ready_to_restart");
});
