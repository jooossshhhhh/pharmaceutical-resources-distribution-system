export const emptyInventoryForm = {
  facility_id: "",
  medicine_id: "",
  supplier_id: "",
  quantity: "",
  threshold: "",
  batch_number: "",
  date_received: "",
  expiration_date: "",
};

export const pageSize = 10;

export const inventoryImportTemplate = [
  "medicine,batch,supplier,quantity,threshold,date_received,expiration_date",
  "Amoxicillin,BATCH-001,MediSource,500,100,2026-01-05,2026-12-31",
  "Paracetamol,BATCH-002,MediSource,300,50,2026-01-05,2027-01-15",
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
  { medicines, suppliers, facilityId }
) => {
  if (!facilityId) {
    return { payloads: [], errors: [{ row: 0, message: "No facility selected for import." }] };
  }

  const medicineByName = new Map(
    medicines.map((medicine) => [medicine.generic_name.toLowerCase(), medicine])
  );
  const supplierByName = new Map(
    suppliers.map((supplier) => [supplier.supplier_name.toLowerCase(), supplier])
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
    if (!supplier) {
      fail(`Unknown supplier: "${row.supplier}".`);
      return;
    }

    const batch = (row.batch || "").toUpperCase().trim();
    if (!batch) {
      fail("Batch number is required.");
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
      supplier_id: supplier.id,
      quantity,
      threshold,
      batch_number: batch,
      date_received: row.date_received,
      expiration_date: row.expiration_date,
      updated_at: new Date().toISOString(),
    });
  });

  return { payloads, errors };
};

export const formatDateTime = (date) => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

export const formatDate = (dateString) => {
  if (!dateString) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dateString));
};

export const formatCurrency = (value) => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
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
      badgeClass: "bg-red-100 text-red-700",
    };
  }

  if (quantity <= threshold) {
    return {
      key: "LOW",
      label: "Low Stock",
      badgeClass: "bg-orange-100 text-orange-700",
    };
  }

  return {
    key: "NORMAL",
    label: "Normal",
    badgeClass: "bg-emerald-100 text-emerald-700",
  };
};

export const getMedicineName = (item) => {
  const genericName = item.medicine?.generic_name || "Medicine";
  const dosage = item.medicine?.dosage ? ` ${item.medicine.dosage}` : "";

  return `${genericName}${dosage}`;
};

export const daysUntilExpiry = (dateString) => {
  if (!dateString) {
    return null;
  }

  const expiry = new Date(dateString);
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
      badgeClass: "bg-red-100 text-red-700",
      days,
    };
  }

  if (days <= 30) {
    return {
      key: "EXPIRING",
      label: "Expiring soon",
      badgeClass: "bg-amber-100 text-amber-700",
      days,
    };
  }

  return {
    key: "OK",
    label: "OK",
    badgeClass: "bg-emerald-100 text-emerald-700",
    days,
  };
};
