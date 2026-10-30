import { parseMedicineCategories } from "./medicineUtils.js";

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });

export const calculateLinearRegression = (values = []) => {
  const cleanValues = values.map(Number).filter(Number.isFinite);

  if (cleanValues.length < 2) {
    return { intercept: cleanValues[0] || 0, rSquared: 0, slope: 0 };
  }

  const n = cleanValues.length;
  const sumX = cleanValues.reduce((sum, _, index) => sum + index, 0);
  const sumY = cleanValues.reduce((sum, value) => sum + value, 0);
  const sumXY = cleanValues.reduce((sum, value, index) => sum + index * value, 0);
  const sumXX = cleanValues.reduce((sum, _, index) => sum + index * index, 0);
  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const totalVariance = cleanValues.reduce((sum, value) => sum + (value - meanY) ** 2, 0);
  const residualVariance = cleanValues.reduce(
    (sum, value, index) => sum + (value - (slope * index + intercept)) ** 2,
    0
  );

  return {
    intercept: roundMetric(intercept),
    rSquared: totalVariance === 0 ? 1 : roundMetric(Math.max(0, 1 - residualVariance / totalVariance)),
    slope: roundMetric(slope),
  };
};

export const buildMonthlyConsumptionRows = ({ dispensingRows = [], forecastRows = [] } = {}) => {
  const historicalByMonth = groupRowsByMonth(dispensingRows, "month", "total_dispensed");
  const forecastByMonth = groupRowsByMonth(forecastRows, "forecast_month", "predicted_quantity");
  const monthKeys = Array.from(
    new Set([...Object.keys(historicalByMonth), ...Object.keys(forecastByMonth)])
  ).sort();

  return monthKeys.map((key) => ({
    key,
    label: formatMonthLabel(key),
    historical: historicalByMonth[key] || 0,
    forecasted: forecastByMonth[key] || 0,
  }));
};

export const getMedicineCategory = (genericName = "", brandName = "") => {
  const text = `${genericName} ${brandName}`.toLowerCase();
  if (text.includes("amoxicillin") || text.includes("cotrimoxazole") || text.includes("cefalexin") || text.includes("antibiotic") || text.includes("ampicillin")) return "Antibiotic";
  if (text.includes("paracetamol") || text.includes("mefenamic") || text.includes("ibuprofen") || text.includes("tramadol") || text.includes("analgesic") || text.includes("aspirin")) return "Analgesic";
  if (text.includes("metformin") || text.includes("glimepiride") || text.includes("gliclazide") || text.includes("insulin") || text.includes("antidiabetic")) return "Antidiabetic";
  if (text.includes("amlodipine") || text.includes("losartan") || text.includes("captopril") || text.includes("metoprolol") || text.includes("antihypertensive")) return "Antihypertensive";
  if (text.includes("ors") || text.includes("oral rehydration") || text.includes("rehydration") || text.includes("electrolyte")) return "Rehydration";
  if (text.includes("salbutamol") || text.includes("inhaler") || text.includes("bronchodilator") || text.includes("budesonide")) return "Bronchodilator";
  if (text.includes("ferrous") || text.includes("iron") || text.includes("vitamin") || text.includes("ascorbic") || text.includes("folic") || text.includes("zinc") || text.includes("supplement")) return "Supplement";
  if (text.includes("omeprazole") || text.includes("antacid") || text.includes("ranitidine") || text.includes("aluminum")) return "Antacid";
  if (text.includes("cetirizine") || text.includes("loratadine") || text.includes("antihistamine") || text.includes("chlorphenamine")) return "Antihistamine";
  return "General";
};

export const buildCategoryForecastRows = ({
  category,
  dispensingRows = [],
  forecastRows = [],
  inventoryRows = [],
} = {}) => {
  const categoryName = String(category || "").trim();
  const categoryId = `category:${categoryName}`;
  const categoryMedicine = {
    id: categoryId,
    generic_name: categoryName,
    brand_name: "",
    dosage: "",
    unit_of_measure: "unit",
    categories: [categoryName],
  };
  const matchesCategory = (row) =>
    parseMedicineCategories(row.medicine?.categories).includes(categoryName);
  const aggregateSeries = (rows, periodKey, valueKey) => {
    const totals = new Map();

    rows.filter(matchesCategory).forEach((row) => {
      const period = String(row[periodKey] || "").slice(0, 7);
      if (!period) return;

      const current = totals.get(period) || {
        facility: row.facility,
        facility_id: row.facility_id,
        value: 0,
      };
      current.value += Number(row[valueKey] || 0);
      totals.set(period, current);
    });

    return Array.from(totals, ([period, total]) => ({
      medicine_id: categoryId,
      facility_id: total.facility_id,
      facility: total.facility,
      medicine: categoryMedicine,
      [periodKey]: `${period}-01`,
      [valueKey]: total.value,
    }));
  };

  const categoryInventory = inventoryRows.filter(matchesCategory);
  const inventory = categoryInventory.length
    ? [{
        medicine_id: categoryId,
        facility_id: categoryInventory[0].facility_id,
        facility: categoryInventory[0].facility,
        medicine: categoryMedicine,
        quantity: categoryInventory.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
        threshold: categoryInventory.reduce((sum, row) => sum + Number(row.threshold || 0), 0),
      }]
    : [];

  return {
    dispensingRows: aggregateSeries(dispensingRows, "month", "total_dispensed"),
    forecastRows: aggregateSeries(forecastRows, "forecast_month", "predicted_quantity"),
    inventoryRows: inventory,
  };
};

