import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Layers, TrendingDown, TrendingUp } from "lucide-react";
import { formatNumber } from "@shared/utils/dashboardUtils";
import { usePaginatedRows } from "../../../hooks/usePaginatedRows";

export default function MedicineTrendTable({
  rows = [],
  selectedMedicineId = "",
  onSelectMedicine,
}) {
  const {
    currentPage,
    paginatedRows = [],
    pageSize,
    setCurrentPage,
    totalCount,
    totalPages,
  } = usePaginatedRows(rows, 10);

  const canSelect = typeof onSelectMedicine === "function";

  return (
    <section className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#CFDDE0] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Layers className="h-4 w-4 text-[#5B7077]" />
          <h2 className="text-xs font-black uppercase tracking-wider text-[#1B2B30]">
            Medicine Trends
          </h2>
          <span className="rounded-full bg-[#E5EFF1] px-2.5 py-0.5 text-xs font-bold text-[#5B7077]">
            {totalCount} items
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-[#CFDDE0] bg-[#F4F8F8] text-[11px] font-bold uppercase tracking-wider text-[#5B7077]">
            <tr>
              <th className="px-5 py-3">Medicine</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Facility</th>
              <th className="px-4 py-3 text-right">Current Stock</th>
              <th className="px-4 py-3 text-center">Monthly Change</th>
              <th className="px-4 py-3 text-right">Next Month Need</th>
              <th className="px-4 py-3 text-center">Supply Coverage</th>
              <th className="px-4 py-3 text-center">Reliability</th>
              <th className="px-5 py-3 text-center">Risk Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#CFDDE0]">
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
                        ? "bg-[#EBF3F5] font-medium"
                        : "hover:bg-[#F4F8F8]"
                      } ${canSelect ? "cursor-pointer" : ""}`}
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-[#1B2B30]">{fullName}</p>
                      {row.brandName && (
                        <p className="text-[11px] font-medium text-slate-400">{row.brandName}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium text-slate-500">
                      {row.category || "General"}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium text-slate-600">
                      {row.facilityName || "City Health Office"}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold text-slate-800">
                      {formatNumber(row.stockQuantity)}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="inline-flex items-center gap-1 font-bold">
                        {slope > 0.05 ? (
                          <>
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-emerald-700">+{slope.toFixed(1)}/mo</span>
                          </>
                        ) : slope < -0.05 ? (
                          <>
                            <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                            <span className="text-rose-600">{slope.toFixed(1)}/mo</span>
                          </>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400">Steady</span>
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
                    <td className="px-4 py-3.5 text-center">
                      <span
                        title={row.reliabilityMeta?.desc || `R² = ${Number(row.rSquared || 0).toFixed(3)}`}
                        className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          row.reliabilityMeta?.badgeClass ||
                          (row.rSquared >= 0.7
                            ? "bg-emerald-50 text-emerald-700"
                            : row.rSquared >= 0.35
                            ? "bg-blue-50 text-blue-700"
                            : "bg-slate-100 text-slate-500")
                        }`}
                      >
                        {row.reliabilityMeta?.label || (row.rSquared >= 0.7 ? "High" : row.rSquared >= 0.35 ? "Moderate" : "Needs Data")}
                      </span>
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#CFDDE0] bg-[#F9FBFB] px-5 py-3.5">
        <p className="text-xs font-medium text-[#5B7077]">
          Page {currentPage} of {totalPages || 1} - {totalCount} items
        </p>

        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] text-[#5B7077] transition hover:bg-[#EBF3F5] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                onClick={() => setCurrentPage(pageNum)}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition cursor-pointer ${pageNum === currentPage
                    ? "bg-[#1F4E5A] text-white shadow-xs"
                    : "border border-[#CFDDE0] bg-[#F9FBFB] text-[#5B7077] hover:bg-[#EBF3F5]"
                  }`}
              >
                {pageNum}
              </button>
            ))}

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] text-[#5B7077] transition hover:bg-[#EBF3F5] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
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
