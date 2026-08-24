export const PATIENT_NAME_FIELDS = ["first_name", "middle_name", "last_name", "suffix"];

export const PATIENT_GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

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

export const buildPatientsCsv = ({ patients }) => {
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

  const escapeCell = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const rows = (patients || []).map((patient) => {
    return [
      patient.patient_code || "",
      formatPatientName(patient),
      patient.gender || "",
      calculateAge(patient.date_of_birth) ?? "",
      patient.date_of_birth || "",
      patient.contact_number || "",
      patient.address || "",
      patient.facility?.facility_name || "",
      formatPatientRegisteredAt(patient.created_at),
    ]
      .map(escapeCell)
      .join(",");
  });

  return [headers.map(escapeCell).join(","), ...rows].join("\n");
};

export const validatePatientForm = (formValues = {}) => {
  if (!formValues.first_name?.trim()) {
    return "First name is required.";
  }

  if (!formValues.last_name?.trim()) {
    return "Last name is required.";
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

  return "";
};