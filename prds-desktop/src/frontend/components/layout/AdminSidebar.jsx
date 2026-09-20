import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  ClipboardList,
  ArrowRightLeft,
  PackageCheck,
  UserRound,
  Pill,
  ChartLine,
  BuildingComplex,
  Store,
  UsersRound,
  HeartHandshake,
  History,
  Bell,
} from "lucide-react";

import prdsLogo from "@frontend/assets/prds-logo-main.svg";
import { getAllowedNavItems } from "@shared/utils/userManagementUtils";

const navIcons = {
  Dashboard: LayoutDashboard,
  Inventory: Boxes,
  Requests: ClipboardList,
  Request: ClipboardList,
  Transfer: ArrowRightLeft,
  Dispensing: PackageCheck,
  Patients: UserRound,
  Medicines: Pill,
  Forecasting: ChartLine,
  Facilities: BuildingComplex,
  Suppliers: Store,
  Supplier: Store,
  "User Management": UsersRound,
  "Other Programs": HeartHandshake,
  "Activity Logs": History,
  Notifications: Bell,
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
  { label: "Suppliers", path: "/suppliers", roles: ["PHARMA_II"], category: "Administration" },
  { label: "User Management", path: "/users", roles: ["PHARMA_II"], category: "Administration" },
  { label: "Other Programs", path: "/other-programs", roles: ["PHARMA_II"], category: "Administration" },
  { label: "Activity Logs", path: "/activity-logs", category: "System" },
  { label: "Notifications", path: "/notifications", category: "System" },
];

const navGroupOrder = ["Overview", "Operations", "Medicine & Planning", "Administration", "System"];

const SidebarIcon = ({ label, isActive }) => {
  const IconComponent = navIcons[label];
  if (!IconComponent) return null;

  return (
    <span
      className={`relative flex h-5 w-5 shrink-0 items-center justify-center transition-all duration-300 ease-out ${
        isActive
          ? "scale-110 text-[#0d1117]"
          : "text-[#42474e] group-hover:scale-110 group-hover:text-[#0d1117]"
      }`}
    >
      <IconComponent
        aria-hidden="true"
        className="h-4 w-4 shrink-0 transition-transform duration-300 ease-out"
        strokeWidth={isActive ? 2.25 : 1.8}
      />
    </span>
  );
};

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

const isActiveNavItem = (itemPath, currentPath) => {
  if (itemPath === "/users") {
    return currentPath === "/users" || currentPath.startsWith("/users/");
  }

  return itemPath === currentPath;
};

const isExactActiveNavItem = (itemPath, currentPath) => {
  return itemPath === currentPath;
};

