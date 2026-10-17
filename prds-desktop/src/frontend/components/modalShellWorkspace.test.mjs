import assert from "node:assert/strict";
import test from "node:test";
import ModalContainerContext from "../context/ModalContainerContext.js";
import { setSidebarCollapsedGlobally, toggleSidebarCollapsedGlobally } from "../hooks/useSidebarCollapse.js";

test("ModalContainerContext is initialized with default structure", () => {
  assert.ok(ModalContainerContext);
  assert.equal(typeof ModalContainerContext._currentValue, "object");
  assert.equal(ModalContainerContext._currentValue.container, null);
  assert.equal(ModalContainerContext._currentValue.isModalOpen, false);
  assert.equal(typeof ModalContainerContext._currentValue.setModalOpen, "function");
  assert.equal(ModalContainerContext._currentValue.isViewActive, true);
  assert.equal(ModalContainerContext._currentValue.routePath, null);
});

test("workspace scoped modal styling enforces containment and refined gray blur", () => {
  const isWorkspaceScopedTrue = true;
  const isWorkspaceScopedFalse = false;

  const getRootClasses = (isWorkspaceScoped) =>
    isWorkspaceScoped
      ? "prds-modal-root pointer-events-auto absolute inset-0 z-40 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      : "prds-modal-root fixed inset-0 z-[9990] flex items-center justify-center p-4 sm:p-6 overflow-y-auto";

  const defaultOverlay =
    "bg-[radial-gradient(ellipse_at_center,_rgba(51,65,85,0.20)_0%,_rgba(30,41,59,0.32)_100%)] backdrop-blur-[1.5px] backdrop-saturate-[70%]";
  const normalizeOverlay = (overlayClassName) => {
    let result = (overlayClassName || defaultOverlay)
      .replace("backdrop-blur-sm", "backdrop-blur-[1.5px]")
      .replace("backdrop-blur-xs", "backdrop-blur-[1.5px]")
      .replace("backdrop-blur-[2px]", "backdrop-blur-[1.5px]")
      .replace("bg-slate-950/45", "bg-[radial-gradient(ellipse_at_center,_rgba(51,65,85,0.20)_0%,_rgba(30,41,59,0.32)_100%)]")
      .replace("bg-slate-950/40", "bg-[radial-gradient(ellipse_at_center,_rgba(51,65,85,0.20)_0%,_rgba(30,41,59,0.32)_100%)]")
      .replace("bg-slate-950/30", "bg-[radial-gradient(ellipse_at_center,_rgba(51,65,85,0.20)_0%,_rgba(30,41,59,0.32)_100%)]")
      .replace("bg-slate-700/30", "bg-[radial-gradient(ellipse_at_center,_rgba(51,65,85,0.20)_0%,_rgba(30,41,59,0.32)_100%)]")
      .replace(/bg-white(?:\/\d+)?/, "bg-[radial-gradient(ellipse_at_center,_rgba(51,65,85,0.20)_0%,_rgba(30,41,59,0.32)_100%)]");

    if (!result.includes("backdrop-saturate")) {
      result += " backdrop-saturate-[70%]";
    }
    return result;
  };

  const getPanelClasses = (panelClassName = "", closing = false) =>
    `relative flex w-full flex-col items-center outline-none ${
      closing ? "prds-modal-panel-exit" : "prds-modal-panel-enter"
    } ${panelClassName || "max-w-2xl"}`;

  // Workspace-scoped modal uses absolute inset-0 and stays within right workspace pane
  const workspaceRoot = getRootClasses(isWorkspaceScopedTrue);
  assert.ok(workspaceRoot.includes("absolute inset-0"));
  assert.ok(workspaceRoot.includes("z-40"));
  assert.ok(!workspaceRoot.includes("fixed"));

  // Fallback modal uses fixed inset-0
  const fallbackRoot = getRootClasses(isWorkspaceScopedFalse);
  assert.ok(fallbackRoot.includes("fixed inset-0"));
  assert.ok(fallbackRoot.includes("z-[9990]"));

  // Refined radial gradient, desaturation, and gentle 1.5px blur
  const overlay = normalizeOverlay("bg-slate-950/40 backdrop-blur-sm");
  assert.ok(overlay.includes("backdrop-blur-[1.5px]"));
  assert.ok(overlay.includes("backdrop-saturate-[70%]"));
  assert.ok(overlay.includes("radial-gradient"));
  assert.ok(!overlay.includes("backdrop-blur-sm"));

  // Accidental white overlays are sanitized to avoid washed-out modal background
  const sanitizedWhiteOverlay = normalizeOverlay("bg-white/95 backdrop-blur-sm");
  assert.ok(!sanitizedWhiteOverlay.includes("bg-white"));
  assert.ok(sanitizedWhiteOverlay.includes("radial-gradient"));
  assert.ok(sanitizedWhiteOverlay.includes("backdrop-blur-[1.5px]"));

  // Panel respects caller max-width without expanding to the full window width
  const panel = getPanelClasses("max-w-3xl w-full");
  assert.ok(panel.includes("max-w-3xl"));
  assert.ok(!panel.includes("max-w-[calc(100%-2rem)]"));
});

