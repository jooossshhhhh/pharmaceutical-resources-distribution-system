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

export const buildForecastAnalytics = ({
  dispensingRows = [],
  forecastRows = [],
  inventoryRows = [],
} = {}) => {
  const monthlyRows = buildMonthlyConsumptionRows({ dispensingRows, forecastRows });
  const coverageRows = buildInventoryCoverageRows({ forecastRows, inventoryRows });
  const trendRows = buildMedicineTrendRows({ dispensingRows, forecastRows, inventoryRows });
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
  const increasingCount = trendRows.filter((row) => row.direction === "Increasing").length;
  const decliningCount = trendRows.filter((row) => row.direction === "Declining").length;
  const regression = calculateLinearRegression(monthlyRows.map((row) => row.forecasted));
  const interpretation = buildForecastInterpretation({
    decliningCount,
    forecastTotal,
    increasingCount,
    monthlyRows,
    riskRows,
  });

  return {
    coverageRows,
    decliningCount,
    forecastTotal,
    increasingCount,
    interpretation,
    monthlyRows,
    regression,
    riskRows,
    trendRows,
    trendingMedicines,
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

export const buildMedicineTrendRows = ({
  dispensingRows = [],
  forecastRows = [],
  inventoryRows = [],
} = {}) => {
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
    const projectedDemand = forecastSeries.at(-1)?.value || 0;
    const coverageMonths = projectedDemand > 0 ? inventory.quantity / projectedDemand : null;
    const risk = getInventoryRisk({
      coverageMonths,
      quantity: inventory.quantity,
      threshold: inventory.threshold,
    });

    return {
      brandName: medicine?.brand_name || "",
      coverageMonths,
      direction: getTrendDirection(forecastRegression.slope),
      forecastSlope: forecastRegression.slope,
      genericName: medicine?.generic_name || "Medicine",
      historicalSlope: historicalRegression.slope,
      latestHistorical,
      medicineId,
      projectedDemand,
      risk,
      stockQuantity: inventory.quantity,
      threshold: inventory.threshold,
      unitOfMeasure: medicine?.unit_of_measure || "unit",
      dosage: medicine?.dosage || "",
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