export default function AdminSidebar({ profile, isCollapsed, onToggleCollapsed }) {
  const location = useLocation();
  const [hoveredItem, setHoveredItem] = useState(null);

  useEffect(() => {
    setHoveredItem(null);
  }, [isCollapsed]);

  const fullName = `${profile?.first_name || "Pharma"} ${
    profile?.last_name || "User"
  }`.trim();
  const allowedNavItems = getAllowedNavItems(navItems, profile?.role);
  const navGroups = navGroupOrder
    .map((category) => ({
      category,
      items: allowedNavItems.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length > 0);

  const handleMouseEnter = (event, label) => {
    if (!isCollapsed) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setHoveredItem({
      label,
      top: rect.top + rect.height / 2,
    });
  };

  const handleMouseLeave = () => {
    setHoveredItem(null);
  };

  return (
    <aside
      className={`flex h-full min-h-0 flex-col overflow-hidden border-r border-[#d8dadc] bg-[#f8f9ff] text-[#42474e] transition-[width] duration-300 ${
        isCollapsed ? "w-14.5" : "w-57"
      }`}
    >
      <div
        className={`flex h-13.5 shrink-0 items-center border-b border-[#d8dadc] ${
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
          className={`group/btn flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent text-[#42474e] transition-all duration-300 ease-out hover:border-[#d8dadc] hover:bg-white hover:text-[#0d1117] hover:shadow-xs active:scale-90 ${
            isCollapsed ? "" : "-mr-1"
          }`}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <HamburgerIcon isCollapsed={isCollapsed} />
        </button>
      </div>

      <nav
        onScroll={() => setHoveredItem(null)}
        className={`prds-sidebar-scrollbar flex-1 min-h-0 space-y-1 overflow-x-hidden overflow-y-auto py-4 ${
          isCollapsed ? "px-2" : "px-2.5"
        }`}
      >
        {navGroups.map((group, groupIndex) => {
          return (
            <div key={group.category}>
              {!isCollapsed && (
                <p
                  className={`px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#8a93a3] ${
                    groupIndex === 0 ? "pt-1.5" : "pt-4"
                  }`}
                >
                  {group.category}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = isActiveNavItem(item.path, location.pathname);
                  const hasChildren = item.children?.length > 0;
                  const itemClass = `group relative flex h-10 w-full items-center rounded-lg text-left text-sm font-bold transition-all duration-300 ease-out ${
                    isActive
                      ? "bg-[#6be9c2] text-[#0d1117] shadow-sm shadow-[#6be9c2]/30"
                      : "text-[#42474e] hover:bg-[#eff4ff] hover:text-[#0d1117]"
                  } ${isCollapsed ? "justify-center px-0" : "gap-3 px-3"}`;
                  const label = (
                    <>
                      <SidebarIcon label={item.label} isActive={isActive} />
                      <span
                        className={`truncate transition-all duration-300 ease-out ${
                          isCollapsed ? "sr-only" : ""
                        } ${
                          isActive
                            ? "translate-x-0.5 font-black text-[#0d1117]"
                            : "font-bold text-[#42474e] group-hover:translate-x-0.5 group-hover:text-[#0d1117]"
                        }`}
                      >
                        {item.label}
                      </span>
                    </>
                  );

                  return (
                    <div
                      key={item.label}
                      onMouseEnter={(event) => handleMouseEnter(event, item.label)}
                      onMouseLeave={handleMouseLeave}
                    >
                      {item.path ? (
                        <Link
                          to={item.path}
                          className={itemClass}
                          aria-label={item.label}
                        >
                          {label}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className={`${itemClass} cursor-default`}
                          aria-label={item.label}
                        >
                          {label}
                        </button>
                      )}

                      {hasChildren && !isCollapsed && isActive ? (
                        <div
                          className={`ml-4 mt-1 grid gap-1 border-l border-[#d8dadc] pl-3 transition-opacity duration-200 ${
                            isActive ? "opacity-100" : "opacity-70"
                          }`}
                        >
                          {item.children.map((child) => {
                            const isChildActive = isExactActiveNavItem(child.path, location.pathname);

                            return (
                              <Link
                                key={child.path}
                                to={child.path}
                                className={`flex h-8 items-center rounded-md px-3 text-xs font-bold transition ${
                                  isChildActive
                                    ? "bg-[#e8fff7] text-[#007f5f] ring-1 ring-[#6be9c2]/40"
                                    : "text-[#6b7280] hover:bg-[#eff4ff] hover:text-[#0d1117]"
                                }`}
                                title={child.label}
                              >
                                <span className="truncate">{child.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div
        className={`shrink-0 border-t border-[#d8dadc] py-4 ${
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

      {isCollapsed && hoveredItem && (
        <div
          style={{ top: `${hoveredItem.top}px`, left: "62px" }}
          className="prds-tooltip-pop fixed z-50 pointer-events-none select-none"
        >
          <div className="relative flex items-center rounded-lg border border-[#0d1117] bg-[#0d1117] px-3 py-1.5 text-xs font-black tracking-wide text-white shadow-xl shadow-black/25">
            <span className="absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-2 rotate-45 bg-[#0d1117]" />
            <span className="relative z-10 whitespace-nowrap">{hoveredItem.label}</span>
          </div>
        </div>
      )}
    </aside>
  );
}

function HamburgerIcon({ isCollapsed }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4.5 w-4.5 shrink-0 text-current transition-all duration-300 ease-out"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <line
        x1={isCollapsed ? "9" : "4"}
        y1="6"
        x2={isCollapsed ? "15" : "20"}
        y2={isCollapsed ? "12" : "6"}
        className="transition-all duration-300 ease-out group-hover/btn:stroke-emerald-600"
      />
      <line
        x1="4"
        y1="12"
        x2={isCollapsed ? "4" : "15"}
        y2="12"
        className={`transition-all duration-300 ease-out group-hover/btn:stroke-emerald-600 ${
          isCollapsed ? "opacity-0 scale-x-0" : "opacity-100"
        }`}
      />
      <line
        x1={isCollapsed ? "9" : "4"}
        y1="18"
        x2={isCollapsed ? "15" : "20"}
        y2={isCollapsed ? "12" : "18"}
        className="transition-all duration-300 ease-out group-hover/btn:stroke-emerald-600"
      />
    </svg>
  );
}
