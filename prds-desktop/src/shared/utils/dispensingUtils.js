import { formatPatientName } from "./patientUtils.js";
import { isChoFacility } from "./facilityUtils.js";

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

export const formatDispensingDate = (value) => {
  if (!value) {
    return "—";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
      }).format(new Date(year, month, day));
    }
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
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
      return "This patient already received all medicines for this month.";
    }

    return "";
  }

  if (step === 3) {
    if (!hasPatient) {
      return "Select a patient first.";
    }

    if (claimed) {
      return "This patient already received all medicines for this month.";
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

export const buildWalkInRpcPayload = ({ items, operationId, patientId, prescribedBy }) => ({
  p_items: items.map((item) => ({
    follow_up_action: item.follow_up_action || null,
    follow_up_date: item.follow_up_date || null,
    medicine_id: item.medicine_id,
    needed_quantity: Number(item.needed_quantity ?? item.quantity),
    quantity: Number(item.quantity),
    referred_facility_id: item.referred_facility_id || null,
  })),
  p_operation_id: operationId,
  p_patient_id: patientId,
  p_prescribed_by: prescribedBy,
});

export const deductWalkInInventoryFefo = ({
  facilityId,
  inventoryRows,
  items,
  today = new Date().toISOString().slice(0, 10),
}) => {
  const quantities = new Map(
    inventoryRows.map((row) => [row.id, Number(row.quantity || 0)])
  );
  const eligibleRows = inventoryRows
    .filter(
      (row) =>
        String(row.facility_id) === String(facilityId) &&
        Number(row.quantity || 0) > 0 &&
        row.expiration_date > today
    )
    .sort((first, second) =>
      (first.expiration_date || "").localeCompare(second.expiration_date || "") ||
      (first.date_received || "").localeCompare(second.date_received || "") ||
      String(first.id).localeCompare(String(second.id))
    );

  items.forEach((item) => {
    let remaining = Number(item.quantity || 0);

    eligibleRows.forEach((row) => {
      if (remaining <= 0 || row.medicine_id !== item.medicine_id) {
        return;
      }

      const available = quantities.get(row.id) || 0;
      const deducted = Math.min(available, remaining);
      quantities.set(row.id, available - deducted);
      remaining -= deducted;
    });
  });

  return inventoryRows.map((row) =>
    quantities.get(row.id) === Number(row.quantity || 0)
      ? row
      : { ...row, quantity: quantities.get(row.id) }
  );
};

export const getDefaultFollowUpDate = (today = new Date()) => {
  const date = new Date(today);

  date.setDate(date.getDate() + 7);

  return date.toISOString().slice(0, 10);
};

export const buildMedicineOptions = (inventoryRows, keyword = "") => {
  const term = (keyword || "").trim().toLowerCase();
  const medicines = new Map();
  const todayStr = new Date().toISOString().slice(0, 10);

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
    const isExpired = row.expiration_date ? row.expiration_date.slice(0, 10) <= todayStr : false;

    if (Number(row.quantity || 0) > 0 && !isExpired) {
      entry.batches.push(row);
      entry.total_quantity += Number(row.quantity || 0);
    }
  });

  const options = Array.from(medicines.values())
    .map((entry) => {
      const sortedBatches = entry.batches.sort((batchA, batchB) => {
        if (batchA.expiration_date !== batchB.expiration_date) {
          return (batchA.expiration_date || "") < (batchB.expiration_date || "") ? -1 : 1;
        }

        if (batchA.date_received !== batchB.date_received) {
          return (batchA.date_received || "") < (batchB.date_received || "") ? -1 : 1;
        }

        return String(batchA.id) < String(batchB.id) ? -1 : 1;
      });

      return {
        ...entry,
        batches: sortedBatches,
        nearest_expiration: sortedBatches[0]?.expiration_date || "",
      };
    })
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
      ...(entry.medicine.categories || []),
      ...entry.batches.map((b) => b.batch_number),
    ]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(term))
  );
};

