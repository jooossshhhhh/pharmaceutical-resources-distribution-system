import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";

import AdminHeader from "./AdminHeader";
import AdminSidebar from "./AdminSidebar";
import AdminShellContext from "@frontend/context/AdminShellContext";
import ModalContainerContext from "@frontend/context/ModalContainerContext";
import { useSidebarCollapse } from "@frontend/hooks/useSidebarCollapse";

function AdminShellRoot({
  children,
  currentDateTime,
  profile,
  onSignOut,
}) {
  const [isSidebarCollapsed, toggleSidebarCollapsed] = useSidebarCollapse();
  const [modalContainer, setModalContainer] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const location = useLocation();
  const mainScrollRef = useRef(null);
  const scrollPositionsRef = useRef(new Map());
  const prevPathRef = useRef(location.pathname);

  // Preserve independent scroll positions across route switches
  useEffect(() => {
    const prevPath = prevPathRef.current;
    const currentPath = location.pathname;

    if (mainScrollRef.current) {
      scrollPositionsRef.current.set(prevPath, mainScrollRef.current.scrollTop);
      const savedScroll = scrollPositionsRef.current.get(currentPath) || 0;
      mainScrollRef.current.scrollTop = savedScroll;
    }

    prevPathRef.current = currentPath;
  }, [location.pathname]);

  const modalContainerCallbackRef = useCallback((node) => {
    if (node !== null) {
      setModalContainer(node);
    }
  }, []);

  const contextValue = useMemo(
    () => ({
      container: modalContainer,
      isModalOpen,
      setModalOpen: setIsModalOpen,
      isViewActive: true,
      routePath: null,
    }),
    [modalContainer, isModalOpen]
  );

  return (
    <ModalContainerContext.Provider value={contextValue}>
      <main className="prds-admin-shell h-full min-h-0 overflow-hidden bg-[var(--grad-canvas)] text-[#1B2B30]">
        <div
          className={`grid h-full min-h-0 transition-[grid-template-columns] duration-300 ${
            isSidebarCollapsed ? "grid-cols-[52px_1fr]" : "grid-cols-[204px_1fr]"
          }`}
        >
          <AdminSidebar
            profile={profile}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapsed={toggleSidebarCollapsed}
            isModalOpen={isModalOpen}
          />
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <AdminHeader
              currentDateTime={currentDateTime}
              profile={profile}
              onSignOut={onSignOut}
            />
            <section
              ref={mainScrollRef}
              className="prds-main-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-5"
            >
              <div className="mx-auto min-w-0 max-w-[1280px]">{children}</div>
            </section>
            <div
              ref={modalContainerCallbackRef}
              id="prds-workspace-modal-host"
              className="pointer-events-none absolute inset-0 z-40 empty:hidden"
            />
          </div>
        </div>
      </main>
    </ModalContainerContext.Provider>
  );
}

export default function AdminShell({
  children,
  currentDateTime,
  profile,
  onSignOut,
}) {
  const isNested = useContext(AdminShellContext);

  // If already inside an outer AdminShell (e.g. KeepAliveWorkspaceLayout),
  // just render children directly so we don't produce duplicate sidebars or headers.
  if (isNested) {
    return <>{children}</>;
  }

  return (
    <AdminShellContext.Provider value={true}>
      <AdminShellRoot
        currentDateTime={currentDateTime}
        profile={profile}
        onSignOut={onSignOut}
      >
        {children}
      </AdminShellRoot>
    </AdminShellContext.Provider>
  );
}


