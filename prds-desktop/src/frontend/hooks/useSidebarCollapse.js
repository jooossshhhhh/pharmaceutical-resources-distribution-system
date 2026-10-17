import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "prds-sidebar-collapsed";

let globalSidebarCollapsed = (() => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
})();

const listeners = new Set();

export function setSidebarCollapsedGlobally(collapsed) {
  globalSidebarCollapsed = Boolean(collapsed);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(globalSidebarCollapsed));
    }
  } catch {}
  listeners.forEach((listener) => {
    try {
      listener(globalSidebarCollapsed);
    } catch {}
  });
}

export function toggleSidebarCollapsedGlobally() {
  setSidebarCollapsedGlobally(!globalSidebarCollapsed);
}

export function useSidebarCollapse() {
  const [isCollapsed, setIsCollapsed] = useState(globalSidebarCollapsed);

  useEffect(() => {
    const handleChange = (val) => {
      setIsCollapsed(val);
    };
    listeners.add(handleChange);
    setIsCollapsed(globalSidebarCollapsed);
    return () => {
      listeners.delete(handleChange);
    };
  }, []);

  const toggleCollapsed = useCallback(() => {
    toggleSidebarCollapsedGlobally();
  }, []);

  return [isCollapsed, toggleCollapsed];
}

export default useSidebarCollapse;
