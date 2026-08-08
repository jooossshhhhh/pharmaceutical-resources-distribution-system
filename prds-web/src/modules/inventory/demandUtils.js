export const CHANNEL_META = {
  WALK_IN: { label: "Walk-In", color: "#0f9f94" },
  PROGRAM: { label: "Program", color: "#6be9c2" },
  REQUEST: { label: "Request", color: "#f59e0b" },
};

export const CHANNEL_ORDER = ["WALK_IN", "PROGRAM", "REQUEST"];

const monthLabel = (date) => {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(date));
};

export const computeAdc = (rows = [], months = 3) => {
  if (!rows.length) {
    return null;
  }

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const completeMonths = rows
    .filter((row) => new Date(row.month) < currentMonthStart)
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
    const key = `${date.getFullYear()}-${date.getMonth()}`;

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
