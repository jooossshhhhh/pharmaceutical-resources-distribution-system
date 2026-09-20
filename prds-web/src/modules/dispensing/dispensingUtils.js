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

export const getDispensingStepBlocker = ({
  claimed,
  hasLineErrors,
  hasPatient,
  hasPrescriber = true,
  lineCount,
  step,
}) => {
  if (step === 2) {
    if (!hasPatient) {
      return "Select a patient first.";
    }

    if (claimed) {
      return "This patient already claimed free medicine this month.";
    }

    return "";
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

    if (!hasPrescriber) {
      return "Enter the prescribing doctor's name.";
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

export const FOLLOW_UP_ACTIONS = {
  schedule: "SCHEDULE_NEXT_WEEK",
  refer: "REFER_TO_BARANGAY",
};

export const getDefaultFollowUpDate = (today = new Date()) => {
  const date = new Date(today);

  date.setDate(date.getDate() + 7);

  return date.toISOString().slice(0, 10);
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
  const neededQuantity = Number(line.needed_quantity ?? line.quantity);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return "Release quantity must be a whole number greater than zero.";
  }

  if (!Number.isInteger(neededQuantity) || neededQuantity <= 0) {
    return "Needed quantity must be a whole number greater than zero.";
  }

  if (neededQuantity < quantity) {
    return "Needed quantity cannot be lower than release quantity.";
  }

  if (quantity > option.total_quantity) {
    return `Only ${option.total_quantity.toLocaleString()} available quantity.`;
  }

  if (line.follow_up_action) {
    if (!Object.values(FOLLOW_UP_ACTIONS).includes(line.follow_up_action)) {
      return "Choose a valid follow-up option.";
    }

    if (line.follow_up_action === FOLLOW_UP_ACTIONS.schedule && !line.follow_up_date) {
      return "Choose a follow-up date.";
    }

    if (line.follow_up_action === FOLLOW_UP_ACTIONS.refer && !line.referred_facility_id) {
      return "Choose a referral facility.";
    }
  }

  return "";
};

export const getCartSummary = (cart) =>
  cart.reduce(
    (summary, line) => ({
      lineCount: summary.lineCount + 1,
      neededUnits: summary.neededUnits + Number((line.needed_quantity ?? line.quantity) || 0),
      releasedUnits: summary.releasedUnits + Number(line.quantity || 0),
      totalUnits: summary.totalUnits + Number(line.quantity || 0),
    }),
    { lineCount: 0, neededUnits: 0, releasedUnits: 0, totalUnits: 0 }
  );

export const getTransactionTotalQuantity = (rows) =>
  rows.reduce((total, row) => total + Number(row.quantity || 0), 0);

export const getBlockedPatientIdsFromClaimRows = (rows = []) => {
  const claims = new Map();

  rows
    .filter((row) => (row.record_type || (row.is_manual_record ? "HISTORY_ONLY" : "LIVE_DISPENSING")) !== "HISTORY_ONLY")
    .forEach((row) => {
      const key = `${row.patient_id}:${row.medicine_id}`;

      if (!claims.has(key)) {
        claims.set(key, {
          needed: 0,
          patientId: row.patient_id,
          released: 0,
        });
      }

      const claim = claims.get(key);

      claim.needed = Math.max(claim.needed, Number(row.needed_quantity || row.quantity || 0));
      claim.released += Number(row.quantity || 0);
    });

  const patientIdsWithClaims = new Set();
  const patientIdsWithOpenPartials = new Set();

  claims.forEach((claim) => {
    patientIdsWithClaims.add(claim.patientId);

    if (claim.released < claim.needed) {
      patientIdsWithOpenPartials.add(claim.patientId);
    }
  });

  return Array.from(patientIdsWithClaims).filter((patientId) => !patientIdsWithOpenPartials.has(patientId));
};

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
        dispensingFacility: row.dispensing_facility,
        dispenseDate: row.dispense_date,
        voidedAt: row.voided_at,
        voidReason: row.void_reason,
        rows: [],
      });
    }

    const group = groups.get(key);
    group.rows.push(row);

    if (!group.dispensingFacility && row.dispensing_facility) {
      group.dispensingFacility = row.dispensing_facility;
    }

    if (row.voided_at && (!group.voidedAt || row.voided_at > group.voidedAt)) {
      group.voidedAt = row.voided_at;
      group.voidReason = row.void_reason;
    }
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    medicineLines: groupMedicineRows(group.rows),
    totalQuantity: getTransactionTotalQuantity(group.rows),
  }));
};

const groupMedicineRows = (rows) => {
  const medicineGroups = new Map();

  rows.forEach((row) => {
    const key = row.medicine_id || row.medicine?.id || row.id;

    if (!medicineGroups.has(key)) {
      medicineGroups.set(key, {
        followUpAction: row.follow_up_action,
        followUpDate: row.follow_up_date,
        medicine: row.medicine,
        neededQuantity: 0,
        referredFacility: row.referred_facility,
        releasedQuantity: 0,
        rows: [],
      });
    }

    const line = medicineGroups.get(key);
    const needed = Number(row.needed_quantity || row.quantity || 0);

    line.neededQuantity = Math.max(line.neededQuantity, needed);
    line.releasedQuantity += Number(row.quantity || 0);
    line.rows.push(row);

    if (!line.followUpAction && row.follow_up_action) {
      line.followUpAction = row.follow_up_action;
      line.followUpDate = row.follow_up_date;
      line.referredFacility = row.referred_facility;
    }
  });

  return Array.from(medicineGroups.values());
};

export const getFollowUpDisplay = (line) => {
  if (!line?.followUpAction && !line?.follow_up_action) {
    return "";
  }

  const action = line.followUpAction || line.follow_up_action;
  const date = line.followUpDate || line.follow_up_date;
  const facility = line.referredFacility || line.referred_facility;

  if (action === FOLLOW_UP_ACTIONS.schedule) {
    return date ? `Schedule next week - ${date}` : "Schedule next week";
  }

  if (action === FOLLOW_UP_ACTIONS.refer) {
    return `Refer to barangay${facility?.facility_name ? ` - ${facility.facility_name}` : ""}`;
  }

  return "";
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
    transaction.dispensingFacility?.facility_name,
    transaction.dispenser ? `${transaction.dispenser.first_name} ${transaction.dispenser.last_name}` : "",
    transaction.patient?.facility?.facility_name,
    ...transaction.rows.map((row) => [
      row.manual_dispensed_by,
      row.dispensing_facility?.facility_name,
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
  const header = "date,transaction_id,status,patient_code,patient,facility,medicine,batch,needed_units,released_units,prescribed_by,dispensed_by,follow_up,voided_at,void_reason";

  const lines = transactions.flatMap((transaction) =>
    transaction.rows.map((row) =>
      [
        formatDispensingDateTime(transaction.dispenseDate),
        transaction.transactionId || transaction.key,
        transaction.voidedAt ? "VOIDED" : "ACTIVE",
        transaction.patient?.patient_code || "",
        transaction.patient ? formatPatientName(transaction.patient) : "",
        row.dispensing_facility?.facility_name || transaction.dispensingFacility?.facility_name || transaction.patient?.facility?.facility_name || "",
        getMedicineLabel(row.medicine),
        row.batch?.batch_number || "",
        Number(row.needed_quantity || row.quantity || 0),
        Number(row.quantity || 0),
        row.prescribed_by || "",
        row.manual_dispensed_by || (transaction.dispenser ? `${transaction.dispenser.first_name} ${transaction.dispenser.last_name}` : ""),
        getFollowUpDisplay(row),
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
