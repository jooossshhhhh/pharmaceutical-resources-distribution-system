import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import AdminHeader from "./AdminHeader";
import AdminSidebar from "./AdminSidebar";

export default function AdminShell({
  children,
  currentDateTime,
  profile,
  onSignOut,
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem("prds-sidebar-collapsed") === "true";
  });
  const location = useLocation();
  const mainScrollRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("prds-sidebar-collapsed", String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <main className="prds-admin-shell h-screen overflow-hidden bg-[#f7f6f3] text-slate-950">
      <div
        className={`grid h-screen transition-[grid-template-columns] duration-300 ${
          isSidebarCollapsed ? "grid-cols-[52px_1fr]" : "grid-cols-[204px_1fr]"
        }`}
      >
        <AdminSidebar
          profile={profile}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapsed={() => setIsSidebarCollapsed((isCollapsed) => !isCollapsed)}
        />
        <div className="flex min-h-0 min-w-0 flex-col">
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
        </div>
      </div>
    </main>
  );
}
