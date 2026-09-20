export const PATIENT_NAME_FIELDS = ["first_name", "middle_name", "last_name", "suffix"];

export const PATIENT_GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

export const PATIENT_ARCHIVE_MODES = {
  active: "active",
  archived: "archived",
  all: "all",
};

export const normalizePatientText = (value = "") =>
  (value || "").trim().toLowerCase().replace(/\s+/g, " ");

export const formatPatientName = (patient = {}) => {
  const parts = [
    patient.first_name,
    patient.middle_name,
    patient.last_name,
    patient.suffix,
  ].filter((part) => part && String(part).trim() !== "");

  return parts.length ? parts.join(" ") : "Unknown patient";
};

export const formatPatientCode = (code) => {
  if (!code) {
    return "—";
  }

  return code;
};

export const calculateAge = (dateOfBirth, today = new Date()) => {
  if (!dateOfBirth) {
    return null;
  }

  const birthDate = new Date(`${dateOfBirth}T00:00:00`);

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  let age = today.getFullYear() - birthDate.getFullYear();
  const isBeforeBirthday =
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());

  if (isBeforeBirthday) {
    age -= 1;
  }

  return age;
};

export const formatPatientAge = (dateOfBirth) => {
  const age = calculateAge(dateOfBirth);

  if (age === null) {
    return "—";
  }

  return `${age} yrs`;
};

