import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Building2,
  Clock,
  Download,
  Filter,
  PackageCheck,
  Pill,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
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
  buildFacilityStockComparison,
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
  const navigate = useNavigate();
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
  const [selectionMode, setSelectionMode] = useState("medicine"); // "medicine" | "category"
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
                expiration_date,
                batch_number,
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

  const categoriesWithCounts = useMemo(() => {
    const counts = new Map();
    catalogMedicines.forEach((med) => {
      const cats = parseMedicineCategories(med.categories);
      cats.forEach((cat) => {
        counts.set(cat, (counts.get(cat) || 0) + 1);
      });
    });

    return [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [catalogMedicines]);

  const categoryOptions = useMemo(() => {
    return categoriesWithCounts.map((c) => c.category);
  }, [categoriesWithCounts]);

  const effectiveCategory = selectedCategory || categoryOptions[0] || "";

  // Base facility analytics (unfiltered, full ranked list for bottom tables & comparisons)
  const baseAnalyticsRows = useMemo(() => {
    return {
      dispensingRows: scopedDispensingRows,
      forecastRows: scopedForecastRows,
      inventoryRows: scopedInventoryRows,
    };
  }, [scopedDispensingRows, scopedForecastRows, scopedInventoryRows]);

  const baseAnalytics = useMemo(() => {
    return buildForecastAnalytics({
      ...baseAnalyticsRows,
      facilities: scopedFacilities,
      monthWindow: monthHorizon,
    });
  }, [baseAnalyticsRows, monthHorizon, scopedFacilities]);

  const analytics = baseAnalytics || {};

  // All ranked trending medicines (unfiltered for bottom tables & forms)
  const allTrendingMedicines = useMemo(() => {
    return baseAnalytics?.trendingMedicines || [];
  }, [baseAnalytics]);

  // Category aggregate analytics when in category mode (only affects the graph!)
  const categoryForecastRow = useMemo(() => {
    if (selectionMode !== "category" || !effectiveCategory) return null;

    const catRows = buildCategoryForecastRows({
      category: effectiveCategory,
      dispensingRows: scopedDispensingRows,
      forecastRows: scopedForecastRows,
      inventoryRows: scopedInventoryRows,
    });

    const catAnalytics = buildForecastAnalytics({
      ...catRows,
      facilities: scopedFacilities,
      monthWindow: monthHorizon,
    });

    return catAnalytics?.trendingMedicines?.[0] || null;
  }, [selectionMode, effectiveCategory, scopedDispensingRows, scopedForecastRows, scopedInventoryRows, scopedFacilities, monthHorizon]);

  // Set default selected medicine
  useEffect(() => {
    if (allTrendingMedicines.length > 0) {
      const exists = allTrendingMedicines.some((r) => r.medicineId === selectedMedicineId);
      if (!exists) {
        setSelectedMedicineId(allTrendingMedicines[0].medicineId);
      }
    }
  }, [allTrendingMedicines, selectedMedicineId]);

  // Set default selected category
  useEffect(() => {
    if (!selectedCategory && categoryOptions.length > 0) {
      setSelectedCategory(categoryOptions[0]);
    }
  }, [categoryOptions, selectedCategory]);

  // Currently selected row driving the graph & action findings (category aggregate OR individual medicine)
  const selectedRow = useMemo(() => {
    if (selectionMode === "category") {
      return categoryForecastRow;
    }
    return (
      allTrendingMedicines.find((r) => r.medicineId === selectedMedicineId) ||
      allTrendingMedicines[0] ||
      null
    );
  }, [selectionMode, categoryForecastRow, allTrendingMedicines, selectedMedicineId]);

  // Chart data for selected row (affects the graph only)
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

  // Plain-language action findings for selected row
  const actionFindings = useMemo(() => {
    return buildMedicineActionFindings(selectedRow, { isCho: !isBhw });
  }, [isBhw, selectedRow]);

  // Individual medicine used for City Health Stations Stock Balance (unaffected by category filtering)
  const stockComparisonMedicine = useMemo(() => {
    if (selectionMode === "medicine" && selectedRow?.medicineId && !selectedRow.medicineId.startsWith("category:")) {
      return selectedRow;
    }
    return (
      allTrendingMedicines.find((m) => m.medicineId === selectedMedicineId) ||
      allTrendingMedicines[0] ||
      null
    );
  }, [selectionMode, selectedRow, allTrendingMedicines, selectedMedicineId]);

  // Cross-facility stock balance for CHO overview
  const facilityStockBalance = useMemo(() => {
    if (!stockComparisonMedicine?.medicineId || isBhw) return [];
    return buildFacilityStockComparison({
      inventoryRows,
      dispensingRows,
      medicineId: stockComparisonMedicine.medicineId,
      facilities,
    });
  }, [dispensingRows, facilities, inventoryRows, isBhw, stockComparisonMedicine?.medicineId]);

  const handleDispenseStock = useCallback(
    (row) => {
      navigate("/dispensing", {
        state: {
          activeTab: "DISPENSE",
          prefillMedicineId: row?.medicineId,
          prefillMedicineName: `${row?.genericName || ""} ${row?.dosage || ""}`.trim(),
        },
      });
    },
    [navigate]
  );

  const handleCreateRequisition = useCallback(
    (row, quantity) => {
      navigate("/requests", {
        state: {
          openNewRequest: true,
          prefillMedicineId: row?.medicineId,
          prefillQuantity: quantity,
          prefillMedicineLabel: `${row?.genericName || ""} ${row?.dosage || ""}`.trim(),
        },
      });
    },
    [navigate]
  );

  const handleInitiateReturn = useCallback(
    (row, quantity) => {
      navigate("/stock-returns", {
        state: {
          openNewReturn: true,
          prefillMedicineId: row?.medicineId,
          prefillQuantity: quantity,
          prefillMedicineLabel: `${row?.genericName || ""} ${row?.dosage || ""}`.trim(),
        },
      });
    },
    [navigate]
  );

  // Export Excel handler (exports all trending medicines for facility)
  const handleExportExcel = () => {
    const csvContent = buildForecastingCsv(
      allTrendingMedicines,
      selectedFacilityLabel,
      monthHorizon
    );
    downloadExportFile({
      filename: `PRDS_Forecasting_${new Date().toISOString().slice(0, 10)}`,
      csv: csvContent,
      recordCount: allTrendingMedicines.length,
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
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1F4E5A]">
              Forecasting
            </p>
            <h1 className="mt-0.5 text-2xl font-black text-[#1B2B30]">Forecast Analytics</h1>
            <p className="mt-0.5 text-xs font-semibold text-[#5B7077]">
              Monitor medicine demand and stock needs across CHO facilities.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={loadForecasting}
              disabled={isLoading}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-3.5 text-xs font-bold text-[#1B2B30] shadow-2xs transition hover:border-[#1F4E5A] hover:bg-[#EBF3F5] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-[#1F4E5A]" : "text-[#5B7077]"}`} />
              Refresh
            </button>
          </div>
        </section>

        {/* 2. Top 4 KPI Metric Cards */}
        <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {/* Card 1: Total Expected Demand */}
          <div className="flex flex-col justify-between rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-5 shadow-xs">
            <div>
              <p className="text-2xl font-black tracking-tight text-[#1F4E5A]">
                {formatNumber(analytics.totalProjectedDemand ?? 0)}
              </p>
              <p className="mt-1 text-xs font-bold text-[#1B2B30]">Total Expected Demand</p>
              <p className="mt-0.5 text-[11px] font-medium text-[#5B7077]">
                next {monthHorizon} months · {allTrendingMedicines.length} items
              </p>
            </div>
          </div>

          {/* Card 2: Medicines Running Low */}
          <div className="flex flex-col justify-between rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-5 shadow-xs">
            <div>
              <p className="text-2xl font-black tracking-tight text-[#D9826B]">
                {analytics.stockoutRiskCount ?? 0}
              </p>
              <p className="mt-1 text-xs font-bold text-[#1B2B30]">Medicines Running Low</p>
              <p className="mt-0.5 text-[11px] font-medium text-[#5B7077]">
                {analytics.stockoutRiskPercent ?? 0}% of filtered items
              </p>
            </div>
          </div>

          {/* Card 3: Rising Demand Items */}
          <div className="flex flex-col justify-between rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-5 shadow-xs">
            <div>
              <p className="text-2xl font-black tracking-tight text-[#1B2B30]">
                {analytics.increasingCount ?? 0}
              </p>
              <p className="mt-1 text-xs font-bold text-[#1B2B30]">Rising Demand Items</p>
              <p className="mt-0.5 text-[11px] font-medium text-[#5B7077]">
                usage climbing month-over-month
              </p>
            </div>
          </div>

          {/* Card 4: Forecast Reliability */}
          <div className="flex flex-col justify-between rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-5 shadow-xs">
            <div>
              <p
                className={`text-2xl font-black tracking-tight ${
                  analytics.avgRSquared >= 0.7
                    ? "text-[#2D7A5D]"
                    : analytics.avgRSquared >= 0.35
                    ? "text-[#dc8939]"
                    : "text-[#5B7077]"
                }`}
              >
                {analytics.avgRSquared >= 0.7
                  ? "High"
                  : analytics.avgRSquared >= 0.35
                  ? "Moderate"
                  : "Needs Data"}
              </p>
              <p className="mt-1 text-xs font-bold text-[#1B2B30]">Forecast Reliability</p>
              <p className="mt-0.5 text-[11px] font-medium text-[#5B7077]">
                {analytics.avgRSquared > 0
                  ? `avg R² ${Number(analytics.avgRSquared).toFixed(3)}`
                  : "based on historical consistency"}
              </p>
            </div>
          </div>
        </section>

        {/* 3. Filter & Horizon Toolbar */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-3">
            {!isBhw && (
              <div className="relative inline-flex items-center">
                <Filter className="pointer-events-none absolute left-3 h-4 w-4 text-[#5B7077]" />
                <select
                  aria-label="Facility scope"
                  value={selectedFacilityId || ""}
                  onChange={(event) => setChoFacilityId(event.target.value)}
                  className="h-9 max-w-64 rounded-lg border border-[#CFDDE0] bg-[#F4F8F8] pl-9 pr-8 text-xs font-bold text-[#1B2B30] outline-none transition focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20 cursor-pointer"
                >
                  {(facilities || []).map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.facility_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Horizon Pill Toggle */}
            <div className="inline-flex items-center rounded-lg border border-[#CFDDE0] bg-[#E5EFF1] p-0.5 text-xs">
              {[3, 6, 12].map((hz) => (
                <button
                  key={hz}
                  type="button"
                  onClick={() => setMonthHorizon(hz)}
                  className={`rounded-md px-3 py-1 text-xs font-bold transition cursor-pointer ${monthHorizon === hz
                      ? "bg-[#1F4E5A] text-white shadow-2xs"
                      : "text-[#5B7077] hover:text-[#1B2B30]"
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
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#CFDDE0] bg-[#F9FBFB] px-3.5 text-xs font-bold text-[#1B2B30] shadow-2xs transition hover:bg-[#EBF3F5] cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-[#5B7077]" />
              Export
            </button>
          </div>
        </section>

        {/* 4. Middle 2-Column Interactive Section */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left: Select Medicine List */}
          <div className="lg:col-span-4 xl:col-span-3">
            <MedicineSelectList
              mode={selectionMode}
              onModeChange={setSelectionMode}
              medicines={allTrendingMedicines}
              selectedMedicineId={selectedMedicineId}
              onSelectMedicine={(medId) => {
                setSelectedMedicineId(medId);
                setSelectionMode("medicine");
              }}
              categories={categoriesWithCounts}
              selectedCategory={effectiveCategory}
              onSelectCategory={setSelectedCategory}
            />
          </div>

          {/* Right: Selected Medicine Detail & 3-Series Projection Chart */}
          <div className="lg:col-span-8 xl:col-span-9">
            <section className="flex h-full flex-col justify-between rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-5 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#CFDDE0] pb-3">
                <div>
                  <h2 className="text-lg font-black text-[#1B2B30]">
                    {selectionMode === "category"
                      ? `Category: ${effectiveCategory}`
                      : selectedRow
                      ? `${selectedRow.genericName} ${selectedRow.dosage || ""}`.trim()
                      : "Select a medicine"}
                  </h2>
                  <p className="mt-0.5 text-xs font-medium text-[#5B7077]">
                    {selectedRow?.facilityName || selectedFacilityLabel} · {selectionMode === "category" ? "Category Monthly Aggregate" : "Monthly Change"}:{" "}
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
                  {(() => {
                    const actionQty = actionFindings.action?.quantity ?? actionFindings.actionQuantity ?? 0;
                    return (
                      <div
                        className={`flex flex-col justify-between rounded-xl border p-3 ${
                          actionFindings.action.type === "emergency"
                            ? "border-red-200 bg-red-50/60"
                            : actionFindings.action.type === "reorder"
                            ? "border-emerald-200 bg-emerald-50/60"
                            : (actionFindings.action.type === "return" ||
                               actionFindings.action.type === "dispense_fefo" ||
                               actionFindings.action.type === "near_expiry_bhw")
                            ? "border-amber-200 bg-amber-50/60"
                            : "border-slate-200/80 bg-slate-50/70"
                        }`}
                      >
                        <div>
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
                                : (actionFindings.action.type === "return" ||
                                   actionFindings.action.type === "dispense_fefo" ||
                                   actionFindings.action.type === "near_expiry_bhw")
                                ? "text-amber-800"
                                : "text-slate-800"
                            }`}
                          >
                            {actionFindings.action.label}
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                            {actionFindings.action.subtext}
                          </p>
                        </div>

                        {/* Actionable Triggers: FEFO Dispensing (CHO), Dual Dispense/Return (BHW), or Requisitions */}
                        {actionFindings.action.type === "dispense_fefo" && (
                          <button
                            type="button"
                            onClick={() => handleDispenseStock(selectedRow)}
                            className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#00a36c] px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-[#008f5d] cursor-pointer"
                            title="Navigate to Dispensing to prioritize FEFO dispensing"
                          >
                            <Pill className="h-3.5 w-3.5" />
                            Dispense Stock ({actionQty})
                          </button>
                        )}
                        {actionFindings.action.type === "near_expiry_bhw" && (
                          <div className="mt-2.5 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleDispenseStock(selectedRow)}
                              className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#00a36c] px-2 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-[#008f5d] cursor-pointer"
                              title="Dispense near-expiry stock locally to walk-in patients"
                            >
                              <Pill className="h-3.5 w-3.5 shrink-0" />
                              Dispense Locally
                            </button>
                            <button
                              type="button"
                              onClick={() => handleInitiateReturn(selectedRow, actionQty)}
                              className="inline-flex items-center justify-center gap-1 rounded-lg bg-amber-600 px-2 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-amber-700 cursor-pointer"
                              title="Return near-expiry batch to City Health Office (CHO)"
                            >
                              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                              Return to CHO ({actionQty})
                            </button>
                          </div>
                        )}
                        {actionFindings.action.type === "emergency" && (
                          <button
                            type="button"
                            onClick={() => handleCreateRequisition(selectedRow, actionQty || 50)}
                            className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-red-700 cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Emergency Requisition (+{actionQty || 50})
                          </button>
                        )}
                        {actionFindings.action.type === "reorder" && (
                          <button
                            type="button"
                            onClick={() => handleCreateRequisition(selectedRow, actionQty || 100)}
                            className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#00a36c] px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-[#008f5d] cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Create Requisition (+{actionQty || 100})
                          </button>
                        )}
                        {actionFindings.action.type === "return" && (
                          <button
                            type="button"
                            onClick={() => handleInitiateReturn(selectedRow, actionQty)}
                            className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-amber-700 cursor-pointer"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Initiate Stock Return ({actionQty})
                          </button>
                        )}
                      </div>
                    );
                  })()}

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

        {/* City Health Stations Stock Balance for CHO Users */}
        {!isBhw && stockComparisonMedicine && facilityStockBalance.length > 0 && (
          <section className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#CFDDE0] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1F4E5A]/10 text-[#1F4E5A]">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#1B2B30]">
                    City Health Stations Stock Balance
                  </h3>
                  <p className="text-xs font-semibold text-[#5B7077]">
                    Cross-station inventory and coverage overview for{" "}
                    <span className="font-bold text-[#1B2B30]">
                      {stockComparisonMedicine.genericName} {stockComparisonMedicine.dosage || ""}
                    </span>{" "}
                    across Naga City health stations.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#5B7077]">
                <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                  {facilityStockBalance.filter((f) => f.status === "deficit").length} Stations Running Low
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  {facilityStockBalance.filter((f) => f.status === "surplus").length} Stations with Ample Buffer
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Deficit Stations */}
              <div className="rounded-xl border border-red-200/80 bg-red-50/30 p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wider text-red-800">
                    Stations Needing Supply (Below Buffer)
                  </p>
                  <span className="text-[11px] font-semibold text-red-600">
                    Stockout Risk
                  </span>
                </div>
                <div className="mt-2.5 space-y-2">
                  {facilityStockBalance.filter((f) => f.status === "deficit").length === 0 ? (
                    <p className="py-4 text-center text-xs font-medium text-slate-500">
                      No health stations experiencing stock deficits for this medicine.
                    </p>
                  ) : (
                    facilityStockBalance
                      .filter((f) => f.status === "deficit")
                      .map((fac) => (
                        <div
                          key={fac.facilityId}
                          className="flex items-center justify-between rounded-lg border border-red-200/60 bg-white p-2.5 shadow-2xs"
                        >
                          <div>
                            <p className="text-xs font-bold text-[#1B2B30]">{fac.facilityName}</p>
                            <p className="text-[11px] font-medium text-slate-500">
                              Stock: <span className="font-bold text-red-700">{fac.currentStock}</span> · Monthly Demand: ~{fac.monthlyDemand} · Coverage: {fac.coverageMonths ?? "—"} mo
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-red-100 px-2 py-1 text-xs font-black text-red-700">
                              -{fac.deficitUnits} needed
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCreateRequisition(stockComparisonMedicine, fac.deficitUnits)}
                              className="rounded-md bg-[#00a36c] px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs hover:bg-[#008f5d] transition cursor-pointer flex items-center gap-1"
                              title="Encode Requisition to Allocate Stock"
                            >
                              <Plus className="h-3 w-3" />
                              Requisition
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Surplus Stations */}
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wider text-emerald-900">
                    Stations with Ample Buffer
                  </p>
                  <span className="text-[11px] font-semibold text-emerald-700">
                    Coverage &gt; 2.5 Months
                  </span>
                </div>
                <div className="mt-2.5 space-y-2">
                  {facilityStockBalance.filter((f) => f.status === "surplus").length === 0 ? (
                    <p className="py-4 text-center text-xs font-medium text-slate-500">
                      No health stations holding surplus stock beyond safe buffer.
                    </p>
                  ) : (
                    facilityStockBalance
                      .filter((f) => f.status === "surplus")
                      .map((fac) => (
                        <div
                          key={fac.facilityId}
                          className="flex items-center justify-between rounded-lg border border-emerald-200/60 bg-white p-2.5 shadow-2xs"
                        >
                          <div>
                            <p className="text-xs font-bold text-[#1B2B30]">{fac.facilityName}</p>
                            <p className="text-[11px] font-medium text-slate-500">
                              Stock: <span className="font-bold text-emerald-800">{fac.currentStock}</span> · Monthly Demand: ~{fac.monthlyDemand} · Coverage: {fac.coverageMonths ?? "—"} mo
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-800">
                              +{fac.surplusUnits} buffer
                            </span>
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                              Sufficient
                            </span>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 5. Bottom Medicine Trends Table */}
        <section>
          <MedicineTrendTable
            rows={allTrendingMedicines}
            selectedMedicineId={selectedMedicineId}
            onSelectMedicine={(medId) => {
              setSelectedMedicineId(medId);
              setSelectionMode("medicine");
            }}
          />
        </section>
      </div>
    </AdminShell>
  );
}
