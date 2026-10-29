import ReportModuleSkeleton from "@frontend/views/reports/components/ReportModuleSkeleton";

function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/80 ${className}`} />;
}

const MODULE_META = {
  "/dashboard": {
    tag: "Overview",
    title: "Dashboard Overview",
    subtitle: "Real-time indicators, stock levels, and critical alerts across facilities.",
  },
  "/inventory": {
    tag: "Inventory Management",
    title: "Inventory Stock Ledger",
    subtitle: "Track on-hand stock, FEFO batches, batch movements, and facility reserves.",
  },
  "/medicines": {
    tag: "Medicine Catalog",
    title: "Medicines Directory",
    subtitle: "Manage pharmaceutical catalog, generic formulas, dosages, and unit packagings.",
  },
  "/facilities": {
    tag: "Facilities Management",
    title: "Health Facilities & Stations",
    subtitle: "Manage City Health Office locations and Barangay Health Station branches.",
  },
  "/stock-returns": {
    tag: "Stock Operations",
    title: "Stock Returns",
    subtitle: "Process damaged, recalled, expired, or excess inventory returns.",
  },
  "/requests": {
    tag: "Stock Transfers",
    title: "Medicine Requisition & Requests",
    subtitle: "Review, approve, and allocate medicine requisitions across health facilities.",
  },
  "/forecasting": {
    tag: "Demand Analytics",
    title: "Stock Demand Forecasting",
    subtitle: "Predict medicine consumption trends and calculate automated reorder levels.",
  },
  "/notifications": {
    tag: "System Alerts",
    title: "Notifications & Updates",
    subtitle: "Review system announcements, stock threshold warnings, and transfer statuses.",
  },
  "/activity-logs": {
    tag: "Audit Trail",
    title: "System Activity Logs",
    subtitle: "Monitor user actions, security audits, inventory adjustments, and status changes.",
  },
  "/users": {
    tag: "Access Control",
    title: "User Account Management",
    subtitle: "Manage healthcare personnel accounts, security roles, and facility assignments.",
  },
  "/patients": {
    tag: "Patient Records",
    title: "Patient Registry",
    subtitle: "Register patients, view medical allocation history, and track monthly claims.",
  },
  "/dispensing": {
    tag: "Walk-in Service",
    title: "Dispensing Management",
    subtitle: "Find a patient, check monthly medicine status, select available medicines, and complete claims.",
  },
  "/other-programs": {
    tag: "Public Health",
    title: "Special Health Programs",
    subtitle: "Manage targeted medicine allocations for special healthcare campaigns.",
  },
  "/profile-settings": {
    tag: "Account",
    title: "Profile & Account Settings",
    subtitle: "Manage your profile details, security preferences, and login credentials.",
  },
};

function DispensingSkeleton() {
  const steps = ["Patient", "Medicines", "Review & Complete"];

  return (
    <div className="space-y-4">
      {/* 1. Header Card */}
      <section className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] px-5 py-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#2D7A5D]">
            Walk-in service
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F5F1] px-3 py-1 text-xs font-bold text-[#2D7A5D]">
            Active workflow
          </span>
        </div>
        <h1 className="mt-2 text-xl font-bold text-[#1B2B30]">Dispensing</h1>
        <p className="mt-1 max-w-3xl text-sm text-[#5B7077]">
          Find a patient, check their monthly medicine status, select available medicines, then complete the claim.
        </p>
      </section>

      {/* 2. Loading Stepper */}
      <nav
        aria-label="Dispensing progress"
        className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] px-4 py-3 shadow-xs"
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
                        ? "bg-linear-to-r from-[#1F4E5A] to-[#286575] text-white shadow-xs"
                        : "border border-[#CFDDE0] bg-[#F9FBFB] text-[#5B7077]"
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
                  <span
                    aria-hidden="true"
                    className="relative mx-3 h-0.5 min-w-6 flex-1 overflow-hidden rounded-full bg-[#e5e7eb]"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* 3. Search and Patient List */}
      <section className="rounded-xl border border-[#d8dadc] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] px-4 py-3">
          <div>
            <p className="text-base font-bold text-[#0d1117]">Search Patient</p>
            <p className="mt-1 text-sm text-[#5f6673]">
              Search by patient name or code, then select the patient for this walk-in claim.
            </p>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="relative h-10 rounded-lg border border-[#d8dadc] bg-slate-50/60 flex items-center px-3">
            <SkeletonBlock className="h-4 w-4 rounded-full mr-3" />
            <SkeletonBlock className="h-3.5 w-60" />
          </div>

          {[0, 1, 2, 3, 4].map((key) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded-xl border border-[#e5e7eb] bg-[#f8f9ff] p-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <SkeletonBlock className="h-3.5 w-48 max-w-full" />
                  <SkeletonBlock className="h-2.5 w-72 max-w-[80%]" />
                </div>
              </div>
              <SkeletonBlock className="h-7 w-24 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="rounded-xl border border-[#d8dadc] bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <SkeletonBlock className="h-3.5 w-24 rounded-full mb-2" />
            <SkeletonBlock className="h-6 w-56" />
            <SkeletonBlock className="mt-1.5 h-3.5 w-80 max-w-full" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-9 w-28 rounded-lg" />
            <SkeletonBlock className="h-9 w-32 rounded-lg" />
          </div>
        </div>
      </section>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[#d8dadc] bg-white p-4 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-3.5 w-28" />
              <SkeletonBlock className="h-8 w-8 rounded-lg" />
            </div>
            <SkeletonBlock className="h-7 w-24" />
            <div className="flex items-center gap-2 pt-1">
              <SkeletonBlock className="h-3 w-16 rounded-full" />
              <SkeletonBlock className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>

      {/* 2 Analytics Charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-[#d8dadc] bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-5 w-44" />
            <SkeletonBlock className="h-7 w-24 rounded-lg" />
          </div>
          <div className="h-64 rounded-xl bg-slate-50/70 border border-[#e5e7eb] flex items-end gap-3 p-4">
            {[40, 65, 30, 85, 55, 75, 45, 90, 60, 70, 80, 50].map((h, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <SkeletonBlock
                  className="w-full rounded-t-sm"
                  style={{ height: `${h}%` }}
                />
                <SkeletonBlock className="h-2 w-4 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#d8dadc] bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-5 w-48" />
            <SkeletonBlock className="h-7 w-28 rounded-lg" />
          </div>
          <div className="h-64 rounded-xl bg-slate-50/70 border border-[#e5e7eb] flex items-center justify-center p-4">
            <div className="flex flex-col items-center gap-3">
              <div className="relative h-36 w-36 rounded-full border-8 border-slate-200/80 animate-pulse flex items-center justify-center">
                <SkeletonBlock className="h-14 w-14 rounded-full" />
              </div>
              <div className="flex items-center gap-4 pt-2">
                <SkeletonBlock className="h-3 w-20 rounded-full" />
                <SkeletonBlock className="h-3 w-20 rounded-full" />
                <SkeletonBlock className="h-3 w-20 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Alerts / Table */}
      <div className="rounded-xl border border-[#d8dadc] bg-white shadow-xs overflow-hidden">
        <div className="border-b border-[#e5e7eb] px-5 py-4 flex items-center justify-between">
          <SkeletonBlock className="h-5 w-52" />
          <SkeletonBlock className="h-7 w-24 rounded-lg" />
        </div>
        <div className="divide-y divide-[#e5e7eb]">
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="flex items-center justify-between p-4 gap-4">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-9 w-9 rounded-lg shrink-0" />
                <div className="space-y-1.5">
                  <SkeletonBlock className="h-3.5 w-48" />
                  <SkeletonBlock className="h-2.5 w-32" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-6 w-20 rounded-full" />
                <SkeletonBlock className="h-6 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileSettingsSkeleton() {
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[#d8dadc] bg-white px-5 py-4 shadow-sm">
        <SkeletonBlock className="h-3.5 w-20 rounded-full mb-2" />
        <SkeletonBlock className="h-6 w-52" />
        <SkeletonBlock className="mt-1.5 h-3.5 w-72" />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-[#d8dadc] bg-white p-6 shadow-xs flex flex-col items-center text-center space-y-4">
          <SkeletonBlock className="h-28 w-28 rounded-full" />
          <SkeletonBlock className="h-5 w-36" />
          <SkeletonBlock className="h-3.5 w-24 rounded-full" />
          <SkeletonBlock className="h-9 w-36 rounded-lg pt-1" />
        </div>

        <div className="lg:col-span-2 rounded-xl border border-[#d8dadc] bg-white p-6 shadow-xs space-y-4">
          <SkeletonBlock className="h-5 w-44" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {[1, 2, 3, 4, 5, 6].map((field) => (
              <div key={field} className="space-y-2">
                <SkeletonBlock className="h-3.5 w-24" />
                <SkeletonBlock className="h-10 w-full rounded-lg" />
              </div>
            ))}
          </div>
          <div className="pt-4 flex justify-end">
            <SkeletonBlock className="h-10 w-32 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceModuleSkeleton({ path = "" }) {
  if (path === "/reports") {
    return <ReportModuleSkeleton scope="monthly" />;
  }

  if (path === "/dispensing") {
    return <DispensingSkeleton />;
  }

  if (path === "/dashboard") {
    return <DashboardSkeleton />;
  }

  if (path === "/profile-settings") {
    return <ProfileSettingsSkeleton />;
  }

  const meta = MODULE_META[path] || {
    tag: "Module",
    title: "Loading Workspace Content...",
    subtitle: "Fetching the latest records and system synchronization data.",
  };

  return (
    <div className="space-y-5">
      {/* 1. Module Header Card */}
      <section className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] px-5 py-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#2D7A5D]">
              {meta.tag}
            </p>
            <h1 className="mt-1 text-xl font-bold text-[#1B2B30]">{meta.title}</h1>
            <p className="mt-1 text-sm text-[#5B7077]">{meta.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-9 w-28 rounded-lg" />
            <SkeletonBlock className="h-9 w-32 rounded-lg" />
          </div>
        </div>
      </section>

      {/* 2. Top Summary KPI Cards (4 cards) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[#d8dadc] bg-white p-4 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-3.5 w-24" />
              <SkeletonBlock className="h-8 w-8 rounded-lg" />
            </div>
            <SkeletonBlock className="h-7 w-24" />
            <div className="flex items-center gap-2 pt-1">
              <SkeletonBlock className="h-3 w-16 rounded-full" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      {/* 3. Filter Toolbar & Search Bar */}
      <div className="rounded-xl border border-[#d8dadc] bg-white p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative h-10 w-full max-w-sm rounded-lg border border-[#d8dadc] bg-slate-50/60 flex items-center px-3">
            <SkeletonBlock className="h-4 w-4 rounded-full mr-2.5 shrink-0" />
            <SkeletonBlock className="h-3.5 w-44" />
          </div>
          <SkeletonBlock className="h-10 w-36 rounded-lg" />
          <SkeletonBlock className="h-10 w-32 rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-10 w-24 rounded-lg" />
        </div>
      </div>

      {/* 4. Rich Data Table Card */}
      <div className="rounded-xl border border-[#d8dadc] bg-white shadow-xs overflow-hidden">
        {/* Table Column Headers */}
        <div className="border-b border-slate-200/80 bg-white px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 flex-1">
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="h-4 w-24 hidden sm:block" />
            <SkeletonBlock className="h-4 w-24 hidden md:block" />
            <SkeletonBlock className="h-4 w-20 hidden lg:block" />
          </div>
          <SkeletonBlock className="h-4 w-16" />
        </div>

        {/* Table Rows (6 rows) */}
        <div className="divide-y divide-[#e5e7eb]">
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div
              key={row}
              className="px-4 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <SkeletonBlock className="h-9 w-9 rounded-lg shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <SkeletonBlock className="h-3.5 w-48 max-w-full" />
                  <SkeletonBlock className="h-2.5 w-32 max-w-[70%]" />
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <SkeletonBlock className="h-6 w-20 rounded-full" />
              </div>
              <div className="hidden md:flex items-center gap-2">
                <SkeletonBlock className="h-5 w-16" />
              </div>
              <div className="hidden lg:flex items-center gap-2">
                <SkeletonBlock className="h-6 w-24 rounded-full" />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <SkeletonBlock className="h-8 w-16 rounded-lg" />
              </div>
            </div>
          ))}
        </div>

        {/* Table Pagination Footer */}
        <div className="border-t border-[#e5e7eb] bg-[#f8f9ff]/40 px-4 py-3 flex items-center justify-between">
          <SkeletonBlock className="h-3.5 w-40" />
          <div className="flex items-center gap-1.5">
            <SkeletonBlock className="h-8 w-8 rounded-lg" />
            <SkeletonBlock className="h-8 w-8 rounded-lg" />
            <SkeletonBlock className="h-8 w-8 rounded-lg" />
            <SkeletonBlock className="h-8 w-8 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
