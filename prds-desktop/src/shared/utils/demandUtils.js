export const CHANNEL_META = {
  WALK_IN: { label: "Walk-In", color: "#0f9f94" },
  PROGRAM: { label: "Program", color: "#6be9c2" },
  REQUEST: { label: "Request", color: "#f59e0b" },
};

export const CHANNEL_ORDER = ["WALK_IN", "PROGRAM", "REQUEST"];

const monthLabel = (date) => {
  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(parsed);
};

const monthKey = (date) => {
  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
};

const getOrCreateMonthBucket = (bucketsByKey, key, date) => {
  if (!bucketsByKey.has(key)) {
    bucketsByKey.set(key, {
      key,
      label: monthLabel(date),
      historical: 0,
      forecasted: 0,
      fitted: null,
      hasHistorical: false,
      hasForecast: false,
    });
  }

  return bucketsByKey.get(key);
};

const roundedNonNegative = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
};

const getConfidenceLabel = (rSquared) => {
  if (rSquared == null) {
    return "Not enough history";
  }

  if (rSquared >= 0.7) {
    return "Reliable trend";
  }

  if (rSquared >= 0.4) {
    return "Moderate trend";
  }

  return "Weak trend";
};

export const computeSuggestedOrderQuantity = (forecastedUse, currentStock) => {
  if (forecastedUse == null || !Number.isFinite(Number(forecastedUse))) {
    return null;
  }

  return Math.max(0, Math.round(Number(forecastedUse || 0) - Number(currentStock || 0)));
};

export const computeAdc = (rows = [], months = 3) => {
  if (!rows.length) {
    return null;
  }

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const completeMonths = rows
    .filter((row) => {
      const monthDate = new Date(row.month);
      return monthDate < currentMonthStart && !Number.isNaN(monthDate.getTime());
    })
    .sort((first, second) => new Date(second.month) - new Date(first.month))
    .slice(0, months);

  if (completeMonths.length === 0) {
    return null;
  }

  let totalDispensed = 0;
  let dayCount = 0;

  completeMonths.forEach((row) => {
    const monthDate = new Date(row.month);
    const daysInMonth = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0
    ).getDate();
    dayCount += daysInMonth;
    totalDispensed += Number(row.total_dispensed || 0);
  });

  if (dayCount === 0) {
    return null;
  }

  return totalDispensed / dayCount;
};

export const computeDaysOfSupply = (quantity, adc) => {
  if (!adc || adc <= 0) {
    return null;
  }

  return Math.floor(Number(quantity || 0) / adc);
};

export const computeStockOutDate = (daysOfSupply) => {
  if (daysOfSupply == null) {
    return null;
  }

  return new Date(Date.now() + daysOfSupply * 86400000);
};

export const computeReorderQty = (quantity, adc, bufferDays = 30) => {
  if (!adc || adc <= 0) {
    return null;
  }

  return Math.max(0, Math.ceil(adc * bufferDays) - Number(quantity || 0));
};

export const buildChannelSeries = (rows = [], maxMonths = 6) => {
  const bucketsByKey = new Map();

  rows.forEach((row) => {
    const date = new Date(row.dispense_date);
    const key = monthKey(date);

    if (!key) {
      return;
    }

    if (!bucketsByKey.has(key)) {
      bucketsByKey.set(key, {
        label: monthLabel(date),
        WALK_IN: 0,
        PROGRAM: 0,
        REQUEST: 0,
        total: 0,
      });
    }

    const bucket = bucketsByKey.get(key);
    const channel = row.dispensing_type;

    if (CHANNEL_ORDER.includes(channel)) {
      bucket[channel] += Number(row.quantity || 0);
    }

    bucket.total += Number(row.quantity || 0);
  });

  return [...bucketsByKey.entries()]
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
    .slice(-maxMonths)
    .map(([, bucket]) => bucket);
};