export const buildMedicineChartSeries = ({
  historicalSeries = [],
  forecastSeries = [],
  slope = 0,
  intercept = 0,
  horizon = 6,
} = {}) => {
  const n = historicalSeries.length;
  const effectiveHorizon = Number(horizon) || 6;
  const result = [];

  if (n === 0 && forecastSeries.length === 0) {
    return [];
  }

  // Calculate residual standard error for prediction interval (uncertainty cone)
  let residualStdDev = 0;
  if (n >= 3) {
    const sumResidualSq = historicalSeries.reduce((sum, pt, i) => {
      const fitted = slope * i + intercept;
      return sum + (pt.value - fitted) ** 2;
    }, 0);
    residualStdDev = Math.sqrt(sumResidualSq / Math.max(1, n - 2));
  }

  if (n > 0) {
    historicalSeries.forEach((pt, i) => {
      const isLast = i === n - 1;
      const fitVal = Math.max(0, Math.round(slope * i + intercept));
      result.push({
        month: formatMonthLabel(pt.key),
        historical: pt.value,
        olsFit: fitVal,
        projected: isLast ? pt.value : null,
        lowerBound: null,
        upperBound: null,
      });
    });

    const lastVal = result[result.length - 1]?.historical ?? result[result.length - 1]?.projected ?? 0;

    for (let k = 1; k <= effectiveHorizon; k++) {
      const explicitForecast = forecastSeries[k - 1]?.value;
      const projectedVal = explicitForecast != null
        ? explicitForecast
        : Math.max(0, Math.round(lastVal + slope * k));
      const fitVal = Math.max(0, Math.round(slope * (n - 1 + k) + intercept));

      const uncertaintyFactor = Math.sqrt(1 + 1 / n + (k * k) / (n * 2));
      const margin = Math.round(1.96 * residualStdDev * uncertaintyFactor);
      const lowerBound = Math.max(0, projectedVal - margin);
      const upperBound = projectedVal + margin;

      result.push({
        month: `+${k}mo`,
        historical: null,
        olsFit: fitVal,
        projected: projectedVal,
        lowerBound: residualStdDev > 0 ? lowerBound : null,
        upperBound: residualStdDev > 0 ? upperBound : null,
      });
    }
  } else if (forecastSeries.length > 0) {
    forecastSeries.slice(0, effectiveHorizon).forEach((pt, k) => {
      result.push({
        month: formatMonthLabel(pt.key) || `+${k + 1}mo`,
        historical: null,
        olsFit: null,
        projected: pt.value,
        lowerBound: null,
        upperBound: null,
      });
    });
  }

  return result;
};

export const buildForecastingCsv = (rows = [], facilityLabel = "All Facilities", horizon = 6) => {
  const headers = [
    "Medicine",
    "Category",
    "Facility",
    "Current Stock",
    "Trend Slope (/mo)",
    "Next Month Projected",
    `Projected (${horizon}mo Total)`,
    "Coverage Multiplier",
    "R-Squared (Fit)",
    "Risk Status",
  ];

  const lines = [headers.join(",")];

  rows.forEach((row) => {
    const medName = `"${(row.genericName + " " + (row.dosage || "")).trim().replace(/"/g, '""')}"`;
    const cat = `"${(row.category || "General").replace(/"/g, '""')}"`;
    const fac = `"${(row.facilityName || facilityLabel).replace(/"/g, '""')}"`;
    const stock = Number(row.stockQuantity || 0);
    const slope = `${row.slope >= 0 ? "+" : ""}${row.slope}`;
    const nextDemand = Number(row.nextMonthDemand || 0);
    const projTotal = Number(row.projectedDemand || 0);
    const coverage = `"${row.coverageMultiplier || "—"}"`;
    const r2 = Number(row.rSquared || 0).toFixed(3);
    const risk = `"${row.circularRisk?.label || row.risk?.label || "Stable"}"`;

    lines.push([medName, cat, fac, stock, slope, nextDemand, projTotal, coverage, r2, risk].join(","));
  });

  return lines.join("\n");
};

