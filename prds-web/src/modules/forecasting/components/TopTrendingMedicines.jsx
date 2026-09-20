import { formatNumber } from "../../dashboard/dashboardUtils";

export default function TopTrendingMedicines({ onSelectMedicine, rows = [] }) {
  const visibleRows = rows.filter((row) => row.forecastSlope > 0).slice(0, 5);
  const canOpenDetails = typeof onSelectMedicine === "function";

  return (
    <section className="rounded-xl border border-[#d8dadc] bg-white p-4 shadow-sm shadow-neutral-200/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-[#0d1117]">Increasing use</h2>
          <p className="mt-1 text-xs font-medium leading-5 text-[#42474e]">
            Medicines with the largest monthly change
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-2">
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
            const Card = canOpenDetails ? "button" : "article";
            const isTopRow = index === 0;

            return (
              <Card
                key={row.medicineId}
                aria-label={`View trend for ${row.genericName} ${row.dosage || ""}`.trim()}
                className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-[#6be9c2]/70 ${
                  isTopRow ? "bg-emerald-50" : "bg-white"
                } ${
                  canOpenDetails ? "cursor-pointer" : ""
                }`}
                onClick={canOpenDetails ? () => onSelectMedicine(row.medicineId) : undefined}
                type={canOpenDetails ? "button" : undefined}
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-xs font-black text-emerald-700">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-black leading-5 text-[#0d1117]">
                    {row.genericName} {row.dosage}
                  </p>
                  <p className="text-xs font-medium leading-4 text-[#42474e]">
                    Recent use {formatNumber(row.latestHistorical)} / month
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-emerald-700">
                    +{row.forecastSlope}
                  </p>
                  <p className="text-[10px] font-bold text-[#42474e]">monthly change</p>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </section>
  );
}
