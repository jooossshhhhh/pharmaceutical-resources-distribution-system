import {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import AdminShell from "../components/layout/AdminShell";
import ModalContainerContext from "../context/ModalContainerContext";
import WorkspaceModuleSkeleton from "../components/common/WorkspaceModuleSkeleton";
import {
  WORKSPACE_ROUTE_CONFIG,
  WORKSPACE_ROUTE_ALIASES,
  resolveCanonicalPath,
  isRouteAuthorized,
} from "./workspaceRouteConfig.js";

// Main Application Modules (Lazy loaded on demand)
const MODULE_COMPONENTS = {
  "/dashboard": lazy(() => import("@frontend/views/dashboard/DashboardModule")),
  "/facilities": lazy(() => import("@frontend/views/facilities/FacilitiesModule")),
  "/medicines": lazy(() => import("@frontend/views/medicines/MedicinesModule")),
  "/inventory": lazy(() => import("@frontend/views/inventory/InventoryModule")),
  "/stock-returns": lazy(() => import("@frontend/views/stock-returns/StockReturnsModule")),
  "/requests": lazy(() => import("@frontend/views/requests/RequestsModule")),
  "/forecasting": lazy(() => import("@frontend/views/forecasting/ForecastingModule")),
  "/notifications": lazy(() => import("@frontend/views/notifications/NotificationsModule")),
  "/activity-logs": lazy(() => import("@frontend/views/activity/ActivityLogsModule")),
  "/users": lazy(() => import("@frontend/views/users/UserManagementModule")),
  "/patients": lazy(() => import("@frontend/views/patients/PatientsModule")),
  "/dispensing": lazy(() => import("@frontend/views/dispensing/DispensingModule")),
  "/reports": lazy(() => import("@frontend/views/reports/ReportModule")),
  "/other-programs": lazy(() => import("@frontend/views/other-programs/OtherProgramsModule")),
  "/profile-settings": lazy(() => import("@frontend/views/profile/ProfileSettingsModule")),
};

export function RouteLoadingFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#f8fafc]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-emerald-500 border-t-transparent" />
        <span className="text-xs font-medium text-slate-500">Loading module...</span>
      </div>
    </div>
  );
}

function KeepAliveRouteView({
  route,
  isActive,
  modalContainer,
  onRouteModalChange,
}) {
  const modalCountRef = useRef(0);
  const [hasModals, setHasModals] = useState(false);
  const routePath = route.path;

  const handleSetModalOpen = useCallback(
    (isOpen) => {
      if (isOpen) {
        modalCountRef.current += 1;
      } else {
        modalCountRef.current = Math.max(0, modalCountRef.current - 1);
      }
      const open = modalCountRef.current > 0;
      setHasModals(open);
      onRouteModalChange(routePath, open);
    },
    [routePath, onRouteModalChange]
  );

  const routeModalContextValue = useMemo(
    () => ({
      container: modalContainer,
      isModalOpen: isActive && hasModals,
      setModalOpen: handleSetModalOpen,
      isViewActive: isActive,
      routePath,
    }),
    [modalContainer, isActive, hasModals, handleSetModalOpen, routePath]
  );

  const Component = MODULE_COMPONENTS[routePath];
  if (!Component) return null;

  return (
    <div
      key={routePath}
      id={`prds-view-${routePath.replace(/\//g, "-").replace(/^-/, "")}`}
      aria-hidden={!isActive}
      className={`min-w-0 w-full ${isActive ? "block" : "hidden"}`}
      style={{ display: isActive ? "block" : "none" }}
    >
      <ModalContainerContext.Provider value={routeModalContextValue}>
        <Suspense fallback={<WorkspaceModuleSkeleton path={routePath} />}>
          <Component />
        </Suspense>
      </ModalContainerContext.Provider>
    </div>
  );
}

function KeepAliveWorkspaceViews({ canonicalPath, visitedPaths }) {
  const outerModalContext = useContext(ModalContainerContext);
  const modalContainer = outerModalContext?.container || null;
  const outerSetModalOpen = outerModalContext?.setModalOpen;

  const [openModalRoutes, setOpenModalRoutes] = useState(() => new Set());

  const handleRouteModalChange = useCallback((routePath, hasOpenModals) => {
    setOpenModalRoutes((prev) => {
      const next = new Set(prev);
      if (hasOpenModals) {
        next.add(routePath);
      } else {
        next.delete(routePath);
      }
      return next;
    });
  }, []);

  const isModalActiveInCurrentRoute = openModalRoutes.has(canonicalPath);

  useEffect(() => {
    if (typeof outerSetModalOpen === "function") {
      outerSetModalOpen(isModalActiveInCurrentRoute);
    }
  }, [isModalActiveInCurrentRoute, outerSetModalOpen]);

  return (
    <div className="relative min-w-0 w-full">
      {WORKSPACE_ROUTE_CONFIG.map((route) => {
        if (!visitedPaths.has(route.path)) {
          return null;
        }

        const isActive = route.path === canonicalPath;

        return (
          <KeepAliveRouteView
            key={route.path}
            route={route}
            isActive={isActive}
            modalContainer={modalContainer}
            onRouteModalChange={handleRouteModalChange}
          />
        );
      })}
    </div>
  );
}

export default function KeepAliveWorkspaceLayout() {
  const location = useLocation();
  const { profile } = useAuth();

  const rawPath = location.pathname.replace(/\/+$/, "") || "/";
  const canonicalPath = resolveCanonicalPath(rawPath);
  const isAlias = Boolean(WORKSPACE_ROUTE_ALIASES[rawPath]);

  const today = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date()),
    []
  );

  // Find matching route configuration
  const activeRouteConfig = useMemo(
    () => WORKSPACE_ROUTE_CONFIG.find((route) => route.path === canonicalPath),
    [canonicalPath]
  );

  // Check role authorization for the requested route
  const isAuthorized = useMemo(
    () => isRouteAuthorized(activeRouteConfig, profile?.role),
    [activeRouteConfig, profile?.role]
  );

  // Maintain the set of visited routes so views mount on demand and stay alive in memory
  const [visitedPaths, setVisitedPaths] = useState(() => {
    if (activeRouteConfig && isAuthorized) {
      return new Set([canonicalPath]);
    }
    return new Set(["/dashboard"]);
  });

  if (activeRouteConfig && isAuthorized && !visitedPaths.has(canonicalPath)) {
    setVisitedPaths((prev) => {
      const next = new Set(prev);
      next.add(canonicalPath);
      return next;
    });
  }


  // Notify charts, maps, and responsive layouts to refresh dimensions when switching views
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 40);
    return () => clearTimeout(timer);
  }, [canonicalPath]);

  if (isAlias) {
    return <Navigate to={WORKSPACE_ROUTE_ALIASES[rawPath]} replace />;
  }

  if (!activeRouteConfig) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!isAuthorized) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <KeepAliveWorkspaceViews
        canonicalPath={canonicalPath}
        visitedPaths={visitedPaths}
      />
    </AdminShell>
  );
}