export const formatPatientDateOfBirth = (dateOfBirth) => {
  if (!dateOfBirth) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateOfBirth}T00:00:00`));
};

export const formatPatientRegisteredAt = (createdAt) => {
  if (!createdAt) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(createdAt));
};

export const formatPatientArchivedAt = (archivedAt) => {
  if (!archivedAt) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(archivedAt));
};

export const formatPatientContact = (contactNumber) => {
  if (!contactNumber) {
    return "—";
  }

  return contactNumber;
};

export const formatPatientAddress = (address) => {
  if (!address) {
    return "—";
  }

  return address;
};

export const getPatientSearchText = (patient = {}) => {
  return [
    patient.patient_code,
    patient.first_name,
    patient.middle_name,
    patient.last_name,
    patient.suffix,
    patient.contact_number,
    patient.address,
    patient.facility?.facility_name,
    patient.facility?.facility_code,
  ]
    .filter(Boolean)
    .join(" ");
};

export const matchesPatientFilters = ({ patient, query, facilityId }) => {
  const normalizedQuery = normalizePatientText(query);

  if (normalizedQuery && !normalizePatientText(getPatientSearchText(patient)).includes(normalizedQuery)) {
    return false;
  }

  if (facilityId && patient.facility_id !== facilityId) {
    return false;
  }

  return true;
};

export const isArchivedPatient = (patient = {}) => {
  return Boolean(patient.archived_at);
};

export const filterPatientsByArchiveMode = ({
  archiveMode = PATIENT_ARCHIVE_MODES.active,
  patients = [],
}) => {
  if (archiveMode === PATIENT_ARCHIVE_MODES.all) {
    return patients;
  }

  return patients.filter((patient) => {
    const isArchived = isArchivedPatient(patient);
    return archiveMode === PATIENT_ARCHIVE_MODES.archived ? isArchived : !isArchived;
  });
};

export const findDuplicatePatients = ({ patients, formValues, excludeId }) => {
  const lastName = normalizePatientText(formValues?.last_name);
  const firstName = normalizePatientText(formValues?.first_name);

  if (!lastName || !firstName) {
    return { exactMatches: [], nameMatches: [] };
  }

  const middleName = normalizePatientText(formValues?.middle_name);
  const dateOfBirth = formValues?.date_of_birth;

  const exactMatches = [];
  const nameMatches = [];

  (patients || []).forEach((patient) => {
    if (excludeId && patient.id === excludeId) {
      return;
    }

    const patientLastName = normalizePatientText(patient.last_name);
    const patientFirstName = normalizePatientText(patient.first_name);

    if (patientLastName !== lastName || patientFirstName !== firstName) {
      return;
    }

    const patientMiddleName = normalizePatientText(patient.middle_name);
    const isNameEqual = patientMiddleName === middleName;

    if (isNameEqual && dateOfBirth && patient.date_of_birth === dateOfBirth) {
      exactMatches.push(patient);
    } else {
      nameMatches.push(patient);
    }
  });

  return { exactMatches, nameMatches };
};

export const sortPatients = ({ patients, sortMode = "asc" }) => {
  const sorted = [...(patients || [])];

  sorted.sort((first, second) => {
    return formatPatientName(first).localeCompare(formatPatientName(second), undefined, {
      sensitivity: "base",
    });
  });

  return sortMode === "desc" ? sorted.reverse() : sorted;
};

export const getPatientSortLabel = (sortMode) => {
  return sortMode === "desc" ? "Z–A" : "A–Z";
};

export const buildPatientsCsv = ({ archiveMode = PATIENT_ARCHIVE_MODES.active, patients }) => {
  const headers = [
    "Patient Code",
    "Full Name",
    "Gender",
    "Age",
    "Date of Birth",
    "Contact Number",
    "Address",
    "Facility",
    "Registered",
  ];
  const includeArchiveFields = archiveMode === PATIENT_ARCHIVE_MODES.archived;

  if (includeArchiveFields) {
    headers.push("Archived", "Archive Reason");
  }

  const escapeCell = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const rows = (patients || []).map((patient) => {
    const row = [
      patient.patient_code || "",
      formatPatientName(patient),
      patient.gender || "",
      calculateAge(patient.date_of_birth) ?? "",
      patient.date_of_birth || "",
      patient.contact_number || "",
      patient.address || "",
      patient.facility?.facility_name || "",
      formatPatientRegisteredAt(patient.created_at),
    ];

    if (includeArchiveFields) {
      row.push(formatPatientArchivedAt(patient.archived_at), patient.archive_reason || "");
    }

    return row.map(escapeCell).join(",");
  });

  return [headers.map(escapeCell).join(","), ...rows].join("\n");
};

export const isValidPatientName = (value = "") => {
  const trimmed = String(value || "").trim();
  return /^[A-Za-z]+(?: [A-Za-z]+)*$/.test(trimmed);
};

export const normalizePatientContactNumber = (value = "") => {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("63")) {
    return `0${digits.slice(2)}`;
  }

  if (digits.startsWith("0")) {
    return digits;
  }

  return `0${digits}`;
};

export const isValidPatientContactNumber = (value = "") => {
  return /^09\d{9}$/.test(normalizePatientContactNumber(value));
};

export const validatePatientForm = (formValues = {}) => {
  if (!formValues.first_name?.trim()) {
    return "First name is required.";
  }

  if (!isValidPatientName(formValues.first_name)) {
    return "First name may only contain letters and spaces.";
  }

  if (formValues.middle_name?.trim() && !isValidPatientName(formValues.middle_name)) {
    return "Middle name may only contain letters and spaces.";
  }

  if (!formValues.last_name?.trim()) {
    return "Last name is required.";
  }

  if (!isValidPatientName(formValues.last_name)) {
    return "Last name may only contain letters and spaces.";
  }

  if (!formValues.gender) {
    return "Gender is required.";
  }

  if (!formValues.date_of_birth) {
    return "Date of birth is required.";
  }

  const birthDate = new Date(`${formValues.date_of_birth}T00:00:00`);

  if (Number.isNaN(birthDate.getTime())) {
    return "Enter a valid date of birth.";
  }

  const today = new Date();
  if (birthDate > today) {
    return "Date of birth cannot be in the future.";
  }

  if (!formValues.facility_id) {
    return "Facility is required.";
  }

  if (formValues.contact_number?.trim() && !isValidPatientContactNumber(formValues.contact_number)) {
    return "Contact number must be an 11-digit Philippine mobile number starting with 09 (e.g. 0917 123 4567).";
  }

  return "";
};

export const PATIENT_HISTORY_DATE_MODES = {
  all: "ALL",
  date: "DATE",
  dateRange: "DATE_RANGE",
  month: "MONTH",
  monthRange: "MONTH_RANGE",
};

const getHistoryRowIsoDate = (row) => {
  if (!row?.dispenseDate) {
    return "";
  }

  const date = new Date(row.dispenseDate);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const formatShortDate = (value) => {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
};

const formatShortMonth = (value) => {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}-01T00:00:00`));
};

