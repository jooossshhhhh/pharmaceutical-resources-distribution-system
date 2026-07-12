import { Link, useLocation } from "react-router-dom";

import prdsLogo from "../../assets/prds-logo-main.svg";

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
  { label: "Inventory", path: "/inventory" },
  { label: "Requests" },
  { label: "Transfers" },
  { label: "Dispensing" },
  { label: "Medicines", path: "/medicines" },
  { label: "Facilities", path: "/facilities" },
  { label: "Patients" },
  { label: "Forecasting" },
  { label: "Activity Logs" },
  { label: "Notifications" },
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

  return (
    <aside
      className={`sticky top-0 flex h-screen flex-col border-r border-neutral-900 bg-black text-white transition-[width] duration-300 ${
        isCollapsed ? "w-16" : "w-[228px]"
      }`}
    >
      <div
        className={`flex h-[68px] items-center border-b border-white/10 ${
          isCollapsed ? "justify-center px-2" : "gap-3 px-4"
        }`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/95 p-1.5">
          <img src={prdsLogo} alt="PRDS" className="h-full w-full object-contain" />
        </span>
        <div className={`min-w-0 ${isCollapsed ? "sr-only" : ""}`}>
          <p className="truncate text-sm font-black">PRDS</p>
          <p className="truncate text-xs font-medium text-slate-400">
            Pharma Resource System
          </p>
        </div>
      </div>

      <nav
        className={`prds-sidebar-scrollbar flex-1 space-y-1 overflow-x-hidden overflow-y-auto py-4 ${
          isCollapsed ? "px-2" : "px-3"
        }`}
      >
        {navItems.map((item) => {
          const isActive = item.path === location.pathname;
          const itemClass = `group relative flex w-full items-center rounded-lg py-3 text-left text-sm font-semibold transition ${
            isActive
              ? "bg-emerald-500/20 text-emerald-400"
              : "text-slate-300 hover:bg-white/5 hover:text-white"
          } ${isCollapsed ? "justify-center px-0" : "gap-3 px-4"}`;
          const label = (
            <>
              <SidebarIcon label={item.label} />
              <span className={isCollapsed ? "sr-only" : ""}>{item.label}</span>
              {isCollapsed && (
                <span className="pointer-events-none absolute left-[52px] z-50 rounded-md bg-neutral-900 px-2 py-1 text-xs font-bold text-white opacity-0 shadow-lg transition group-hover:opacity-100">
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
        className={`border-t border-white/10 py-5 ${
          isCollapsed ? "px-2" : "px-4"
        }`}
      >
        <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-3"}`}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-xs font-black text-white">
            {getInitials(profile)}
          </span>
          <div className={`min-w-0 ${isCollapsed ? "sr-only" : ""}`}>
            <p className="truncate text-sm font-black">{fullName}</p>
            <p className="truncate text-xs font-medium text-slate-400">
              {roleLabels[profile?.role] || "Barangay Health Worker"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="mx-auto mt-6 flex h-8 w-8 items-center justify-center rounded-full border border-white/70 text-slate-300 transition hover:border-emerald-400 hover:bg-white/5 hover:text-white"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            aria-hidden="true"
            className={`h-4 w-4 transition-transform duration-300 ${
              isCollapsed ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
