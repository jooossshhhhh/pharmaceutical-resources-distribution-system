import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  ClipboardList,
  PackageCheck,
  UserRound,
  Pill,
  ChartLine,
  BuildingComplex,
  UsersRound,
  HeartHandshake,
  History,
  Bell,
  FileSpreadsheet,
  RotateCcw,
} from "lucide-react";

import prdsLogo from "@frontend/assets/prds-logo-main.svg";
import { getAllowedNavItems } from "@shared/utils/userManagementUtils";

const navIcons = {
  Dashboard: LayoutDashboard,
  Inventory: Boxes,
  "Stock Returns": RotateCcw,
  Requests: ClipboardList,
  Request: ClipboardList,
  Dispensing: PackageCheck,
  Reports: FileSpreadsheet,
  Patients: UserRound,
  Medicines: Pill,
  Forecasting: ChartLine,
  Facilities: BuildingComplex,
  "User Management": UsersRound,
  "Other Programs": HeartHandshake,
  "Activity Logs": History,
  Notifications: Bell,
};

const navItems = [
  { label: "Dashboard", path: "/dashboard", category: "Overview" },
  { label: "Inventory", path: "/inventory", category: "Operations" },
  { label: "Stock Returns", path: "/stock-returns", category: "Operations" },
  { label: "Requests", path: "/requests", category: "Operations" },
  { label: "Dispensing", path: "/dispensing", category: "Operations" },
  { label: "Patients", path: "/patients", category: "Operations" },
  { label: "Other Programs", path: "/other-programs", roles: ["PHARMA_II"], category: "Operations" },
  { label: "Medicines", path: "/medicines", roles: ["PHARMA_I", "PHARMA_II"], category: "Analytics & Catalog" },
  { label: "Forecasting", path: "/forecasting", category: "Analytics & Catalog" },
  { label: "Reports", path: "/reports", category: "Analytics & Catalog" },
  { label: "Facilities", path: "/facilities", roles: ["PHARMA_I", "PHARMA_II"], category: "Administration" },
  { label: "User Management", path: "/users", roles: ["PHARMA_II"], category: "Administration" },
  { label: "Activity Logs", path: "/activity-logs", category: "System" },
  { label: "Notifications", path: "/notifications", category: "System" },
];

const navGroupOrder = ["Overview", "Operations", "Analytics & Catalog", "Administration", "System"];

const SidebarIcon = ({ label, isActive, isSystem = false }) => {
  const IconComponent = navIcons[label];
  if (!IconComponent) return null;

  return (
    <span
      className={`relative flex h-5 w-5 shrink-0 items-center justify-center transition-all duration-300 ease-out ${
        isActive
          ? "scale-110 text-[#0d1117]"
          : isSystem
            ? "text-slate-400 group-hover:scale-110 group-hover:text-amber-300"
            : "text-slate-400 group-hover:scale-110 group-hover:text-white"
      }`}
    >
      <IconComponent
        aria-hidden="true"
        className="h-4 w-4 shrink-0 transition-transform duration-300 ease-out"
        strokeWidth={isActive ? 2.3 : 1.85}
      />
    </span>
  );
};

const getInitials = (profile) => {
  const firstInitial = profile?.first_name?.[0] || "P";
  const lastInitial = profile?.last_name?.[0] || "A";

  return `${firstInitial}${lastInitial}`.toUpperCase();
};

function SidebarAvatar({ profile }) {
  const [hasError, setHasError] = useState(false);
  const avatarUrl = profile?.avatar_url;

  useEffect(() => {
    let isActive = true;
    void Promise.resolve().then(() => {
      if (isActive) setHasError(false);
    });
    return () => {
      isActive = false;
    };
  }, [avatarUrl]);

  if (avatarUrl && !hasError) {
    return (
      <img
        src={avatarUrl}
        alt={`${profile?.first_name || ""} ${profile?.last_name || ""}`.trim()}
        onError={() => setHasError(true)}
        className="h-9 w-9 shrink-0 rounded-full object-cover shadow-xs group-hover:scale-105 transition-transform"
      />
    );
  }

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#6be9c2] text-xs font-black text-[#0d1117] shadow-xs group-hover:scale-105 transition-transform">
      {getInitials(profile)}
    </span>
  );
}

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

