import assert from "node:assert/strict";
import test from "node:test";

import {
  getNotificationCategory,
  getNotificationPanelLabel,
  getVisibleNotifications,
  isFacilityNotification,
  matchesNotificationDateFilter,
  matchesNotificationFilters,
} from "./notificationUtils.js";

const notifications = [
  {
    id: "admin-system",
    user_id: "admin",
    title: "Account Approved",
    message: "Your PRDS account has been approved.",
    is_read: false,
    created_at: "2026-07-26T02:00:00.000Z",
    recipient_role: "PHARMA_II",
    recipient_facility_id: "cho",
    facility_name: "City Of Naga Health Office",
  },
  {
    id: "pharma-request",
    user_id: "pharma",
    title: "Request Approved",
    message: "Medicine request from Palompon District Hospital was approved.",
    is_read: true,
    created_at: "2026-07-25T02:00:00.000Z",
    recipient_role: "PHARMA_I",
    recipient_facility_id: "cho",
    facility_name: "City Of Naga Health Office",
  },
  {
    id: "bhw-low-stock-own-facility",
    user_id: "bhw-one",
    title: "Critical Low Stock",
    message: "Insulin Regular is down to 20 vials.",
    is_read: false,
    created_at: "2026-07-24T02:00:00.000Z",
    recipient_role: "BHW",
    recipient_facility_id: "hc-one",
    facility_name: "Tinaan",
  },
  {
    id: "bhw-transfer-other-facility",
    user_id: "bhw-two",
    title: "Transfer Completed",
    message: "Stock transfer completed.",
    is_read: false,
    created_at: "2026-07-23T02:00:00.000Z",
    recipient_role: "BHW",
    recipient_facility_id: "hc-two",
    facility_name: "LUTAC",
  },
];

test("detects notification categories from title and message", () => {
  assert.equal(getNotificationCategory(notifications[2]), "low_stock");
  assert.equal(getNotificationCategory(notifications[1]), "requests");
  assert.equal(getNotificationCategory(notifications[3]), "transfers");
  assert.equal(getNotificationCategory(notifications[0]), "system");
});

test("detects facility-related notifications", () => {
  assert.equal(isFacilityNotification(notifications[1]), true);
  assert.equal(isFacilityNotification(notifications[2]), true);
  assert.equal(isFacilityNotification(notifications[0]), false);
});

test("Pharma II can view all notifications", () => {
  assert.deepEqual(
    getVisibleNotifications(notifications, { id: "admin", role: "PHARMA_II" }).map(
      (notification) => notification.id
    ),
    [
      "admin-system",
      "pharma-request",
      "bhw-low-stock-own-facility",
      "bhw-transfer-other-facility",
    ]
  );
});

test("Pharma I can view own notifications and all facility notifications", () => {
  assert.deepEqual(
    getVisibleNotifications(notifications, { id: "pharma", role: "PHARMA_I" }).map(
      (notification) => notification.id
    ),
    [
      "pharma-request",
      "bhw-low-stock-own-facility",
      "bhw-transfer-other-facility",
    ]
  );
});

test("BHW can view own notifications and own facility notifications", () => {
  assert.deepEqual(
    getVisibleNotifications(notifications, {
      id: "bhw-one",
      role: "BHW",
      facility_id: "hc-one",
    }).map((notification) => notification.id),
    ["bhw-low-stock-own-facility"]
  );
});

test("matches keyword, category, status, role, and facility filters", () => {
  assert.equal(
    matchesNotificationFilters(notifications[2], {
      category: "low_stock",
      currentUserId: "bhw-one",
      facilityId: "hc-one",
      keyword: "insulin",
      readFilter: "unread",
      roleFilter: "BHW",
    }),
    true
  );

  assert.equal(
    matchesNotificationFilters(notifications[2], {
      category: "requests",
      currentUserId: "bhw-one",
      facilityId: "ALL",
      keyword: "",
      readFilter: "all",
      roleFilter: "ALL",
    }),
    false
  );
});

test("matches notification dates", () => {
  assert.equal(
    matchesNotificationDateFilter(notifications[0], {
      dateMode: "specific",
      specificDate: "2026-07-26",
    }),
    true
  );
  assert.equal(
    matchesNotificationDateFilter(notifications[3], {
      dateMode: "range",
      endDate: "2026-07-24",
      startDate: "2026-07-22",
    }),
    true
  );
});

test("builds notification panel label from filters", () => {
  assert.equal(
    getNotificationPanelLabel({
      category: "facility",
      dateMode: "range",
      endDate: "2026-07-26",
      facilityId: "hc-one",
      facilities: [{ id: "hc-one", facility_name: "Tinaan" }],
      readFilter: "unread",
      roleFilter: "BHW",
      roleOptions: [
        { value: "ALL", label: "All visible roles" },
        { value: "BHW", label: "Barangay Health Worker" },
      ],
      startDate: "2026-07-20",
    }),
    "Facility Notifications - Unread - Barangay Health Worker - Tinaan - 2026-07-20 to 2026-07-26"
  );
});
