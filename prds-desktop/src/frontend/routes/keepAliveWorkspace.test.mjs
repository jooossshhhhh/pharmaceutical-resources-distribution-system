import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKSPACE_ROUTE_CONFIG,
  WORKSPACE_ROUTE_ALIASES,
  resolveCanonicalPath,
  isRouteAuthorized,
} from "./workspaceRouteConfig.js";

test("WORKSPACE_ROUTE_CONFIG contains all core operational modules", () => {
  const paths = WORKSPACE_ROUTE_CONFIG.map((route) => route.path);

  assert.ok(paths.includes("/dashboard"));
  assert.ok(paths.includes("/dispensing"));
  assert.ok(paths.includes("/inventory"));
  assert.ok(paths.includes("/requests"));
  assert.ok(paths.includes("/patients"));
  assert.ok(paths.includes("/reports"));
  assert.ok(paths.includes("/medicines"));
  assert.ok(paths.includes("/facilities"));
  assert.ok(paths.includes("/users"));
  assert.ok(paths.includes("/profile-settings"));
});

test("WORKSPACE_ROUTE_ALIASES correctly redirects legacy and shortcut routes", () => {
  assert.equal(WORKSPACE_ROUTE_ALIASES["/suppliers"], "/inventory");
  assert.equal(WORKSPACE_ROUTE_ALIASES["/inventory-bhw"], "/inventory");
  assert.equal(WORKSPACE_ROUTE_ALIASES["/transfers"], "/inventory");
  assert.equal(WORKSPACE_ROUTE_ALIASES["/users/accounts"], "/users");
  assert.equal(WORKSPACE_ROUTE_ALIASES["/users/change-requests"], "/users");
  assert.equal(WORKSPACE_ROUTE_ALIASES["/profile"], "/profile-settings");
});

test("resolveCanonicalPath maps paths and handles trailing slashes cleanly", () => {
  assert.equal(resolveCanonicalPath("/dispensing"), "/dispensing");
  assert.equal(resolveCanonicalPath("/dispensing/"), "/dispensing");
  assert.equal(resolveCanonicalPath("/suppliers"), "/inventory");
  assert.equal(resolveCanonicalPath("/profile/"), "/profile-settings");
  assert.equal(resolveCanonicalPath("/"), "/dashboard");
});

test("role guards properly restrict administrative modules", () => {
  const usersRoute = WORKSPACE_ROUTE_CONFIG.find((r) => r.path === "/users");
  assert.deepEqual(usersRoute.allowedRoles, ["PHARMA_II"]);
  assert.equal(isRouteAuthorized(usersRoute, "PHARMA_II"), true);
  assert.equal(isRouteAuthorized(usersRoute, "PHARMA_I"), false);
  assert.equal(isRouteAuthorized(usersRoute, "BHW"), false);

  const facilitiesRoute = WORKSPACE_ROUTE_CONFIG.find((r) => r.path === "/facilities");
  assert.deepEqual(facilitiesRoute.allowedRoles, ["PHARMA_I", "PHARMA_II"]);
  assert.equal(isRouteAuthorized(facilitiesRoute, "PHARMA_I"), true);
  assert.equal(isRouteAuthorized(facilitiesRoute, "PHARMA_II"), true);
  assert.equal(isRouteAuthorized(facilitiesRoute, "BHW"), false);

  const medicinesRoute = WORKSPACE_ROUTE_CONFIG.find((r) => r.path === "/medicines");
  assert.deepEqual(medicinesRoute.allowedRoles, ["PHARMA_I", "PHARMA_II"]);
  assert.equal(isRouteAuthorized(medicinesRoute, "PHARMA_I"), true);

  const dispensingRoute = WORKSPACE_ROUTE_CONFIG.find((r) => r.path === "/dispensing");
  assert.equal(dispensingRoute.allowedRoles, undefined);
  assert.equal(isRouteAuthorized(dispensingRoute, "BHW"), true);
  assert.equal(isRouteAuthorized(dispensingRoute, "PHARMA_I"), true);
  assert.equal(isRouteAuthorized(dispensingRoute, "PHARMA_II"), true);
});

test("all workspace route configurations have non-empty paths and human-readable labels", () => {
  for (const route of WORKSPACE_ROUTE_CONFIG) {
    assert.ok(route.path.startsWith("/"), `Route path ${route.path} must start with /`);
    assert.ok(route.label && route.label.trim().length > 0, `Route ${route.path} must have a valid label`);
  }
});

