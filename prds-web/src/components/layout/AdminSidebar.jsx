import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import prdsLogo from "../../assets/prds-logo-main.svg";
import { getAllowedNavItems } from "../../modules/users/userManagementUtils";

const iconPaths = {
  Dashboard: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="m12 8 1.2 3.2L16 12l-2.8.8L12 16l-1.2-3.2L8 12l2.8-.8L12 8Z" />
    </>
  ),
  Inventory: (
    <>
      <path d="m12 3 8 4-8 4-8-4 8-4Z" />
      <path d="m4 11 8 4 8-4" />
      <path d="m4 15 8 4 8-4" />
    </>
  ),
  Requests: (
    <>
      <path d="M7 3h8l4 4v14H7V3Z" />
      <path d="M14 3v5h5" />
      <path d="M10 13h6M10 17h4" />
    </>
  ),
  Transfer: (
    <>
      <path d="M7 7h11l-3-3" />
      <path d="m18 7-3 3" />
      <path d="M17 17H6l3 3" />
      <path d="m6 17 3-3" />
    </>
  ),
  Dispensing: (
    <>
      <path d="M7 4h10v6a5 5 0 0 1-10 0V4Z" />
      <path d="M12 15v5M9 20h6" />
      <path d="M9 8h6" />
    </>
  ),
  Medicines: (
    <>
      <path d="m10 21 9.2-9.2a4 4 0 0 0-5.7-5.7L4.3 15.3A4 4 0 0 0 10 21Z" />
      <path d="m8 11 5 5" />
    </>
  ),
  Facilities: (
    <>
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 10h.01M15 10h.01" />
    </>
  ),
  Patients: (
    <>
      <circle cx="10" cy="8" r="4" />
      <path d="M3 21a7 7 0 0 1 14 0" />
      <path d="M19 8v6M16 11h6" />
    </>
  ),
  "Other Programs": (
    <>
      <path d="M3 4h18v13H3z" />
      <path d="M6 21h12M12 17v4" />
    </>
  ),
  "User Management": (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0" />
      <circle cx="18" cy="9" r="3" />
      <path d="M17 21a5 5 0 0 0-2-4" />
      <path d="M20 15v6" />
      <path d="M17 18h6" />
    </>
  ),
  Forecasting: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="m7 15 4-4 3 3 5-7" />
    </>
  ),
  "Activity Logs": (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  Notifications: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
};

const navItems = [
  { label: "Dashboard", path: "/dashboard", category: "Overview" },
  { label: "Inventory", path: "/inventory", category: "Operations" },
  { label: "Requests", path: "/requests", category: "Operations" },
  { label: "Transfer", path: "/transfers", category: "Operations" },
  { label: "Dispensing", path: "/dispensing", category: "Operations" },
  { label: "Patients", path: "/patients", category: "Operations" },
  { label: "Medicines", path: "/medicines", roles: ["PHARMA_I", "PHARMA_II"], category: "Medicine & Planning" },
  { label: "Forecasting", path: "/forecasting", category: "Medicine & Planning" },
  { label: "Facilities", path: "/facilities", roles: ["PHARMA_I", "PHARMA_II"], category: "Administration" },
  { label: "User Management", path: "/users", roles: ["PHARMA_II"], category: "Administration" },
  { label: "Other Programs", path: "/other-programs", roles: ["PHARMA_I", "PHARMA_II"], category: "Administration" },
  { label: "Activity Logs", path: "/activity-logs", category: "System" },
  { label: "Notifications", path: "/notifications", category: "System" },
];

const navGroupOrder = ["Overview", "Operations", "Medicine & Planning", "Administration", "System"];

const SidebarIcon = ({ label }) => (
  <svg
    aria-hidden="true"
    className="h-4 w-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
  >
    {iconPaths[label]}
  </svg>
);

const getInitials = (profile) => {
  const firstInitial = profile?.first_name?.[0] || "P";
  const lastInitial = profile?.last_name?.[0] || "A";

  return `${firstInitial}${lastInitial}`.toUpperCase();
};

const roleLabels = {
  PHARMA_II: "Pharmacist II",
  PHARMA_I: "Pharmacist I",
  BHW: "Barangay Health Worker",
};