export const filterAndSortMedicineOptions = ({
  options = [],
  keyword = "",
  formFilter = "ALL",
  stockFilter = "ALL",
  sortBy = "NAME_ASC",
}) => {
  let result = options;

  const term = (keyword || "").trim().toLowerCase();
  if (term) {
    result = result.filter((entry) =>
      [
        entry.medicine?.generic_name,
        entry.medicine?.brand_name,
        entry.medicine?.dosage,
        entry.medicine?.unit_of_measure,
        ...(entry.medicine?.categories || []),
        ...(entry.batches || []).map((b) => b.batch_number),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term))
    );
  }

  if (formFilter && formFilter !== "ALL") {
    const fLower = formFilter.toLowerCase();
    result = result.filter((entry) => {
      const unit = (entry.medicine?.unit_of_measure || "").toLowerCase();
      const dosage = (entry.medicine?.dosage || "").toLowerCase();
      return unit === fLower || unit.includes(fLower) || dosage.includes(fLower);
    });
  }

  if (stockFilter === "LOW") {
    result = result.filter((entry) => (entry.total_quantity || 0) <= 10);
  } else if (stockFilter === "NORMAL") {
    result = result.filter((entry) => (entry.total_quantity || 0) > 10);
  }

  return [...result].sort((a, b) => {
    if (sortBy === "NAME_ASC") {
      const nameA = (a.medicine?.generic_name || "").toLowerCase();
      const nameB = (b.medicine?.generic_name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    }
    if (sortBy === "NAME_DESC") {
      const nameA = (a.medicine?.generic_name || "").toLowerCase();
      const nameB = (b.medicine?.generic_name || "").toLowerCase();
      return nameB.localeCompare(nameA);
    }
    if (sortBy === "STOCK_DESC") {
      return (b.total_quantity || 0) - (a.total_quantity || 0);
    }
    if (sortBy === "STOCK_ASC") {
      return (a.total_quantity || 0) - (b.total_quantity || 0);
    }
    if (sortBy === "EXPIRY_ASC") {
      const expA = a.nearest_expiration || a.batches?.[0]?.expiration_date || "9999-12-31";
      const expB = b.nearest_expiration || b.batches?.[0]?.expiration_date || "9999-12-31";
      return expA.localeCompare(expB);
    }
    return 0;
  });
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

export const getCartLineError = ({ line, medicineOptions, patientClaim = null }) => {
  const option = medicineOptions.find((entry) => entry.medicine_id === line.medicine_id);

  if (!option) {
    return "This medicine is no longer in stock.";
  }

  const quantity = Number(line.quantity);
  const neededQuantity = Number(line.needed_quantity ?? line.quantity);

  if (!Number.isInteger(quantity)) {
    return "Release quantity must be a whole number.";
  }

  if (!Number.isInteger(neededQuantity) || neededQuantity <= 0) {
    return "Needed quantity must be a whole number greater than zero.";
  }

  if (neededQuantity < quantity) {
    return "Needed quantity cannot be lower than release quantity.";
  }

  if (patientClaim) {
    if (patientClaim.is_completed || patientClaim.remaining_quantity <= 0) {
      return "This medicine was already completed for this month.";
    }

    if (quantity > patientClaim.remaining_quantity) {
      return `Release quantity cannot exceed the remaining balance of ${patientClaim.remaining_quantity} units.`;
    }
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

export const getPatientMonthlyClaimsBreakdown = (rows = [], patientId = null, monthRange = null) => {
  const { start, end } = monthRange || getMonthRangeIso();
  const claims = new Map();

  rows
    .filter((row) => {
      if (row.voided_at) return false;
      const recordType = row.record_type || (row.is_manual_record ? "HISTORY_ONLY" : "LIVE_DISPENSING");
      if (recordType === "HISTORY_ONLY") return false;
      const rowPatientId = String(row.patient_id || row.patient?.id || "");
      if (patientId && rowPatientId !== String(patientId)) return false;
      const dispenseDate = row.dispense_date || "";
      if (start && dispenseDate < start) return false;
      if (end && dispenseDate >= end) return false;
      return true;
    })
    .forEach((row) => {
      const rowPatientId = String(row.patient_id || row.patient?.id || "");
      const medicineId = String(row.medicine_id || row.medicine?.id || "");
      const key = `${rowPatientId}:${medicineId}`;

      if (!claims.has(key)) {
        claims.set(key, {
          patient_id: rowPatientId,
          medicine_id: medicineId,
          medicine: row.medicine || null,
          needed_quantity: 0,
          released_quantity: 0,
          remaining_quantity: 0,
          is_completed: false,
          prescribed_by: row.prescribed_by || "",
          follow_up_action: row.follow_up_action || "",
          follow_up_date: row.follow_up_date || "",
          referred_facility: row.referred_facility || null,
          referred_facility_id: row.referred_facility_id || (row.referred_facility ? row.referred_facility.id : ""),
          last_dispense_date: row.dispense_date || "",
          facility_id: row.facility_id || "",
          transactions: [],
          dispensing_ids: [],
        });
      }

      const claim = claims.get(key);
      const needed = Number(row.needed_quantity || row.quantity || 0);
      claim.needed_quantity = Math.max(claim.needed_quantity, needed);
      claim.released_quantity += Number(row.quantity || 0);
      if (row.id && !claim.dispensing_ids.includes(row.id)) {
        claim.dispensing_ids.push(row.id);
      }
      if (row.facility_id && !claim.facility_id) {
        claim.facility_id = row.facility_id;
      }
      if (row.medicine && !claim.medicine) {
        claim.medicine = row.medicine;
      }
      if (row.prescribed_by && !claim.prescribed_by) {
        claim.prescribed_by = row.prescribed_by;
      }
      if (row.follow_up_action) {
        claim.follow_up_action = row.follow_up_action;
        claim.follow_up_date = row.follow_up_date || "";
        claim.referred_facility = row.referred_facility || null;
        claim.referred_facility_id = row.referred_facility_id || (row.referred_facility ? row.referred_facility.id : "");
      }
      if (row.dispense_date && (!claim.last_dispense_date || row.dispense_date > claim.last_dispense_date)) {
        claim.last_dispense_date = row.dispense_date;
      }
      if (row.dispensing_transaction_id) {
        claim.transactions.push(row.dispensing_transaction_id);
      }
    });

  return Array.from(claims.values()).map((claim) => {
    const remaining = Math.max(0, claim.needed_quantity - claim.released_quantity);
    return {
      ...claim,
      remaining_quantity: remaining,
      is_completed: remaining === 0,
    };
  });
};

export const getPatientDispensingStatus = ({
  claimsBreakdown = [],
  today = new Date().toISOString().slice(0, 10),
  currentFacilityId = null,
  isBhw = false,
} = {}) => {
  if (!claimsBreakdown || claimsBreakdown.length === 0) {
    return {
      code: "UNCLAIMED",
      label: "Ready to claim",
      badgeColor: "emerald",
      description: "No medicine claimed yet this month",
      isBlocked: false,
      isFutureSchedule: false,
      pendingMedicines: [],
      completedMedicines: [],
    };
  }

  const pending = claimsBreakdown.filter((item) => !item.is_completed);
  const completed = claimsBreakdown.filter((item) => item.is_completed);

  if (pending.length === 0) {
    return {
      code: "COMPLETED",
      label: "Already received all medicines for this month",
      badgeColor: "gray",
      description: "All prescribed medicines completed",
      isBlocked: true,
      isFutureSchedule: false,
      pendingMedicines: [],
      completedMedicines: completed,
    };
  }

  const scheduledItems = pending.filter(
    (item) => item.follow_up_action === FOLLOW_UP_ACTIONS.schedule && item.follow_up_date
  );

  if (scheduledItems.length > 0) {
    scheduledItems.sort((a, b) => a.follow_up_date.localeCompare(b.follow_up_date));
    const earliestDate = scheduledItems[0].follow_up_date;

    // If viewer is BHW: patient is scheduled to return to CHO for remaining balance.
    // Barangay health worker cannot dispense until CHO updates follow-up to refer to barangay.
    if (isBhw) {
      return {
        code: "SCHEDULED_AT_CHO",
        label: earliestDate ? `Scheduled at CHO (${earliestDate})` : "Scheduled at CHO",
        badgeColor: "amber",
        description: `Patient is scheduled to return to CHO on ${earliestDate}. Cannot dispense at Barangay.`,
        isBlocked: true,
        isFutureSchedule: true,
        scheduledDate: earliestDate,
        pendingMedicines: pending,
        completedMedicines: completed,
      };
    }

    // If viewer is CHO:
    if (earliestDate > today) {
      const todayDate = new Date(today);
      const targetDate = new Date(earliestDate);
      const diffMs = targetDate.getTime() - todayDate.getTime();
      const daysLeft = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      return {
        code: "PARTIAL_SCHEDULED",
        label: `Scheduled for ${earliestDate}`,
        badgeColor: "amber",
        description: `${pending.length} medicine(s) pending (${daysLeft} day${daysLeft === 1 ? "" : "s"} left)`,
        isBlocked: false,
        isFutureSchedule: true,
        scheduledDate: earliestDate,
        pendingMedicines: pending,
        completedMedicines: completed,
      };
    }

    return {
      code: "PARTIAL_READY",
      label: "Ready for pickup",
      badgeColor: "emerald",
      description: `${pending.length} medicine(s) pending (Scheduled for ${earliestDate})`,
      isBlocked: false,
      isFutureSchedule: false,
      scheduledDate: earliestDate,
      pendingMedicines: pending,
      completedMedicines: completed,
    };
  }

  const referredItems = pending.filter(
    (item) => item.follow_up_action === FOLLOW_UP_ACTIONS.refer
  );

  if (referredItems.length > 0) {
    const targetFacilityId = referredItems[0]?.referred_facility_id || referredItems[0]?.referred_facility?.id || "";
    const facilityName = referredItems[0]?.referred_facility?.facility_name || "Barangay Health Center";

    // If viewer is BHW: check if referred specifically to this BHW's facility
    if (isBhw) {
      const isReferredToThisBarangay = Boolean(
        currentFacilityId && targetFacilityId && String(currentFacilityId) === String(targetFacilityId)
      );

      if (isReferredToThisBarangay) {
        return {
          code: "PARTIAL_REFERRED",
          label: "Referred from CHO",
          badgeColor: "indigo",
          description: `Referred to ${facilityName}. Ready to dispense remaining balance.`,
          isBlocked: false,
          isFutureSchedule: false,
          referredFacilityId: targetFacilityId,
          referredFacilityName: facilityName,
          pendingMedicines: pending,
          completedMedicines: completed,
        };
      }

      // Referred to a different barangay
      return {
        code: "REFERRED_OTHER_BARANGAY",
        label: `Referred to ${facilityName}`,
        badgeColor: "indigo",
        description: `Patient was referred to ${facilityName}. Cannot dispense at this barangay.`,
        isBlocked: true,
        isFutureSchedule: false,
        referredFacilityId: targetFacilityId,
        referredFacilityName: facilityName,
        pendingMedicines: pending,
        completedMedicines: completed,
      };
    }

    // If viewer is CHO:
    return {
      code: "PARTIAL_REFERRED",
      label: `Referred to ${facilityName}`,
      badgeColor: "indigo",
      description: `${pending.length} medicine(s) pending (Referred to ${facilityName})`,
      isBlocked: false,
      isFutureSchedule: false,
      referredFacilityId: targetFacilityId,
      referredFacilityName: facilityName,
      pendingMedicines: pending,
      completedMedicines: completed,
    };
  }

  return {
    code: "PARTIAL_READY",
    label: "Has remaining medicine to claim",
    badgeColor: "emerald",
    description: `${pending.length} medicine(s) pending`,
    isBlocked: false,
    isFutureSchedule: false,
    pendingMedicines: pending,
    completedMedicines: completed,
  };
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

  const groupList = Array.from(groups.values());

  // Sort chronologically (oldest first) to accurately track multi-step prescription cycles and remaining balance
  const chronological = [...groupList].sort((a, b) => {
    const timeA = new Date(a.dispenseDate).getTime() || 0;
    const timeB = new Date(b.dispenseDate).getTime() || 0;
    if (timeA !== timeB) return timeA - timeB;
    return String(a.transactionId || a.key || "").localeCompare(String(b.transactionId || b.key || ""));
  });

  const activeCycles = new Map();

  chronological.forEach((group) => {
    group.isFollowUp = false;
    group.isFulfilledByLater = false;
    group.fulfillingTransactionId = null;
    group.fulfillingDate = null;
    group.followUpOfTransactionId = null;
    group.followUpOfDate = null;

    const medicineLines = groupMedicineRows(group.rows);
    const patientId = String(
      group.patient?.id ||
      group.rows[0]?.patient?.id ||
      group.rows[0]?.patient_id ||
      ""
    );

    const hasPendingScheduled = !group.voidedAt && medicineLines.some(
      (line) =>
        line.followUpAction === FOLLOW_UP_ACTIONS.schedule ||
        (Boolean(line.followUpDate) && line.followUpAction !== FOLLOW_UP_ACTIONS.refer) ||
        (line.releasedQuantity < line.neededQuantity && line.followUpAction === FOLLOW_UP_ACTIONS.schedule)
    );
    const hasReferred = !group.voidedAt && medicineLines.some(
      (line) =>
        line.followUpAction === FOLLOW_UP_ACTIONS.refer ||
        Boolean(line.referredFacility) ||
        (line.releasedQuantity < line.neededQuantity && line.followUpAction === FOLLOW_UP_ACTIONS.refer)
    );

    let allLinesCompleted = true;

    for (const line of medicineLines) {
      const firstRow = line.rows?.[0] || line || {};
      const medicineId = String(line.medicine?.id || firstRow.medicine_id || firstRow.id || "");
      const cycleKey = `${patientId}:${medicineId}`;
      const cycle = patientId && medicineId ? activeCycles.get(cycleKey) : null;

      if (group.voidedAt) {
        line.isFollowUp = false;
        line.prescribedNeeded = line.neededQuantity;
        line.previouslyClaimed = 0;
        line.neededThisVisit = line.neededQuantity;
        line.releasedThisVisit = line.releasedQuantity;
        line.balanceRemaining = Math.max(0, line.neededQuantity - line.releasedQuantity);
        line.rows?.forEach((row) => {
          row.is_follow_up = false;
          row.prescribed_needed = line.prescribedNeeded;
          row.previously_claimed = 0;
          row.needed_this_visit = line.neededQuantity;
          row.released_this_visit = Number(row.quantity || 0);
          row.balance_remaining = line.balanceRemaining;
        });
        continue;
      }

      if (cycle && cycle.remaining > 0) {
        // Follow-up visit completing an open prescription cycle
        const prescribedNeeded = cycle.originalNeeded;
        const previouslyClaimed = cycle.cumulativeReleased;
        const neededThisVisit = cycle.remaining;
        const newCumulative = previouslyClaimed + line.releasedQuantity;
        const balanceRemaining = Math.max(0, prescribedNeeded - newCumulative);

        group.isFollowUp = true;
        group.followUpOfTransactionId = cycle.initialTransactionId;
        group.followUpOfDate = cycle.initialTransaction?.dispenseDate;

        line.isFollowUp = true;
        line.prescribedNeeded = prescribedNeeded;
        line.previouslyClaimed = previouslyClaimed;
        line.neededThisVisit = neededThisVisit;
        line.releasedThisVisit = line.releasedQuantity;
        line.balanceRemaining = balanceRemaining;
        line.initialTransactionId = cycle.initialTransactionId;

        line.rows?.forEach((row) => {
          row.is_follow_up = true;
          row.prescribed_needed = prescribedNeeded;
          row.previously_claimed = previouslyClaimed;
          row.needed_this_visit = neededThisVisit;
          row.released_this_visit = Number(row.quantity || 0);
          row.balance_remaining = balanceRemaining;
          row.initial_transaction_id = cycle.initialTransactionId;
        });

        if (balanceRemaining === 0) {
          // Fulfills the open cycle! Mark initial transaction and any intermediate transactions
          if (cycle.initialTransaction) {
            cycle.initialTransaction.isFulfilledByLater = true;
            cycle.initialTransaction.fulfillingTransactionId = group.transactionId || group.key;
            cycle.initialTransaction.fulfillingDate = group.dispenseDate;
            cycle.initialTransaction.rows?.forEach((r) => {
              if (String(r.medicine_id || r.medicine?.id || "") === medicineId) {
                r.is_fulfilled_by_later = true;
                r.fulfilling_transaction_id = group.transactionId || group.key;
                r.fulfilling_date = group.dispenseDate;
              }
            });
            cycle.initialTransaction.medicineLines?.forEach((l) => {
              const lMedId = String(l.medicine?.id || l.rows?.[0]?.medicine_id || "");
              if (lMedId === medicineId) {
                l.isFulfilledByLater = true;
                l.fulfillingTransactionId = group.transactionId || group.key;
                l.fulfillingDate = group.dispenseDate;
              }
            });
          }

          cycle.transactions?.forEach((tx) => {
            tx.isFulfilledByLater = true;
            tx.fulfillingTransactionId = group.transactionId || group.key;
            tx.fulfillingDate = group.dispenseDate;
          });

          activeCycles.delete(cycleKey);
        } else {
          cycle.cumulativeReleased = newCumulative;
          cycle.remaining = balanceRemaining;
          cycle.transactions.push(group);
          allLinesCompleted = false;
        }
      } else {
        // Initial / standalone prescription release
        const prescribedNeeded = line.neededQuantity;
        const previouslyClaimed = 0;
        const neededThisVisit = line.neededQuantity;
        const balanceRemaining = Math.max(0, prescribedNeeded - line.releasedQuantity);

        line.isFollowUp = false;
        line.prescribedNeeded = prescribedNeeded;
        line.previouslyClaimed = 0;
        line.neededThisVisit = neededThisVisit;
        line.releasedThisVisit = line.releasedQuantity;
        line.balanceRemaining = balanceRemaining;

        line.rows?.forEach((row) => {
          row.is_follow_up = false;
          row.prescribed_needed = prescribedNeeded;
          row.previously_claimed = 0;
          row.needed_this_visit = neededThisVisit;
          row.released_this_visit = Number(row.quantity || 0);
          row.balance_remaining = balanceRemaining;
        });

        if (balanceRemaining > 0) {
          allLinesCompleted = false;
          if (patientId && medicineId) {
            activeCycles.set(cycleKey, {
              originalNeeded: prescribedNeeded,
              cumulativeReleased: line.releasedQuantity,
              remaining: balanceRemaining,
              initialTransaction: group,
              initialTransactionId: group.transactionId || group.key,
              transactions: [group],
            });
          }
        }
      }
    }

    const isCompleted =
      !group.voidedAt &&
      !hasPendingScheduled &&
      !hasReferred &&
      allLinesCompleted;

    let status = "COMPLETED";
    if (group.voidedAt) {
      status = "VOIDED";
    } else if (hasReferred) {
      status = "REFERRED";
    } else if (hasPendingScheduled || !isCompleted) {
      status = "PARTIAL";
    }

    group.medicineLines = medicineLines;
    group.hasPendingScheduled = hasPendingScheduled;
    group.hasReferred = hasReferred;
    group.isCompleted = isCompleted;
    group.status = status;
    group.totalQuantity = getTransactionTotalQuantity(group.rows);
  });

  return groupList;
};

export const buildDispensingClaimCycles = (transactions = []) => {
  const cycles = new Map();

  const sorted = [...transactions].sort((a, b) => {
    const timeA = new Date(a.dispenseDate).getTime() || 0;
    const timeB = new Date(b.dispenseDate).getTime() || 0;
    return timeA - timeB;
  });

  sorted.forEach((tx) => {
    const patient = tx.patient;
    const patientId = String(patient?.id || tx.rows?.[0]?.patient_id || "");
    if (!patientId) return;

    tx.rows?.forEach((row) => {
      const medicineId = String(row.medicine_id || row.medicine?.id || "");
      if (!medicineId) return;

      const cycleId = row.initial_transaction_id || tx.transactionId || tx.key;
      const key = `${patientId}:${medicineId}:${cycleId}`;

      if (!cycles.has(key)) {
        cycles.set(key, {
          key,
          cycleId,
          patient,
          patientId,
          medicine: row.medicine,
          medicineId,
          prescribedBy: row.prescribed_by || tx.rows?.[0]?.prescribed_by || "—",
          prescribedNeeded: Number(row.prescribed_needed || row.needed_quantity || row.quantity || 0),
          totalReleased: 0,
          balanceRemaining: 0,
          startDate: tx.dispenseDate,
          latestDate: tx.dispenseDate,
          dispensingFacility: tx.dispensingFacility || row.dispensing_facility,
          visits: [],
          status: "COMPLETED",
          isVoided: false,
        });
      }

      const cycle = cycles.get(key);
      const qty = Number(row.quantity || 0);
      cycle.totalReleased += qty;
      cycle.latestDate = tx.dispenseDate;
      cycle.balanceRemaining = Math.max(0, cycle.prescribedNeeded - cycle.totalReleased);

      if (tx.voidedAt) {
        cycle.isVoided = true;
      }

      cycle.visits.push({
        transactionId: tx.transactionId || tx.key,
        dispenseDate: tx.dispenseDate,
        dispenser: tx.dispenser,
        manualDispensedBy: row.manual_dispensed_by,
        quantity: qty,
        batchNumber: row.batch?.batch_number,
        expirationDate: row.batch?.expiration_date,
        followUpAction: row.follow_up_action,
        followUpDate: row.follow_up_date,
        referredFacility: row.referred_facility,
        isVoided: Boolean(tx.voidedAt),
      });

      if (cycle.isVoided) {
        cycle.status = "VOIDED";
      } else if (cycle.balanceRemaining > 0) {
        cycle.status = row.follow_up_action === FOLLOW_UP_ACTIONS.refer ? "REFERRED" : "PARTIAL";
      } else {
        cycle.status = "COMPLETED";
      }
    });
  });

  return Array.from(cycles.values()).sort((a, b) => {
    const timeA = new Date(a.latestDate).getTime() || 0;
    const timeB = new Date(b.latestDate).getTime() || 0;
    return timeB - timeA;
  });
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
  // If the line has been fulfilled (0 balance remaining), there is no pending follow-up action
  if (line?.balance_remaining === 0 || line?.balanceRemaining === 0) {
    return "";
  }

  // If this line fulfilled what was needed for this visit and has no pending balance
  if (
    line?.needed_this_visit !== undefined &&
    Number(line?.quantity || line?.released_this_visit || 0) >= Number(line?.needed_this_visit) &&
    (line?.balance_remaining === undefined || line?.balance_remaining <= 0)
  ) {
    return "";
  }

  const action = line?.followUpAction || line?.follow_up_action;
  const facility = line?.referredFacility || line?.referred_facility;

  if (action === FOLLOW_UP_ACTIONS.refer) {
    if (isChoFacility(facility)) {
      const name = facility?.facility_name;
      if (name && !name.toLowerCase().includes("city health office")) {
        return `Refer to City Health Office - ${name}`;
      }
      return "Refer to City Health Office";
    }
    return `Refer to barangay${facility?.facility_name ? ` - ${facility.facility_name}` : ""}`;
  }

  if (action === FOLLOW_UP_ACTIONS.schedule) {
    return "Partial";
  }

  if (!action) {
    if (
      (line?.neededQuantity && line?.releasedQuantity && line.neededQuantity > line.releasedQuantity) ||
      (line?.needed_quantity && line?.quantity && Number(line.needed_quantity) > Number(line.quantity))
    ) {
      return "Partial";
    }
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

  if (
    (status === "SCHEDULED" || status === "PARTIAL") &&
    (transaction.voidedAt || transaction.isCompleted || transaction.hasReferred)
  ) {
    return false;
  }

  if (status === "REFERRED" && (transaction.voidedAt || !transaction.hasReferred)) {
    return false;
  }

  if (status === "COMPLETED" && (transaction.voidedAt || !transaction.isCompleted)) {
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

export const getDispensedByName = (row, transaction) => {
  if (row?.manual_dispensed_by) {
    return row.manual_dispensed_by;
  }

  if (transaction?.dispenser) {
    const firstName = transaction.dispenser.first_name || "";
    const lastName = transaction.dispenser.last_name || "";
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) return fullName;
  }

  return "Unknown user";
};

export const buildPatientHistoryRows = (transactions = []) => {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return [];
  }

  // 1. Sort transactions chronologically (oldest to newest) to track prescription cycles and remaining balance accurately.
  const chronologicalTransactions = [...transactions].sort((a, b) => {
    const timeA = new Date(a.dispenseDate).getTime() || 0;
    const timeB = new Date(b.dispenseDate).getTime() || 0;
    if (timeA !== timeB) return timeA - timeB;
    return String(a.transactionId || a.key || "").localeCompare(String(b.transactionId || b.key || ""));
  });

  // activeCycles tracks open partial balances per medicine ID:
  // key: medicineId -> { originalNeeded: number, remaining: number, lastDate: string }
  const activeCycles = new Map();
  const chronologicalRows = [];

  for (const transaction of chronologicalTransactions) {
    const isVoided = Boolean(transaction.voidedAt);
    const lines = transaction.medicineLines || (transaction.rows ? [transaction] : []);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const firstRow = line.rows?.[0] || line || {};
      const medicineId = String(line.medicine?.id || firstRow.medicine_id || firstRow.id || `med-${index}`);
      const lineNeeded = Number(line.neededQuantity ?? firstRow.needed_quantity ?? line.releasedQuantity ?? firstRow.quantity ?? 0);
      const lineReleased = Number(line.releasedQuantity ?? firstRow.quantity ?? 0);

      let isFollowUp = false;
      let displayNeeded = lineNeeded;
      let balanceQuantity = 0;
      let status = "COMPLETED";

      if (isVoided) {
        status = "VOIDED";
        balanceQuantity = Math.max(0, lineNeeded - lineReleased);
      } else {
        const cycle = activeCycles.get(medicineId);
        // If an open cycle exists with an unfulfilled balance for this medicine:
        if (cycle && cycle.remaining > 0) {
          isFollowUp = true;
          displayNeeded = null; // Dash in UI: avoid double counting doctor's prescribed needed quantity
          const newRemaining = Math.max(0, cycle.remaining - lineReleased);
          balanceQuantity = newRemaining;
          cycle.remaining = newRemaining;
          cycle.lastDate = transaction.dispenseDate || cycle.lastDate;

          if (newRemaining === 0) {
            status = "COMPLETED";
            activeCycles.delete(medicineId);
          } else {
            status = "SCHEDULED";
          }
        } else {
          // Fresh prescription or initial dispensing
          const remaining = Math.max(0, lineNeeded - lineReleased);
          balanceQuantity = remaining;

          if (remaining === 0) {
            status = "COMPLETED";
          } else {
            status = "SCHEDULED";
            activeCycles.set(medicineId, {
              originalNeeded: lineNeeded,
              remaining,
              lastDate: transaction.dispenseDate || "",
            });
          }
        }
      }

      chronologicalRows.push({
        balanceQuantity,
        date: transaction.dispenseDate,
        dispenseDate: transaction.dispenseDate,
        dispenseId: transaction.transactionId || transaction.key,
        dispensedBy: getDispensedByName(firstRow, transaction),
        dispensingFacility: firstRow.dispensing_facility || transaction.dispensingFacility,
        followUp: getFollowUpDisplay(line) || "None",
        isFollowUp,
        isManual: line.rows?.some((row) => row.is_manual_record) ?? Boolean(firstRow.is_manual_record),
        key: `${transaction.key || transaction.transactionId}-${firstRow.medicine_id || firstRow.id || medicineId}-${index}`,
        medicine: line.medicine,
        neededQuantity: displayNeeded,
        prescribedBy: firstRow.prescribed_by || "Not recorded",
        recordType: firstRow.record_type || (firstRow.is_manual_record ? "HISTORY_ONLY" : "LIVE_DISPENSING"),
        releasedQuantity: lineReleased,
        status,
        voidedAt: transaction.voidedAt || null,
        voidReason: transaction.voidReason || null,
      });
    }
  }

  // 2. Return rows in reverse chronological order (newest first) for clinical display.
  return chronologicalRows.sort((a, b) => {
    const timeA = new Date(a.dispenseDate).getTime() || 0;
    const timeB = new Date(b.dispenseDate).getTime() || 0;
    if (timeA !== timeB) return timeB - timeA;
    return String(b.dispenseId || b.key || "").localeCompare(String(a.dispenseId || a.key || ""));
  });
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
  if (typeof window !== "undefined" && typeof window.__prdsDownloadExportFile === "function") {
    return window.__prdsDownloadExportFile({ filename, csv });
  }

  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("prds:register-export", {
        detail: {
          filename,
          format: "CSV",
          size: blob.size,
          blob,
        },
      })
    );
  }
};
