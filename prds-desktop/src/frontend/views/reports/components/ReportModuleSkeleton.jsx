import React from "react";

function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/80 ${className}`} />;
}

export default function ReportModuleSkeleton({ scope = "monthly" }) {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* 1. Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#d8dadc]">
        <div className="space-y-2">
          <SkeletonBlock className="h-8 w-64 max-w-full" />
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-5 w-40 rounded-full" />
            <SkeletonBlock className="h-5 w-28 rounded-full" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-9 w-32 rounded-lg" />
          <SkeletonBlock className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* 2. Top Summary KPI Cards (4 cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-4 rounded-xl border border-[#d8dadc]/70 bg-white shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-9 w-9 rounded-lg" />
            </div>
            <SkeletonBlock className="h-8 w-36" />
            <div className="flex items-center gap-2 pt-1">
              <SkeletonBlock className="h-3 w-16" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      {/* 3. Controls Bar Skeleton (Scope Toggle, Month/Year/Date, Facility Selector) */}
      <div className="p-4 rounded-xl border border-[#d8dadc]/80 bg-white shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <SkeletonBlock className="h-9 w-44 rounded-lg" />
          <SkeletonBlock className="h-9 w-40 rounded-lg" />
        </div>
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-9 w-48 rounded-lg" />
        </div>
      </div>

      {/* 4. Scope-Specific Content Skeleton */}
      {scope === "monthly" ? (
        <div className="space-y-6">
          {/* Monthly Reconciliation 6-Stage Flow KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map((k) => (
              <div
                key={k}
                className="p-3 rounded-xl border border-[#d8dadc]/60 bg-white shadow-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <SkeletonBlock className="h-3 w-16" />
                  <SkeletonBlock className="h-5 w-5 rounded-full" />
                </div>
                <SkeletonBlock className="h-6 w-20" />
                <SkeletonBlock className="h-3.5 w-24" />
              </div>
            ))}
          </div>

          {/* Area Programs Allocation Skeleton */}
          <div className="p-4 rounded-xl border border-[#d8dadc] bg-white shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-5 w-48" />
              <SkeletonBlock className="h-4 w-24" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((p) => (
                <div key={p} className="p-3 rounded-lg border border-purple-100 bg-purple-50/40 space-y-2">
                  <SkeletonBlock className="h-4 w-28 bg-purple-200/60" />
                  <SkeletonBlock className="h-5 w-20 bg-purple-200/60" />
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Inventory Physical Count Ledger Table Skeleton */}
          <div className="rounded-xl border border-[#d8dadc] bg-white shadow-sm overflow-hidden space-y-0">
            {/* Table Control / Search bar */}
            <div className="p-3 bg-[#f8f9ff]/70 border-b border-[#d8dadc]/60 flex items-center justify-between gap-4">
              <SkeletonBlock className="h-8 w-64 rounded-lg" />
              <div className="flex items-center gap-2">
                <SkeletonBlock className="h-7 w-20 rounded-full" />
                <SkeletonBlock className="h-7 w-24 rounded-full" />
                <SkeletonBlock className="h-7 w-20 rounded-full" />
              </div>
            </div>

            {/* Table Header and Rows */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-[#d8dadc]">
                    <th colSpan={6} className="p-2.5 border-r border-[#d8dadc]">
                      <SkeletonBlock className="h-4 w-36 mx-auto" />
                    </th>
                    <th colSpan={3} className="p-2.5 border-r border-[#d8dadc]">
                      <SkeletonBlock className="h-4 w-28 mx-auto" />
                    </th>
                    <th colSpan={3} className="p-2.5 border-r border-[#d8dadc]">
                      <SkeletonBlock className="h-4 w-28 mx-auto" />
                    </th>
                    <th colSpan={3} className="p-2.5 border-r border-[#d8dadc]">
                      <SkeletonBlock className="h-4 w-28 mx-auto" />
                    </th>
                    <th colSpan={3} className="p-2.5 border-r border-[#d8dadc]">
                      <SkeletonBlock className="h-4 w-28 mx-auto" />
                    </th>
                    <th colSpan={4} className="p-2.5 border-r border-[#d8dadc]">
                      <SkeletonBlock className="h-4 w-32 mx-auto" />
                    </th>
                    <th colSpan={3} className="p-2.5 border-r border-[#d8dadc]">
                      <SkeletonBlock className="h-4 w-24 mx-auto" />
                    </th>
                    <th colSpan={3} className="p-2.5">
                      <SkeletonBlock className="h-4 w-28 mx-auto" />
                    </th>
                  </tr>
                  <tr className="bg-slate-50 border-b border-[#d8dadc]">
                    {[
                      "ITEM NO",
                      "ITEM DESCRIPTION",
                      "UNIT",
                      "BRAND",
                      "LOT NO",
                      "EXPIRY DATE",
                      "QUANTITY",
                      "UNIT COST",
                      "TOTAL COST",
                      "QUANTITY",
                      "UNIT COST",
                      "TOTAL COST",
                      "QUANTITY",
                      "UNIT COST",
                      "TOTAL COST",
                      "QUANTITY",
                      "UNIT COST",
                      "TOTAL COST",
                      "QUANTITY",
                      "UNIT COST",
                      "TOTAL COST",
                      "AREA/PROG",
                      "QUANTITY",
                      "UNIT COST",
                      "TOTAL COST",
                      "QUANTITY",
                      "UNIT COST",
                      "TOTAL COST",
                    ].map((col, idx) => (
                      <th key={idx} className="p-2 text-center border-r border-[#d8dadc]/60 last:border-r-0">
                        <SkeletonBlock className="h-3 w-12 mx-auto" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d8dadc]/60">
                  {/* PO Header Section Skeleton */}
                  <tr className="bg-amber-50/60 border-y border-amber-200/70">
                    <td className="p-2 border-r border-amber-200/60">
                      <SkeletonBlock className="h-3 w-4 mx-auto bg-amber-200/60" />
                    </td>
                    <td colSpan={5} className="p-2 border-r border-amber-200/60">
                      <SkeletonBlock className="h-4 w-32 bg-amber-200/70" />
                    </td>
                    {Array.from({ length: 22 }).map((_, c) => (
                      <td key={c} className="p-2 text-right border-r border-[#d8dadc]/40 last:border-r-0">
                        <SkeletonBlock className="h-3 w-6 ml-auto bg-amber-200/40" />
                      </td>
                    ))}
                  </tr>

                  {/* Shimmering Data Rows */}
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
                    <tr key={row} className="hover:bg-slate-50/50">
                      <td className="p-2 text-center border-r border-[#d8dadc]/60">
                        <SkeletonBlock className="h-3 w-4 mx-auto" />
                      </td>
                      <td className="p-2 border-r border-[#d8dadc]/60">
                        <SkeletonBlock className={`h-3.5 ${row % 2 === 0 ? "w-44" : "w-36"}`} />
                      </td>
                      <td className="p-2 text-center border-r border-[#d8dadc]/60">
                        <SkeletonBlock className="h-3 w-10 mx-auto" />
                      </td>
                      <td className="p-2 border-r border-[#d8dadc]/60">
                        <SkeletonBlock className="h-3 w-16" />
                      </td>
                      <td className="p-2 border-r border-[#d8dadc]/60">
                        <SkeletonBlock className="h-3 w-14 font-mono" />
                      </td>
                      <td className="p-2 border-r border-[#d8dadc]/60">
                        <SkeletonBlock className="h-3 w-16" />
                      </td>
                      {Array.from({ length: 22 }).map((_, c) => (
                        <td key={c} className="p-2 text-right border-r border-[#d8dadc]/60 last:border-r-0">
                          <SkeletonBlock className="h-3 w-12 ml-auto" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer Skeleton */}
            <div className="p-3 border-t border-[#d8dadc] flex items-center justify-between bg-white">
              <SkeletonBlock className="h-4 w-40" />
              <div className="flex items-center gap-2">
                <SkeletonBlock className="h-7 w-7 rounded-md" />
                <SkeletonBlock className="h-4 w-20" />
                <SkeletonBlock className="h-7 w-7 rounded-md" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Daily View Skeleton */
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 p-4 rounded-xl border border-[#d8dadc] bg-white shadow-xs space-y-4">
              <SkeletonBlock className="h-5 w-32" />
              <SkeletonBlock className="h-64 w-full rounded-lg" />
            </div>
            <div className="lg:col-span-2 p-4 rounded-xl border border-[#d8dadc] bg-white shadow-xs space-y-4">
              <SkeletonBlock className="h-5 w-44" />
              <SkeletonBlock className="h-64 w-full rounded-lg" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 rounded-xl border border-[#d8dadc] bg-white shadow-xs space-y-4">
              <SkeletonBlock className="h-5 w-40" />
              <SkeletonBlock className="h-56 w-full rounded-lg" />
            </div>
            <div className="p-4 rounded-xl border border-[#d8dadc] bg-white shadow-xs space-y-4">
              <SkeletonBlock className="h-5 w-40" />
              <SkeletonBlock className="h-56 w-full rounded-lg" />
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[#d8dadc] bg-white shadow-xs space-y-4">
            <SkeletonBlock className="h-5 w-48" />
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((d) => (
                <div key={d} className="flex items-center justify-between p-2.5 rounded-lg border border-[#d8dadc]/60">
                  <div className="flex items-center gap-3">
                    <SkeletonBlock className="h-4 w-8" />
                    <SkeletonBlock className="h-4 w-36" />
                    <SkeletonBlock className="h-4 w-20" />
                  </div>
                  <SkeletonBlock className="h-4 w-24" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
