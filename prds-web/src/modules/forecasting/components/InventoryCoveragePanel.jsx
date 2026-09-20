import { formatNumber } from "../../dashboard/dashboardUtils";

export default function InventoryCoveragePanel({ rows = [] }) {
  const visibleRows = [...rows]
    .sort((first, second) => getCoverageDays(first) - getCoverageDays(second))
    .slice(0, 6);

  return (
    <section className="rounded-xl border border-[#d8dadc] bg-white p-4 shadow-sm shadow-neutral-200/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-[#0d1117]">Stock needs</h2>
          <p className="mt-1 text-xs font-medium leading-5 text-[#42474e]">
            Lowest coverage relative to expected use
          </p>
        </div>
      </div>

      <div className="mt-5 divide-y divide-neutral-100">
        {visibleRows.length === 0 ? (
          <div className="grid min-h-56 place-items-center text-center">
            <div>
              <p className="text-sm font-black text-[#0d1117]">No stock needs found</p>
              <p className="mt-1 text-xs font-medium text-neutral-500">
                Current stock and expected use will appear here.
              </p>
            </div>
          </div>
        ) : (
          visibleRows.map((row, index) => (
            <article key={row.medicineId} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
              <span className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-black ${getAvatarClass(row.risk?.label)}`}>
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black leading-5 text-[#0d1117]">
                  {row.genericName} {row.dosage}
                </p>
                <p className="text-xs font-medium leading-4 text-[#42474e]">
                  {row.brandName || row.unitOfMeasure || "Medicine"}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-black ${row.risk?.textClass || "text-[#0d1117]"}`}>
                  {formatCoverageDays(row)}
                </p>
                <p className="text-[10px] font-bold text-[#42474e]">coverage</p>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

const getCoverageDays = (row) => {
  const months = Number(row.coverageMonths);
  return Number.isFinite(months) ? months * 30 : Number.POSITIVE_INFINITY;
};

const formatCoverageDays = (row) => {
  const days = getCoverageDays(row);
  return Number.isFinite(days) ? `${formatNumber(Math.round(days))}d` : "No data";
};

const getAvatarClass = (label) => {
  if (label === "Critical" || label === "Low Stock") {
    return "bg-red-100 text-red-700";
  }

  if (label === "Monitor Stock") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-emerald-100 text-emerald-700";
};
