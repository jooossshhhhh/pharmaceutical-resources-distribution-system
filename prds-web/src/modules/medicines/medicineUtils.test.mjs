import assert from "node:assert/strict";
import test from "node:test";

import {
  filterMedicines,
  findDuplicateMedicines,
  formatCurrency,
  normalizeMedicineText,
  sortMedicines,
} from "./medicineUtils.js";

const medicines = [
  {
    id: "med-1",
    generic_name: "Amoxicillin",
    brand_name: "Medimox",
    dosage: "500mg",
    unit_of_measure: "capsule",
    unit_cost: 12.5,
  },
  {
    id: "med-2",
    generic_name: "Paracetamol",
    brand_name: "ReliefCare",
    dosage: "500mg",
    unit_of_measure: "tablet",
    unit_cost: 3.75,
  },
  {
    id: "med-3",
    generic_name: "Amlodipine",
    brand_name: "CardioNorm",
    dosage: "5mg",
    unit_of_measure: "tablet",
    unit_cost: null,
  },
];

test("normalizeMedicineText includes searchable medicine fields", () => {
  assert.equal(
    normalizeMedicineText(medicines[0]).includes("amoxicillin medimox 500mg capsule 12.5"),
    true
  );
});

test("filterMedicines matches name, brand, dosage, unit, and cost", () => {
  assert.deepEqual(
    filterMedicines(medicines, "relief").map((medicine) => medicine.id),
    ["med-2"]
  );
  assert.deepEqual(
    filterMedicines(medicines, "5mg").map((medicine) => medicine.id),
    ["med-3"]
  );
  assert.equal(filterMedicines(medicines, "tablet").length, 2);
});

test("sortMedicines orders by generic name in both directions", () => {
  assert.deepEqual(
    sortMedicines(medicines, "ASC").map((medicine) => medicine.generic_name),
    ["Amlodipine", "Amoxicillin", "Paracetamol"]
  );
  assert.deepEqual(
    sortMedicines(medicines, "DESC").map((medicine) => medicine.generic_name),
    ["Paracetamol", "Amoxicillin", "Amlodipine"]
  );
});

test("formatCurrency renders Philippine peso values and unset placeholders", () => {
  assert.equal(formatCurrency(null), "Not set");
  assert.equal(formatCurrency(""), "Not set");
  assert.equal(formatCurrency(12.5), "₱12.50");
});

test("findDuplicateMedicines separates exact duplicates from same generic matches", () => {
  const exact = findDuplicateMedicines({
    medicines,
    formValues: {
      generic_name: "amoxicillin",
      brand_name: "medimox",
      dosage: "500mg",
      unit_of_measure: "capsule",
    },
  });

  assert.deepEqual(
    exact.exactMatches.map((medicine) => medicine.id),
    ["med-1"]
  );
  assert.deepEqual(exact.nameMatches, []);

  const sameGeneric = findDuplicateMedicines({
    medicines,
    formValues: {
      generic_name: "amoxicillin",
      brand_name: "other brand",
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
