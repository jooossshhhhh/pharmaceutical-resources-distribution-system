import { useEffect, useRef, useState } from "react";
import { isTauriEnvironment } from "@backend/database/sqliteClient";
import { useAuth } from "@frontend/context/useAuth";
import { getCachedUserSession, clearUserSession } from "@backend/database/snapshotStore";

const REMEMBER_SESSION_KEY = "prds_remember_session_on_exit";

export default function DesktopTitlebar({ isPinned: propIsPinned, onTogglePin }) {
  const { isAuthenticated, profile, signOut } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [internalPinned, setInternalPinned] = useState(() => {
    const saved = localStorage.getItem("prds-titlebar-pinned");
    return saved !== null ? saved === "true" : true;
  });
  const [showExitModal, setShowExitModal] = useState(false);
  const [rememberSession, setRememberSession] = useState(() => {
    const saved = localStorage.getItem(REMEMBER_SESSION_KEY);
    return saved !== null ? saved === "true" : true;
  });
  const [exitError, setExitError] = useState("");
  const [isExiting, setIsExiting] = useState(false);
  const hideTimeoutRef = useRef(null);
  const unlistenCloseRef = useRef(null);
  const [appWindow, setAppWindow] = useState(null);

  const isPinned = propIsPinned !== undefined ? propIsPinned : internalPinned;

  const handleTogglePin = () => {
    if (onTogglePin) {
      onTogglePin();
    } else {
      setInternalPinned((prev) => {
        const next = !prev;
        localStorage.setItem("prds-titlebar-pinned", String(next));
        return next;
      });
    }
  };

  const openExitModal = () => {
    const hasActiveSession = Boolean(isAuthenticated || getCachedUserSession().user);
    const saved = localStorage.getItem(REMEMBER_SESSION_KEY);
    setRememberSession(hasActiveSession ? (saved !== null ? saved === "true" : true) : false);
    setExitError("");
    setShowExitModal(true);
    setIsVisible(true);
  };

  useEffect(() => {
    if (isTauriEnvironment()) {
      import("@tauri-apps/api/window")
        .then(async ({ getCurrentWindow }) => {
          const win = getCurrentWindow();
          setAppWindow(win);

          try {
            const unlisten = await win.onCloseRequested((event) => {
              event.preventDefault();
              openExitModal();
            });
            unlistenCloseRef.current = unlisten;
          } catch (e) {
            console.warn("onCloseRequested setup error:", e);
          }
        })
        .catch((err) => console.warn("Tauri window API not available:", err));
    }

    return () => {
      if (unlistenCloseRef.current) {
        unlistenCloseRef.current();
        unlistenCloseRef.current = null;
      }
    };
  }, [isAuthenticated]);

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    if (isPinned || showExitModal) return;
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 600);
  };

  const handleMinimize = async (e) => {
    e?.stopPropagation();
    if (appWindow) {
      await appWindow.minimize();
    }
  };

  const handleToggleMaximize = async (e) => {
    e?.stopPropagation();
    if (appWindow) {
      await appWindow.toggleMaximize();
    }
  };

  const handleCloseClick = (e) => {
    e?.stopPropagation();
    openExitModal();
  };

  const handleConfirmExit = async () => {
    if (isExiting) return;
    setIsExiting(true);
    setExitError("");

    const hasActiveSession = Boolean(isAuthenticated || getCachedUserSession().user);

    if (!rememberSession && hasActiveSession) {
      try {
        await signOut();
      } catch (err) {
        console.warn("Network sign out failed during exit; clearing local session directly:", err);
        try {
          await clearUserSession();
        } catch (clearErr) {
          console.warn("Failed to clear local session cache:", clearErr);
        }
      }
    }

    // Detach close-requested listener so it cannot intercept the subsequent destroy/close
    if (unlistenCloseRef.current) {
      try {
        unlistenCloseRef.current();
        unlistenCloseRef.current = null;
      } catch (e) {
        console.warn("Error unlistening close request:", e);
      }
    }

    setShowExitModal(false);

    let win = appWindow;
    if (!win && isTauriEnvironment()) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        win = getCurrentWindow();
      } catch (e) {
        console.warn("Failed to retrieve current window:", e);
      }
    }

    if (win) {
      try {
        await win.destroy();
      } catch (err) {
        console.warn("win.destroy() failed, falling back to win.close():", err);
        try {
          await win.close();
        } catch (closeErr) {
          console.error("Failed to close window:", closeErr);
        }
      }
    } else {
      try {
        window.close();
      } catch {}
    }

    setIsExiting(false);
  };

  const handleDoubleClick = async (e) => {
    if (e.target.tagName !== "BUTTON" && appWindow) {
      await appWindow.toggleMaximize();
    }
  };

  const shouldShow = isVisible || isPinned || showExitModal;

  return (
    <>
      {/* Top hover detection strip */}
      <div
        onMouseEnter={handleMouseEnter}
        className="fixed top-0 left-0 right-0 h-3 z-[9999] cursor-pointer"
        title="Hover to reveal window controls"
      />

      {/* Auto-Hiding Titlebar */}
      <div
        data-tauri-drag-region
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
        className={`fixed top-0 left-0 right-0 h-10 z-[9999] flex items-center justify-between px-3.5 bg-[#0d1117]/95 backdrop-blur-md border-b border-white/10 shadow-md text-white transition-all duration-300 ease-in-out select-none ${
          shouldShow
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        {/* Left: Branding & Drag Region */}
        <div data-tauri-drag-region className="flex items-center gap-2">
          <span
            data-tauri-drag-region
            className="text-xs font-bold tracking-wider text-white select-none"
          >
            PRDS
          </span>
          {profile?.facility_name && (
            <span className="hidden sm:inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-neutral-300">
              {profile.facility_name}
            </span>
          )}
        </div>

        {/* Center: Draggable Spacer */}
        <div data-tauri-drag-region className="flex-1 h-full mx-4 cursor-default" />

        {/* Right: Actions & Window Controls */}
        <div className="flex items-center gap-2">
          {/* Pin / Auto-Hide Toggle */}
          <button
            type="button"
            onClick={handleTogglePin}
            className={`flex items-center justify-center w-7 h-7 rounded text-xs transition-colors cursor-pointer ${
              isPinned
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                : "text-neutral-400 hover:text-white hover:bg-white/10"
            }`}
            title={isPinned ? "Window bar is locked (Click to unlock & auto-hide)" : "Lock window bar to stay visible and adjust header"}
            aria-label="Toggle lock titlebar"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2"
            >
              {isPinned ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              )}
            </svg>
          </button>

          <div className="w-px h-4 bg-white/15 mx-1" />

          {/* Window Control Buttons */}
          <div className="flex items-center gap-1">
            {/* Minimize */}
            <button
              type="button"
              onClick={handleMinimize}
              className="flex items-center justify-center w-7 h-7 rounded text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Minimize"
              aria-label="Minimize window"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
              </svg>
            </button>

            {/* Maximize / Restore */}
            <button
              type="button"
              onClick={handleToggleMaximize}
              className="flex items-center justify-center w-7 h-7 rounded text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Maximize / Restore"
              aria-label="Maximize or restore window"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={handleCloseClick}
              className="flex items-center justify-center w-7 h-7 rounded text-neutral-400 hover:text-white hover:bg-rose-600 transition-colors cursor-pointer"
              title="Close Application"
              aria-label="Close window"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Exit Confirmation Modal */}
      {showExitModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-neutral-200 text-neutral-900">
            {/* Modal Header */}
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-black text-neutral-950">Close PRDS Application</h3>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Are you sure you want to close the application?
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberSession}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setRememberSession(checked);
                    setExitError("");
                    localStorage.setItem(REMEMBER_SESSION_KEY, String(checked));
                  }}
                  disabled={!isAuthenticated && !getCachedUserSession().user}
                  className="mt-0.5 h-4 w-4 accent-emerald-600 cursor-pointer disabled:cursor-not-allowed"
                />
                <span>
                  <span className="block text-xs font-bold text-neutral-800">
                    Remember my session on this device
                    {!isAuthenticated && !getCachedUserSession().user && (
                      <span className="ml-1.5 text-[11px] font-normal text-neutral-400">
                        (No active session)
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-4 text-neutral-500">
                    {rememberSession
                      ? "Keep me signed in when PRDS opens again. You will automatically be logged in to your account."
                      : "Clear session on exit. You will need to sign in with your phone number or Google verification code when PRDS opens again."}
                  </span>
                </span>
              </label>
            </div>

            {exitError && (
              <p className="mt-3 text-xs font-semibold text-red-700" role="alert">
                {exitError}
              </p>
            )}

            {/* Modal Actions */}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExitModal(false)}
                disabled={isExiting}
                className="px-4 py-2 rounded-lg text-xs font-bold text-neutral-600 hover:bg-neutral-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmExit}
                disabled={isExiting}
                className="rounded-lg bg-black px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#0d1117] disabled:opacity-60 cursor-pointer flex items-center gap-1.5"
              >
                {isExiting ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Closing PRDS...</span>
                  </>
                ) : (
                  <span>Close Application</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
