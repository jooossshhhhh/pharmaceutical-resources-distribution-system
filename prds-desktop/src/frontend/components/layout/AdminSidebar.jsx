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
  { label: "Medicines", path: "/medicines", roles: ["PHARMA_I", "PHARMA_II"], category: "Operations" },
  { label: "Stock Returns", path: "/stock-returns", category: "Operations" },
  { label: "Requests", path: "/requests", category: "Operations" },
  { label: "Dispensing", path: "/dispensing", category: "Operations" },
  { label: "Patients", path: "/patients", category: "Operations" },
  { label: "Other Programs", path: "/other-programs", roles: ["PHARMA_II"], category: "Operations" },
  { label: "Forecasting", path: "/forecasting", category: "Reports & Analytics" },
  { label: "Reports", path: "/reports", category: "Reports & Analytics" },
  { label: "Facilities", path: "/facilities", roles: ["PHARMA_I", "PHARMA_II"], category: "Administration" },
  { label: "User Management", path: "/users", roles: ["PHARMA_II"], category: "Administration" },
  { label: "Activity Logs", path: "/activity-logs", category: "System" },
  { label: "Notifications", path: "/notifications", category: "System" },
];

const navGroupOrder = ["Overview", "Operations", "Reports & Analytics", "Administration", "System"];

