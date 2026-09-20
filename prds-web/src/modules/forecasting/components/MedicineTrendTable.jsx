import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Layers, TrendingDown, TrendingUp } from "lucide-react";
import { formatNumber } from "../../dashboard/dashboardUtils";
import { usePaginatedRows } from "../../../hooks/usePaginatedRows";

export default function MedicineTrendTable({
  rows = [],
  selectedMedicineId = "",
  onSelectMedicine,
}) {
  const {
    currentPage,
    paginatedRows,
    pageSize,
    setCurrentPage,
    totalCount,
    totalPages,
  } = usePaginatedRows(rows, 10);

  const canSelect = typeof onSelectMedicine === "function";

  return (
    <section className="rounded-xl border border-[#d8dadc] bg-white shadow-sm shadow-slate-200/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Layers className="h-4 w-4 text-slate-400" />
          <h2 className="text-xs font-black uppercase tracking-wider text-[#0d1117]">
            Medicine Trends
          </h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
            {totalCount} items
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-black uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">Medicine</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Facility</th>
              <th className="px-4 py-3 text-right">Current Stock</th>
              <th className="px-4 py-3 text-center">Trend</th>
              <th className="px-4 py-3 text-right">Next Month</th>
              <th className="px-4 py-3 text-center">Coverage</th>
              <th className="px-4 py-3 text-center">R²</th>
              <th className="px-5 py-3 text-center">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm font-semibold text-slate-400">
                  No medicine trends match the selected filters.
                </td>
              </tr>
            ) : (
              paginatedRows.map((row) => {
                const isSelected = row.medicineId === selectedMedicineId;
                const slope = Number(row.slope || 0);
                const fullName = `${row.genericName} ${row.dosage || ""}`.trim();
                const coverage = Number(row.coverageMonths);

                return (
                  <tr
                    key={row.medicineId}
                    onClick={() => canSelect && onSelectMedicine(row.medicineId)}
                    className={`transition duration-150 ${isSelected
                        ? "bg-[#e6fbf4]/80 font-medium"
                        : "hover:bg-slate-50/80"
                      } ${canSelect ? "cursor-pointer" : ""}`}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-[#0d1117]">{fullName}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium text-slate-500">
                      {row.category || "General"}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium text-slate-600">
                      {row.facilityName || "CHO Central"}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-800">
                      {formatNumber(row.stockQuantity)}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="inline-flex items-center gap-1 font-bold">
                        {slope > 0.05 ? (
                          <>
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-emerald-700">+{slope.toFixed(1)}</span>
                          </>
                        ) : slope < -0.05 ? (
                          <>
                            <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                            <span className="text-rose-600">{slope.toFixed(1)}</span>
                          </>
                        ) : (
                          <span className="text-slate-400">0.0</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-800">
                      {formatNumber(row.nextMonthDemand)}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span
                        className={`font-black ${Number.isFinite(coverage) && coverage < 1.0
                            ? "text-rose-600"
                            : Number.isFinite(coverage) && coverage > 2.5
                              ? "text-amber-600"
                              : "text-emerald-600"
                          }`}
                      >
                        {row.coverageMultiplier || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center text-xs font-medium text-slate-500">
                      {Number(row.rSquared || 0).toFixed(3)}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={
                          row.circularRisk?.badgeClass ||
                          "inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 whitespace-nowrap"
                        }
                      >
                        {row.circularRisk?.label || row.risk?.label || "Stable"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer matching mockup */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
        <p className="text-xs font-medium text-slate-500">
          Page {currentPage} of {totalPages || 1} - {totalCount} items
        </p>

        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                onClick={() => setCurrentPage(pageNum)}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition ${pageNum === currentPage
                    ? "bg-[#00a36c] text-white shadow-2xs"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
              >
                {pageNum}
              </button>
            ))}

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