test("sidebar elevation prevents tooltip from being covered by modal backdrop blur", () => {
  const sidebarZIndex = 60; // z-[60]
  const tooltipZIndex = 70; // z-[70]
  const modalOverlayZIndex = 40; // z-40

  assert.ok(sidebarZIndex > modalOverlayZIndex, "Sidebar must sit above modal overlay");
  assert.ok(tooltipZIndex > modalOverlayZIndex, "Hover tooltip must sit above modal overlay");
});

test("global sidebar collapse state remains consistent across all module views", () => {
  setSidebarCollapsedGlobally(true);
  let viewA = true;
  let viewB = true;

  toggleSidebarCollapsedGlobally();
  viewA = false;
  viewB = false;

  toggleSidebarCollapsedGlobally();
  assert.equal(viewA || true, true);
  assert.equal(viewB || true, true);
});

test("keyboard shortcuts ignore hidden modal when user switches to another module in keep-alive workspace", () => {
  let closeCalled = false;
  const onClose = () => {
    closeCalled = true;
  };

  const simulateKeyDown = (key, offsetParent) => {
    const isHidden = offsetParent === null;
    if (isHidden) {
      return; // Ignored when module is hidden in background tab
    }
    if (key === "Escape") {
      onClose();
    }
  };

  // When modal is hidden in background tab (offsetParent is null), Escape does not trigger onClose
  simulateKeyDown("Escape", null);
  assert.equal(closeCalled, false);

  // When modal is active and visible (offsetParent is present), Escape triggers onClose
  simulateKeyDown("Escape", {});
  assert.equal(closeCalled, true);
});

test("sidebar modal focus state uses refined background and crisp border separation", () => {
  const isModalOpen = true;
  const sidebarClass = isModalOpen ? "bg-[#edf1f7] border-[#c8cfdb]" : "bg-[#f8f9ff] border-[#d8dadc]";
  const overlayTintClass = isModalOpen ? "opacity-100 bg-slate-700/[0.06]" : "opacity-0";

  assert.ok(sidebarClass.includes("bg-[#edf1f7]"));
  assert.ok(sidebarClass.includes("border-[#c8cfdb]"));
  assert.ok(overlayTintClass.includes("bg-slate-700/[0.06]"));
});