export const buildMedicineTrendRows = ({
  dispensingRows = [],
  forecastRows = [],
  inventoryRows = [],
  facilities = [],
  monthWindow = 6,
} = {}) => {
  const facilityMap = new Map((facilities || []).map((f) => [f.id, f.facility_name]));
  const medicineIds = Array.from(
    new Set(
      [...dispensingRows, ...forecastRows, ...inventoryRows]
        .map((row) => row.medicine_id)
        .filter(Boolean)
    )
  );

  return medicineIds.map((medicineId) => {
    const forecastSeries = getSeriesForMedicine(
      forecastRows,
      medicineId,
      "forecast_month",
      "predicted_quantity"
    );
    const historicalSeries = getSeriesForMedicine(
      dispensingRows,
      medicineId,
      "month",
      "total_dispensed"
    );
    const forecastRegression = calculateLinearRegression(forecastSeries.map((row) => row.value));
    const historicalRegression = calculateLinearRegression(historicalSeries.map((row) => row.value));
    const medicine = getMedicineForId(medicineId, forecastRows, inventoryRows);
    const inventory = summarizeInventoryForMedicine(inventoryRows, medicineId);
    const latestHistorical = historicalSeries.at(-1)?.value || 0;
    const rawProjected = forecastSeries.at(-1)?.value || 0;

    const projectedDemand = rawProjected > 0
      ? rawProjected
      : Math.max(0, Math.round(historicalRegression.slope * historicalSeries.length + historicalRegression.intercept)) || latestHistorical || 0;

    const coverageMonths = projectedDemand > 0 ? roundMetric(inventory.quantity / projectedDemand) : null;
    const risk = getInventoryRisk({
      coverageMonths,
      quantity: inventory.quantity,
      threshold: inventory.threshold,
    });

    const hasThresholdBreach = inventory.threshold > 0 && inventory.quantity <= inventory.threshold;
    const dailyDemand = projectedDemand > 0 ? projectedDemand / 30 : 0;
    const usableBeforeExpiry = (inventory.daysToNearestExpiry != null && dailyDemand > 0)
      ? Math.round(dailyDemand * Math.max(0, inventory.daysToNearestExpiry))
      : null;
    const atRiskExpiryUnits = (usableBeforeExpiry != null && inventory.quantity > usableBeforeExpiry)
      ? inventory.quantity - usableBeforeExpiry
      : 0;

    let circularRisk = {
      type: "optimal",
      label: "Optimal",
      badgeClass: "inline-block rounded-full bg-emerald-100/80 text-emerald-700 px-3 py-1 text-xs font-bold whitespace-nowrap",
      cardBadgeClass: "inline-block rounded-full bg-emerald-100/80 text-emerald-700 px-3.5 py-1 text-xs font-bold whitespace-nowrap",
    };

    if (inventory.quantity === 0) {
      circularRisk = {
        type: "stockout",
        label: "Stockout Risk",
        badgeClass: "inline-block rounded-full bg-red-100/80 text-red-600 px-3 py-1 text-xs font-bold whitespace-nowrap",
        cardBadgeClass: "inline-block rounded-full bg-red-100/80 text-red-600 px-3.5 py-1 text-xs font-bold whitespace-nowrap",
      };
    } else if (hasThresholdBreach) {
      circularRisk = {
        type: "stockout",
        label: "Below Buffer",
        badgeClass: "inline-block rounded-full bg-red-100/80 text-red-600 px-3 py-1 text-xs font-bold whitespace-nowrap",
        cardBadgeClass: "inline-block rounded-full bg-red-100/80 text-red-600 px-3.5 py-1 text-xs font-bold whitespace-nowrap",
      };
    } else if (coverageMonths !== null && coverageMonths < 1.0) {
      circularRisk = {
        type: "stockout",
        label: "Stockout Risk",
        badgeClass: "inline-block rounded-full bg-red-100/80 text-red-600 px-3 py-1 text-xs font-bold whitespace-nowrap",
        cardBadgeClass: "inline-block rounded-full bg-red-100/80 text-red-600 px-3.5 py-1 text-xs font-bold whitespace-nowrap",
      };
    } else if (coverageMonths !== null && coverageMonths > 2.5) {
      if (atRiskExpiryUnits > 0 || (inventory.daysToNearestExpiry != null && inventory.daysToNearestExpiry <= 90)) {
        circularRisk = {
          type: "expiry_risk",
          label: "Expiry Risk (FEFO)",
          badgeClass: "inline-block rounded-full bg-rose-100 text-rose-700 px-3 py-1 text-xs font-bold whitespace-nowrap",
          cardBadgeClass: "inline-block rounded-full bg-rose-100 text-rose-700 px-3.5 py-1 text-xs font-bold whitespace-nowrap",
        };
      } else {
        circularRisk = {
          type: "overstock",
          label: "Overstock",
          badgeClass: "inline-block rounded-full bg-amber-100/80 text-amber-700 px-3 py-1 text-xs font-bold whitespace-nowrap",
          cardBadgeClass: "inline-block rounded-full bg-amber-100/80 text-amber-700 px-3.5 py-1 text-xs font-bold whitespace-nowrap",
        };
      }
    } else if (projectedDemand === 0 && inventory.quantity > 0) {
      circularRisk = {
        type: "optimal",
        label: "Ample Stock",
        badgeClass: "inline-block rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs font-bold whitespace-nowrap",
        cardBadgeClass: "inline-block rounded-full bg-slate-100 text-slate-700 px-3.5 py-1 text-xs font-bold whitespace-nowrap",
      };
    }

    const sampleRow = [...forecastRows, ...inventoryRows, ...dispensingRows].find((r) => r.medicine_id === medicineId);
    const facilityName = sampleRow?.facility?.facility_name || facilityMap.get(sampleRow?.facility_id) || "Barangay Health Center";

    const activeSlope = forecastSeries.length >= 2 ? forecastRegression.slope : historicalRegression.slope;
    const activeRSquared = forecastSeries.length >= 2 ? forecastRegression.rSquared : historicalRegression.rSquared;
    const activeIntercept = forecastSeries.length >= 2 ? forecastRegression.intercept : historicalRegression.intercept;
    const historyCount = historicalSeries.length;
    const reliabilityMeta = getReliabilityMeta(activeRSquared, historyCount);

    return {
      atRiskExpiryUnits,
      brandName: medicine?.brand_name || "",
      category:
        parseMedicineCategories(medicine?.categories)[0] ||
        getMedicineCategory(medicine?.generic_name, medicine?.brand_name),
      circularRisk,
      coverageMonths,
      coverageMultiplier: coverageMonths != null
        ? `${coverageMonths.toFixed(2)}x`
        : (inventory.quantity > 0 && projectedDemand === 0 ? "Ample (>12m)" : "—"),
      daysToNearestExpiry: inventory.daysToNearestExpiry,
      direction: getTrendDirection(forecastRegression.slope),
      dosage: medicine?.dosage || "",
      expiringSoonQty: inventory.expiringSoonQty,
      facilityName,
      forecastRegression,
      forecastSeries,
      forecastSlope: forecastRegression.slope,
      genericName: medicine?.generic_name || "Medicine",
      historicalRegression,
      historicalSeries,
      historicalSlope: historicalRegression.slope,
      intercept: activeIntercept,
      latestHistorical,
      medicineId,
      nearestExpiryDate: inventory.nearestExpiryDate,
      nextMonthDemand: projectedDemand,
      projectedDemand,
      reliabilityMeta,
      risk,
      rSquared: activeRSquared,
      slope: activeSlope,
      stockQuantity: inventory.quantity,
      threshold: inventory.threshold,
      unitOfMeasure: medicine?.unit_of_measure || "unit",
    };
  });
};

