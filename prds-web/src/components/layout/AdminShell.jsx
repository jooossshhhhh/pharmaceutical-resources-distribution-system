import { useEffect, useState } from "react";

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

  useEffect(() => {
    localStorage.setItem("prds-sidebar-collapsed", String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  return (
    <main className="min-h-screen bg-[#f7f6f3] text-slate-950">
      <div
        className={`grid min-h-screen transition-[grid-template-columns] duration-300 ${
          isSidebarCollapsed ? "grid-cols-[64px_1fr]" : "grid-cols-[228px_1fr]"
        }`}
      >
        <AdminSidebar
          profile={profile}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapsed={() => setIsSidebarCollapsed((isCollapsed) => !isCollapsed)}
        />
        <div className="flex min-w-0 flex-col">
          <AdminHeader
            currentDateTime={currentDateTime}
            profile={profile}
            onSignOut={onSignOut}
          />
          <section className="min-w-0 flex-1 overflow-auto px-6 py-5">
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}
