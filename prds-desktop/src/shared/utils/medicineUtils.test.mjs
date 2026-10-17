import assert from "node:assert/strict";
import test from "node:test";

import {
  extractUniqueCategories,
  filterMedicines,
  findDuplicateMedicines,
  formatCurrency,
  formatMedicineCategories,
  normalizeMedicineText,
  parseMedicineCategories,
  sortMedicines,
} from "./medicineUtils.js";

const medicines = [
  {
    id: "med-1",
    generic_name: "Amoxicillin",
    dosage: "500mg",
    unit_of_measure: "capsule",
    categories: ["Anti-Infectives", "HIV Program"],
  },
  {
    id: "med-2",
    generic_name: "Paracetamol",
    dosage: "500mg",
    unit_of_measure: "tablet",
    categories: ["Analgesic"],
  },
  {
    id: "med-3",
    generic_name: "Amlodipine",
    dosage: "5mg",
    unit_of_measure: "tablet",
    categories: ["Cardiovascular"],
  },
];

test("normalizeMedicineText includes searchable medicine fields", () => {
  assert.equal(
    normalizeMedicineText(medicines[0]).includes("amoxicillin 500mg capsule"),
    true
  );
});

test("filterMedicines matches name, dosage, unit, and category", () => {
  assert.deepEqual(
    filterMedicines(medicines, "paracetamol").map((medicine) => medicine.id),
    ["med-2"]
  );
  assert.deepEqual(
    filterMedicines(medicines, "5mg").map((medicine) => medicine.id),
    ["med-3"]
  );
  assert.equal(filterMedicines(medicines, "tablet").length, 2);
  assert.deepEqual(
    filterMedicines(medicines, "HIV Program").map((medicine) => medicine.id),
    ["med-1"]
  );
  assert.deepEqual(
    filterMedicines(medicines, "", "Analgesic").map((medicine) => medicine.id),
    ["med-2"]
  );
  assert.deepEqual(
    filterMedicines(medicines, "", "all").map((medicine) => medicine.id),
    ["med-1", "med-2", "med-3"]
  );
  assert.deepEqual(
    filterMedicines(medicines, "500mg", "Anti-Infectives").map((medicine) => medicine.id),
    ["med-1"]
  );
});

test("parseMedicineCategories splits comma-separated strings and removes empty elements", () => {
  assert.deepEqual(
    parseMedicineCategories("Anti-Infectives, Analgesic, , Analgesic"),
    ["Anti-Infectives", "Analgesic"]
  );
  assert.deepEqual(parseMedicineCategories(["Anti-Infectives", "Analgesic"]), [
    "Anti-Infectives",
    "Analgesic",
  ]);
  assert.deepEqual(parseMedicineCategories(""), []);
  assert.deepEqual(parseMedicineCategories(null), []);
});

test("formatMedicineCategories returns comma-separated string", () => {
  assert.equal(
    formatMedicineCategories(["Anti-Infectives", "Analgesic"]),
    "Anti-Infectives, Analgesic"
  );
  assert.equal(formatMedicineCategories(""), "");
});

test("extractUniqueCategories returns sorted unique categories from medicines", () => {
  const categories = extractUniqueCategories(medicines);
  assert.deepEqual(categories, [
    "Analgesic",
    "Anti-Infectives",
    "Cardiovascular",
    "HIV Program",
  ]);
});

test("sortMedicines sorts ascending and descending by generic name", () => {
  assert.deepEqual(
    sortMedicines(medicines, "ASC").map((medicine) => medicine.generic_name),
    ["Amlodipine", "Amoxicillin", "Paracetamol"]
  );
  assert.deepEqual(
    sortMedicines(medicines, "DESC").map((medicine) => medicine.generic_name),
    ["Paracetamol", "Amoxicillin", "Amlodipine"]
  );
});

test("formatCurrency handles values, undefined, and non-numeric values", () => {
  assert.equal(formatCurrency(null), "Not set");
  assert.equal(formatCurrency(undefined), "Not set");
  assert.equal(formatCurrency(""), "Not set");
  assert.equal(formatCurrency(12.5), "₱12.50");
});

test("findDuplicateMedicines separates exact duplicates from same generic matches", () => {
  const exact = findDuplicateMedicines({
    medicines,
    formValues: {
      generic_name: "amoxicillin",
      dosage: "500mg",
      unit_of_measure: "capsule",
    },
  });

  assert.deepEqual(
    exact.exactMatches.map((medicine) => medicine.id),
    ["med-1"]
  );
  assert.deepEqual(exact.nameMatches, []);

  const sameMedicineWithoutBrand = findDuplicateMedicines({
    medicines,
    formValues: {
      generic_name: "amoxicillin",
      dosage: "500mg",
      unit_of_measure: "capsule",
    },
  });

  assert.deepEqual(
    sameMedicineWithoutBrand.exactMatches.map((medicine) => medicine.id),
    ["med-1"]
  );

  const sameGeneric = findDuplicateMedicines({
    medicines,
    formValues: {
      generic_name: "amoxicillin",
      dosage: "250mg",
      unit_of_measure: "suspension",
    },
  });

  assert.deepEqual(sameGeneric.exactMatches, []);
  assert.deepEqual(
    sameGeneric.nameMatches.map((medicine) => medicine.id),
    ["med-1"]
  );
});
