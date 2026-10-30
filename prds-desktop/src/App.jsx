import { useState, useEffect } from "react";
import AppRoutes from "@frontend/routes/AppRoutes";
import DesktopTitlebar from "@frontend/components/layout/DesktopTitlebar";
import { initSqliteSchema, isTauriEnvironment } from "@backend/database/sqliteClient";

function App() {
  useEffect(() => {
    if (isTauriEnvironment()) {
      initSqliteSchema().catch((error) => {
        console.warn("Unable to initialize the local database:", error);
      });
    }

    const handleContextMenu = (e) => {
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handleContextMenu);
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  const [isPinned, setIsPinned] = useState(() => {
    const saved = localStorage.getItem("prds-titlebar-pinned");
    return saved !== null ? saved === "true" : true;
  });

  const handleTogglePin = () => {
    setIsPinned((prev) => {
      const next = !prev;
      localStorage.setItem("prds-titlebar-pinned", String(next));
      window.dispatchEvent(new Event("prds-titlebar-pin-change"));
      return next;
    });
  };

  const isDesktop = isTauriEnvironment();

  return (
    <div
      className={`flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#f5f7fb] transition-[padding-top] duration-300 ease-in-out ${
        isPinned && isDesktop ? "pt-10" : "pt-0"
      }`}
    >
      {isDesktop && (
        <DesktopTitlebar isPinned={isPinned} onTogglePin={handleTogglePin} />
      )}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden relative">
        <AppRoutes />
      </div>
    </div>
  );
}

export default App;