export default function AdminSidebar({ profile, isCollapsed, onToggleCollapsed }) {
  const location = useLocation();
  const fullName = `${profile?.first_name || "Pharma"} ${
    profile?.last_name || "User"
  }`.trim();
  const inventoryPath = profile?.role === "BHW" ? "/inventory-bhw" : "/inventory";
  const allowedNavItems = getAllowedNavItems(navItems, profile?.role).map((item) =>
    item.label === "Inventory" ? { ...item, path: inventoryPath } : item
  );
  const navGroups = navGroupOrder
    .map((category) => ({
      category,
      items: allowedNavItems.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length > 0);

  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try {
      const stored = window.localStorage.getItem("prds-sidebar-collapsed-categories");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const activeCategory = navGroups.find((group) =>
    group.items.some((item) => item.path === location.pathname)
  )?.category;

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "prds-sidebar-collapsed-categories",
        JSON.stringify([...collapsedGroups])
      );
    } catch {
      // ignore storage write failures
    }
  }, [collapsedGroups]);

  const toggleGroup = (category) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);

      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }

      return next;
    });
  };

  return (
    <aside
      className={`sticky top-0 flex h-screen flex-col border-r border-[#d8dadc] bg-[#f8f9ff] text-[#42474e] transition-[width] duration-300 ${
        isCollapsed ? "w-14.5" : "w-57"
      }`}
    >
      <div
        className={`flex h-13.5 items-center border-b border-[#d8dadc] ${
          isCollapsed ? "justify-center px-2" : "gap-2.5 px-3"
        }`}
      >
        <div className={`min-w-0 flex-1 items-center gap-2 ${isCollapsed ? "sr-only" : "flex"}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
            <img src={prdsLogo} alt="PRDS" className="h-full w-full object-contain" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium leading-3 text-[#42474e]">
              Pharmaceutical Resources Distribution System
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#42474e] transition hover:bg-[#eff4ff] hover:text-[#0d1117] ${
            isCollapsed ? "" : "-mr-1"
          }`}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <HamburgerIcon />
        </button>
      </div>

      <nav
        className={`prds-sidebar-scrollbar flex-1 space-y-1 overflow-x-hidden overflow-y-auto py-4 ${
          isCollapsed ? "px-2" : "px-2.5"
        }`}
      >
        {navGroups.map((group, groupIndex) => {
          const isOpen =
              isCollapsed || group.category === activeCategory || !collapsedGroups.has(group.category);

          return (
            <div key={group.category}>
              {!isCollapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.category)}
                  aria-expanded={isOpen}
                  aria-controls={`nav-group-${group.category}`}
                  className={`flex w-full cursor-pointer items-center justify-between px-3 pb-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-[#8a93a3] transition hover:text-[#0d1117] ${
                    groupIndex === 0 ? "pt-1.5" : "pt-4"
                  }`}
                >
                  {group.category}
                  <ChevronDownIcon
                    className={`transition-transform duration-200 ${
                      isOpen ? "" : "-rotate-90"
                    }`}
                  />
                </button>
              )}
              <div
                className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    id={`nav-group-${group.category}`}
                    aria-hidden={!isOpen}
                    inert={!isOpen}
                    className={`space-y-1 transition-opacity duration-200 ${
                      isOpen ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    {group.items.map((item) => {
                      const isActive = item.path === location.pathname;
                      const itemClass = `group relative flex h-10 w-full items-center rounded-lg text-left text-sm font-bold transition ${
                        isActive
                          ? "bg-[#6be9c2] text-[#0d1117]"
                          : "text-[#42474e] hover:bg-[#eff4ff] hover:text-[#0d1117]"
                      } ${isCollapsed ? "justify-center px-0" : "gap-3 px-3"}`;
                      const label = (
                        <>
                          <SidebarIcon label={item.label} />
                          <span className={isCollapsed ? "sr-only" : "truncate"}>{item.label}</span>
                          {isCollapsed && (
                            <span className="pointer-events-none absolute left-12 z-50 whitespace-nowrap rounded-md border border-[#d8dadc] bg-white px-2.5 py-1.5 text-xs font-bold text-[#0d1117] opacity-0 shadow-xl transition group-hover:opacity-100">
                              {item.label}
                            </span>
                          )}
                        </>
                      );

                      return item.path ? (
                        <Link key={item.label} to={item.path} className={itemClass} title={item.label}>
                          {label}
                        </Link>
                      ) : (
                        <button
                          key={item.label}
                          type="button"
                          className={`${itemClass} cursor-default`}
                          title={item.label}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div
        className={`border-t border-[#d8dadc] py-4 ${
          isCollapsed ? "px-2" : "px-3"
        }`}
      >
        <div className={`flex items-center rounded-xl ${isCollapsed ? "justify-center" : "gap-3"}`}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#6be9c2] text-xs font-black text-[#0d1117]">
            {getInitials(profile)}
          </span>
          <div className={`min-w-0 ${isCollapsed ? "sr-only" : ""}`}>
            <p className="truncate text-sm font-black leading-4 text-[#0d1117]">{fullName}</p>
            <p className="truncate text-xs font-medium text-[#42474e]">
              {roleLabels[profile?.role] || "Barangay Health Worker"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ChevronDownIcon({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-3 w-3 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M5 7h14" />
      <path d="M5 12h14" />
      <path d="M5 17h14" />
    </svg>
  );
}
