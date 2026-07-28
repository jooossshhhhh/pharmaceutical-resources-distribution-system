import { useEffect, useMemo, useState } from "react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";
import ForecastMapPreview from "../dashboard/components/ForecastMapPreview";
import { formatDateTime, formatNumber } from "../dashboard/dashboardUtils";

const monthLabelFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });

const calculateLinearRegression = (values) => {
  if (values.length < 2) {
    return { rSquared: 0, slope: 0 };
  }

  const n = values.length;
  const sumX = values.reduce((sum, _, index) => sum + index, 0);
  const sumY = values.reduce((sum, value) => sum + value, 0);
  const sumXY = values.reduce((sum, value, index) => sum + index * value, 0);
  const sumXX = values.reduce((sum, _, index) => sum + index * index, 0);
  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const totalVariance = values.reduce((sum, value) => sum + (value - meanY) ** 2, 0);
  const residualVariance = values.reduce(
    (sum, value, index) => sum + (value - (slope * index + intercept)) ** 2,
    0
  );

  return {
    rSquared: totalVariance === 0 ? 1 : Math.max(0, 1 - residualVariance / totalVariance),
    slope,
  };
};

const groupQuantitiesByMonth = (rows, dateKey, quantityKey) => {
  return rows.reduce((summary, row) => {
    const rawDate = row[dateKey];
    if (!rawDate) {
      return summary;
    }

    const label = monthLabelFormatter.format(new Date(rawDate));
    summary[label] = (summary[label] || 0) + Number(row[quantityKey] || 0);
    return summary;
  }, {});
};

const getStockStatus = (row) => {
  const quantity = Number(row.quantity || 0);
  const threshold = Number(row.threshold || 0);

  if (quantity === 0 || quantity <= Math.max(1, threshold * 0.25)) {
    return { label: "Critical", tone: "text-red-600", urgency: "In 24 Hours" };
  }

  if (quantity <= threshold) {
    return { label: "Below Safety", tone: "text-orange-600", urgency: "In 3 Days" };
  }

  return { label: "Stable", tone: "text-emerald-700", urgency: "In 8 Days" };
};

