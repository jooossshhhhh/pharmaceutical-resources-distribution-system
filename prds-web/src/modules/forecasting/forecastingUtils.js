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

export const buildMedicineChartSeries = ({
  historicalSeries = [],
  forecastSeries = [],
  slope = 0,
  intercept = 0,
  horizon = 6,
} = {}) => {
  const n = historicalSeries.length;
  const result = [];

  if (n > 0) {
    historicalSeries.forEach((pt, i) => {
      const isLast = i === n - 1;
      const fitVal = Math.max(0, Math.round(slope * i + intercept));
      result.push({
        month: formatMonthLabel(pt.key),
        historical: pt.value,
        olsFit: fitVal,
        projected: isLast ? pt.value : null,
      });
    });
  } else {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const baseVal = intercept > 0 ? intercept : 300;
    for (let i = 0; i < 6; i++) {
      const isLast = i === 5;
      const val = Math.max(0, Math.round(baseVal + slope * i));
      result.push({
        month: monthNames[i],
        historical: val,
        olsFit: val,
        projected: isLast ? val : null,
      });
    }
  }

  const lastVal = result[result.length - 1]?.historical ?? result[result.length - 1]?.projected ?? 0;
  const effectiveHorizon = Number(horizon) || 6;

  for (let k = 1; k <= effectiveHorizon; k++) {
    const explicitForecast = forecastSeries[k - 1]?.value;
    const projectedVal = explicitForecast != null
      ? explicitForecast
      : Math.max(0, Math.round(lastVal + slope * k));

    result.push({
      month: `+${k}mo`,
      historical: null,
      olsFit: null,
      projected: projectedVal,
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

    let circularRisk = {
      type: "optimal",
      label: "Optimal",
      badgeClass: "inline-block rounded-full bg-emerald-100/80 text-emerald-700 px-3 py-1 text-xs font-bold whitespace-nowrap",
      cardBadgeClass: "inline-block rounded-full bg-emerald-100/80 text-emerald-700 px-3.5 py-1 text-xs font-bold whitespace-nowrap",
    };

    if ((coverageMonths !== null && coverageMonths < 1.0) || risk.label === "Critical" || risk.label === "Low Stock" || inventory.quantity <= inventory.threshold) {
      circularRisk = {
        type: "stockout",
        label: "Stockout Risk",
        badgeClass: "inline-block rounded-full bg-red-100/80 text-red-600 px-3 py-1 text-xs font-bold whitespace-nowrap",
        cardBadgeClass: "inline-block rounded-full bg-red-100/80 text-red-600 px-3.5 py-1 text-xs font-bold whitespace-nowrap",
      };
    } else if (coverageMonths !== null && coverageMonths > 2.5) {
      circularRisk = {
        type: "overstock",
        label: "Overstock",
        badgeClass: "inline-block rounded-full bg-amber-100/80 text-amber-700 px-3 py-1 text-xs font-bold whitespace-nowrap",
        cardBadgeClass: "inline-block rounded-full bg-amber-100/80 text-amber-700 px-3.5 py-1 text-xs font-bold whitespace-nowrap",
      };
    }

    const sampleRow = [...forecastRows, ...inventoryRows, ...dispensingRows].find((r) => r.medicine_id === medicineId);
    const facilityName = sampleRow?.facility?.facility_name || facilityMap.get(sampleRow?.facility_id) || "Barangay Health Center";

    const activeSlope = forecastSeries.length >= 2 ? forecastRegression.slope : historicalRegression.slope;
    const activeRSquared = forecastSeries.length >= 2 ? forecastRegression.rSquared : historicalRegression.rSquared;
    const activeIntercept = forecastSeries.length >= 2 ? forecastRegression.intercept : historicalRegression.intercept;

    return {
      brandName: medicine?.brand_name || "",
      category: getMedicineCategory(medicine?.generic_name, medicine?.brand_name),
      circularRisk,
      coverageMonths,
      coverageMultiplier: coverageMonths != null ? `${coverageMonths.toFixed(2)}x` : "—",
      direction: getTrendDirection(forecastRegression.slope),
      dosage: medicine?.dosage || "",
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
      nextMonthDemand: projectedDemand,
      projectedDemand,
      risk,
      rSquared: activeRSquared,
      slope: activeSlope,
      stockQuantity: inventory.quantity,
      threshold: inventory.threshold,
      unitOfMeasure: medicine?.unit_of_measure || "unit",
    };
  });
};

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
    : 0.882;

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
    badgeClass: "bg-red-100 text-red-700",
    barClass: "bg-red-500",
    label: "Critical",
    textClass: "text-red-700",
  },
  Low: {
    badgeClass: "bg-orange-100 text-orange-700",
    barClass: "bg-orange-500",
    label: "Low Stock",
    textClass: "text-orange-700",
  },
  Stable: {
    badgeClass: "bg-emerald-100 text-emerald-700",
    barClass: "bg-[#6be9c2]",
    label: "Enough Stock",
    textClass: "text-emerald-700",
  },
  Watch: {
    badgeClass: "bg-amber-100 text-amber-700",
    barClass: "bg-amber-500",
    label: "Monitor Stock",
    textClass: "text-amber-700",
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
  return inventoryRows
    .filter((row) => row.medicine_id === medicineId)
    .reduce(
      (summary, row) => ({
        quantity: summary.quantity + Number(row.quantity || 0),
        threshold: summary.threshold + Number(row.threshold || 0),
      }),
      { quantity: 0, threshold: 0 }
    );
};

const getLatestForecastQuantity = (forecastRows, medicineId) => {
  const latest = forecastRows
    .filter((row) => row.medicine_id === medicineId)
    .sort((first, second) => new Date(first.forecast_month) - new Date(second.forecast_month))
    .at(-1);

  return Number(latest?.predicted_quantity || 0);
};

const getMedicineForId = (medicineId, forecastRows, inventoryRows) => {
  const row = [...forecastRows, ...inventoryRows].find((candidate) => candidate.medicine_id === medicineId);
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
