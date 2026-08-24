import { useMemo } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";

export default function ComingSoonModule({ icon, description, title }) {
  const { profile } = useAuth();

  const today = useMemo(() => {
    return new Intl.DateTimeFormat("en-PH", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date());
  }, []);

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <div className="prds-fade-in mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#dffbf2] text-[#008f68]">
          {icon || (
            <svg
              aria-hidden="true"
              className="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M10 15 9 21l7-3-1-3" />
              <path d="M12 3a6 6 0 0 0-4.5 9.8c.3.3.5.7.5 1.2v1h8v-1c0-.5.2-.9.5-1.2A6 6 0 0 0 12 3Z" />
            </svg>
          )}
        </span>
        <h2 className="mt-6 text-2xl font-bold text-[#0d1117]">{title || "Coming Soon"}</h2>
        <p className="mt-3 text-sm leading-6 text-[#5f6673]">
          {description ||
            "This module is under development and will be available in a future update."}
        </p>
        <span className="mt-6 inline-flex rounded-full border border-[#d8dadc] bg-white px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#008f68]">
          Coming Soon
        </span>
      </div>
    </AdminShell>
  );
}