export const getReliabilityMeta = (rSquared, historyCount = 2) => {
  if (historyCount < 3 || rSquared == null || Number.isNaN(rSquared)) {
    return { label: "Needs Data", badgeClass: "bg-slate-100 text-slate-500", desc: "Less than 3 months of history (insufficient for trend)" };
  }
  if (historyCount >= 4 && rSquared >= 0.7) {
    return { label: "High", badgeClass: "bg-emerald-100 text-emerald-800", desc: "Steady, predictable pattern (4+ mos)" };
  }
  if (historyCount === 3 && rSquared >= 0.75) {
    return { label: "Moderate", badgeClass: "bg-blue-100 text-blue-800", desc: "Preliminary trend (3 mos)" };
  }
  if (rSquared >= 0.35) {
    return { label: "Moderate", badgeClass: "bg-blue-100 text-blue-800", desc: "Fluctuating month-to-month" };
  }
  return { label: "Limited", badgeClass: "bg-amber-100 text-amber-800", desc: "Low correlation; use with caution" };
};

export const buildMedicineActionFindings = (row, options = {}) => {
  if (!row) {
    return {
      runout: { label: "—", subtext: "Select a medicine to view runout estimates", severity: "normal" },
      action: { label: "—", subtext: "No action calculated", type: "neutral", quantity: 0, isCho: true },
      actionQuantity: 0,
      pace: { label: "—", subtext: "No dispensing data available" },
    };
  }

  const isCho = options.isCho ?? true;
  const currentStock = Number(row.stockQuantity ?? row.currentStock ?? 0);
  const threshold = Number(row.threshold ?? 0);
  const monthlyDemand = Number(row.nextMonthDemand ?? row.projectedDemand ?? 0);
  const slope = Number(row.slope ?? 0);
  const historyCount = Array.isArray(row.historicalSeries) ? row.historicalSeries.length : 0;

  // 1. Estimated Runout (Days of Supply)
  let runoutLabel = "—";
  let runoutSubtext = "No forecast data";
  let runoutSeverity = "normal";

  if (currentStock === 0) {
    runoutLabel = "Out of Stock (0 Days)";
    runoutSubtext = "No medicine units on shelf";
    runoutSeverity = "critical";
  } else if (monthlyDemand <= 0) {
    runoutLabel = "Ample Stock (>180 Days)";
    runoutSubtext = "Zero patient demand recorded";
    runoutSeverity = "normal";
  } else {
    const dailyDemand = monthlyDemand / 30;
    const daysLeft = Math.round(currentStock / dailyDemand);

    if (daysLeft <= 15) {
      runoutLabel = `~${daysLeft} Days of Supply Left`;
      runoutSubtext = "Urgent: Stock runs out in ~2 weeks";
      runoutSeverity = "critical";
    } else if (daysLeft <= 30) {
      runoutLabel = `~${daysLeft} Days of Supply Left`;
      runoutSubtext = "Stock depletes within 1 month";
      runoutSeverity = "warning";
    } else if (daysLeft <= 75) {
      const mos = (daysLeft / 30).toFixed(1);
      runoutLabel = `~${daysLeft} Days (${mos} Mos)`;
      runoutSubtext = "Healthy operational buffer on shelf";
      runoutSeverity = "normal";
    } else {
      const mos = (daysLeft / 30).toFixed(1);
      runoutLabel = `~${mos} Months of Supply`;
      runoutSubtext = "Stock exceeds standard 2.5-month buffer";
      runoutSeverity = "normal";
    }
  }

  // 2. Recommended Action
  let actionLabel = "No Request Needed";
  let actionSubtext = "Current stock covers upcoming needs";
  let actionType = "neutral";
  let actionQuantity = 0;

  const targetBuffer = Math.round(monthlyDemand * 2) + threshold;
  const shortage = targetBuffer - currentStock;

  if (row.circularRisk?.type === "expiry_risk") {
    const surplusToReturn = row.atRiskExpiryUnits > 0
      ? row.atRiskExpiryUnits
      : Math.max(0, currentStock - Math.round(monthlyDemand * 1.5));
    actionQuantity = surplusToReturn > 0 ? surplusToReturn : currentStock;

    if (isCho) {
      // CHO is the central warehouse for the City of Naga - they do not return stock to CHO.
      // Recommended operational action: prioritize FEFO walk-in dispensing & allocation to BHS stations
      actionType = "dispense_fefo";
      actionLabel = `Prioritize FEFO Dispensing: ${actionQuantity} units`;
      actionSubtext = row.daysToNearestExpiry != null
        ? `Batch expires in ~${row.daysToNearestExpiry} days; prioritize walk-in dispensing & BHS allocations`
        : "Prioritize FEFO walk-in dispensing & BHS allocations before batch expiration";
    } else {
      // BHW at Barangay Health Station: dual option to dispense locally or return to CHO
      actionType = "near_expiry_bhw";
      actionLabel = `Near-Expiry Action: ${actionQuantity} units`;
      actionSubtext = row.daysToNearestExpiry != null
        ? `Batch expires in ~${row.daysToNearestExpiry} days; dispense locally to patients or return to CHO`
        : "Stock expires soon; dispense locally or return excess stock to CHO";
    }
  } else if (currentStock === 0) {
    const qty = targetBuffer > 0 ? targetBuffer : Math.max(threshold, 100);
    actionLabel = `Emergency Reorder: +${qty} units`;
    actionSubtext = isCho
      ? "Immediate replenishment required from supplier or central buffer"
      : "Immediate requisition required from CHO";
    actionType = "emergency";
    actionQuantity = qty;
  } else if (shortage > 0) {
    actionLabel = `Request +${shortage} units`;
    actionSubtext = "Restores 60-day supply plus safety buffer";
    actionType = "reorder";
    actionQuantity = shortage;
  } else if (currentStock > (monthlyDemand * 3 + threshold) && monthlyDemand > 0) {
    const surplus = currentStock - (monthlyDemand * 2 + threshold);
    actionLabel = `Surplus Stock: +${surplus} units`;
    actionSubtext = "Ample stock on hand; pause new requisitions";
    actionType = "surplus";
    actionQuantity = surplus;
  } else {
    actionLabel = "No Request Needed";
    actionSubtext = "Stock on hand covers upcoming needs";
    actionType = "neutral";
    actionQuantity = 0;
  }

  // 3. Usage Pace
  let paceLabel = "Steady";
  let paceSubtext = "Consistent month-to-month consumption";

  if (historyCount < 2) {
    paceLabel = monthlyDemand > 0 ? `Steady (~${monthlyDemand} units/mo)` : "No Recent Dispensing";
    paceSubtext = "1 month of logs (needs 2+ mos for trend)";
  } else if (slope > 0.5) {
    paceLabel = `Rising (+${Math.abs(slope).toFixed(1)}/mo)`;
    paceSubtext = "Patient demand climbing month-over-month";
  } else if (slope < -0.5) {
    paceLabel = `Falling (-${Math.abs(slope).toFixed(1)}/mo)`;
    paceSubtext = "Patient demand slowing down";
  } else {
    paceLabel = `Steady (±0.0/mo)`;
    paceSubtext = "Consistent month-to-month consumption";
  }

  return {
    runout: { label: runoutLabel, subtext: runoutSubtext, severity: runoutSeverity },
    action: {
      label: actionLabel,
      subtext: actionSubtext,
      type: actionType,
      quantity: actionQuantity,
      isCho,
    },
    actionQuantity,
    pace: { label: paceLabel, subtext: paceSubtext },
  };
};

