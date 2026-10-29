export const emptyInventoryForm = {
  facility_id: "",
  medicine_id: "",
  brand_name: "",
  supplier_name: "",
  supplier_address: "",
  supplier_contact: "",
  quantity: "",
  threshold: "",
  batch_number: "",
  date_received: "",
  expiration_date: "",
  po_number: "",
  unit_cost: "",
  intake_type: "PO", // "PO" | "RETURN"
  return_reason: "",
  status: "ACTIVE",
};

export const createEmptyPoItem = (
  id = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
) => ({
  id,
  medicine_id: "",
  brand_name: "",
  batch_number: "",
  quantity: "",
  unit_cost: "",
  threshold: "100",
  expiration_date: "",
});

export const RETURN_REASON_OPTIONS = [
  { value: "EXCESS", label: "Excess / Overstocked" },
  { value: "NEAR_EXPIRY", label: "Near-Expiry Consolidation" },
  { value: "PROGRAM_ENDED", label: "Program Terminated / Surrendered" },
  { value: "REALLOCATION", label: "Facility Re-allocation" },
  { value: "OTHER", label: "Other / Routine Return" },
];

export const DISPOSAL_METHODS = [
  { value: "HAZARDOUS_INCINERATION", label: "Medical Waste Neutralization / Incineration" },
  { value: "LGU_CONDEMNATION", label: "LGU City Health Condemnation Protocol" },
  { value: "DOH_RETURN", label: "Returned to DOH Regional Center for Destruction" },
  { value: "CRUSHING_BURIAL", label: "Chemical Denaturing & Controlled Disposal" },
];

export const emptyPoReceiptForm = {
  facility_id: "",
  po_number: "",
  supplier_name: "",
  supplier_address: "",
  supplier_contact: "",
  intake_type: "PO",
  return_reason: "",
  date_received: new Date().toISOString().slice(0, 10),
  items: [createEmptyPoItem("item-1")],
};

export const emptyReturnReceiptForm = {
  facility_id: "",
  po_number: "",
  intake_type: "RETURN",
  return_reason: "EXCESS",
  date_received: new Date().toISOString().slice(0, 10),
  items: [createEmptyPoItem("item-1")],
};

export const normalizePoNumber = (value) =>
  String(value || "")
    .trim()
    .replace(/[^\w\s-]/gi, "");

export const calculatePoTotals = (items = []) => {
  return items.reduce(
    (acc, item) => {
      const qty = Number(item.quantity) || 0;
      const cost = Number(item.unit_cost) || 0;
      acc.totalQuantity += qty;
      acc.totalAmount += qty * cost;
      if (item.medicine_id && qty > 0) {
        acc.validItemCount += 1;
      }
      return acc;
    },
    { totalQuantity: 0, totalAmount: 0, validItemCount: 0 }
  );
};

export const isStrictlyFutureDate = (dateString, referenceDate = new Date()) => {
  if (!dateString) return false;
  const targetStr = String(dateString).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetStr)) {
    return false;
  }

  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  if (Number.isNaN(ref.getTime())) return false;

  const year = ref.getFullYear();
  const month = String(ref.getMonth() + 1).padStart(2, "0");
  const day = String(ref.getDate()).padStart(2, "0");
  const refStr = `${year}-${month}-${day}`;

  return targetStr > refStr;
};

