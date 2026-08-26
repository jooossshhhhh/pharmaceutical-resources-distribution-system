export const UNIT_OF_MEASURE_OPTIONS = [
  "tablet",
  "capsule",
  "caplet",
  "vial",
  "ampule",
  "sachet",
  "bottle",
  "tube",
  "syrup",
  "suspension",
  "drops",
  "cream",
  "ointment",
  "gel",
  "spray",
  "inhaler",
  "patch",
  "suppository",
  "injection",
  "unit",
];

export const CUSTOM_UNIT_VALUE = "__other__";

export const emptyMedicineForm = {
  generic_name: "",
  brand_name: "",
  unit_of_measure: "",
  dosage: "",
  unit_cost: "",
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

export const formatCurrency = (value) => {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value));
};

export const normalizeMedicineText = (medicine) => {
  return [
    medicine.generic_name,
    medicine.brand_name,
    medicine.dosage,
    medicine.unit_of_measure,
    medicine.unit_cost,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

export const filterMedicines = (medicines, searchTerm) => {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  return medicines.filter((medicine) => {
    return !normalizedSearch || normalizeMedicineText(medicine).includes(normalizedSearch);
  });
};

export const sortMedicines = (medicines, direction = "ASC") => {
  return [...medicines].sort((first, second) => {
    const firstName = first.generic_name || "";
    const secondName = second.generic_name || "";
    const comparison = firstName.localeCompare(secondName, undefined, {
      sensitivity: "base",
    });

    return direction === "ASC" ? comparison : comparison * -1;
  });
};

export const findDuplicateMedicines = ({ medicines, formValues, excludeId }) => {
  const genericName = (formValues.generic_name || "").trim().toLowerCase();
  const brandName = (formValues.brand_name || "").trim().toLowerCase();
  const dosage = (formValues.dosage || "").trim().toLowerCase();
  const unitOfMeasure = (formValues.unit_of_measure || "").trim().toLowerCase();

  if (!genericName) {
    return { exactMatches: [], nameMatches: [] };
  }

  const exactMatches = [];
  const nameMatches = [];

  medicines.forEach((medicine) => {
    if (excludeId && medicine.id === excludeId) {
      return;
    }

    const medicineGeneric = (medicine.generic_name || "").trim().toLowerCase();
    const medicineBrand = (medicine.brand_name || "").trim().toLowerCase();
    const medicineDosage = (medicine.dosage || "").trim().toLowerCase();
    const medicineUnit = (medicine.unit_of_measure || "").trim().toLowerCase();

    if (medicineGeneric === genericName) {
      const isExact =
        dosage &&
        unitOfMeasure &&
        medicineBrand === brandName &&
        medicineDosage === dosage &&
        medicineUnit === unitOfMeasure;

      if (isExact) {
        exactMatches.push(medicine);
      } else {
        nameMatches.push(medicine);
      }
    }
  });

  return { exactMatches, nameMatches };
};
