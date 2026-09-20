import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDate,
  formatDateTime,
  getExpiryStatus,
  getStockStatus,
} from "./inventoryUtils.js";

test("formatDateTime renders a valid date", () => {
  assert.equal(formatDateTime(new Date(2026, 7, 9, 10, 30)).includes("2026"), true);
  assert.equal(formatDateTime("2026-08-09T10:30:00").includes("Aug"), true);
});

test("formatDateTime returns a placeholder for invalid dates", () => {
  assert.equal(formatDateTime(null), "—");
  assert.equal(formatDateTime(undefined), "—");
  assert.equal(formatDateTime("not-a-date"), "—");
  assert.equal(formatDateTime("2026-13-45"), "—");
});

test("formatDate renders a valid date", () => {
  assert.equal(formatDate(new Date(2026, 7, 9).toDateString()), "08/09/2026");
});

test("formatDate returns a placeholder for invalid dates", () => {
  assert.equal(formatDate(""), "-");
  assert.equal(formatDate("not-a-date"), "-");
  assert.equal(formatDate("2026-13-45"), "-");
});

test("getStockStatus tiers quantities against thresholds", () => {
  assert.equal(getStockStatus({ quantity: 0, threshold: 100 }).key, "CRITICAL");
  assert.equal(getStockStatus({ quantity: 20, threshold: 100 }).key, "CRITICAL");
  assert.equal(getStockStatus({ quantity: 80, threshold: 100 }).key, "LOW");
  assert.equal(getStockStatus({ quantity: 200, threshold: 100 }).key, "NORMAL");
});

test("getExpiryStatus treats missing or invalid dates as no date", () => {
  assert.equal(getExpiryStatus({ expiration_date: null }).key, "NO_DATE");
  assert.equal(getExpiryStatus({ expiration_date: "not-a-date" }).key, "NO_DATE");
  assert.equal(getExpiryStatus({ expiration_date: "2026-13-45" }).key, "NO_DATE");
});
