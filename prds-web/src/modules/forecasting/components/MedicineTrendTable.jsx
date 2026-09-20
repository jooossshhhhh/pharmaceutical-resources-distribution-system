import { formatNumber } from "../../dashboard/dashboardUtils";

export default function MedicineTrendTable({ rows = [] }) {
  return (
    <section className="rounded-xl border border-[#d8dadc] bg-white shadow-sm shadow-neutral-200/40">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
            Medicine Forecast
          </p>
          <h2 className="mt-1 text-base font-black text-[#0d1117]">Monthly Use Ranking</h2>
        </div>
        <span className="rounded-full bg-[#eff4ff] px-3 py-1 text-xs font-black text-[#42474e]">
          {formatNumber(rows.length)} medicines
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left">
          <thead className="bg-[#f8f9ff] text-[11px] font-black uppercase tracking-[0.14em] text-[#42474e]">
            <tr>
              <th className="px-4 py-3">Medicine</th>
              <th className="px-4 py-3">Latest Use</th>
              <th className="px-4 py-3">Expected Use</th>
              <th className="px-4 py-3">Monthly Change</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Stock Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm font-semibold text-neutral-500">
                  No medicine trend records match the selected filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.medicineId} className="transition hover:bg-[#f8f9ff]">
                  <td className="px-4 py-3">
                    <p className="text-sm font-black text-[#0d1117]">
                      {row.genericName} {row.dosage}
                    </p>
                    <p className="text-xs font-medium text-neutral-500">
                      {row.brandName || "No brand"} - {row.unitOfMeasure}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-sm font-black text-[#0d1117]">
                    {formatNumber(row.latestHistorical)}
                  </td>
                  <td className="px-4 py-3 text-sm font-black text-[#0d1117]">
                    {formatNumber(row.projectedDemand)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-black ${getTrendClass(row.direction)}`}>
                      {row.forecastSlope >= 0 ? "+" : ""}
                      {row.forecastSlope}
                    </span>
                    <p className="text-xs font-medium text-neutral-500">{row.direction}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-black text-[#0d1117]">{formatNumber(row.stockQuantity)}</p>
                    <p className="text-xs font-medium text-neutral-500">Threshold {formatNumber(row.threshold)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${row.risk.badgeClass}`}>
                      {row.risk.label}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const getTrendClass = (direction) => {
  if (direction === "Increasing") {
    return "text-emerald-700";
  }

  if (direction === "Declining") {
    return "text-red-600";
  }

  return "text-[#42474e]";
};