export const calculateLinearRegression = (values = []) => {
  const points = values
    .map((value) => Number(value || 0))
    .filter((value) => Number.isFinite(value));

  if (points.length < 2) {
    return {
      slope: 0,
      intercept: points[0] || 0,
      rSquared: null,
      direction: "STABLE",
    };
  }

  const count = points.length;
  const sumX = points.reduce((sum, _value, index) => sum + index, 0);
  const sumY = points.reduce((sum, value) => sum + value, 0);
  const sumXY = points.reduce((sum, value, index) => sum + index * value, 0);
  const sumXX = points.reduce((sum, _value, index) => sum + index * index, 0);
  const denominator = count * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;
  const meanY = sumY / count;
  const totalSquares = points.reduce((sum, value) => sum + (value - meanY) ** 2, 0);
  const residualSquares = points.reduce((sum, value, index) => {
    const estimated = intercept + slope * index;
    return sum + (value - estimated) ** 2;
  }, 0);
  const rSquared = totalSquares === 0 ? 1 : 1 - residualSquares / totalSquares;

  return {
    slope,
    intercept,
    rSquared,
    direction: slope > 0 ? "INCREASING" : slope < 0 ? "DECLINING" : "STABLE",
  };
};

export const forecastSLR = (history = []) => {
  const points = history
    .map((entry) => ({
      month: entry?.month,
      quantity: Number(entry?.quantity || 0),
    }))
    .filter((entry) => Number.isFinite(entry.quantity));

  if (points.length < 3) {
    return {
      forecast: null,
      slope: 0,
      intercept: points[0]?.quantity || 0,
      rSquared: null,
      confidenceLabel: "Not enough history",
      reason: "insufficient_history",
      direction: "STABLE",
    };
  }

  const regression = calculateLinearRegression(points.map((entry) => entry.quantity));
  const nextIndex = points.length;
  const rawForecast = regression.intercept + regression.slope * nextIndex;
  const rSquared = Number(regression.rSquared.toFixed(3));

  return {
    forecast: roundedNonNegative(rawForecast),
    slope: regression.slope,
    intercept: regression.intercept,
    rSquared,
    confidenceLabel: getConfidenceLabel(rSquared),
    reason: null,
    direction: regression.direction,
  };
};

export const buildMonthlyDemandTrend = ({
  dispensingRows = [],
  forecastRows = [],
  maxMonths = 8,
} = {}) => {
  const bucketsByKey = new Map();

  dispensingRows.forEach((row) => {
    const date = new Date(row.dispense_date);
    const key = monthKey(date);

    if (!key) {
      return;
    }

    const bucket = getOrCreateMonthBucket(bucketsByKey, key, date);
    bucket.historical += Number(row.quantity || 0);
    bucket.hasHistorical = true;
  });

  forecastRows.forEach((row) => {
    const date = new Date(row.forecast_month);
    const key = monthKey(date);

    if (!key) {
      return;
    }

    const bucket = getOrCreateMonthBucket(bucketsByKey, key, date);
    bucket.forecasted += Number(row.predicted_quantity || 0);
    bucket.hasForecast = true;
  });

  const allRows = [...bucketsByKey.values()].sort((first, second) =>
    first.key.localeCompare(second.key)
  );
  const historicalRows = allRows.filter((row) => row.hasHistorical);
  const regression = forecastSLR(
    historicalRows.map((row) => ({
      month: row.key,
      quantity: row.historical,
    }))
  );

  if (!regression.reason) {
    historicalRows.forEach((row, index) => {
      row.fitted = roundedNonNegative(regression.intercept + regression.slope * index);
    });
  }

  return {
    rows: allRows.slice(-maxMonths),
    regression,
    observedMonths: historicalRows.length,
  };
};

export const sumDispensedByFacilityType = (rows = [], facilityTypeById) => {
  let cho = 0;
  let healthCenter = 0;

  rows.forEach((row) => {
    const type = facilityTypeById.get(row.facility_id);
    const quantity = Number(row.quantity || 0);

    if (type === "CHO") {
      cho += quantity;
    } else {
      healthCenter += quantity;
    }
  });

  return { cho, healthCenter };
};

export const forecastSummary = (forecastRows = []) => {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const upcoming = forecastRows
    .map((row) => ({
      month: new Date(row.forecast_month),
      quantity: Number(row.predicted_quantity || 0),
    }))
    .filter((row) => row.month >= currentMonthStart)
    .sort((first, second) => first.month - second.month);

  if (upcoming.length === 0) {
    return null;
  }

  const nextMonth = upcoming[0].month;
  const total = upcoming
    .filter((row) => row.month.getTime() === nextMonth.getTime())
    .reduce((sum, row) => sum + row.quantity, 0);

  return { monthLabel: monthLabel(nextMonth), total };
};

