import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Clock,
  Download,
  Filter,
  PackageCheck,
  RefreshCw,
  Search,
} from "lucide-react";

import AdminShell from "../../components/layout/AdminShell";
import { useAuth } from "../../context/useAuth";
import { downloadExportFile } from "../../services/downloadManager";
import { logoutUser } from "@backend/services/auth/authService";
import { supabase } from "@backend/client/supabase";
import { saveSnapshot, getSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import { isCurrentNetworkOnline } from "@backend/sync/networkStatus";
import { formatUserFacingError } from "@backend/sync/syncUtils";
import { formatDateTime, formatNumber } from "@shared/utils/dashboardUtils";
import {
  buildCategoryForecastRows,
  buildForecastAnalytics,
  buildForecastingCsv,
  buildMedicineActionFindings,
  buildMedicineChartSeries,
} from "@shared/utils/forecastingUtils";
import { parseMedicineCategories } from "@shared/utils/medicineUtils";

import ForecastingProjectionChart from "./components/charts/ForecastingProjectionChart";
import MedicineSelectList from "./components/MedicineSelectList";
import MedicineTrendTable from "./components/MedicineTrendTable";

const scopeRowsWithMedicine = (rows, facilityId, medicinesById) =>
  rows
    .filter((row) => !facilityId || row.facility_id === facilityId)
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
  const isBhw = profile?.role === "BHW";
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
  const [choFacilityId, setChoFacilityId] = useState(profile?.facility_id || "");

  const isMountedRef = useRef(true);
  const loadIdRef = useRef(0);

  const today = useMemo(() => formatDateTime(new Date()), []);
  const assignedFacilityId = profile?.facility_id || null;
  const queryFacilityId = isBhw ? assignedFacilityId : null;
  const selectedFacilityId = isBhw
    ? assignedFacilityId
    : choFacilityId || assignedFacilityId || facilities[0]?.id || null;

  // Load data from Supabase backend with offline fallback
  const loadForecasting = useCallback(async () => {
    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;

    if (isBhw && !queryFacilityId) {
      setIsLoading(false);
      return;
    }

    if (!isCurrentNetworkOnline()) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setForecastError("");

    const scope = (query) => queryFacilityId
      ? query.eq("facility_id", queryFacilityId)
      : query;

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
                medicine:medicines(generic_name, dosage, unit_of_measure, categories)
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
                facility:facilities!inventory_facility_id_fkey(facility_name),
                medicine:medicines(generic_name, dosage, unit_of_measure, categories)
              `)
              .order("quantity", { ascending: true })
          ),
          supabase
            .from("medicines")
            .select("id, generic_name, dosage, unit_of_measure, categories")
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
      setFacilities(queryFacilityId
        ? activeFacilities.filter((facility) => facility.id === queryFacilityId)
        : activeFacilities);
      if (!isBhw && activeFacilities[0]) {
        setChoFacilityId((current) => current || assignedFacilityId || activeFacilities[0].id);
      }
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
        setForecastError(formatUserFacingError(error, "Unable to load forecasting analytics right now. Please try again."));
      }
      setIsLoading(false);
    }
  }, [assignedFacilityId, isBhw, queryFacilityId]);
  useEffect(() => {
    isMountedRef.current = true;
    loadForecasting();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadForecasting]);

  // Compute analytics using Simple Linear Regression
  const scopedFacilities = useMemo(
    () => facilities.filter((facility) => facility.id === selectedFacilityId),
    [facilities, selectedFacilityId]
  );
  const medicinesById = useMemo(
    () => new Map(catalogMedicines.map((medicine) => [medicine.id, medicine])),
    [catalogMedicines]
  );
  const scopedForecastRows = useMemo(
    () => scopeRowsWithMedicine(forecastRows, selectedFacilityId, medicinesById),
    [forecastRows, medicinesById, selectedFacilityId]
  );
  const scopedDispensingRows = useMemo(
    () => scopeRowsWithMedicine(dispensingRows, selectedFacilityId, medicinesById),
    [dispensingRows, medicinesById, selectedFacilityId]
  );
  const scopedInventoryRows = useMemo(
    () => scopeRowsWithMedicine(inventoryRows, selectedFacilityId, medicinesById),
    [inventoryRows, medicinesById, selectedFacilityId]
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
    let rows = (analytics?.trendingMedicines || []).slice(0, 20);

    const query = searchTerm.trim().toLowerCase();
    if (query) {
      rows = rows.filter((r) =>
        [r.genericName, r.brandName, r.dosage, r.category, r.facilityName]
          .filter(Boolean)
          .some((val) => String(val).toLowerCase().includes(query))
      );
    }

    return rows;
  }, [analytics?.trendingMedicines, searchTerm]);

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
      intercept: selectedRow.intercept || selectedRow.latestHistorical || 0,
      horizon: monthHorizon,
    });
  }, [monthHorizon, selectedRow]);

  // Plain-language action findings for selected medicine
  const actionFindings = useMemo(() => {
    return buildMedicineActionFindings(selectedRow);
  }, [selectedRow]);

  // Export Excel handler
  const handleExportExcel = () => {
    const csvContent = buildForecastingCsv(
      filteredTrendRows,
      selectedFacilityLabel,
      monthHorizon
    );
    downloadExportFile({
      filename: `PRDS_Forecasting_${new Date().toISOString().slice(0, 10)}`,
      csv: csvContent,
      recordCount: filteredTrendRows.length,
    });
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
          {/* Card 1: Total Expected Demand */}
          <div className="flex flex-col justify-between rounded-xl border border-[#d8dadc] bg-white p-5 shadow-sm shadow-slate-200/40">
            <div>
              <p className="text-2xl font-black tracking-tight text-[#00a36c]">
                {formatNumber(analytics.totalProjectedDemand ?? 0)}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-800">Total Expected Demand</p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                next {monthHorizon} months · {filteredTrendRows.length} items
              </p>
            </div>
          </div>

          {/* Card 2: Medicines Running Low */}
          <div className="flex flex-col justify-between rounded-xl border border-[#d8dadc] bg-white p-5 shadow-sm shadow-slate-200/40">
            <div>
              <p className="text-2xl font-black tracking-tight text-amber-600">
                {analytics.stockoutRiskCount ?? 0}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-800">Medicines Running Low</p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                {analytics.stockoutRiskPercent ?? 0}% of filtered items
              </p>
            </div>
          </div>

          {/* Card 3: Rising Demand Items */}
          <div className="flex flex-col justify-between rounded-xl border border-[#d8dadc] bg-white p-5 shadow-sm shadow-slate-200/40">
            <div>
              <p className="text-2xl font-black tracking-tight text-[#0d1117]">
                {analytics.increasingCount ?? 0}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-800">Rising Demand Items</p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                usage climbing month-over-month
              </p>
            </div>
          </div>

          {/* Card 4: Forecast Reliability */}
          <div className="flex flex-col justify-between rounded-xl border border-[#d8dadc] bg-white p-5 shadow-sm shadow-slate-200/40">
            <div>
              <p
                className={`text-2xl font-black tracking-tight ${
                  analytics.avgRSquared >= 0.7
                    ? "text-[#00a36c]"
                    : analytics.avgRSquared >= 0.35
                    ? "text-blue-600"
                    : "text-slate-600"
                }`}
              >
                {analytics.avgRSquared >= 0.7
                  ? "High"
                  : analytics.avgRSquared >= 0.35
                  ? "Moderate"
                  : "Needs Data"}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-800">Forecast Reliability</p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                {analytics.avgRSquared > 0
                  ? `avg R² ${Number(analytics.avgRSquared).toFixed(3)}`
                  : "based on historical consistency"}
              </p>
            </div>
          </div>
        </section>

        {/* 3. Filter & Horizon Toolbar */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d8dadc] bg-white p-3 shadow-sm shadow-slate-200/40">
          <div className="flex flex-wrap items-center gap-3">
            {!isBhw && (
              <div className="relative inline-flex items-center">
                <Filter className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
                <select
                  aria-label="Facility scope"
                  value={selectedFacilityId || ""}
                  onChange={(event) => setChoFacilityId(event.target.value)}
                  className="h-9 max-w-64 rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-xs font-bold text-slate-700 outline-none transition focus:border-[#00a36c] focus:ring-2 focus:ring-[#6be9c2]/30"
                >
                  {(facilities || []).map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.facility_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

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
              onClick={handleExportExcel}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              Export
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
                    {selectedRow?.facilityName || selectedFacilityLabel} · Monthly Change:{" "}
                    <span className="font-bold text-slate-700">
                      {selectedRow && selectedRow.slope > 0 ? "+" : ""}
                      {selectedRow?.slope != null ? Number(selectedRow.slope).toFixed(1) : "0.0"}/mo
                    </span>
                    {" "}· Reliability:{" "}
                    <span className="font-bold text-slate-700">
                      {selectedRow?.reliabilityMeta?.label || (selectedRow?.rSquared >= 0.7 ? "High" : selectedRow?.rSquared >= 0.35 ? "Moderate" : "Needs Data")}
                    </span>
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

              {/* Projection Chart with Stock and Buffer Lines */}
              <div className="mt-3">
                <ForecastingProjectionChart
                  data={chartSeriesData}
                  currentStock={selectedRow?.stockQuantity}
                  threshold={selectedRow?.threshold}
                  height={290}
                />
              </div>

              {/* Plain-Language Action Findings Strip */}
              {selectedRow && (
                <div className="mt-3.5 grid grid-cols-1 gap-2.5 border-t border-slate-100 pt-3 sm:grid-cols-3">
                  {/* Box 1: Estimated Runout */}
                  <div
                    className={`rounded-xl border p-3 ${
                      actionFindings.runout.severity === "critical"
                        ? "border-red-200 bg-red-50/60"
                        : actionFindings.runout.severity === "warning"
                        ? "border-amber-200 bg-amber-50/60"
                        : "border-slate-200/80 bg-slate-50/70"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>Estimated Runout</span>
                    </div>
                    <p
                      className={`mt-1 text-sm font-black ${
                        actionFindings.runout.severity === "critical"
                          ? "text-red-700"
                          : actionFindings.runout.severity === "warning"
                          ? "text-amber-700"
                          : "text-slate-800"
                      }`}
                    >
                      {actionFindings.runout.label}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                      {actionFindings.runout.subtext}
                    </p>
                  </div>

                  {/* Box 2: Recommended Action */}
                  <div
                    className={`rounded-xl border p-3 ${
                      actionFindings.action.type === "emergency"
                        ? "border-red-200 bg-red-50/60"
                        : actionFindings.action.type === "reorder"
                        ? "border-emerald-200 bg-emerald-50/60"
                        : "border-slate-200/80 bg-slate-50/70"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      <PackageCheck className="h-3.5 w-3.5 text-slate-400" />
                      <span>Recommended Action</span>
                    </div>
                    <p
                      className={`mt-1 text-sm font-black ${
                        actionFindings.action.type === "emergency"
                          ? "text-red-700"
                          : actionFindings.action.type === "reorder"
                          ? "text-emerald-700"
                          : "text-slate-800"
                      }`}
                    >
                      {actionFindings.action.label}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                      {actionFindings.action.subtext}
                    </p>
                  </div>

                  {/* Box 3: Monthly Usage Pace */}
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      <Activity className="h-3.5 w-3.5 text-slate-400" />
                      <span>Monthly Usage Pace</span>
                    </div>
                    <p className="mt-1 text-sm font-black text-slate-800">
                      {actionFindings.pace.label}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                      {actionFindings.pace.subtext}
                    </p>
                  </div>
                </div>
              )}
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
