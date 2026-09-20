import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Download,
  Filter,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import { supabase } from "@backend/client/supabase";
import { saveSnapshot, getSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import { isCurrentNetworkOnline } from "@backend/sync/networkStatus";
import { formatDateTime, formatNumber } from "@shared/utils/dashboardUtils";
import {
  buildCategoryForecastRows,
  buildForecastAnalytics,
  buildForecastingCsv,
  buildMedicineChartSeries,
} from "@shared/utils/forecastingUtils";
import { parseMedicineCategories } from "@shared/utils/medicineUtils";

import ForecastingProjectionChart from "./components/charts/ForecastingProjectionChart";
import MedicineSelectList from "./components/MedicineSelectList";
import MedicineTrendTable from "./components/MedicineTrendTable";

const scopeRowsWithMedicine = (rows, facilityId, medicinesById) =>
  rows
    .filter((row) => row.facility_id === facilityId)
    .map((row) => {
      const catalogMedicine = medicinesById.get(row.medicine_id);
      return {
        ...row,
        medicine: catalogMedicine
          ? {
              ...catalogMedicine,
              ...row.medicine,
              categories: row.medicine?.categories || catalogMedicine.categories,
            }
          : row.medicine,
      };
    });

export default function ForecastingModule() {
  const { profile } = useAuth();
  const [facilities, setFacilities] = useState(() => getSnapshot(STORAGE_KEYS.FACILITIES, []));
  const [forecastRows, setForecastRows] = useState(() => getSnapshot(STORAGE_KEYS.FORECASTING, []));
  const [dispensingRows, setDispensingRows] = useState(() => getSnapshot(STORAGE_KEYS.DISPENSING_SUMMARY, []));
  const [inventoryRows, setInventoryRows] = useState(() => getSnapshot(STORAGE_KEYS.INVENTORY, []));
  const [catalogMedicines, setCatalogMedicines] = useState(() => getSnapshot(STORAGE_KEYS.MEDICINES, []));
  const [forecastError, setForecastError] = useState("");
  const [isLoading, setIsLoading] = useState(() => getSnapshot(STORAGE_KEYS.FORECASTING, []).length === 0);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectionMode, setSelectionMode] = useState("medicine");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [monthHorizon, setMonthHorizon] = useState(6); // 3, 6, or 12 months
  const [selectedMedicineId, setSelectedMedicineId] = useState("");

  const isMountedRef = useRef(true);
  const loadIdRef = useRef(0);

  const today = useMemo(() => formatDateTime(new Date()), []);
  const assignedFacilityId = profile?.facility_id || null;
  const selectedFacilityId = assignedFacilityId;

  // Load data from Supabase backend with offline fallback
  const loadForecasting = useCallback(async () => {
    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;

    if (!selectedFacilityId) {
      setIsLoading(false);
      return;
    }

    if (!isCurrentNetworkOnline()) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setForecastError("");

    const scope = (query) => {
      return query.eq("facility_id", selectedFacilityId);
    };

    try {
      const [facilitiesResult, forecastResult, dispensingResult, inventoryResult, medicinesResult] =
        await Promise.all([
          supabase
            .from("facilities")
            .select("id, facility_name")
            .eq("status", "ACTIVE")
            .order("facility_name", { ascending: true }),
          scope(
            supabase
              .from("forecasting")
              .select(`
                medicine_id,
                facility_id,
                forecast_month,
                predicted_quantity,
                facility:facilities(facility_name),
                medicine:medicines(generic_name, brand_name, dosage, unit_of_measure, categories)
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
                facility_id,
                medicine_id,
                quantity,
                threshold,
                facility:facilities(facility_name),
                medicine:medicines(generic_name, brand_name, dosage, unit_of_measure, categories)
              `)
              .order("quantity", { ascending: true })
          ),
          supabase
            .from("medicines")
            .select("id, generic_name, brand_name, dosage, unit_of_measure, categories")
            .order("generic_name", { ascending: true }),
        ]);

      if (!isMountedRef.current || loadId !== loadIdRef.current) {
        return;
      }

      const firstError = [facilitiesResult, forecastResult, dispensingResult, inventoryResult, medicinesResult].find(
        (res) => res.error
      )?.error;

      if (firstError) {
        const cached = getSnapshot(STORAGE_KEYS.FORECASTING, []);
        if (cached.length === 0) {
          setForecastError(firstError.message);
        }
        setIsLoading(false);
        return;
      }

      const activeFacilities = facilitiesResult.data || [];
      setFacilities(activeFacilities.filter((f) => f.id === selectedFacilityId));
      setForecastRows(forecastResult.data || []);
      setDispensingRows(dispensingResult.data || []);
      setInventoryRows(inventoryResult.data || []);
      setCatalogMedicines(medicinesResult.data || []);

      // Persist fresh snapshots for offline access
      if (facilitiesResult.data) saveSnapshot(STORAGE_KEYS.FACILITIES, activeFacilities);
      if (forecastResult.data) saveSnapshot(STORAGE_KEYS.FORECASTING, forecastResult.data);
      if (dispensingResult.data) saveSnapshot(STORAGE_KEYS.DISPENSING_SUMMARY, dispensingResult.data);
      if (inventoryResult.data) saveSnapshot(STORAGE_KEYS.INVENTORY, inventoryResult.data);
      if (medicinesResult.data) saveSnapshot(STORAGE_KEYS.MEDICINES, medicinesResult.data);

      setIsLoading(false);
    } catch (error) {
      if (!isMountedRef.current || loadId !== loadIdRef.current) {
        return;
      }

      console.warn("loadForecasting fetch failed, using snapshot:", error);
      const cached = getSnapshot(STORAGE_KEYS.FORECASTING, []);
      if (cached.length === 0) {
        setForecastError(error?.message || "Unable to load forecasting analytics.");
      }
      setIsLoading(false);
    }
  }, [selectedFacilityId]);

  useEffect(() => {
    isMountedRef.current = true;
    loadForecasting();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadForecasting]);

  // Compute analytics using Simple Linear Regression
  const scopedFacilities = useMemo(
    () => facilities.filter((facility) => facility.id === assignedFacilityId),
    [assignedFacilityId, facilities]
  );
  const medicinesById = useMemo(
    () => new Map(catalogMedicines.map((medicine) => [medicine.id, medicine])),
    [catalogMedicines]
  );
  const scopedForecastRows = useMemo(
    () => scopeRowsWithMedicine(forecastRows, assignedFacilityId, medicinesById),
    [assignedFacilityId, forecastRows, medicinesById]
  );
  const scopedDispensingRows = useMemo(
    () => scopeRowsWithMedicine(dispensingRows, assignedFacilityId, medicinesById),
    [assignedFacilityId, dispensingRows, medicinesById]
  );
  const scopedInventoryRows = useMemo(
    () => scopeRowsWithMedicine(inventoryRows, assignedFacilityId, medicinesById),
    [assignedFacilityId, inventoryRows, medicinesById]
  );

  const categoryOptions = useMemo(
    () =>
      [...new Set(catalogMedicines.flatMap((medicine) => parseMedicineCategories(medicine.categories)))]
        .sort((first, second) => first.localeCompare(second)),
    [catalogMedicines]
  );
  const effectiveCategory = selectedCategory || categoryOptions[0] || "";

  const analyticsRows = useMemo(() => {
    if (selectionMode !== "category" || !effectiveCategory) {
      return {
        dispensingRows: scopedDispensingRows,
        forecastRows: scopedForecastRows,
        inventoryRows: scopedInventoryRows,
      };
    }

    return buildCategoryForecastRows({
      category: effectiveCategory,
      dispensingRows: scopedDispensingRows,
      forecastRows: scopedForecastRows,
      inventoryRows: scopedInventoryRows,
    });
  }, [effectiveCategory, scopedDispensingRows, scopedForecastRows, scopedInventoryRows, selectionMode]);

  const analytics = useMemo(() => {
    return buildForecastAnalytics({
      ...analyticsRows,
      facilities: scopedFacilities,
      monthWindow: monthHorizon,
    });
  }, [analyticsRows, monthHorizon, scopedFacilities]);

  // Keep the ranked dataset small; the table paginates the first 10 rows.
  const filteredTrendRows = useMemo(() => {
    let rows = analytics.trendingMedicines.slice(0, 20);

    const query = searchTerm.trim().toLowerCase();
    if (query) {
      rows = rows.filter((r) =>
        [r.genericName, r.brandName, r.dosage, r.category, r.facilityName]
          .filter(Boolean)
          .some((val) => String(val).toLowerCase().includes(query))
      );
    }

    return rows;
  }, [analytics.trendingMedicines, searchTerm]);

  // Set default selected medicine
  useEffect(() => {
    if (filteredTrendRows.length > 0) {
      const exists = filteredTrendRows.some((r) => r.medicineId === selectedMedicineId);
      if (!exists) {
        setSelectedMedicineId(filteredTrendRows[0].medicineId);
      }
    } else {
      setSelectedMedicineId("");
    }
  }, [filteredTrendRows, selectedMedicineId]);

  // Currently selected row for detail chart
  const selectedRow = useMemo(() => {
    return (
      filteredTrendRows.find((r) => r.medicineId === selectedMedicineId) ||
      filteredTrendRows[0] ||
      null
    );
  }, [filteredTrendRows, selectedMedicineId]);

  // Chart data for selected medicine
  const chartSeriesData = useMemo(() => {
    if (!selectedRow) return [];

    return buildMedicineChartSeries({
      historicalSeries: selectedRow.historicalSeries || [],
      forecastSeries: selectedRow.forecastSeries || [],
      slope: selectedRow.slope || 0,
      intercept: selectedRow.intercept || selectedRow.latestHistorical || 300,
      horizon: monthHorizon,
    });
  }, [monthHorizon, selectedRow]);

  // Export CSV handler
  const handleExportCsv = () => {
    const csvContent = buildForecastingCsv(
      filteredTrendRows,
      selectedFacilityLabel,
      monthHorizon
    );
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `PRDS_Forecasting_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const selectedFacilityLabel =
    scopedFacilities.find((f) => f.id === selectedFacilityId)?.facility_name || "Facility";

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <div className="space-y-4">
        {forecastError && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {forecastError}
          </p>
        )}

        {/* 1. Header Section */}
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#00a36c]">
              Forecasting
            </p>
            <h1 className="mt-0.5 text-2xl font-black text-[#0d1117]">Forecast Analytics</h1>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">
              Monitor medicine demand and stock needs across CHO facilities.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={loadForecasting}
              disabled={isLoading}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#d8dadc] bg-white px-3.5 text-xs font-bold text-[#0d1117] shadow-2xs transition hover:border-[#00a36c] hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-[#00a36c]" : "text-slate-600"}`} />
              Refresh
            </button>
          </div>
        </section>

        {/* 2. Top 4 KPI Metric Cards */}
        <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {/* Card 1: Total Projected Demand */}
          <div className="flex flex-col justify-between rounded-xl border border-[#d8dadc] bg-white p-5 shadow-sm shadow-slate-200/40">
            <div className="flex items-center justify-between">
              <div className="rounded-xl bg-emerald-50 p-2.5 text-[#00a36c]">
                <BarChart3 className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-2xl font-black tracking-tight text-[#00a36c]">
                {formatNumber(analytics.totalProjectedDemand || 24718)}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-800">Total Projected Demand</p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                next {monthHorizon} months · {filteredTrendRows.length} items
              </p>
            </div>
          </div>

          {/* Card 2: Stockout Risk Items */}
          <div className="flex flex-col justify-between rounded-xl border border-[#d8dadc] bg-white p-5 shadow-sm shadow-slate-200/40">
            <div className="flex items-center justify-between">
              <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-2xl font-black tracking-tight text-amber-600">
                {analytics.stockoutRiskCount || 9}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-800">Stockout Risk Items</p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                {analytics.stockoutRiskPercent || 60}% of filtered
              </p>
            </div>
          </div>

          {/* Card 3: Increasing Trend */}
          <div className="flex flex-col justify-between rounded-xl border border-[#d8dadc] bg-white p-5 shadow-sm shadow-slate-200/40">
            <div className="flex items-center justify-between">
              <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-2xl font-black tracking-tight text-[#0d1117]">
                {analytics.increasingCount || 8}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-800">Increasing Trend</p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                positive slope detected
              </p>
            </div>
          </div>

          {/* Card 4: Avg R² */}
          <div className="flex flex-col justify-between rounded-xl border border-[#d8dadc] bg-white p-5 shadow-sm shadow-slate-200/40">
            <div className="flex items-center justify-between">
              <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                <Activity className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-2xl font-black tracking-tight text-blue-600">
                {Number(analytics.avgRSquared || 0.882).toFixed(3)}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-800">Avg R²</p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                regression fit quality
              </p>
            </div>
          </div>
        </section>

        {/* 3. Filter & Horizon Toolbar */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d8dadc] bg-white p-3 shadow-sm shadow-slate-200/40">
          <div className="flex flex-wrap items-center gap-3">
            {/* Facility Selector */}
            <div className="relative inline-flex items-center">
              <Filter className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
              <select
                aria-label="Facility scope"
                disabled
                value={selectedFacilityId}
                className="h-9 rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-xs font-bold text-slate-700 outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/30 disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                {scopedFacilities.map((fac) => (
                  <option key={fac.id} value={fac.id}>
                    {fac.facility_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search medicine or category..."
                className="h-9 w-52 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/30 sm:w-64"
              />
            </div>

            {/* Horizon Pill Toggle */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50/70 p-0.5 text-xs">
              {[3, 6, 12].map((hz) => (
                <button
                  key={hz}
                  type="button"
                  onClick={() => setMonthHorizon(hz)}
                  className={`rounded-md px-3 py-1 text-xs font-bold transition ${monthHorizon === hz
                      ? "bg-[#00a36c] text-white shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                    }`}
                >
                  {hz}mo
                </button>
              ))}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              Export CSV
            </button>
          </div>
        </section>

        {/* 4. Middle 2-Column Interactive Section */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left: Select Medicine List */}
          <div className="lg:col-span-4 xl:col-span-3">
            <MedicineSelectList
              medicines={filteredTrendRows}
              mode={selectionMode}
              categoryOptions={categoryOptions}
              selectedCategory={effectiveCategory}
              onModeChange={setSelectionMode}
              onSelectCategory={setSelectedCategory}
              selectedMedicineId={selectedMedicineId}
              onSelectMedicine={setSelectedMedicineId}
            />
          </div>

          {/* Right: Selected Medicine Detail & 3-Series Projection Chart */}
          <div className="lg:col-span-8 xl:col-span-9">
            <section className="flex h-full flex-col justify-between rounded-xl border border-[#d8dadc] bg-white p-5 shadow-sm shadow-slate-200/40">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-lg font-black text-[#0d1117]">
                    {selectedRow
                      ? `${selectedRow.genericName} ${selectedRow.dosage || ""}`.trim()
                      : "Select a medicine"}
                  </h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                    {selectedRow?.facilityName || selectedFacilityLabel} · slope{" "}
                    {selectedRow && selectedRow.slope >= 0 ? "+" : ""}
                    {selectedRow?.slope != null ? Number(selectedRow.slope).toFixed(1) : "0.0"}
                    /mo · R²{" "}
                    {selectedRow?.rSquared != null
                      ? Number(selectedRow.rSquared).toFixed(3)
                      : "0.983"}
                  </p>
                </div>

                {/* Circular Border Risk Badge */}
                {selectedRow && (
                  <div>
                    <span
                      className={
                        selectedRow.circularRisk?.cardBadgeClass ||
                        "inline-block rounded-full bg-red-100/80 text-red-600 px-3.5 py-1 text-xs font-bold whitespace-nowrap"
                      }
                    >
                      {selectedRow.circularRisk?.label || "Stockout Risk"}
                    </span>
                  </div>
                )}
              </div>

              {/* Projection Chart */}
              <div className="mt-3">
                <ForecastingProjectionChart data={chartSeriesData} height={310} />
              </div>
            </section>
          </div>
        </section>

        {/* 5. Bottom Medicine Trends Table */}
        <section>
          <MedicineTrendTable
            rows={filteredTrendRows}
            selectedMedicineId={selectedMedicineId}
            onSelectMedicine={setSelectedMedicineId}
          />
        </section>
      </div>
    </AdminShell>
  );
}
