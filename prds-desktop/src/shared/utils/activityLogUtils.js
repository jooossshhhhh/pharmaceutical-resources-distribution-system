export const activityCategories = [
  { value: "all", label: "All Activity" },
  { value: "self", label: "My Activity" },
  { value: "inventory", label: "Inventory" },
  { value: "dispensing", label: "Dispensing" },
  { value: "requests", label: "Medicine Requests" },
  { value: "transfers", label: "Stock Transfers" },
  { value: "patients", label: "Patients" },
];

export const activityDateModes = [
  { value: "all", label: "All Dates" },
  { value: "specific", label: "Specific Date" },
  { value: "range", label: "Date Range" },
];

export const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
export const REQUEST_NUMBER_REGEX = /#RQ-[0-9A-Z]{8}/gi;

const getLocalDateString = (dateValue) => {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const getAllowedActivityLogRoleFilters = (role) => {
  return activityCategories.filter((filter) => {
    return !filter.adminOnly || role === "PHARMA_II";
  });
};

export const getVisibleActivityLogs = (logs = [], profile) => {
  if (!profile?.id) {
    return [];
  }

  if (profile.role === "PHARMA_II") {
    return logs;
  }

  if (profile.role === "PHARMA_I") {
    return logs.filter((log) => {
      return log.user_id === profile.id || log.user?.role === "BHW";
    });
  }

  return logs.filter((log) => log.user_id === profile.id);
};

/**
 * Parses and enriches activity log details by formatting raw IDs into readable
 * codes (e.g. #RQ-A5342461) and resolving the entity name (facility, patient, requester).
 */
export const enrichActivityDetails = (
  log,
  { requests = [], facilities = [], patients = [] } = {}
) => {
  if (!log || !log.details) {
    return {
      text: log?.details || "",
      requestId: null,
      requestNumber: null,
      fullUuid: null,
      facilityName: null,
      requesterName: null,
      items: [],
      patient: null,
    };
  }

  let text = log.details;
  let requestId = null;
  let requestNumber = null;
  let fullUuid = null;
  let facilityName = null;
  let requesterName = null;
  let items = [];
  let patient = null;

  const isReleaseEvent =
    log.action === "Request Released" ||
    (log.details && log.details.toLowerCase().includes("released"));

  const processRequestItems = (matchingReq) => {
    const isRelease =
      isReleaseEvent ||
      (matchingReq && (matchingReq.status === "COMPLETED" || matchingReq.status === "APPROVED"));

    const fulfillments = matchingReq.fulfillments || [];
    const hasFulfillments = Array.isArray(fulfillments) && fulfillments.length > 0;

    return (matchingReq.items || []).map((item) => {
      const releasedQty = fulfillments
        .filter((f) => f.request_item_id === item.id)
        .reduce((sum, f) => sum + Number(f.quantity || 0), 0);

      const effectiveQuantity = isRelease && hasFulfillments ? releasedQty : item.quantity;

      return {
        ...item,
        requested_quantity: item.quantity,
        released_quantity: releasedQty,
        quantity: effectiveQuantity,
        display_quantity: effectiveQuantity,
        is_released: isRelease,
      };
    });
  };

  // 1. Check for Request Number pattern (#RQ-XXXXXXXX)
  const reqNumMatch = text.match(REQUEST_NUMBER_REGEX);
  if (reqNumMatch) {
    requestNumber = reqNumMatch[0].toUpperCase();
    const prefix = requestNumber.slice(4).toLowerCase();
    const matchingReq = requests.find((r) => r.id && r.id.toLowerCase().startsWith(prefix));
    if (matchingReq) {
      requestId = matchingReq.id;
      fullUuid = matchingReq.id;
      facilityName =
        matchingReq.facility?.facility_name ||
        facilities.find((f) => f.id === matchingReq.facility_id)?.facility_name ||
        null;
      requesterName =
        matchingReq.manual_requested_by ||
        (matchingReq.requester
          ? `${matchingReq.requester.first_name || ""} ${matchingReq.requester.last_name || ""}`.trim()
          : null);
      items = processRequestItems(matchingReq);
    }
  }

  // 2. Check for raw UUID pattern in details
  const uuidMatches = text.match(UUID_REGEX);
  if (uuidMatches && uuidMatches.length > 0) {
    const rawUuid = uuidMatches[0].toLowerCase();
    fullUuid = rawUuid;

    const isRequestModule =
      log.module === "Medicine Request" ||
      (log.action && log.action.toLowerCase().includes("request"));

    if (isRequestModule) {
      requestNumber = `#RQ-${rawUuid.slice(0, 8).toUpperCase()}`;
      requestId = rawUuid;
      const matchingReq = requests.find(
        (r) =>
          r.id &&
          (r.id.toLowerCase() === rawUuid || r.id.toLowerCase().startsWith(rawUuid.slice(0, 8)))
      );
      if (matchingReq) {
        facilityName =
          matchingReq.facility?.facility_name ||
          facilities.find((f) => f.id === matchingReq.facility_id)?.facility_name ||
          null;
        requesterName =
          matchingReq.manual_requested_by ||
          (matchingReq.requester
            ? `${matchingReq.requester.first_name || ""} ${matchingReq.requester.last_name || ""}`.trim()
            : null);
        items = processRequestItems(matchingReq);
      }

      // If text is "Encoded paper medicine request <uuid>" without facility
      if (
        text.toLowerCase().includes("encoded paper medicine request") &&
        !text.toLowerCase().includes(" for ")
      ) {
        const facilitySuffix = facilityName ? ` for ${facilityName}` : "";
        const requesterSuffix = requesterName ? ` (Requested by: ${requesterName})` : "";
        text = text.replace(uuidMatches[0], `${requestNumber}${facilitySuffix}${requesterSuffix}`);
      } else {
        text = text.replace(uuidMatches[0], requestNumber);
      }
    } else if (log.module === "Patients" || log.module === "Dispensing") {
      const matchingPatient = patients.find((p) => p.id && p.id.toLowerCase() === rawUuid);
      if (matchingPatient) {
        patient = matchingPatient;
        const patientName = `${matchingPatient.first_name || ""} ${matchingPatient.last_name || ""}`.trim();
        const patientCode = matchingPatient.patient_code || `#PT-${rawUuid.slice(0, 8).toUpperCase()}`;
        text = text.replace(uuidMatches[0], `${patientName} (${patientCode})`);
      } else {
        text = text.replace(uuidMatches[0], `#PT-${rawUuid.slice(0, 8).toUpperCase()}`);
      }
    } else {
      text = text.replace(uuidMatches[0], `#ID-${rawUuid.slice(0, 8).toUpperCase()}`);
    }
  }

  // 3. Fallback extraction of facility name if "for <facility_name>" is in the text
  if (!facilityName) {
    const forMatch = text.match(/ for ([^.(]+)/i);
    if (forMatch && forMatch[1]) {
      facilityName = forMatch[1].trim();
    }
  }

  return {
    text,
    requestId,
    requestNumber,
    fullUuid,
    facilityName,
    requesterName,
    items,
    patient,
    isReleaseEvent,
  };
};

export const matchesActivityLogFilters = (
  log,
  {
    category,
    currentUserId,
    dateMode = "all",
    endDate = "",
    facilityId,
    keyword,
    selfOnly,
    specificDate = "",
    startDate = "",
    requests = [],
    facilities = [],
    patients = [],
  }
) => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const enriched = enrichActivityDetails(log, { requests, facilities, patients });

  const searchableText = [
    log.action,
    log.module,
    log.details,
    enriched.text,
    enriched.requestNumber,
    enriched.facilityName,
    enriched.requesterName,
    log.user?.first_name,
    log.user?.last_name,
    log.user?.email,
    log.user?.phone_number,
    log.user?.facility?.facility_name,
    log.user?.facility?.facility_code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (normalizedKeyword && !searchableText.includes(normalizedKeyword)) {
    return false;
  }

  if (selfOnly && log.user_id !== currentUserId) {
    return false;
  }

  if (category === "self" && log.user_id !== currentUserId) {
    return false;
  }

  if (category === "inventory" && log.module !== "Inventory") {
    return false;
  }

  if (category === "dispensing" && log.module !== "Dispensing") {
    return false;
  }

  if (category === "requests" && log.module !== "Medicine Request") {
    return false;
  }

  if (
    category === "transfers" &&
    log.module !== "Stock Transfer" &&
    log.module !== "Transfer"
  ) {
    return false;
  }

  if (
    category === "patients" &&
    log.module !== "Patients" &&
    log.module !== "Patient Registry"
  ) {
    return false;
  }

  if (facilityId !== "ALL" && log.user?.facility_id !== facilityId) {
    return false;
  }

  if (!matchesActivityLogDateFilter(log, {
    dateMode,
    endDate,
    specificDate,
    startDate,
  })) {
    return false;
  }

  return true;
};

export const matchesActivityLogDateFilter = (
  log,
  { dateMode = "all", endDate = "", specificDate = "", startDate = "" }
) => {
  if (dateMode === "all") {
    return true;
  }

  const logDate = getLocalDateString(log.created_at);

  if (!logDate) {
    return false;
  }

  if (dateMode === "specific") {
    return !specificDate || logDate === specificDate;
  }

  if (dateMode === "range") {
    return (!startDate || logDate >= startDate) && (!endDate || logDate <= endDate);
  }

  return true;
};

export const getActivityLogPanelLabel = ({
  category,
  categoryOptions = activityCategories,
  facilityId,
  facilities = [],
  dateMode = "all",
  endDate = "",
  roleFilter,
  roleOptions = [],
  specificDate = "",
  startDate = "",
}) => {
  const parts = [];
  const selectedCategory = categoryOptions.find((option) => option.value === category);
  const selectedRole = roleOptions.find((option) => option.value === roleFilter);
  const selectedFacility = facilities.find((facility) => facility.id === facilityId);

  parts.push(selectedCategory?.label || "Activity Logs");

  if (selectedRole && selectedRole.value !== "ALL") {
    parts.push(selectedRole.label);
  }

  if (selectedFacility) {
    parts.push(selectedFacility.facility_name);
  }

  if (dateMode === "specific" && specificDate) {
    parts.push(specificDate);
  }

  if (dateMode === "range" && (startDate || endDate)) {
    parts.push(`${startDate || "Start"} to ${endDate || "Today"}`);
  }

  return parts.join(" - ");
};