const formatDateRangeLabel = (start, end) => {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);

  if (startDate.getFullYear() === endDate.getFullYear() && startDate.getMonth() === endDate.getMonth()) {
    const month = new Intl.DateTimeFormat("en-PH", { month: "short" }).format(startDate);
    return `${month} ${startDate.getDate()}-${endDate.getDate()}, ${endDate.getFullYear()}`;
  }

  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
};

const formatMonthRangeLabel = (start, end) => {
  const [startYear, startMonth] = start.split("-");
  const [endYear, endMonth] = end.split("-");

  if (startYear && startYear === endYear) {
    const startLabel = new Intl.DateTimeFormat("en-PH", { month: "short" }).format(
      new Date(`${startYear}-${startMonth}-01T00:00:00`)
    );
    const endLabel = new Intl.DateTimeFormat("en-PH", { month: "short" }).format(
      new Date(`${endYear}-${endMonth}-01T00:00:00`)
    );
    return `${startLabel}-${endLabel} ${endYear}`;
  }

  return `${formatShortMonth(start)} - ${formatShortMonth(end)}`;
};

export const formatPatientHistoryDateFilterLabel = ({
  end = "",
  mode = PATIENT_HISTORY_DATE_MODES.all,
  start = "",
  value = "",
} = {}) => {
  if (mode === PATIENT_HISTORY_DATE_MODES.date) {
    return formatShortDate(value) || "Specific date";
  }

  if (mode === PATIENT_HISTORY_DATE_MODES.dateRange) {
    if (start && end) {
      return formatDateRangeLabel(start, end);
    }
    return "Date range";
  }

  if (mode === PATIENT_HISTORY_DATE_MODES.month) {
    return formatShortMonth(value) || "Month";
  }

  if (mode === PATIENT_HISTORY_DATE_MODES.monthRange) {
    if (start && end) {
      return formatMonthRangeLabel(start, end);
    }
    return "Month range";
  }

  return "All dates";
};

export const matchesPatientHistoryDateFilter = ({
  end = "",
  mode = PATIENT_HISTORY_DATE_MODES.all,
  row,
  start = "",
  value = "",
} = {}) => {
  if (!row?.dispenseDate || mode === PATIENT_HISTORY_DATE_MODES.all) {
    return true;
  }

  const isoDate = getHistoryRowIsoDate(row);

  if (!isoDate) {
    return false;
  }

  if (mode === PATIENT_HISTORY_DATE_MODES.date) {
    if (!value) return true;
    return isoDate === value;
  }

  if (mode === PATIENT_HISTORY_DATE_MODES.dateRange) {
    return (!start || isoDate >= start) && (!end || isoDate <= end);
  }

  if (mode === PATIENT_HISTORY_DATE_MODES.month) {
    if (!value) return true;
    return isoDate.slice(0, 7) === value;
  }

  if (mode === PATIENT_HISTORY_DATE_MODES.monthRange) {
    const isoMonth = isoDate.slice(0, 7);
    return (!start || isoMonth >= start) && (!end || isoMonth <= end);
  }

  return true;
};

export const filterPatientHistoryRows = ({ end, mode, rows = [], start, value } = {}) =>
  rows.filter((row) => matchesPatientHistoryDateFilter({ end, mode, row, start, value }));

export const validateManualPatientRecord = (formValues = {}) => {
  if (!formValues.medicine_id) {
    return "Medicine is required.";
  }

  if (!formValues.facility_id) {
    return "Dispensing facility is required.";
  }

  if (!formValues.dispense_date) {
    return "Date is required.";
  }

  const date = new Date(`${formValues.dispense_date}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "Enter a valid date.";
  }

  if (date > new Date()) {
    return "Date cannot be in the future.";
  }

  if (!formValues.prescribed_by?.trim()) {
    return "Prescribed by is required.";
  }

  if (!formValues.manual_dispensed_by?.trim()) {
    return "Dispensed by is required.";
  }

  const needed = Number(formValues.needed_quantity);
  const released = Number(formValues.quantity);

  if (!Number.isFinite(needed) || needed <= 0) {
    return "Needed quantity must be greater than 0.";
  }

  if (!Number.isFinite(released) || released <= 0) {
    return "Released quantity must be greater than 0.";
  }

  if (needed < released) {
    return "Needed quantity cannot be lower than released quantity.";
  }

  return "";
};
