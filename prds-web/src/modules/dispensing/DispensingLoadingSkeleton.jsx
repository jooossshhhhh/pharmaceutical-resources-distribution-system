import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { PillIcon, SearchIcon, UserPlusIcon } from "./DispensingUi";

function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-[#eef1f5] ${className}`} />;
}

function LoadingStepper() {
  const steps = ["Patient", "Medicines", "Review & Complete"];

  return (
    <nav
      aria-label="Dispensing progress"
      className="rounded-xl border border-[#d8dadc] bg-white px-4 py-3 shadow-sm"
    >
      <ol className="flex items-center">
        {steps.map((label, index) => {
          const active = index === 0;

          return (
            <li
              key={label}
              className={`flex min-w-0 items-center ${index < steps.length - 1 ? "flex-1" : ""}`}
            >
              <div className="flex min-w-0 items-center gap-2 rounded-lg">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    active
                      ? "bg-[#00a36c] text-white shadow-sm"
                      : "border border-[#d8dadc] bg-white text-[#9aa1ad]"
                  }`}
                >
                  {index + 1}
                </span>
                <span
                  className={`hidden whitespace-nowrap text-sm font-bold sm:block ${
                    active ? "text-[#0d1117]" : "text-[#9aa1ad]"
                  }`}
                >
                  {label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <span aria-hidden="true" className="relative mx-3 h-0.5 min-w-6 flex-1 overflow-hidden rounded-full bg-[#e5e7eb]" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function DispensingLoadingSkeleton({ error = "" }) {
  const { profile } = useAuth();
  const currentDateTime = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  return (
    <AdminShell currentDateTime={currentDateTime} profile={profile} onSignOut={logoutUser}>
      <div className="space-y-4">
        <section className="rounded-xl border border-[#d8dadc] bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#008f68]">Walk-in service</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#6be9c2] px-3 py-1 text-xs font-bold text-[#0d1117]">
              <PillIcon /> Active workflow
            </span>
          </div>
          <h1 className="mt-2 text-xl font-bold text-[#0d1117]">Dispensing</h1>
          <p className="mt-1 max-w-3xl text-sm text-[#5f6673]">
            Find a patient, confirm their monthly eligibility, select available medicines, then complete the claim.
          </p>
        </section>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        {!error && (
          <>
            <LoadingStepper />

            <section className="rounded-xl border border-[#d8dadc] bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] px-4 py-3">
                <div>
                  <p className="text-base font-bold text-[#0d1117]">Search Patient</p>
                  <p className="mt-1 text-sm text-[#5f6673]">
                    Search by patient name or code, then select the patient for this walk-in claim.
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-black px-4 text-sm font-bold text-white opacity-70 shadow-sm"
                >
                  <UserPlusIcon /> Register New Patient
                </button>
              </div>

              <div className="space-y-3 p-4">
                <div className="relative h-10 rounded-lg border border-[#d8dadc] bg-white">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a93a3]">
                    <SearchIcon />
                  </span>
                  <span className="absolute left-9 top-1/2 -translate-y-1/2 text-sm text-[#9aa1ad]">
                    Search patient name or code...
                  </span>
                </div>

                {[0, 1, 2, 3, 4].map((key) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-3"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1">
                        <SkeletonBlock className="h-3.5 w-48 max-w-full" />
                        <SkeletonBlock className="mt-2 h-2.5 w-72 max-w-[80%]" />
                      </div>
                    </div>
                    <SkeletonBlock className="h-7 w-24 rounded-full" />
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AdminShell>
  );
}