export const buildFacilityStockComparison = ({
  medicineId,
  dispensingRows = [],
  inventoryRows = [],
  facilities = [],
} = {}) => {
  if (!medicineId) return [];

  const facilityMap = new Map((facilities || []).map((f) => [f.id, f.facility_name]));
  const relevantFacilityIds = Array.from(
    new Set(
      [...dispensingRows, ...inventoryRows]
        .filter((r) => r.medicine_id === medicineId)
        .map((r) => r.facility_id)
        .filter(Boolean)
    )
  );

  return relevantFacilityIds.map((facId) => {
    const facName = facilityMap.get(facId) || "Barangay Station";
    const facInventory = inventoryRows
      .filter((r) => r.medicine_id === medicineId && r.facility_id === facId)
      .reduce((sum, r) => sum + Number(r.quantity || 0), 0);
    const facThreshold = inventoryRows
      .filter((r) => r.medicine_id === medicineId && r.facility_id === facId)
      .reduce((max, r) => Math.max(max, Number(r.threshold || 0)), 0);

    const facDispensingSeries = getSeriesForMedicine(
      dispensingRows.filter((r) => r.facility_id === facId),
      medicineId,
      "month",
      "total_dispensed"
    );

    const regression = calculateLinearRegression(facDispensingSeries.map((r) => r.value));
    const monthlyDemand = facDispensingSeries.length > 0
      ? Math.max(0, Math.round(regression.slope * facDispensingSeries.length + regression.intercept)) || facDispensingSeries.at(-1)?.value || 0
      : 0;

    const targetStock = Math.round(monthlyDemand * 2) + facThreshold;
    const netBalance = facInventory - targetStock;
    const coverageMonths = monthlyDemand > 0 ? roundMetric(facInventory / monthlyDemand) : null;

    let status = "optimal";
    if (facInventory === 0 || netBalance < 0 || (coverageMonths !== null && coverageMonths < 1.0)) {
      status = "deficit";
    } else if (coverageMonths !== null && coverageMonths > 2.5) {
      status = "surplus";
    }

    return {
      facilityId: facId,
      facilityName: facName,
      currentStock: facInventory,
      threshold: facThreshold,
      monthlyDemand,
      coverageMonths,
      netBalance,
      status,
      deficitUnits: netBalance < 0 ? Math.abs(netBalance) : 0,
      surplusUnits: netBalance > 0 ? netBalance : 0,
      safeBufferTarget: targetStock,
    };
  }).sort((a, b) => a.netBalance - b.netBalance);
};