export const buildDemandQualitySummary = ({
  observedMonths = 0,
  forecastRows = [],
  dispensingRows = [],
  regression = null,
} = {}) => {
  const forecastCount = Array.isArray(forecastRows) ? forecastRows.length : 0;
  const dispensingCount = Array.isArray(dispensingRows) ? dispensingRows.length : 0;
  const rSquared = regression?.rSquared;

  if (observedMonths >= 3 && (rSquared == null || rSquared >= 0.7)) {
    return {
      key: "GOOD",
      label: "Good",
      tone: "emerald",
      message:
        "This trend estimate has enough recent dispensing history to support stock planning.",
    };
  }

  if (observedMonths >= 3 || dispensingCount >= 3 || forecastCount > 0) {
    return {
      key: "LIMITED",
      label: "Limited",
      tone: "amber",
      message:
        "Use this as a guide only. The records are available, but the pattern is not strong enough yet.",
    };
  }

  return {
    key: "INSUFFICIENT",
    label: "Not enough data",
    tone: "red",
    message:
      "There are not enough monthly dispensing records yet. Add at least 3 months before relying on the trend estimate.",
  };
};

export const buildForecastInterpretation = ({
  trend,
  forecast,
  quantity = 0,
} = {}) => {
  const observedMonths = Number(trend?.observedMonths || 0);
  const direction = trend?.regression?.direction || "STABLE";
  const slope = Number(trend?.regression?.slope || 0);
  const currentQuantity = Number(quantity || 0);
  const regressionForecast =
    trend?.regression?.forecast != null ? Number(trend.regression.forecast || 0) : null;
  const forecastTotal = regressionForecast;
  const forecastLabel = forecast?.monthLabel || "next forecast month";
  const stockBelowForecast = forecastTotal != null && currentQuantity < forecastTotal;
  const suggestedOrder = computeSuggestedOrderQuantity(forecastTotal, currentQuantity);

  const reasons = [
    {
      label: "Records used",
      value: `${observedMonths} month${observedMonths === 1 ? "" : "s"} of dispensing records`,
    },
    {
      label: "Projected use next month",
      value:
        forecastTotal != null
          ? `${roundedNonNegative(forecastTotal)} units for ${forecastLabel}`
          : "Not enough history yet",
    },
    {
      label: "Monthly change",
      value:
        observedMonths >= 3
          ? `${slope >= 0 ? "+" : ""}${slope.toFixed(1)} units per month`
          : "Needs at least 3 months",
    },
    {
      label: "Trend confidence",
      value: trend?.regression?.confidenceLabel || "Not enough history",
    },
    {
      label: "Suggested order",
      value:
        suggestedOrder != null
          ? suggestedOrder > 0
            ? `${suggestedOrder} units`
            : "No extra units suggested"
          : "No suggestion yet",
    },
  ];

  if (observedMonths < 3 || trend?.regression?.reason === "insufficient_history") {
    return {
      tone: "red",
      title: "Not enough history for a trend estimate",
      summary:
        "Not enough records yet. Add more dispensing history before relying on this estimate.",
      reasons,
    };
  }

  if (direction === "INCREASING") {
    return {
      tone: stockBelowForecast ? "amber" : "blue",
      title: "Medicine use is increasing",
      summary: stockBelowForecast
        ? "Medicine use is increasing. Consider preparing more stock for next month."
        : "Medicine use is increasing, but current stock appears enough for next month.",
      reasons,
    };
  }

  if (direction === "DECLINING") {
    return {
      tone: stockBelowForecast ? "amber" : "emerald",
      title: "Medicine use is decreasing",
      summary: stockBelowForecast
        ? "Medicine use is decreasing, but current stock is still below the next projected month."
        : "Medicine use is decreasing. Reorder may be delayed unless requests increase.",
      reasons,
    };
  }

  return {
    tone: stockBelowForecast ? "amber" : "emerald",
    title: "Medicine use is stable",
    summary: stockBelowForecast
      ? "Medicine use is stable, but current stock may not cover the next projected month."
      : "Medicine use is stable. Current stock appears enough based on recent records.",
    reasons,
  };
};

export const getTrendDirectionLabel = (direction) => {
  if (direction === "INCREASING") {
    return "Increasing";
  }

  if (direction === "DECLINING") {
    return "Declining";
  }

  return "Stable";
};
