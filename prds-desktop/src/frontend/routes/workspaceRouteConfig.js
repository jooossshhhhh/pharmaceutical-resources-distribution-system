export const WORKSPACE_ROUTE_CONFIG = [
  {
    path: "/dashboard",
    label: "Dashboard",
  },
  {
    path: "/facilities",
    label: "Facilities",
    allowedRoles: ["PHARMA_I", "PHARMA_II"],
  },
  {
    path: "/medicines",
    label: "Medicines",
    allowedRoles: ["PHARMA_I", "PHARMA_II"],
  },
  {
    path: "/inventory",
    label: "Inventory",
  },
  {
    path: "/stock-returns",
    label: "Stock Returns",
    allowedRoles: ["BHW", "PHARMA_I", "PHARMA_II"],
  },
  {
    path: "/requests",
    label: "Requests",
  },
  {
    path: "/forecasting",
    label: "Forecasting",
  },
  {
    path: "/notifications",
    label: "Notifications",
  },
  {
    path: "/activity-logs",
    label: "Activity Logs",
  },
  {
    path: "/users",
    label: "User Management",
    allowedRoles: ["PHARMA_II"],
  },
  {
    path: "/patients",
    label: "Patients",
  },
  {
    path: "/dispensing",
    label: "Dispensing",
  },
  {
    path: "/reports",
    label: "Reports",
  },
  {
    path: "/other-programs",
    label: "Other Programs",
    allowedRoles: ["PHARMA_II"],
  },
  {
    path: "/profile-settings",
    label: "Profile Settings",
  },
];

export const WORKSPACE_ROUTE_ALIASES = {
  "/": "/dashboard",
  "/suppliers": "/inventory",
  "/inventory-bhw": "/inventory",
  "/transfers": "/inventory",
  "/users/accounts": "/users",
  "/users/change-requests": "/users",
  "/profile": "/profile-settings",
};

export const resolveCanonicalPath = (pathname = "") => {
  const rawPath = String(pathname || "").replace(/\/+$/, "") || "/";
  return WORKSPACE_ROUTE_ALIASES[rawPath] || rawPath;
};

export const isRouteAuthorized = (routeConfig, role) => {
  if (!routeConfig) return false;
  if (!routeConfig.allowedRoles || routeConfig.allowedRoles.length === 0) return true;
  return routeConfig.allowedRoles.includes(role);
};
