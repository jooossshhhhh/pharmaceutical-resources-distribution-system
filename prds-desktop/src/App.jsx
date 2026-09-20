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
  }, []);

  const [isPinned, setIsPinned] = useState(() => {
    return localStorage.getItem("prds-titlebar-pinned") === "true";
  });

  const handleTogglePin = () => {
    setIsPinned((prev) => {
      const next = !prev;
      localStorage.setItem("prds-titlebar-pinned", String(next));
      return next;
    });
  };

  return (
    <div
      className={`flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#f5f7fb] transition-[padding-top] duration-300 ease-in-out ${
        isPinned ? "pt-10" : "pt-0"
      }`}
    >
      <DesktopTitlebar isPinned={isPinned} onTogglePin={handleTogglePin} />
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden relative">
        <AppRoutes />
      </div>
    </div>
  );
}

export default App;