const SidebarIcon = ({ label, isActive }) => {
  const IconComponent = navIcons[label];
  if (!IconComponent) return null;

  return (
    <span
      className={`relative flex h-5 w-5 shrink-0 items-center justify-center transition-all duration-300 ease-out ${
        isActive
          ? "scale-110 text-[#34769B]"
          : "text-[#D5E5E8]/80 group-hover:scale-110 group-hover:text-white"
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

function SidebarAvatar({ profile, isActive }) {
  const [hasError, setHasError] = useState(false);
  const avatarUrl = profile?.avatar_url;

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setHasError(false);
    });
    return () => {
      active = false;
    };
  }, [avatarUrl]);

  if (avatarUrl && !hasError) {
    return (
      <img
        src={avatarUrl}
        alt={`${profile?.first_name || ""} ${profile?.last_name || ""}`.trim()}
        onError={() => setHasError(true)}
        className="h-9 w-9 shrink-0 rounded-full object-cover shadow-xs group-hover:scale-105 transition-transform ring-1 ring-white/20"
      />
    );
  }

  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black shadow-xs group-hover:scale-105 transition-transform ${
        isActive
          ? "bg-[#34769B] text-white"
          : "bg-white/15 text-[#D5E5E8] border border-white/20"
      }`}
    >
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
  if (!itemPath || !currentPath) return false;
  if (itemPath === "/users") {
    return currentPath === "/users" || currentPath.startsWith("/users/");
  }

  return itemPath === currentPath || currentPath.startsWith(`${itemPath}/`);
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
      className={`relative z-[60] flex h-full min-h-0 flex-col overflow-hidden border-r border-[#1A4350]/60 bg-gradient-to-b from-[#245866] via-[#1F4E5A] to-[#1A4350] text-[#D5E5E8] transition-all duration-300 ${
        isCollapsed ? "w-14.5" : "w-57"
      }`}
    >
      {/* Complementary modal focus tint: softly harmonizes sidebar with dimmed workspace without any blur */}
      <div
        className={`pointer-events-none absolute inset-0 z-0 transition-opacity duration-300 ${
          isModalOpen ? "opacity-100 bg-black/25" : "opacity-0"
        }`}
        aria-hidden="true"
      />

      <div
        className={`flex h-13.5 shrink-0 items-center border-b border-white/10 ${
          isCollapsed ? "justify-center px-2" : "gap-2.5 px-3"
        }`}
      >
        <div className={`min-w-0 flex-1 items-center gap-2 ${isCollapsed ? "sr-only" : "flex"}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1 ring-1 ring-white/20 shadow-xs">
            <img src={prdsLogo} alt="PRDS" className="h-full w-full object-contain" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold leading-3.5 text-white">
              Pharmaceutical Resources Distribution System
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={`group/btn flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent text-[#D5E5E8]/80 transition-all duration-300 ease-out hover:border-white/15 hover:bg-white/10 hover:text-white hover:shadow-xs active:scale-90 ${
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
        {navGroups.map((group, groupIndex) => (
          <div key={group.category}>
            {!isCollapsed && (
              <div
                className={`px-3 pb-1.5 ${
                  groupIndex === 0 ? "pt-1.5" : "pt-4"
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-wider text-[#D5E5E8]/60">
                  {group.category}
                </p>
              </div>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = isActiveNavItem(item.path, location.pathname);
                const hasChildren = item.children?.length > 0;

                const itemClass = `group relative flex h-10 w-full items-center rounded-lg text-left text-sm font-bold transition-all duration-300 ease-out ${
                  isActive
                    ? "bg-[#F9FBFB] text-[#1F4A66] shadow-sm font-black"
                    : "text-[#D5E5E8] hover:bg-white/10 hover:text-white"
                } ${isCollapsed ? "justify-center px-0" : "gap-3 px-3"}`;

                const label = (
                  <>
                    <SidebarIcon label={item.label} isActive={isActive} />
                    <span
                      className={`truncate transition-all duration-300 ease-out ${
                        isCollapsed ? "sr-only" : ""
                      } ${
                        isActive
                          ? "translate-x-0.5 font-black text-[#1F4A66]"
                          : "font-semibold text-[#D5E5E8] group-hover:translate-x-0.5 group-hover:text-white"
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
                        className="ml-4 mt-1 grid gap-1 border-l border-white/15 pl-3 transition-opacity duration-200"
                      >
                        {item.children.map((child) => {
                          const isChildActive = isExactActiveNavItem(child.path, location.pathname);

                          return (
                            <Link
                              key={child.path}
                              to={child.path}
                              className={`flex h-8 items-center rounded-md px-3 text-xs font-bold transition ${
                                isChildActive
                                  ? "bg-[#F9FBFB] text-[#1F4A66] font-black shadow-xs"
                                  : "text-[#D5E5E8]/70 hover:bg-white/10 hover:text-white"
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
        ))}
      </nav>

      <div
        className={`shrink-0 border-t border-white/10 py-3 ${
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
              ? "bg-[#F9FBFB] text-[#1F4A66] shadow-sm font-black"
              : "hover:bg-white/10 text-[#D5E5E8]"
          }`}
        >
          <SidebarAvatar
            profile={profile}
            isActive={location.pathname === "/profile-settings"}
          />
          <div className={`min-w-0 flex-1 ${isCollapsed ? "sr-only" : ""}`}>
            <p
              className={`truncate text-sm font-bold leading-4 transition-colors ${
                location.pathname === "/profile-settings"
                  ? "text-[#1F4A66]"
                  : "text-white group-hover:text-[#E3EEF5]"
              }`}
            >
              {fullName}
            </p>
            <p
              className={`truncate text-xs font-medium ${
                location.pathname === "/profile-settings"
                  ? "text-[#1F4A66]/75"
                  : "text-[#D5E5E8]/70 group-hover:text-[#D5E5E8]"
              }`}
            >
              {roleLabels[profile?.role] || "Barangay Health Worker"}
            </p>
          </div>
          {!isCollapsed && (
            <svg
              className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                location.pathname === "/profile-settings"
                  ? "text-[#1F4A66]"
                  : "text-[#D5E5E8]/60 group-hover:translate-x-0.5 group-hover:text-white"
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
          <div className="relative flex items-center rounded-lg border border-[#245866] bg-[#1A4350] px-3 py-1.5 text-xs font-bold tracking-wide text-[#F9FBFB] shadow-xl ring-1 ring-black/20">
            <span className="absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-2 rotate-45 border-l border-b border-[#245866] bg-[#1A4350]" />
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
        className="transition-all duration-300 ease-out group-hover/btn:stroke-white"
      />
      <line
        x1={isCollapsed ? "14" : "4"}
        y1="12"
        x2={isCollapsed ? "20" : "10"}
        y2="12"
        className="transition-all duration-300 ease-out group-hover/btn:stroke-white"
      />
      <line
        x1={isCollapsed ? "11.5" : "4"}
        y1="17.5"
        x2={isCollapsed ? "20" : "12.5"}
        y2="17.5"
        className="transition-all duration-300 ease-out group-hover/btn:stroke-white"
      />

      {/* Directional Chevron */}
      <path
        d={isCollapsed ? "M 4 6.5 L 9 12 L 4 17.5" : "M 20 6.5 L 15 12 L 20 17.5"}
        className="transition-all duration-300 ease-out group-hover/btn:stroke-white"
      />
    </svg>
  );
}