export const buildFacilityRedistributionComparison = buildFacilityStockComparison;

export const buildInventoryCoverageRows = ({ forecastRows = [], inventoryRows = [] } = {}) => {
  const medicineIds = Array.from(
    new Set([...forecastRows, ...inventoryRows].map((row) => row.medicine_id).filter(Boolean))
  );

  return medicineIds
    .map((medicineId) => {
      const medicine = getMedicineForId(medicineId, forecastRows, inventoryRows);
      const inventory = summarizeInventoryForMedicine(inventoryRows, medicineId);
      const projectedDemand = getLatestForecastQuantity(forecastRows, medicineId);
      const coverageMonths = projectedDemand > 0 ? roundMetric(inventory.quantity / projectedDemand) : null;
      const risk = getInventoryRisk({
        coverageMonths,
        quantity: inventory.quantity,
        threshold: inventory.threshold,
      });

      return {
        brandName: medicine?.brand_name || "",
        coverageMonths,
        currentStock: inventory.quantity,
        dosage: medicine?.dosage || "",
        genericName: medicine?.generic_name || "Medicine",
        medicineId,
        projectedDemand,
        risk,
        threshold: inventory.threshold,
        unitOfMeasure: medicine?.unit_of_measure || "unit",
      };
    })
    .sort((first, second) => riskRank[first.risk.label] - riskRank[second.risk.label]);
};

