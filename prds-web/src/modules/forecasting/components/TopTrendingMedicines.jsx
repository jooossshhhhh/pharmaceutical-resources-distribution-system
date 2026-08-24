import { formatNumber } from "../../dashboard/dashboardUtils";

export default function TopTrendingMedicines({ rows = [] }) {
  const visibleRows = rows.slice(0, 6);
  const maxSlope = Math.max(...visibleRows.map((row) => Math.abs(row.forecastSlope)), 1);

  return (
    <section className="rounded-xl border border-[#d8dadc] bg-white shadow-sm shadow-neutral-200/40">
      <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
            Trend Watch
          </p>
          <h2 className="mt-1 text-base font-black text-[#0d1117]">Medicines Trending This Month</h2>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {visibleRows.length === 0 ? (
          <div className="grid min-h-48 place-items-center rounded-xl bg-[#f8f9ff] text-center">
            <div>
              <p className="text-sm font-black text-[#0d1117]">No trend records yet</p>
              <p className="mt-1 text-xs font-medium text-neutral-500">
                Forecast rows will drive medicine trend ranking.
              </p>
            </div>
          </div>
        ) : (
          visibleRows.map((row, index) => {
            const width = Math.max(10, Math.round((Math.abs(row.forecastSlope) / maxSlope) * 100));

            return (
              <article key={row.medicineId} className="rounded-xl bg-[#f8f9ff] px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#0d1117]">
                      {index + 1}. {row.genericName} {row.dosage}
                    </p>
                    <p className="truncate text-xs font-medium text-neutral-500">
                      {row.brandName || "No brand"} - {formatNumber(row.projectedDemand)} projected
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-black ${row.forecastSlope >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {row.forecastSlope >= 0 ? "+" : ""}
                    {row.forecastSlope}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className={`h-full rounded-full ${row.forecastSlope >= 0 ? "bg-[#6be9c2]" : "bg-red-400"}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
