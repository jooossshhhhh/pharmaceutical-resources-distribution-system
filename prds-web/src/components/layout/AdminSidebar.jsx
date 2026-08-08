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
  Transfers: (
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
  { label: "Dashboard", path: "/dashboard" },
  { label: "Inventory" },
  { label: "Requests", path: "/requests" },
  { label: "Transfers" },
  { label: "Dispensing" },
  { label: "Medicines", path: "/medicines", roles: ["PHARMA_I", "PHARMA_II"] },
  { label: "Facilities", path: "/facilities" },
  { label: "Patients" },
  { label: "User Management", path: "/users", roles: ["PHARMA_II"] },
  { label: "Forecasting", path: "/forecasting" },
  { label: "Activity Logs", path: "/activity-logs" },
  { label: "Notifications", path: "/notifications" },
];

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

  return (
    <aside
      className={`sticky top-0 flex h-screen flex-col border-r border-[#d8dadc] bg-[#f8f9ff] text-[#42474e] transition-[width] duration-300 ${
        isCollapsed ? "w-[58px]" : "w-[228px]"
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
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#42474e] transition hover:bg-[#eff4ff] hover:text-[#0d1117] ${
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
        {allowedNavItems.map((item) => {
          const isActive = item.path === location.pathname;
          const itemClass = `group relative flex h-10 w-full items-center rounded-lg text-left text-sm font-bold transition ${
            isActive
              ? "bg-[#6be9c2] text-[#0d1117] shadow-sm shadow-emerald-100"
              : "text-[#42474e] hover:bg-[#eff4ff] hover:text-[#0d1117]"
          } ${isCollapsed ? "justify-center px-0" : "gap-3 px-3"}`;
          const label = (
            <>
              {isActive && !isCollapsed && (
                <span className="absolute -left-2.5 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-[#00a36c]" />
              )}
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
      </nav>

      <div
        className={`border-t border-[#d8dadc] py-4 ${
          isCollapsed ? "px-2" : "px-3"
        }`}
      >
        <Link
          to="/profile-settings"
          title="Profile settings"
          className={`group flex items-center rounded-xl bg-[#eff4ff]/70 transition hover:bg-[#6be9c2]/70 ${
            isCollapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2.5"
          }`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#6be9c2] text-xs font-black text-[#0d1117]">
            {getInitials(profile)}
          </span>
          <div className={`min-w-0 ${isCollapsed ? "sr-only" : ""}`}>
            <p className="truncate text-sm font-black leading-4 text-[#0d1117]">{fullName}</p>
            <p className="truncate text-xs font-medium text-[#42474e]">
              {roleLabels[profile?.role] || "Barangay Health Worker"}
            </p>
          </div>
          <span className={`ml-auto shrink-0 text-[#42474e] transition group-hover:translate-x-0.5 ${isCollapsed ? "sr-only" : ""}`}>
            <ChevronRightIcon />
          </span>
        </Link>
      </div>
    </aside>
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

function ChevronRightIcon() {
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
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