export default function AdminSidebar({
  profile,
  isCollapsed,
  onToggleCollapsed,
  isModalOpen = false,
}) {
  const location = useLocation();
  const [hoveredItem, setHoveredItem] = useState(null);

  useEffect(() => {
    let isActive = true;
    void Promise.resolve().then(() => {
      if (isActive) setHoveredItem(null);
    });
    return () => {
      isActive = false;
    };
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
      className={`relative z-[60] flex h-full min-h-0 flex-col overflow-hidden border-r transition-all duration-300 ${
        isModalOpen ? "bg-[#070d18] border-[#131e33]" : "bg-[#0b1329] border-[#18263e]"
      } ${
        isCollapsed ? "w-14.5" : "w-57"
      }`}
    >
      {/* Complementary modal focus tint: softly harmonizes sidebar with dimmed workspace without any blur */}
      <div
        className={`pointer-events-none absolute inset-0 z-0 transition-opacity duration-300 ${
          isModalOpen ? "opacity-100 bg-[#020617]/40" : "opacity-0"
        }`}
        aria-hidden="true"
      />

      <div
        className={`flex h-13.5 shrink-0 items-center border-b border-[#18263e] ${
          isCollapsed ? "justify-center px-2" : "gap-2.5 px-3"
        }`}
      >
        <div className={`min-w-0 flex-1 items-center gap-2 ${isCollapsed ? "sr-only" : "flex"}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1 ring-1 ring-white/10 shadow-xs">
            <img src={prdsLogo} alt="PRDS" className="h-full w-full object-contain" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold leading-3.5 text-slate-200">
              Pharmaceutical Resources Distribution System
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={`group/btn flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent text-slate-400 transition-all duration-300 ease-out hover:border-slate-700/80 hover:bg-[#16233b] hover:text-white hover:shadow-xs active:scale-90 ${
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
          const isSystemGroup = group.category === "System";

          return (
            <div key={group.category}>
              {!isCollapsed && (
                <div
                  className={`flex items-center gap-1.5 px-3 pb-1.5 ${
                    groupIndex === 0 ? "pt-1.5" : "pt-4"
                  }`}
                >
                  <p
                    className={`text-[10px] font-black uppercase tracking-wider ${
                      isSystemGroup
                        ? "text-amber-400"
                        : "text-slate-400"
                    }`}
                  >
                    {group.category}
                  </p>
                  {isSystemGroup && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 shadow-xs shadow-amber-400/60" />
                  )}
                </div>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = isActiveNavItem(item.path, location.pathname);
                  const hasChildren = item.children?.length > 0;
                  const isSystem = isSystemGroup;

                  const itemClass = `group relative flex h-10 w-full items-center rounded-lg text-left text-sm font-bold transition-all duration-300 ease-out ${
                    isActive
                      ? isSystem
                        ? "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-sm shadow-amber-500/25 font-black"
                        : "bg-[#6be9c2] text-[#0d1117] shadow-sm shadow-[#6be9c2]/25 font-black"
                      : isSystem
                        ? "text-slate-300 hover:bg-amber-500/10 hover:text-amber-200"
                        : "text-slate-300 hover:bg-[#16233b] hover:text-white"
                  } ${isCollapsed ? "justify-center px-0" : "gap-3 px-3"}`;

                  const label = (
                    <>
                      <SidebarIcon label={item.label} isActive={isActive} isSystem={isSystem} />
                      <span
                        className={`truncate transition-all duration-300 ease-out ${
                          isCollapsed ? "sr-only" : ""
                        } ${
                          isActive
                            ? isSystem
                              ? "translate-x-0.5 font-black text-slate-950"
                              : "translate-x-0.5 font-black text-[#0d1117]"
                            : isSystem
                              ? "font-semibold text-slate-300 group-hover:translate-x-0.5 group-hover:text-amber-100"
                              : "font-semibold text-slate-300 group-hover:translate-x-0.5 group-hover:text-white"
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
                          className={`ml-4 mt-1 grid gap-1 border-l border-slate-700/80 pl-3 transition-opacity duration-200 ${
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
                                    ? isSystem
                                      ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40"
                                      : "bg-[#6be9c2]/20 text-[#6be9c2] ring-1 ring-[#6be9c2]/40"
                                    : "text-slate-400 hover:bg-[#16233b]/70 hover:text-white"
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
        className={`shrink-0 border-t border-[#18263e] py-3 ${
          isCollapsed ? "px-2" : "px-3"
        }`}
      >
        <Link
          to="/profile-settings"
          title={isCollapsed ? `My Profile (${fullName})` : undefined}
          onMouseEnter={(e) => {
            if (isCollapsed) {
              const rect = e.currentTarget.getBoundingClientRect();
              setHoveredItem({ label: `My Profile (${fullName})`, top: rect.top });
            }
          }}
          onMouseLeave={() => {
            if (isCollapsed) setHoveredItem(null);
          }}
          className={`group flex items-center rounded-xl transition duration-150 ${
            isCollapsed ? "justify-center p-1.5" : "gap-3 p-2"
          } ${
            location.pathname === "/profile-settings"
              ? "bg-[#16233b] text-white ring-1 ring-[#6be9c2]/60 shadow-xs"
              : "hover:bg-[#16233b]/70 text-slate-200"
          }`}
        >
          <SidebarAvatar profile={profile} />
          <div className={`min-w-0 flex-1 ${isCollapsed ? "sr-only" : ""}`}>
            <p className="truncate text-sm font-bold leading-4 text-white group-hover:text-[#6be9c2] transition-colors">{fullName}</p>
            <p className="truncate text-xs font-medium text-slate-400">
              {roleLabels[profile?.role] || "Barangay Health Worker"}
            </p>
          </div>
          {!isCollapsed && (
            <svg
              className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                location.pathname === "/profile-settings"
                  ? "text-[#6be9c2]"
                  : "text-slate-400 group-hover:translate-x-0.5 group-hover:text-[#6be9c2]"
              }`}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
        </Link>
      </div>

      {isCollapsed && hoveredItem && (
        <div
          style={{ top: `${hoveredItem.top}px`, left: "64px" }}
          className="prds-tooltip-pop fixed z-[70] pointer-events-none select-none"
        >
          <div className="relative flex items-center rounded-lg border border-[#233554] bg-[#0c1527] px-3 py-1.5 text-xs font-bold tracking-wide text-white shadow-xl shadow-black/50 ring-1 ring-white/10">
            <span className="absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-2 rotate-45 border-l border-b border-[#233554] bg-[#0c1527]" />
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
      className="h-5 w-5 shrink-0 text-current transition-all duration-300 ease-out"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      {/* 3 Horizontal Bars */}
      <line
        x1={isCollapsed ? "11.5" : "4"}
        y1="6.5"
        x2={isCollapsed ? "20" : "12.5"}
        y2="6.5"
        className="transition-all duration-300 ease-out group-hover/btn:stroke-[#6be9c2]"
      />
      <line
        x1={isCollapsed ? "14" : "4"}
        y1="12"
        x2={isCollapsed ? "20" : "10"}
        y2="12"
        className="transition-all duration-300 ease-out group-hover/btn:stroke-[#6be9c2]"
      />
      <line
        x1={isCollapsed ? "11.5" : "4"}
        y1="17.5"
        x2={isCollapsed ? "20" : "12.5"}
        y2="17.5"
        className="transition-all duration-300 ease-out group-hover/btn:stroke-[#6be9c2]"
      />

      {/* Directional Chevron */}
      <path
        d={isCollapsed ? "M 4 6.5 L 9 12 L 4 17.5" : "M 20 6.5 L 15 12 L 20 17.5"}
        className="transition-all duration-300 ease-out group-hover/btn:stroke-[#6be9c2]"
      />
    </svg>
  );
}