export const getInventoryRisk = ({ coverageMonths, quantity, threshold }) => {
  const stock = Number(quantity || 0);
  const safety = Number(threshold || 0);
  const coverage = Number(coverageMonths);

  if (stock === 0 || stock <= Math.max(1, Math.floor(safety * 0.25))) {
    return riskMeta.Critical;
  }

  if (stock <= safety || (Number.isFinite(coverage) && coverage < 1)) {
    return riskMeta.Low;
  }

  if (stock <= safety * 1.5 || (Number.isFinite(coverage) && coverage < 2)) {
    return riskMeta.Watch;
  }

  return riskMeta.Stable;
};

export const buildForecastAnalytics = ({
  dispensingRows = [],
  forecastRows = [],
  inventoryRows = [],
  facilities = [],
  monthWindow = 6,
} = {}) => {
  const monthlyRows = buildMonthlyConsumptionRows({ dispensingRows, forecastRows });
  const coverageRows = buildInventoryCoverageRows({ forecastRows, inventoryRows });
  const trendRows = buildMedicineTrendRows({ dispensingRows, forecastRows, inventoryRows, facilities, monthWindow });
  const trendingMedicines = [...trendRows].sort((first, second) => {
    if (second.forecastSlope !== first.forecastSlope) {
      return second.forecastSlope - first.forecastSlope;
    }
    return second.projectedDemand - first.projectedDemand;
  });
  const forecastTotal = forecastRows.reduce(
    (sum, row) => sum + Number(row.predicted_quantity || 0),
    0
  );
  const riskRows = coverageRows.filter((row) => row.risk.label !== "Enough Stock");
  const increasingCount = trendRows.filter((row) => row.direction === "Increasing" || row.slope > 0).length;
  const decliningCount = trendRows.filter((row) => row.direction === "Declining" || row.slope < 0).length;
  const regression = calculateLinearRegression(monthlyRows.map((row) => row.forecasted));
  const interpretation = buildForecastInterpretation({
    decliningCount,
    forecastTotal,
    increasingCount,
    monthlyRows,
    riskRows,
  });

  const horizonMonths = Number(monthWindow) || 6;
  const totalProjectedDemand = trendRows.reduce((sum, row) => {
    const perMonth = row.nextMonthDemand || row.projectedDemand || 0;
    return sum + perMonth * horizonMonths;
  }, 0);

  const stockoutRiskCount = trendRows.filter((row) => row.circularRisk?.type === "stockout").length;
  const stockoutRiskPercent = trendRows.length > 0 ? Math.round((stockoutRiskCount / trendRows.length) * 100) : 0;

  const validR2Rows = trendRows.filter((row) => Number.isFinite(row.rSquared) && row.rSquared > 0);
  const avgRSquared = validR2Rows.length > 0
    ? roundMetric(validR2Rows.reduce((sum, r) => sum + r.rSquared, 0) / validR2Rows.length)
    : 0;

  return {
    avgRSquared,
    coverageRows,
    decliningCount,
    forecastTotal,
    increasingCount,
    interpretation,
    monthlyRows,
    regression,
    riskRows,
    stockoutRiskCount,
    stockoutRiskPercent,
    totalProjectedDemand,
    trendingMedicines,
    trendRows,
    uniqueMedicineCount: trendRows.length,
  };
};

export const buildForecastInterpretation = ({
  decliningCount = 0,
  forecastTotal = 0,
  increasingCount = 0,
  monthlyRows = [],
  riskRows = [],
} = {}) => {
  const recordsUsed = monthlyRows.filter((row) => Number(row.historical || 0) > 0 || Number(row.forecasted || 0) > 0).length;

  if (recordsUsed < 2) {
    return {
      sentence: "There are not enough records yet to estimate next month clearly.",
      details: `${recordsUsed} month${recordsUsed === 1 ? "" : "s"} with use or forecast records.`,
    };
  }

  if (riskRows.length > 0) {
    return {
      sentence: "Some medicines may need stock review before the next month.",
      details: `${riskRows.length} medicine${riskRows.length === 1 ? "" : "s"} need attention from ${formatNumberForText(forecastTotal)} expected units.`,
    };
  }

  if (increasingCount > 0) {
    return {
      sentence: "Medicine use is increasing. Review if current stock is enough for next month.",
      details: `${increasingCount} medicine${increasingCount === 1 ? "" : "s"} show increasing use.`,
    };
  }

  if (decliningCount > 0) {
    return {
      sentence: "Medicine use is decreasing. Restocking may be lower unless requests increase.",
      details: `${decliningCount} medicine${decliningCount === 1 ? "" : "s"} show lower expected use.`,
    };
  }

  return {
    sentence: "Medicine use is stable. Current stock appears enough based on recent records.",
    details: `${formatNumberForText(forecastTotal)} expected units across the selected records.`,
  };
};

