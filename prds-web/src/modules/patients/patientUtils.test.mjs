import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPatientsCsv,
  calculateAge,
  findDuplicatePatients,
  formatPatientAge,
  formatPatientCode,
  formatPatientDateOfBirth,
  formatPatientName,
  formatPatientRegisteredAt,
  getPatientSortLabel,
  matchesPatientFilters,
  normalizePatientText,
  sortPatients,
  validatePatientForm,
} from "./patientUtils.js";

const samplePatient = {
  id: "p1",
  patient_code: "PRD-0001",
  first_name: "Maria",
  middle_name: "Santos",
  last_name: "Reyes",
  suffix: "Jr.",
  gender: "FEMALE",
  date_of_birth: "1990-05-15",
  contact_number: "+639171234567",
  address: "Purok 3, Barangay San",
  facility_id: "f1",
  facility: { id: "f1", facility_name: "San Barangay Health Center", facility_code: "BHW-01" },
  created_by: "u1",
  created_at: "2026-08-01T08:00:00Z",
};

const fixedToday = new Date("2026-08-15T00:00:00");

test("calculateAge handles birthdays and edge inputs", () => {
  assert.equal(calculateAge("1990-05-15", fixedToday), 36);
  assert.equal(calculateAge("2026-08-14", fixedToday), 0);
  assert.equal(calculateAge(""), null);
  assert.equal(calculateAge("not-a-date"), null);
});

test("formatPatientAge render age or em dash", () => {
  assert.equal(formatPatientAge("1990-05-15"), "36 yrs");
  assert.equal(formatPatientAge(null), "—");
});

test("formatPatientCode returns the code or an em dash", () => {
  assert.equal(formatPatientCode("PRD-0007"), "PRD-0007");
  assert.equal(formatPatientCode(""), "—");
  assert.equal(formatPatientCode(null), "—");
});

test("formatPatientDateOfBirth renders readable date", () => {
  assert.equal(formatPatientDateOfBirth("1990-05-15"), "May 15, 1990");
  assert.equal(formatPatientDateOfBirth(null), "—");
});

test("formatPatientRegisteredAt renders readable date", () => {
  assert.equal(formatPatientRegisteredAt("2026-08-01T08:00:00Z"), "Aug 1, 2026");
  assert.equal(formatPatientRegisteredAt(null), "—");
});

test("normalizePatientText trims and lowercases", () => {
  assert.equal(normalizePatientText("  Maria   Reyes "), "maria reyes");
});

test("matchesPatientFilters filters by query and facility", () => {
  assert.equal(matchesPatientFilters({ patient: samplePatient, query: "maria" }), true);
  assert.equal(matchesPatientFilters({ patient: samplePatient, query: "PRD-0001" }), true);
  assert.equal(matchesPatientFilters({ patient: samplePatient, query: "nonexistent" }), false);
  assert.equal(
    matchesPatientFilters({ patient: samplePatient, query: "", facilityId: "f1" }),
    true
  );
  assert.equal(
    matchesPatientFilters({ patient: samplePatient, query: "", facilityId: "f2" }),
    false
  );
});

test("findDuplicatePatients detects exact and name-only matches", () => {
  const patients = [
    samplePatient,
    {
      id: "p2",
      first_name: "Maria",
      middle_name: "Santos",
      last_name: "Reyes",
      date_of_birth: "1992-01-01",
    },
    { id: "p3", first_name: "Juan", last_name: "Cruz" },
  ];

  const exact = findDuplicatePatients({
    patients,
    formValues: {
      first_name: "Maria",
      middle_name: "Santos",
      last_name: "Reyes",
      date_of_birth: "1990-05-15",
    },
  });

  assert.equal(exact.exactMatches.length, 1);
  assert.equal(exact.exactMatches[0].id, "p1");
  assert.equal(exact.nameMatches.length, 1);
  assert.equal(exact.nameMatches[0].id, "p2");

  const nameOnly = findDuplicatePatients({
    patients,
    formValues: {
      first_name: "Maria",
      middle_name: "Santos",
      last_name: "Reyes",
      date_of_birth: "1993-03-03",
    },
  });

  assert.equal(nameOnly.exactMatches.length, 0);
  assert.equal(nameOnly.nameMatches.length, 2);

  const none = findDuplicatePatients({
    patients,
    formValues: { first_name: "Juan", last_name: "Cruz" },
  });

  assert.equal(none.exactMatches.length, 0);
  assert.equal(none.nameMatches.length, 1);

  const empty = findDuplicatePatients({
    patients,
    formValues: { first_name: "", last_name: "" },
  });

  assert.equal(empty.exactMatches.length, 0);
  assert.equal(empty.nameMatches.length, 0);
});

