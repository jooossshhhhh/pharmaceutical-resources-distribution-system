import { formatPatientName } from "../patients/patientUtils.js";

export const formatDispensingDateTime = (value) => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

export const formatTransactionNumber = (transactionId) => {
  if (!transactionId) {
    return "TXN-UNKNOWN";
  }

  return `TXN-${String(transactionId).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
};

export const formatDispensingDayParts = (value) => {
  const parsed = new Date(value);

  if (!value || Number.isNaN(parsed.getTime())) {
    return { day: "—", month: "", time: "—" };
  }

  return {
    day: new Intl.DateTimeFormat("en-US", { day: "2-digit" }).format(parsed),
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(parsed).toUpperCase(),
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(parsed),
  };
};

export const getDispensingStepBlocker = ({ claimed, hasLineErrors, hasPatient, lineCount, step }) => {
  if (step === 2) {
    return hasPatient ? "" : "Select a patient first.";
  }

  if (step === 3) {
    if (!hasPatient) {
      return "Select a patient first.";
    }

    if (claimed) {
      return "This patient already claimed free medicine this month.";
    }

    if (!lineCount) {
      return "Add at least one medicine to the claim.";
    }

    if (hasLineErrors) {
      return "Fix invalid quantities before reviewing the claim.";
    }
  }

  return "";
};

export const getMedicineLabel = (medicine) => {
  const genericName = medicine?.generic_name || "No generic name";
  const dosage = medicine?.dosage ? ` ${medicine.dosage}` : "";

  return `${genericName}${dosage}`;
};

export const getMedicineFullLabel = (medicine) => {
  const brand = medicine?.brand_name || "Generic";
  const unit = medicine?.unit_of_measure || "No unit";

  return `${brand} · ${unit}`;
};

export const getMonthRangeIso = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return { start: start.toISOString(), end: end.toISOString() };
};

export const buildMedicineOptions = (inventoryRows, keyword = "") => {
  const term = (keyword || "").trim().toLowerCase();
  const medicines = new Map();

  inventoryRows.forEach((row) => {
    if (!row.medicine_id || !row.medicine) {
      return;
    }

    if (!medicines.has(row.medicine_id)) {
      medicines.set(row.medicine_id, {
        medicine: row.medicine,
        medicine_id: row.medicine_id,
        batches: [],
        total_quantity: 0,
      });
    }

    const entry = medicines.get(row.medicine_id);

    if (Number(row.quantity || 0) > 0 && new Date(row.expiration_date) > new Date()) {
      entry.batches.push(row);
      entry.total_quantity += Number(row.quantity || 0);
    }
  });

  const options = Array.from(medicines.values())
    .map((entry) => ({
      ...entry,
      batches: entry.batches.sort((batchA, batchB) => {
        if (batchA.expiration_date !== batchB.expiration_date) {
          return batchA.expiration_date < batchB.expiration_date ? -1 : 1;
        }

        if (batchA.date_received !== batchB.date_received) {
          return batchA.date_received < batchB.date_received ? -1 : 1;
        }

        return batchA.id < batchB.id ? -1 : 1;
      }),
    }))
    .filter((entry) => entry.total_quantity > 0);

  if (!term) {
    return options;
  }

  return options.filter((entry) =>
    [
      entry.medicine.generic_name,
      entry.medicine.brand_name,
      entry.medicine.dosage,
      entry.medicine.unit_of_measure,
    ]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(term))
  );
};

export const buildFefoPreview = (batches, requestedQuantity) => {
  let remaining = Number(requestedQuantity || 0);
  const allocations = [];

  batches.forEach((batch) => {
    if (remaining <= 0) {
      return;
    }

    const take = Math.min(Number(batch.quantity || 0), remaining);

    if (take > 0) {
      allocations.push({
        batch_number: batch.batch_number,
        expiration_date: batch.expiration_date,
        inventory_id: batch.id,
        quantity: take,
      });
      remaining -= take;
    }
  });

  return { allocations, shortfall: remaining };
};

export const getCartLineError = ({ line, medicineOptions }) => {
  const option = medicineOptions.find((entry) => entry.medicine_id === line.medicine_id);

  if (!option) {
    return "This medicine is no longer in stock.";
  }

  const quantity = Number(line.quantity);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return "Quantity must be a whole number greater than zero.";
  }

  if (quantity > option.total_quantity) {
    return `Only ${option.total_quantity.toLocaleString()} units available.`;
  }

  return "";
};

export const getCartSummary = (cart) =>
  cart.reduce(
    (summary, line) => ({
      lineCount: summary.lineCount + 1,
      totalUnits: summary.totalUnits + Number(line.quantity || 0),
    }),
    { lineCount: 0, totalUnits: 0 }
  );

export const getTransactionTotalQuantity = (rows) =>
  rows.reduce((total, row) => total + Number(row.quantity || 0), 0);

export const groupHistoryByTransaction = (rows) => {
  const groups = new Map();

  rows.forEach((row) => {
    const key = row.dispensing_transaction_id || row.id;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        transactionId: row.dispensing_transaction_id,
        patient: row.patient,
        dispenser: row.dispenser,
        dispenseDate: row.dispense_date,
        voidedAt: row.voided_at,
        voidReason: row.void_reason,
        rows: [],
      });
    }

    const group = groups.get(key);
    group.rows.push(row);

    if (row.voided_at && (!group.voidedAt || row.voided_at > group.voidedAt)) {
      group.voidedAt = row.voided_at;
      group.voidReason = row.void_reason;
    }
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    totalQuantity: getTransactionTotalQuantity(group.rows),
  }));
};

export const matchesHistoryFilters = ({ keyword = "", status = "ALL", transaction }) => {
  const term = (keyword || "").trim().toLowerCase();

  if (status === "VOIDED" && !transaction.voidedAt) {
    return false;
  }

  if (status === "ACTIVE" && transaction.voidedAt) {
    return false;
  }

  if (!term) {
    return true;
  }

  const haystack = [
    transaction.transactionId,
    transaction.patient?.patient_code,
    transaction.patient ? formatPatientName(transaction.patient) : "",
    transaction.dispenser ? `${transaction.dispenser.first_name} ${transaction.dispenser.last_name}` : "",
    transaction.patient?.facility?.facility_name,
    ...transaction.rows.map((row) => [
      row.medicine?.generic_name,
      row.medicine?.brand_name,
      row.medicine?.dosage,
      row.batch?.batch_number,
    ]),
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(term);
};

export const sortTransactions = (transactions, sort = "newest") => {
  const sorted = [...transactions].sort((first, second) => {
    const firstDate = new Date(first.dispenseDate).getTime() || 0;
    const secondDate = new Date(second.dispenseDate).getTime() || 0;

    return sort === "newest" ? secondDate - firstDate : firstDate - secondDate;
  });

  return sorted;
};

const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export const buildDispensingCsv = (transactions) => {
  const header = "date,transaction_id,status,patient_code,patient,facility,medicine,batch,quantity,dispensed_by,voided_at,void_reason";

  const lines = transactions.flatMap((transaction) =>
    transaction.rows.map((row) =>
      [
        formatDispensingDateTime(transaction.dispenseDate),
        transaction.transactionId || transaction.key,
        transaction.voidedAt ? "VOIDED" : "ACTIVE",
        transaction.patient?.patient_code || "",
        transaction.patient ? formatPatientName(transaction.patient) : "",
        transaction.patient?.facility?.facility_name || "",
        getMedicineLabel(row.medicine),
        row.batch?.batch_number || "",
        Number(row.quantity || 0),
        transaction.dispenser ? `${transaction.dispenser.first_name} ${transaction.dispenser.last_name}` : "",
        transaction.voidedAt || "",
        transaction.voidReason || "",
      ]
        .map(csvEscape)
        .join(",")
    )
  );

  return [header, ...lines].join("\n");
};

export const downloadCsv = (csv, filename) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