export const getTomorrowDateString = (referenceDate = new Date()) => {
  const ref = referenceDate instanceof Date ? new Date(referenceDate.getTime()) : new Date(referenceDate);
  ref.setDate(ref.getDate() + 1);
  const year = ref.getFullYear();
  const month = String(ref.getMonth() + 1).padStart(2, "0");
  const day = String(ref.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const isPoNumberUsed = (poNumber, existingInventory = [], excludeId = null, facilityId = null) => {
  const normalized = normalizePoNumber(poNumber).toUpperCase();
  if (!normalized) return false;

  return existingInventory.some((item) => {
    if (excludeId && String(item?.id) === String(excludeId)) {
      return false;
    }
    if (facilityId && item?.facility_id && String(item.facility_id) !== String(facilityId)) {
      return false;
    }
    const itemPo = normalizePoNumber(item?.po_number).toUpperCase();
    return itemPo === normalized;
  });
};

export const isLotNumberUsed = (lotNumber, existingInventory = [], excludeId = null, facilityId = null) => {
  const normalized = normalizeLotNumber(lotNumber);
  if (!normalized) return false;

  return existingInventory.some((item) => {
    if (excludeId && String(item?.id) === String(excludeId)) {
      return false;
    }
    if (facilityId && item?.facility_id && String(item.facility_id) !== String(facilityId)) {
      return false;
    }
    const itemLot = normalizeLotNumber(item?.batch_number);
    return itemLot === normalized;
  });
};

export const findDuplicateLotsInBatch = (items = []) => {
  const seen = new Map();
  const duplicateIndices = new Set();

  items.forEach((item, index) => {
    const lot = normalizeLotNumber(item?.batch_number);
    if (lot) {
      if (seen.has(lot)) {
        duplicateIndices.add(index);
        duplicateIndices.add(seen.get(lot));
      } else {
        seen.set(lot, index);
      }
    }
  });

  return duplicateIndices;
};

export const pageSize = 10;

export const normalizeLotNumber = (value) =>
  String(value || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();

export const inventoryImportTemplate = [
  "medicine,lot_number,supplier,quantity,threshold,date_received,expiration_date",
  "Amoxicillin,1023124,MediSource,500,100,2026-01-05,2026-12-31",
  "Paracetamol,1023125,MediSource,300,50,2026-01-05,2027-01-15",
].join("\n");

const parseCsvLine = (line) => {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
};

export const parseInventoryCsv = (text) => {
  const rows = [];
  const errors = [];
  const lines = String(text || "").split(/\r?\n/);

  if (lines.length === 0 || !lines[0].trim()) {
    return { rows: [], errors: [{ row: 1, message: "The file is empty." }] };
  }

  const header = parseCsvLine(lines[0]).map((cell) =>
    cell.toLowerCase().trim().replace(/\s+/g, "_")
  );

  lines.slice(1).forEach((line, index) => {
    if (!line.trim()) {
      return;
    }

    const cells = parseCsvLine(line);
    const record = { rowNumber: index + 2 };

    header.forEach((key, cellIndex) => {
      record[key] = (cells[cellIndex] || "").trim();
    });

    rows.push(record);
  });

  return { rows, errors };
};

export const buildInventoryImportPayloads = (
  rows,
  { medicines, suppliers = [], facilityId }
) => {
  if (!facilityId) {
    return { payloads: [], errors: [{ row: 0, message: "No facility selected for import." }] };
  }

  const medicineByName = new Map(
    medicines.map((medicine) => [medicine.generic_name.toLowerCase(), medicine])
  );
  const supplierByName = new Map(
    (suppliers || []).map((supplier) => [supplier.supplier_name.toLowerCase(), supplier])
  );

  const payloads = [];
  const errors = [];

  rows.forEach((row) => {
    const line = row.rowNumber;
    const fail = (message) => errors.push({ row: line, message });

    const medicine = medicineByName.get((row.medicine || "").toLowerCase());
    if (!medicine) {
      fail(`Unknown medicine: "${row.medicine}".`);
      return;
    }

    const supplier = supplierByName.get((row.supplier || "").toLowerCase());

    const lotNumber = normalizeLotNumber(row.lot_number || row.batch);
    if (!lotNumber) {
      fail("Lot Number must contain letters and numbers only.");
      return;
    }

    const quantity = Number(row.quantity);
    if (row.quantity === "" || !Number.isFinite(quantity) || quantity < 0) {
      fail(`Quantity must be zero or higher (got "${row.quantity}").`);
      return;
    }

    const threshold = row.threshold === "" ? 0 : Number(row.threshold);
    if (!Number.isFinite(threshold) || threshold < 0) {
      fail(`Threshold must be zero or higher (got "${row.threshold}").`);
      return;
    }

    if (!row.date_received) {
      fail("Date received is required.");
      return;
    }

    if (!row.expiration_date) {
      fail("Expiration date is required.");
      return;
    }

    const dateReceived = new Date(`${row.date_received}T00:00:00`);
    const expirationDate = new Date(`${row.expiration_date}T00:00:00`);

    if (Number.isNaN(dateReceived.getTime()) || Number.isNaN(expirationDate.getTime())) {
      fail("Dates must be in YYYY-MM-DD format.");
      return;
    }

    if (expirationDate <= dateReceived) {
      fail("Expiration date must be later than date received.");
      return;
    }

    payloads.push({
      facility_id: facilityId,
      medicine_id: medicine.id,
      brand_name: row.brand_name || row.brand || supplier?.supplier_name || row.supplier || null,
      quantity,
      threshold,
      batch_number: lotNumber,
      date_received: row.date_received,
      expiration_date: row.expiration_date,
      updated_at: new Date().toISOString(),
    });
  });

  return { payloads, errors };
};

export const formatDateTime = (date) => {
  if (!date) {
    return "—";
  }

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
};

export const formatDate = (dateString) => {
  if (!dateString) {
    return "-";
  }

  const parsed = new Date(dateString);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
};

export const formatCurrency = (value) => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
};

export const amountToWords = (amount) => {
  const num = Math.round((Number(amount) || 0) * 100) / 100;
  if (num <= 0) return "Zero Pesos Only";

  const units = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
  ];

  function convertHundreds(n) {
    let str = "";
    if (n >= 100) {
      str += units[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + (n % 10 !== 0 ? "-" + units[n % 10] : "") + " ";
    } else if (n > 0) {
      str += units[n] + " ";
    }
    return str.trim();
  }

  const integerPart = Math.floor(num);
  const cents = Math.round((num - integerPart) * 100);

  let words = "";
  let rem = integerPart;

  if (rem >= 1000000000) {
    const b = Math.floor(rem / 1000000000);
    words += convertHundreds(b) + " Billion ";
    rem %= 1000000000;
  }
  if (rem >= 1000000) {
    const m = Math.floor(rem / 1000000);
    words += convertHundreds(m) + " Million ";
    rem %= 1000000;
  }
  if (rem >= 1000) {
    const t = Math.floor(rem / 1000);
    words += convertHundreds(t) + " Thousand ";
    rem %= 1000;
  }
  if (rem > 0) {
    words += convertHundreds(rem) + " ";
  }

  words = words.trim() + " Pesos";
  if (cents > 0) {
    words += ` and ${cents}/100`;
  }
  return words + " Only";
};

export const formatNumber = (value) => {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
};

export const getStockStatus = (item) => {
  const quantity = Number(item.quantity || 0);
  const threshold = Number(item.threshold || 0);

  if (quantity === 0 || quantity <= Math.max(1, Math.floor(threshold * 0.25))) {
    return {
      key: "CRITICAL",
      label: "Critical",
      badgeClass: "bg-[#faedf0] text-[#D9826B] border border-[#D9826B]/25",
    };
  }

  if (quantity <= threshold) {
    return {
      key: "LOW",
      label: "Low Stock",
      badgeClass: "bg-[#fdf3e9] text-[#965315] border border-[#dc8939]/25",
    };
  }

  return {
    key: "NORMAL",
    label: "Normal",
    badgeClass: "bg-[#E8F5F1] text-[#2D7A5D] border border-[#4C9F80]/25",
  };
};

export const getMedicineName = (item) => {
  const genericName = item.medicine?.generic_name || "Medicine";
  const dosage = item.medicine?.dosage ? ` ${item.medicine.dosage}` : "";

  return `${genericName}${dosage}`;
};

const isValidDateValue = (dateString) => {
  if (!dateString) {
    return false;
  }

  return !Number.isNaN(new Date(dateString).getTime());
};

const maxDate = (items, key) => {
  return items
    .map((item) => item[key])
    .filter(isValidDateValue)
    .sort()
    .at(-1) || "";
};

export const buildInventoryMedicineRows = (items = []) => {
  const groups = new Map();

  items
    .filter((item) => !isDisposedLot(item))
    .forEach((item) => {
      const key = `${item.facility_id || "no-facility"}:${item.medicine_id || "no-medicine"}`;
      const group = groups.get(key) || [];
      group.push(item);
      groups.set(key, group);
    });

  return Array.from(groups.entries()).map(([key, lots]) => {
    const sortedLots = [...lots].sort((first, second) => {
      const firstDate = first.expiration_date || "9999-12-31";
      const secondDate = second.expiration_date || "9999-12-31";
      return firstDate.localeCompare(secondDate);
    });
    const nearestLot =
      sortedLots.find((lot) => Number(lot.quantity || 0) > 0 && isValidDateValue(lot.expiration_date)) ||
      sortedLots.find((lot) => isValidDateValue(lot.expiration_date)) ||
      sortedLots[0] ||
      {};

    const distinctBrands = Array.from(
      new Set(
        lots
          .map((lot) => (lot.brand_name || lot.medicine?.brand_name || "").trim())
          .filter((b) => b && b !== "-" && b !== "—")
      )
    );
    const resolvedBrandName =
      distinctBrands.join(", ") ||
      nearestLot.brand_name ||
      nearestLot.medicine?.brand_name ||
      "";

    return {
      ...nearestLot,
      id: key,
      isGrouped: true,
      brand_name: resolvedBrandName,
      medicine: {
        ...(nearestLot.medicine || {}),
        brand_name: resolvedBrandName || nearestLot.medicine?.brand_name || "",
      },
      lots: sortedLots,
      lotCount: sortedLots.length,
      quantity: lots.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0),
      threshold: Math.max(...lots.map((lot) => Number(lot.threshold || 0)), 0),
      expiration_date: nearestLot.expiration_date || "",
      updated_at: maxDate(lots, "updated_at"),
    };
  });
};

export const sortInventoryRows = (rows = [], sort = { key: "medicine", direction: "ASC" }) => {
  const { key, direction } = sort;
  const factor = direction === "DESC" ? -1 : 1;

  return [...rows].sort((first, second) => {
    if (key === "quantity") {
      return (Number(first.quantity || 0) - Number(second.quantity || 0)) * factor;
    }

    if (key === "expiration_date" || key === "updated_at") {
      return String(first[key] || "").localeCompare(String(second[key] || "")) * factor;
    }

    return getMedicineName(first).localeCompare(getMedicineName(second), undefined, {
      sensitivity: "base",
    }) * factor;
  });
};

export const daysUntilExpiry = (dateString) => {
  const expiry = new Date(dateString);

  if (!dateString || Number.isNaN(expiry.getTime())) {
    return null;
  }

  const now = new Date();

  return Math.ceil((expiry - now) / 86400000);
};

export const getExpiryStatus = (item) => {
  const days = daysUntilExpiry(item.expiration_date);

  if (days === null) {
    return {
      key: "NO_DATE",
      label: "No date",
      badgeClass: "bg-neutral-100 text-neutral-500",
      days: null,
    };
  }

  if (days < 0) {
    return {
      key: "EXPIRED",
      label: "Expired",
      badgeClass: "bg-[#faedf0] text-[#D9826B] border border-[#D9826B]/25",
      days,
    };
  }

  if (days <= 30) {
    return {
      key: "EXPIRING",
      label: "Expiring soon",
      badgeClass: "bg-[#fefee6] text-[#716006] border border-[#f3f029]/60",
      days,
    };
  }

  return {
    key: "OK",
    label: "OK",
    badgeClass: "bg-[#E8F5F1] text-[#2D7A5D] border border-[#4C9F80]/25",
    days,
  };
};

export const isLotExpired = (lot) => {
  if (!lot?.expiration_date) {
    return false;
  }
  return getExpiryStatus(lot).key === "EXPIRED";
};

export const getExpiredDays = (dateString) => {
  const days = daysUntilExpiry(dateString);
  if (days === null || days >= 0) {
    return 0;
  }
  return Math.abs(days);
};

export const getLotStatus = (lot) => {
  const quantity = Number(lot?.quantity || 0);

  if (quantity === 0) {
    return {
      key: "DEPLETED",
      label: "Depleted",
      badgeClass: "bg-neutral-100 text-neutral-600 border border-neutral-200",
    };
  }

  const expiry = getExpiryStatus(lot);

  if (expiry.key === "EXPIRED") {
    return {
      key: "EXPIRED",
      label: "Expired",
      badgeClass: "bg-[#faedf0] text-[#D9826B] border border-[#D9826B]/25",
    };
  }

  if (expiry.days !== null && expiry.days <= 0) {
    return {
      key: "EXPIRES_TODAY",
      label: "Expires Today",
      badgeClass: "bg-[#faedf0] text-[#D9826B] border border-[#D9826B]/30",
    };
  }

  if (expiry.key === "EXPIRING") {
    return {
      key: "EXPIRING",
      label: "Expiring Soon",
      badgeClass: "bg-[#fefee6] text-[#716006] border border-[#f3f029]/60",
    };
  }

  return {
    key: "ACTIVE",
    label: "Active",
    badgeClass: "bg-[#E8F5F1] text-[#2D7A5D] border border-[#4C9F80]/25",
  };
};

export const isReturnedLot = (lot) => {
  if (!lot) return false;
  return (
    lot.intake_type === "RETURN" ||
    Boolean(lot.origin_facility_id) ||
    Boolean(lot.origin_facility) ||
    (typeof lot.po_number === "string" && lot.po_number.startsWith("RET-"))
  );
};

export const getReturnReasonLabel = (reason) => {
  if (!reason) return "Routine Return";
  const found = RETURN_REASON_OPTIONS.find((opt) => opt.value === reason);
  return found ? found.label : reason;
};

export const isDisposedLot = (lot) => {
  if (!lot) return false;
  return lot.status === "DISPOSED" || Boolean(lot.disposed_at);
};