const riskMeta = {
  Critical: {
    badgeClass: "bg-[#faedf0] text-[#D9826B] border border-[#D9826B]/25",
    barClass: "bg-[#D9826B]",
    label: "Critical",
    textClass: "text-[#D9826B]",
  },
  Low: {
    badgeClass: "bg-[#fdf3e9] text-[#965315] border border-[#dc8939]/25",
    barClass: "bg-[#dc8939]",
    label: "Low Stock",
    textClass: "text-[#965315]",
  },
  Stable: {
    badgeClass: "bg-[#E8F5F1] text-[#2D7A5D] border border-[#4C9F80]/25",
    barClass: "bg-[#4C9F80]",
    label: "Enough Stock",
    textClass: "text-[#2D7A5D]",
  },
  Watch: {
    badgeClass: "bg-[#fefce8] text-[#716006] border border-[#f3f029]/60",
    barClass: "bg-[#f3f029]",
    label: "Monitor Stock",
    textClass: "text-[#716006]",
  },
};

const riskRank = {
  Critical: 0,
  "Low Stock": 1,
  "Monitor Stock": 2,
  "Enough Stock": 3,
};

const groupRowsByMonth = (rows, dateKey, quantityKey) => {
  return rows.reduce((summary, row) => {
    const key = getMonthKey(row?.[dateKey]);

    if (!key) {
      return summary;
    }

    summary[key] = (summary[key] || 0) + Number(row?.[quantityKey] || 0);
    return summary;
  }, {});
};

const getSeriesForMedicine = (rows, medicineId, dateKey, quantityKey) => {
  const grouped = rows
    .filter((row) => row.medicine_id === medicineId)
    .reduce((summary, row) => {
      const key = getMonthKey(row?.[dateKey]);

      if (!key) {
        return summary;
      }

      summary[key] = (summary[key] || 0) + Number(row?.[quantityKey] || 0);
      return summary;
    }, {});

  return Object.entries(grouped)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, value]) => ({ key, value }));
};

const summarizeInventoryForMedicine = (inventoryRows, medicineId) => {
  const matching = inventoryRows.filter((row) => row.medicine_id === medicineId);
  const now = new Date();
  let nearestExpiry = null;
  let expiringSoonQty = 0;
  let totalQty = 0;
  let maxThreshold = 0;
  const batches = [];

  matching.forEach((row) => {
    const qty = Number(row.quantity || 0);
    const th = Number(row.threshold || 0);
    totalQty += qty;
    if (th > maxThreshold) maxThreshold = th;

    if (row.expiration_date) {
      const expDate = new Date(row.expiration_date);
      if (!Number.isNaN(expDate.getTime())) {
        const daysUntil = Math.round((expDate - now) / (1000 * 60 * 60 * 24));
        if (nearestExpiry === null || expDate < nearestExpiry) {
          nearestExpiry = expDate;
        }
        if (daysUntil <= 90 && daysUntil > 0 && qty > 0) {
          expiringSoonQty += qty;
        }
        batches.push({
          batch_number: row.batch_number || "Default",
          expiration_date: row.expiration_date,
          quantity: qty,
          daysUntil,
        });
      }
    }
  });

  const daysToNearestExpiry = nearestExpiry
    ? Math.round((nearestExpiry - now) / (1000 * 60 * 60 * 24))
    : null;

  return {
    quantity: totalQty,
    threshold: maxThreshold,
    nearestExpiryDate: nearestExpiry ? nearestExpiry.toISOString().slice(0, 10) : null,
    daysToNearestExpiry,
    expiringSoonQty,
    batches,
  };
};

const getLatestForecastQuantity = (forecastRows, medicineId) => {
  const latest = forecastRows
    .filter((row) => row.medicine_id === medicineId)
    .sort((first, second) => new Date(first.forecast_month) - new Date(second.forecast_month))
    .at(-1);

  return Number(latest?.predicted_quantity || 0);
};

const getMedicineForId = (medicineId, forecastRows, inventoryRows) => {
  const row = [...forecastRows, ...inventoryRows].find(
    (candidate) => candidate.medicine_id === medicineId && candidate.medicine
  );
  return row?.medicine || null;
};

const getTrendDirection = (slope) => {
  if (slope > 0.5) {
    return "Increasing";
  }

  if (slope < -0.5) {
    return "Declining";
  }

  return "Flat";
};

const getMonthKey = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 7);
};

const formatMonthLabel = (monthKey) => {
  const date = new Date(`${monthKey}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? monthKey : monthFormatter.format(date);
};

const roundMetric = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 100) / 100;
};

const formatNumberForText = (value) => Number(value || 0).toLocaleString();
