import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "../../features/auth/AuthService";
import { supabase } from "../../services/supabase";
import ForecastMapPreview from "../dashboard/components/ForecastMapPreview";
import {
  buildFacilityDemand,
  buildFacilityStockStatus,
  formatDateTime,
  formatNumber,
} from "../dashboard/dashboardUtils";
import ConsumptionTrendChart from "./components/charts/ConsumptionTrendChart";
import ForecastComparisonChart from "./components/charts/ForecastComparisonChart";
import ForecastMetricCard from "./components/ForecastMetricCard";
import InventoryCoveragePanel from "./components/InventoryCoveragePanel";
import MedicineTrendTable from "./components/MedicineTrendTable";
import TopTrendingMedicines from "./components/TopTrendingMedicines";
import { buildForecastAnalytics } from "./forecastingUtils";

const ALL = "ALL";

const metricIcons = {
  demand: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 19V5" />
      <path d="M8 17V9" />
      <path d="M12 17V7" />
      <path d="M16 17v-5" />
      <path d="M20 17V4" />
    </svg>
  ),
  fit: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 19c4-8 8-12 16-14" />
      <path d="M4 19h16" />
      <path d="M4 19V5" />
    </svg>
  ),
  risk: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 4.3 2.7 17.5A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.5L13.7 4.3a2 2 0 0 0-3.4 0Z" />
    </svg>
  ),
  trend: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m3 17 6-6 4 4 7-8" />
      <path d="M14 7h6v6" />
    </svg>
  ),
};