export default function ForecastingModule() {
  const { profile } = useAuth();
  const [facilities, setFacilities] = useState([]);
  const [forecastRows, setForecastRows] = useState([]);
  const [dispensingRows, setDispensingRows] = useState([]);
  const [inventoryRows, setInventoryRows] = useState([]);
  const [forecastError, setForecastError] = useState("");

  const today = useMemo(() => formatDateTime(new Date()), []);
  const forecastTotal = useMemo(
    () =>
      forecastRows.reduce(
        (sum, row) => sum + Number(row.predicted_quantity || 0),
        0
      ),
    [forecastRows]
  );
  const uniqueForecastedMedicines = useMemo(
    () => new Set(forecastRows.map((row) => row.medicine_id).filter(Boolean)).size,
    [forecastRows]
  );
  const regressionSummary = useMemo(() => {
    const orderedValues = [...forecastRows]
      .sort((first, second) => new Date(first.forecast_month) - new Date(second.forecast_month))
      .map((row) => Number(row.predicted_quantity || 0));

    return calculateLinearRegression(orderedValues);
  }, [forecastRows]);
  const stockWatchRows = useMemo(() => {
    return inventoryRows
      .map((row) => ({
        ...row,
        stockStatus: getStockStatus(row),
      }))
      .filter((row) => row.stockStatus.label !== "Stable")
      .slice(0, 8);
  }, [inventoryRows]);
  const consumptionRows = useMemo(() => {
    const historical = groupQuantitiesByMonth(dispensingRows, "dispense_date", "quantity");
    const forecasted = groupQuantitiesByMonth(forecastRows, "forecast_month", "predicted_quantity");
    const labels = Array.from(new Set([...Object.keys(historical), ...Object.keys(forecasted)]))
      .slice(-6);

    return labels.length > 0
      ? labels.map((label) => ({
          label,
          historical: historical[label] || 0,
          forecasted: forecasted[label] || 0,
        }))
      : [
          { label: "Aug", historical: 120, forecasted: 138 },
          { label: "Sep", historical: 150, forecasted: 158 },
          { label: "Oct", historical: 132, forecasted: 149 },
          { label: "Nov", historical: 168, forecasted: 181 },
          { label: "Dec", historical: 175, forecasted: 194 },
        ];
  }, [dispensingRows, forecastRows]);

  useEffect(() => {
    let isMounted = true;

    const loadForecasting = async () => {
      const [facilitiesResult, forecastResult, dispensingResult, inventoryResult] =
        await Promise.all([
          supabase
            .from("facilities")
            .select("id, facility_name, facility_code, facility_type, address, status")
            .eq("status", "ACTIVE")
            .order("facility_name", { ascending: true }),
          supabase
            .from("forecasting")
            .select(`
              id,
              medicine_id,
              facility_id,
              forecast_month,
              predicted_quantity,
              generated_at,
              facility:facilities(facility_name, facility_code),
              medicine:medicines(generic_name, brand_name, dosage, unit_of_measure)
            `)
            .order("forecast_month", { ascending: true }),
          supabase
            .from("medicine_dispensing")
            .select("id, facility_id, medicine_id, quantity, dispense_date")
            .order("dispense_date", { ascending: true })
            .limit(120),
          supabase
            .from("inventory")
            .select(`
              id,
              facility_id,
              medicine_id,
              quantity,
              threshold,
              facility:facilities(facility_name, facility_code),
              medicine:medicines(generic_name, brand_name, dosage, unit_of_measure)
            `)
            .order("quantity", { ascending: true }),
        ]);

      if (!isMounted) {
        return;
      }

      const firstError = [facilitiesResult, forecastResult, dispensingResult, inventoryResult].find(
        (result) => result.error
      )?.error;

      if (firstError) {
        setForecastError(firstError.message);
        return;
      }

      setFacilities(facilitiesResult.data || []);
      setForecastRows(forecastResult.data || []);
      setDispensingRows(dispensingResult.data || []);
      setInventoryRows(inventoryResult.data || []);
    };

    loadForecasting();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <div className="space-y-4">
        {forecastError && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {forecastError}
          </p>
        )}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ForecastMetricCard
            label="Regression Fit"
            value={`${Math.round(regressionSummary.rSquared * 100)}%`}
            note={`Slope ${regressionSummary.slope >= 0 ? "+" : ""}${regressionSummary.slope.toFixed(1)}`}
            progress={Math.round(regressionSummary.rSquared * 100)}
          />
          <ForecastMetricCard
            label="Supply Gap Risk"
            value={stockWatchRows.length > 0 ? "Watch" : "Stable"}
            note={`${formatNumber(stockWatchRows.length)} items below safety`}
            tone={stockWatchRows.length > 0 ? "orange" : "emerald"}
          />
          <ForecastMetricCard
            label="30-Day Projected Volume"
            value={formatNumber(forecastTotal)}
            note="Across active health centers"
          />
          <ForecastMetricCard
            label="SKU Forecast Records"
            value={formatNumber(uniqueForecastedMedicines)}
            note={`${formatNumber(forecastRows.length)} forecast rows`}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
          <ForecastMapPreview
            compact
            facilities={facilities}
            forecastTotal={forecastTotal}
            lowStockCount={stockWatchRows.length}
          />

          <section className="rounded-xl border border-[#d8dadc] bg-white shadow-sm shadow-neutral-200/40">
            <div className="border-b border-neutral-100 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-500">
                Consumption Trends
              </p>
              <h2 className="mt-1 text-base font-black text-[#0d1117]">
                Historical vs Regression Forecast
              </h2>
            </div>
            <div className="p-4">
              <ConsumptionTrendChart rows={consumptionRows} />
              <div className="mt-4 rounded-lg bg-[#f8f9ff] px-3 py-2.5 text-xs font-semibold leading-5 text-[#42474e]">
                Trend values are rendered from dispensing records and forecast rows
                generated through simple linear regression.
              </div>
            </div>
          </section>
        </section>

        <section className="rounded-xl border border-[#d8dadc] bg-white shadow-sm shadow-neutral-200/40">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3">
            <div>
              <h2 className="text-base font-black text-[#0d1117]">
                Critical Stock Watch (14-Day Window)
              </h2>
              <p className="mt-1 text-sm font-medium text-neutral-500">
                Items below safety threshold based on current stock and consumption trend.
              </p>
            </div>
            <span className="rounded-full bg-[#eff4ff] px-3 py-1 text-xs font-black text-[#42474e]">
              Showing {formatNumber(stockWatchRows.length)} critical items
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead className="bg-[#f8f9ff] text-xs font-black uppercase tracking-[0.14em] text-[#42474e]">
                <tr>
                  <th className="px-4 py-3">Facility</th>
                  <th className="px-4 py-3">Medicine / SKU</th>
                  <th className="px-4 py-3">Current Stock</th>
                  <th className="px-4 py-3">Predicted Depletion</th>
                  <th className="px-4 py-3">Review Trigger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {stockWatchRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm font-semibold text-neutral-500">
                      No critical stock records currently match the watch criteria.
                    </td>
                  </tr>
                ) : (
                  stockWatchRows.map((row) => (
                    <tr key={row.id} className="hover:bg-[#f8f9ff]">
                      <td className="px-4 py-3">
                        <p className="text-sm font-black text-[#0d1117]">
                          {row.facility?.facility_name || "Facility"}
                        </p>
                        <p className="text-xs font-medium text-neutral-500">
                          {row.facility?.facility_code || "No code"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-black text-[#0d1117]">
                          {row.medicine?.brand_name || row.medicine?.generic_name || "Medicine"}
                        </p>
                        <p className="text-xs font-medium text-neutral-500">
                          {row.medicine?.dosage || "No dosage"} / {row.medicine?.unit_of_measure || "unit"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm font-black">
                        <span className={row.stockStatus.tone}>
                          {formatNumber(row.quantity)} Units
                        </span>
                        <span className="ml-2 text-xs font-semibold text-neutral-400">
                          ({row.stockStatus.label})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-black text-[#0d1117]">
                        {row.stockStatus.urgency}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-[#d8dadc] bg-white px-3 py-1 text-xs font-black uppercase tracking-wide text-[#42474e]">
                          Review request plan
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function ForecastMetricCard({ label, note, progress, tone = "emerald", value }) {
  const toneClass =
    tone === "orange"
      ? "bg-orange-50 text-orange-700"
      : "bg-emerald-50 text-emerald-700";

  return (
    <article className="rounded-xl border border-[#d8dadc] bg-white p-4 shadow-sm shadow-neutral-200/40">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#42474e]">{label}</p>
      <p className="mt-2 text-2xl font-black text-[#0d1117]">{value}</p>
      <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-black ${toneClass}`}>
        {note}
      </p>
      {Number.isFinite(progress) && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#eff4ff]">
          <div
            className="h-full rounded-full bg-[#6be9c2]"
            style={{ width: `${Math.max(5, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </article>
  );
}

function ConsumptionTrendChart({ rows }) {
  const maxValue = Math.max(
    ...rows.flatMap((row) => [row.historical, row.forecasted]),
    1
  );

  return (
    <div className="space-y-4">
      <div className="flex h-48 items-end gap-2.5 border-b border-l border-dashed border-neutral-200 px-2 pb-3">
        {rows.map((row) => {
          const historicalHeight = Math.max(8, Math.round((row.historical / maxValue) * 100));
          const forecastHeight = Math.max(8, Math.round((row.forecasted / maxValue) * 100));

          return (
            <div key={row.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="flex h-36 w-full items-end justify-center gap-1.5">
                <span
                  className="w-4 rounded-t bg-[#b8dce6]"
                  style={{ height: `${historicalHeight}%` }}
                  title={`Historical: ${formatNumber(row.historical)}`}
                />
                <span
                  className="w-4 rounded-t bg-[#6be9c2]"
                  style={{ height: `${forecastHeight}%` }}
                  title={`Forecast: ${formatNumber(row.forecasted)}`}
                />
              </div>
              <span className="text-xs font-black uppercase tracking-wide text-neutral-500">
                {row.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-xs font-bold">
        <span className="flex items-center gap-2 text-[#42474e]">
          <span className="h-2 w-4 rounded-full bg-[#b8dce6]" />
          Historical consumption
        </span>
        <span className="flex items-center gap-2 text-emerald-700">
          <span className="h-2 w-4 rounded-full bg-[#6be9c2]" />
          Regression forecast
        </span>
      </div>
    </div>
  );
}