test("findDuplicatePatients honors excludeId", () => {
  const patients = [samplePatient];
  const result = findDuplicatePatients({
    excludeId: "p1",
    formValues: {
      first_name: "Maria",
      middle_name: "Santos",
      last_name: "Reyes",
      date_of_birth: "1990-05-15",
    },
    patients,
  });

  assert.equal(result.exactMatches.length, 0);
  assert.equal(result.nameMatches.length, 0);
});

test("sortPatients orders alphabetically by full name asc or desc", () => {
  const patients = [
    { id: "a", first_name: "MARIA", last_name: "Abad" },
    { id: "b", first_name: "Juan", last_name: "Cruz" },
    { id: "c", first_name: "ana", last_name: "Lopez" },
  ];

  assert.deepEqual(
    sortPatients({ patients, sortMode: "asc" }).map((patient) => patient.id),
    ["c", "b", "a"]
  );

  assert.deepEqual(
    sortPatients({ patients, sortMode: "desc" }).map((patient) => patient.id),
    ["a", "b", "c"]
  );

  assert.deepEqual(
    sortPatients({ patients }).map((patient) => patient.id),
    ["c", "b", "a"]
  );
});

test("getPatientSortLabel renders A-Z or Z-A", () => {
  assert.equal(getPatientSortLabel("asc"), "A–Z");
  assert.equal(getPatientSortLabel("desc"), "Z–A");
});

test("buildPatientsCsv produces quoted CSV with headers", () => {
  const csv = buildPatientsCsv({ patients: [samplePatient] });
  const lines = csv.split("\n");

  assert.equal(lines[0].includes("Patient Code"), true);
  assert.equal(lines[0].includes("Full Name"), true);
  assert.match(lines[1], /PRD-0001/);
  assert.match(lines[1], /Maria Santos Reyes Jr\./);

  const emptyCsv = buildPatientsCsv({ patients: [] });
  assert.equal(emptyCsv.split("\n").length, 1);
});

test("validatePatientForm checks required fields", () => {
  assert.equal(validatePatientForm({}), "First name is required.");
  assert.equal(
    validatePatientForm({ first_name: "Maria", last_name: "" }),
    "Last name is required."
  );
  assert.equal(
    validatePatientForm({ first_name: "Maria", last_name: "Reyes", gender: "" }),
    "Gender is required."
  );
  assert.equal(
    validatePatientForm({ first_name: "Maria", last_name: "Reyes", gender: "FEMALE" }),
    "Date of birth is required."
  );
  assert.equal(
    validatePatientForm({
      first_name: "Maria",
      last_name: "Reyes",
      gender: "FEMALE",
      date_of_birth: "2030-01-01",
    }),
    "Date of birth cannot be in the future."
  );
  assert.equal(
    validatePatientForm({
      first_name: "Maria",
      last_name: "Reyes",
      gender: "FEMALE",
      date_of_birth: "1990-05-15",
    }),
    "Facility is required."
  );
  assert.equal(
    validatePatientForm({
      first_name: "Maria",
      last_name: "Reyes",
      gender: "FEMALE",
      date_of_birth: "1990-05-15",
      facility_id: "f1",
    }),
    ""
  );
});