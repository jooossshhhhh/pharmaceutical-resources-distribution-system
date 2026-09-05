import { formatNumber } from "../../dashboard/dashboardUtils";

export default function InventoryCoveragePanel({ rows = [] }) {
  const visibleRows = rows.slice(0, 8);

  return (
    <section className="rounded-xl border border-[#d8dadc] bg-white shadow-sm shadow-neutral-200/40">
      <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
            Stock Coverage
          </p>
          <h2 className="mt-1 text-base font-black text-[#0d1117]">Stock Coverage</h2>
        </div>
        <span className="rounded-full bg-[#eff4ff] px-3 py-1 text-xs font-black text-[#42474e]">
          {formatNumber(rows.length)} tracked
        </span>
      </div>

      <div className="divide-y divide-neutral-100 px-4">
        {visibleRows.length === 0 ? (
          <div className="grid min-h-56 place-items-center text-center">
            <div>
              <p className="text-sm font-black text-[#0d1117]">No inventory coverage data</p>
              <p className="mt-1 text-xs font-medium text-neutral-500">
                Current stock and expected use will appear here.
              </p>
            </div>
          </div>
        ) : (
          visibleRows.map((row) => {
            const coveragePercent = Math.min(100, Math.round((Number(row.coverageMonths || 0) / 3) * 100));

            return (
              <article key={row.medicineId} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#0d1117]">
                      {row.genericName} {row.dosage}
                    </p>
                    <p className="truncate text-xs font-medium text-neutral-500">
                      {row.brandName || "No brand"} - {row.unitOfMeasure}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${row.risk.badgeClass}`}>
                    {row.risk.label}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <Metric label="Stock" value={formatNumber(row.currentStock)} />
                  <Metric label="Expected Use" value={formatNumber(row.projectedDemand)} />
                  <Metric
                    label="Coverage"
                    value={row.coverageMonths == null ? "No demand" : `${row.coverageMonths} mo`}
                  />
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full rounded-full ${row.risk.barClass}`}
                    style={{ width: `${Math.max(5, coveragePercent)}%` }}
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

function Metric({ label, value }) {
  return (
    <div className="rounded-lg bg-[#f8f9ff] px-2.5 py-2">
      <p className="font-black text-[#0d1117]">{value}</p>
      <p className="mt-0.5 font-semibold text-neutral-500">{label}</p>
    </div>
  );
}
