import { useContext, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import ModalContainerContext from "@frontend/context/ModalContainerContext";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export default function ModalShell({
  children,
  closing = false,
  labelledBy,
  onClose,
  overlayClassName = "bg-[radial-gradient(ellipse_at_center,_rgba(51,65,85,0.20)_0%,_rgba(30,41,59,0.32)_100%)] backdrop-blur-[1.5px] backdrop-saturate-[70%]",
  panelClassName = "",
}) {
  const panelRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const context = useContext(ModalContainerContext);
  const modalContainer = context?.container !== undefined ? context.container : context;
  const setModalOpen = context?.setModalOpen;
  const isViewActive = context?.isViewActive !== undefined ? Boolean(context.isViewActive) : true;
  const routePath = context?.routePath || null;
  const isWorkspaceScoped = Boolean(modalContainer);

  const isViewActiveRef = useRef(isViewActive);
  useEffect(() => {
    isViewActiveRef.current = isViewActive;
  }, [isViewActive]);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (typeof setModalOpen === "function") {
      setModalOpen(true);
      return () => {
        setModalOpen(false);
      };
    }
  }, [setModalOpen]);

  useEffect(() => {
    if (isViewActive && panelRef.current && panelRef.current.offsetParent !== null) {
      panelRef.current.focus();
    }
  }, [isViewActive]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    previouslyFocusedRef.current = previouslyFocused;

    if (isViewActive && panelRef.current && panelRef.current.offsetParent !== null) {
      panelRef.current.focus();
    }

    const handleKeyDown = (event) => {
      // If modal or panel is hidden (e.g. inactive tab in KeepAliveWorkspace), ignore keyboard shortcuts
      if (!isViewActiveRef.current || !panelRef.current || panelRef.current.offsetParent === null) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const panel = panelRef.current;

      if (!panel) {
        return;
      }

      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (element) =>
          element.offsetParent !== null || element === document.activeElement
      );

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isViewActive]);

  const targetElement = modalContainer || (typeof document !== "undefined" ? document.body : null);
  if (!targetElement) {
    return null;
  }

  const rootClasses = isWorkspaceScoped
    ? "prds-modal-root pointer-events-auto absolute inset-0 z-40 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    : "prds-modal-root fixed inset-0 z-[9990] flex items-center justify-center p-4 sm:p-6 overflow-y-auto";

  // Automatically normalize overlays to a refined, soft gray tone with gentle 1.5px blur, desaturation, and optical depth
  const defaultOverlay =
    "bg-[radial-gradient(ellipse_at_center,_rgba(51,65,85,0.20)_0%,_rgba(30,41,59,0.32)_100%)] backdrop-blur-[1.5px] backdrop-saturate-[70%]";
  let normalizedOverlay = (overlayClassName || defaultOverlay)
    .replace("backdrop-blur-sm", "backdrop-blur-[1.5px]")
    .replace("backdrop-blur-xs", "backdrop-blur-[1.5px]")
    .replace("backdrop-blur-[2px]", "backdrop-blur-[1.5px]")
    .replace("bg-slate-950/45", "bg-[radial-gradient(ellipse_at_center,_rgba(51,65,85,0.20)_0%,_rgba(30,41,59,0.32)_100%)]")
    .replace("bg-slate-950/40", "bg-[radial-gradient(ellipse_at_center,_rgba(51,65,85,0.20)_0%,_rgba(30,41,59,0.32)_100%)]")
    .replace("bg-slate-950/30", "bg-[radial-gradient(ellipse_at_center,_rgba(51,65,85,0.20)_0%,_rgba(30,41,59,0.32)_100%)]")
    .replace("bg-slate-700/30", "bg-[radial-gradient(ellipse_at_center,_rgba(51,65,85,0.20)_0%,_rgba(30,41,59,0.32)_100%)]")
    .replace(/bg-white(?:\/\d+)?/, "bg-[radial-gradient(ellipse_at_center,_rgba(51,65,85,0.20)_0%,_rgba(30,41,59,0.32)_100%)]");

  if (!normalizedOverlay.includes("backdrop-saturate")) {
    normalizedOverlay += " backdrop-saturate-[70%]";
  }

  const panelClasses = `relative flex w-full flex-col items-center outline-none ${
    closing ? "prds-modal-panel-exit" : "prds-modal-panel-enter"
  } ${panelClassName || "max-w-2xl"}`;

  return createPortal(
    <div
      role="dialog"
      data-route-path={routePath || undefined}
      data-view-active={isViewActive ? "true" : "false"}
      aria-modal={isViewActive ? "true" : "false"}
      aria-hidden={!isViewActive}
      className={`${rootClasses} ${!isViewActive ? "!hidden !pointer-events-none" : ""}`}
      style={!isViewActive ? { display: "none", pointerEvents: "none" } : undefined}
    >
      <div
        className={`absolute inset-0 ${
          closing ? "prds-modal-overlay-exit" : "prds-modal-overlay-enter"
        } ${normalizedOverlay}`}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={panelClasses}
      >
        {children}
      </div>
    </div>,
    targetElement
  );
}