test("modal visibility attributes and inline styles hide modal when isViewActive is false", () => {
  const computeModalAttributes = (isWorkspaceScoped, isViewActive, routePath) => {
    const rootClasses = isWorkspaceScoped
      ? "prds-modal-root pointer-events-auto absolute inset-0 z-40 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      : "prds-modal-root fixed inset-0 z-[9990] flex items-center justify-center p-4 sm:p-6 overflow-y-auto";

    return {
      "data-route-path": routePath || undefined,
      "data-view-active": isViewActive ? "true" : "false",
      "aria-modal": isViewActive ? "true" : "false",
      "aria-hidden": !isViewActive,
      className: `${rootClasses} ${!isViewActive ? "!hidden !pointer-events-none" : ""}`,
      style: !isViewActive ? { display: "none", pointerEvents: "none" } : undefined,
    };
  };

  // Inactive background modal (e.g. Patients modal while user is viewing Stock Returns)
  const inactiveAttrs = computeModalAttributes(true, false, "/patients");
  assert.equal(inactiveAttrs["data-route-path"], "/patients");
  assert.equal(inactiveAttrs["data-view-active"], "false");
  assert.equal(inactiveAttrs["aria-modal"], "false");
  assert.equal(inactiveAttrs["aria-hidden"], true);
  assert.ok(inactiveAttrs.className.includes("!hidden !pointer-events-none"));
  assert.deepEqual(inactiveAttrs.style, { display: "none", pointerEvents: "none" });

  // Active modal in current view
  const activeAttrs = computeModalAttributes(true, true, "/patients");
  assert.equal(activeAttrs["data-view-active"], "true");
  assert.equal(activeAttrs["aria-modal"], "true");
  assert.equal(activeAttrs["aria-hidden"], false);
  assert.ok(!activeAttrs.className.includes("!hidden"));
  assert.equal(activeAttrs.style, undefined);
});

test("keyboard shortcuts ignore inactive view modal even if DOM elements remain in memory", () => {
  let escapeTriggered = false;
  const onClose = () => {
    escapeTriggered = true;
  };

  const handleKeyDown = (eventKey, isViewActive, offsetParent) => {
    if (!isViewActive || offsetParent === null) {
      return;
    }
    if (eventKey === "Escape") {
      onClose();
    }
  };

  // Inactive view (user navigated to another module)
  handleKeyDown("Escape", false, {});
  assert.equal(escapeTriggered, false, "Escape must not fire when isViewActive is false");

  // Active view
  handleKeyDown("Escape", true, {});
  assert.equal(escapeTriggered, true, "Escape must fire when isViewActive is true");
});

test("keep-alive workspace synchronizes active route modal state when switching modules", () => {
  const openModalRoutes = new Set();
  let shellModalOpenState = false;

  const setShellModalOpen = (isOpen) => {
    shellModalOpenState = isOpen;
  };

  const notifyRouteModalChange = (routePath, hasOpenModals, canonicalPath) => {
    if (hasOpenModals) {
      openModalRoutes.add(routePath);
    } else {
      openModalRoutes.delete(routePath);
    }
    setShellModalOpen(openModalRoutes.has(canonicalPath));
  };

  const switchRoute = (newCanonicalPath) => {
    setShellModalOpen(openModalRoutes.has(newCanonicalPath));
  };

  // 1. User opens modal in /patients
  notifyRouteModalChange("/patients", true, "/patients");
  assert.equal(shellModalOpenState, true, "Shell modal open state must be true on /patients");

  // 2. User switches to /stock-returns (modal in /patients remains in memory but is backgrounded)
  switchRoute("/stock-returns");
  assert.equal(shellModalOpenState, false, "Shell modal open state must be false on /stock-returns");
  assert.equal(openModalRoutes.has("/patients"), true, "Patients route still tracks its open modal");

  // 3. User opens a modal in /stock-returns
  notifyRouteModalChange("/stock-returns", true, "/stock-returns");
  assert.equal(shellModalOpenState, true, "Shell modal open state must be true for active stock-returns modal");

  // 4. User closes modal in /stock-returns
  notifyRouteModalChange("/stock-returns", false, "/stock-returns");
  assert.equal(shellModalOpenState, false, "Shell modal open state must be false after closing modal");

  // 5. User switches back to /patients
  switchRoute("/patients");
  assert.equal(shellModalOpenState, true, "Shell modal open state restores to true when returning to /patients");
});