export default function ForecastingModule() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [facilities, setFacilities] = useState([]);
  const [forecastRows, setForecastRows] = useState([]);
  const [dispensingRows, setDispensingRows] = useState([]);
  const [inventoryRows, setInventoryRows] = useState([]);
  const [forecastError, setForecastError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [facilityFilter, setFacilityFilter] = useState(ALL);
  const [medicineFilter, setMedicineFilter] = useState(ALL);
  const [riskFilter, setRiskFilter] = useState(ALL);
  const [monthWindow, setMonthWindow] = useState("6");

  const today = useMemo(() => formatDateTime(new Date()), []);
  const isBhw = profile?.role === "BHW";
  const assignedFacilityId = profile?.facility_id || null;

  const selectedFacilityId = isBhw && assignedFacilityId ? assignedFacilityId : facilityFilter;

  const filteredForecastRows = useMemo(
    () =>
      filterRowsByScope(
        filterRowsByMonthWindow(forecastRows, "forecast_month", monthWindow),
        selectedFacilityId,
        medicineFilter
      ),
    [forecastRows, medicineFilter, monthWindow, selectedFacilityId]
  );
  const filteredDispensingRows = useMemo(
    () =>
      filterRowsByScope(
        filterRowsByMonthWindow(dispensingRows, "month", monthWindow),
        selectedFacilityId,
        medicineFilter
      ),
    [dispensingRows, medicineFilter, monthWindow, selectedFacilityId]
  );
  const filteredInventoryRows = useMemo(
    () => filterRowsByScope(inventoryRows, selectedFacilityId, medicineFilter),
    [inventoryRows, medicineFilter, selectedFacilityId]
  );
  const visibleFacilities = useMemo(() => {
    if (selectedFacilityId === ALL) {
      return facilities;
    }

    return facilities.filter((facility) => facility.id === selectedFacilityId);
  }, [facilities, selectedFacilityId]);
  const analytics = useMemo(
    () =>
      buildForecastAnalytics({
        dispensingRows: filteredDispensingRows,
        forecastRows: filteredForecastRows,
        inventoryRows: filteredInventoryRows,
      }),
    [filteredDispensingRows, filteredForecastRows, filteredInventoryRows]
  );
  const visibleTrendRows = useMemo(
    () => filterRowsByRisk(analytics.trendRows, riskFilter),
    [analytics.trendRows, riskFilter]
  );
  const visibleCoverageRows = useMemo(
    () => filterRowsByRisk(analytics.coverageRows, riskFilter),
    [analytics.coverageRows, riskFilter]
  );
  const visibleTrendingRows = useMemo(
    () => filterRowsByRisk(analytics.trendingMedicines, riskFilter),
    [analytics.trendingMedicines, riskFilter]
  );
  const medicineOptions = useMemo(
    () =>
      getMedicineOptions([...forecastRows, ...inventoryRows]).sort((first, second) =>
        first.label.localeCompare(second.label)
      ),
    [forecastRows, inventoryRows]
  );
  const stockStatusByFacility = useMemo(
    () => buildFacilityStockStatus(filteredInventoryRows),
    [filteredInventoryRows]
  );
  const demandByFacility = useMemo(
    () => buildFacilityDemand(filteredForecastRows),
    [filteredForecastRows]
  );


  useEffect(() => {
    let isMounted = true;

    const loadForecasting = async () => {
      setIsLoading(true);
      setForecastError("");

      const scope = (query) =>
        isBhw && assignedFacilityId ? query.eq("facility_id", assignedFacilityId) : query;

      const [facilitiesResult, forecastResult, dispensingResult, inventoryResult] = await Promise.all([
        supabase
          .from("facilities")
          .select("id, facility_name, facility_code, facility_type, address, status, latitude, longitude")
          .eq("status", "ACTIVE")
          .order("facility_name", { ascending: true }),
        scope(
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
            .order("forecast_month", { ascending: true })
        ),
        scope(
          supabase
            .from("monthly_dispensing_summary")
            .select("facility_id, medicine_id, month, total_dispensed")
            .order("month", { ascending: true })
        ),
        scope(
          supabase
            .from("inventory")
            .select(`
              id,
              facility_id,
              medicine_id,
              quantity,
              threshold,
              expiration_date,
              facility:facilities(facility_name, facility_code),
              medicine:medicines(generic_name, brand_name, dosage, unit_of_measure)
            `)
            .order("quantity", { ascending: true })
        ),
      ]);

      if (!isMounted) {
        return;
      }

      const firstError = [facilitiesResult, forecastResult, dispensingResult, inventoryResult].find(
        (result) => result.error
      )?.error;

      if (firstError) {
        setForecastError(firstError.message);
        setIsLoading(false);
        return;
      }

      const activeFacilities = facilitiesResult.data || [];
      setFacilities(isBhw && assignedFacilityId ? activeFacilities.filter((facility) => facility.id === assignedFacilityId) : activeFacilities);
      setForecastRows(forecastResult.data || []);
      setDispensingRows(dispensingResult.data || []);
      setInventoryRows(inventoryResult.data || []);
      setIsLoading(false);
    };

    loadForecasting();

    return () => {
      isMounted = false;
    };
  }, [assignedFacilityId, isBhw]);

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <div className="space-y-3">
        {forecastError && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {forecastError}
          </p>
        )}

        <section className="rounded-xl border border-[#d8dadc] bg-white px-4 py-3 shadow-sm shadow-neutral-200/40">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="mt-1 text-xl font-black tracking-tight text-[#0d1117]">
                Medicine Forecast Analytics
              </h2>
              <p className="mt-1 max-w-3xl text-xs font-medium leading-5 text-[#42474e]">
                Review monthly medicine use, expected use, and stock coverage across PRDS facilities.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate("/inventory")}
                className="rounded-lg border border-[#d8dadc] bg-white px-3.5 py-2 text-xs font-black text-[#0d1117] shadow-sm transition hover:border-[#6be9c2] hover:bg-[#eff4ff]"
              >
                Inventory
              </button>
              <button
                type="button"
                onClick={() => navigate("/requests")}
                className="rounded-lg bg-[#0d1117] px-3.5 py-2 text-xs font-black text-white shadow-sm transition hover:bg-[#00a36c]"
              >
                Request Queue
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <ForecastMetricCard
            description="Expected units from the selected month and facility scope."
            icon={metricIcons.demand}
            label="Expected Use"
            meta={`${analytics.uniqueMedicineCount} SKUs`}
            tone="blue"
            value={formatNumber(analytics.forecastTotal)}
          />
          <ForecastMetricCard
            description="Medicines with higher expected use in the selected range."
            icon={metricIcons.trend}
            label="Increasing Use"
            meta="Monthly Change"
            tone="emerald"
            value={formatNumber(analytics.increasingCount)}
          />
          <ForecastMetricCard
            description="Inventory records that may need stock review."
            icon={metricIcons.risk}
            label="Stock Needs"
            meta="Needs Review"
            tone={analytics.riskRows.length > 0 ? "orange" : "emerald"}
            value={formatNumber(analytics.riskRows.length)}
          />
          <ForecastMetricCard
            description="How closely the estimate follows recent expected use values."
            icon={metricIcons.fit}
            label="Estimate Reliability"
            meta={`Monthly Change ${analytics.regression.slope >= 0 ? "+" : ""}${analytics.regression.slope}`}
            tone="amber"
            value={`${Math.round(analytics.regression.rSquared * 100)}%`}
          />
        </section>

        <ForecastFilters
          facilities={facilities}
          facilityFilter={selectedFacilityId}
          isFacilityLocked={isBhw}
          medicineFilter={medicineFilter}
          medicineOptions={medicineOptions}
          monthWindow={monthWindow}
          riskFilter={riskFilter}
          setFacilityFilter={setFacilityFilter}
          setMedicineFilter={setMedicineFilter}
          setMonthWindow={setMonthWindow}
          setRiskFilter={setRiskFilter}
        />

        <section className="rounded-xl border border-[#d8dadc] bg-white px-4 py-3 shadow-sm shadow-neutral-200/40">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
            Forecast Summary
          </p>
          <p className="mt-1 text-sm font-black text-[#0d1117]">
            {analytics.interpretation.sentence}
          </p>
          <p className="mt-1 text-xs font-medium leading-5 text-[#42474e]">
            {analytics.interpretation.details}
          </p>
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <section className="rounded-xl border border-[#d8dadc] bg-white shadow-sm shadow-neutral-200/40">
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                  Consumption Trend
                </p>
                <h2 className="mt-1 text-base font-black text-[#0d1117]">Medicine Use and Forecast</h2>
              </div>
              <span className="rounded-full bg-[#eff4ff] px-3 py-1 text-xs font-black text-[#42474e]">
                {monthWindow === ALL ? "All months" : `Last ${monthWindow} months`}
              </span>
            </div>
            <div className="p-4">
              <ConsumptionTrendChart rows={analytics.monthlyRows} />
            </div>
          </section>

          <ForecastComparisonChart rows={visibleTrendRows} />
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <ForecastMapPreview
            compact
            demandByFacility={demandByFacility}
            description="Facility locations with stock status and expected use context."
            facilities={visibleFacilities}
            forecastTotal={analytics.forecastTotal}
            inventoryRows={filteredInventoryRows}
            lowStockCount={analytics.riskRows.length}
            mapClassName="min-h-[30rem] md:min-h-[32rem]"
            previewMode
            showExpand={false}
            showMetrics={false}
            stockStatusByFacility={stockStatusByFacility}
            title="City of Naga Facility Coverage"
          />

          <InventoryCoveragePanel rows={visibleCoverageRows} />
        </section>

        <TopTrendingMedicines rows={visibleTrendingRows} />

        <MedicineTrendTable rows={visibleTrendRows} />

        {isLoading && (
          <div className="fixed inset-x-0 bottom-4 z-20 flex justify-center pointer-events-none">
            <span className="rounded-full border border-[#d8dadc] bg-white px-4 py-2 text-xs font-black text-[#42474e] shadow-lg">
              Loading forecasting analytics...
            </span>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function ForecastFilters({
  facilities,
  facilityFilter,
  isFacilityLocked,
  medicineFilter,
  medicineOptions,
  monthWindow,
  riskFilter,
  setFacilityFilter,
  setMedicineFilter,
  setMonthWindow,
  setRiskFilter,
}) {
  const showFacilityFilter = !isFacilityLocked;

  return (
    <section className="rounded-xl border border-[#d8dadc] bg-white px-4 py-3 shadow-sm shadow-neutral-200/40">
      <div className={`grid gap-3 md:grid-cols-2 ${showFacilityFilter ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        {showFacilityFilter && (
          <FilterField label="Facility">
            <select
              className="h-10 w-full rounded-lg border border-[#d8dadc] bg-white px-3 text-sm font-semibold text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/40"
              value={facilityFilter}
              onChange={(event) => setFacilityFilter(event.target.value)}
            >
              <option value={ALL}>All Facilities</option>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.facility_name}
                </option>
              ))}
            </select>
          </FilterField>
        )}

        <FilterField label="Medicine">
          <select
            className="h-10 w-full rounded-lg border border-[#d8dadc] bg-white px-3 text-sm font-semibold text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/40"
            value={medicineFilter}
            onChange={(event) => setMedicineFilter(event.target.value)}
          >
            <option value={ALL}>All Medicines</option>
            {medicineOptions.map((medicine) => (
              <option key={medicine.id} value={medicine.id}>
                {medicine.label}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Stock Status">
          <select
            className="h-10 w-full rounded-lg border border-[#d8dadc] bg-white px-3 text-sm font-semibold text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/40"
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value)}
          >
            <option value={ALL}>All Stock Statuses</option>
            <option value="Critical">Critical</option>
            <option value="Low Stock">Low Stock</option>
            <option value="Monitor Stock">Monitor Stock</option>
            <option value="Enough Stock">Enough Stock</option>
          </select>
        </FilterField>

        <FilterField label="Month Range">
          <select
            className="h-10 w-full rounded-lg border border-[#d8dadc] bg-white px-3 text-sm font-semibold text-[#0d1117] outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/40"
            value={monthWindow}
            onChange={(event) => setMonthWindow(event.target.value)}
          >
            <option value="3">Last 3 months</option>
            <option value="6">Last 6 months</option>
            <option value="12">Last 12 months</option>
            <option value={ALL}>All months</option>
          </select>
        </FilterField>
      </div>
    </section>
  );
}

function FilterField({ children, label }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#42474e]">
        {label}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

const filterRowsByScope = (rows, facilityId, medicineId) => {
  return rows.filter((row) => {
    const facilityMatches = facilityId === ALL || row.facility_id === facilityId;
    const medicineMatches = medicineId === ALL || row.medicine_id === medicineId;
    return facilityMatches && medicineMatches;
  });
};

const filterRowsByRisk = (rows, risk) => {
  if (risk === ALL) {
    return rows;
  }

  return rows.filter((row) => row.risk?.label === risk);
};

const filterRowsByMonthWindow = (rows, dateKey, monthWindow) => {
  if (monthWindow === ALL) {
    return rows;
  }

  const windowSize = Number(monthWindow);
  const dates = rows
    .map((row) => new Date(row?.[dateKey]))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((first, second) => first - second);

  if (!Number.isFinite(windowSize) || dates.length === 0) {
    return rows;
  }

  const latest = dates.at(-1);
  const cutoff = new Date(latest.getFullYear(), latest.getMonth() - windowSize + 1, 1);

  return rows.filter((row) => {
    const date = new Date(row?.[dateKey]);
    return !Number.isNaN(date.getTime()) && date >= cutoff;
  });
};

const getMedicineOptions = (rows) => {
  const optionMap = new Map();

  rows.forEach((row) => {
    if (!row.medicine_id || optionMap.has(row.medicine_id)) {
      return;
    }

    const medicine = row.medicine || {};
    const label = `${medicine.generic_name || "Medicine"} ${medicine.dosage || ""}`.trim();
    optionMap.set(row.medicine_id, {
      id: row.medicine_id,
      label,
    });
  });

  return Array.from(optionMap.values());
};



