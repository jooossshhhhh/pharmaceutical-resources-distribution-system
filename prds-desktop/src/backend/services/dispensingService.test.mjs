import assert from "node:assert/strict";
import test from "node:test";
import { saveUserSession, saveSnapshot, STORAGE_KEYS } from "../database/snapshotStore.js";
import { setNetworkOnlineState } from "../sync/networkStatus.js";
import {
  getLocalWalkInInventory,
  getSyncSnapshotWalkInInventory,
  getWalkInInventory,
} from "./dispensingService.js";
import { buildMedicineOptions } from "../../shared/utils/dispensingUtils.js";

function createMemoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key) {
      map.delete(key);
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

const CHO_ID = "0b7e2eaa-1072-4fb1-8e14-d6fb46097aad";
const INAYAGAN_ID = "ef6dc643-fe33-4dd5-af75-5f8806eaf492";

const MOCK_FACILITIES = [
  {
    id: CHO_ID,
    facility_name: "City Health Office - City of Naga",
    facility_code: "CHO-NAGA",
    facility_type: "CHO",
    status: "ACTIVE",
  },
  {
    id: INAYAGAN_ID,
    facility_name: "Inayagan Barangay Health Center",
    facility_code: "HC-INAYAGAN",
    facility_type: "HEALTH_CENTER",
    status: "ACTIVE",
  },
];

const MOCK_MEDICINES = [
  {
    id: "med-folic",
    generic_name: "Folic acid",
    dosage: "5 mg",
    unit_of_measure: "tablet",
    categories: ["Vitamins & Minerals"],
  },
  {
    id: "med-multi",
    generic_name: "Multivitamins",
    dosage: "Standard formulation",
    unit_of_measure: "capsule",
    categories: ["Vitamins & Minerals"],
  },
  {
    id: "med-albendazole",
    generic_name: "Albendazole",
    dosage: "400 mg chewable tablet",
    unit_of_measure: "tablet",
    categories: ["Anti-infectives"],
  },
];

const MOCK_INVENTORY = [
  {
    id: "lot-cho-1",
    facility_id: CHO_ID,
    medicine_id: "med-multi",
    batch_number: "0827024",
    brand_name: "Ritemed",
    quantity: 19494,
    date_received: "2026-08-27",
    expiration_date: "2027-05-31",
    status: "ACTIVE",
  },
  {
    id: "lot-cho-2",
    facility_id: CHO_ID,
    medicine_id: "med-albendazole",
    batch_number: "0827021",
    brand_name: "Zentel",
    quantity: 1157,
    date_received: "2026-08-27",
    expiration_date: "2027-03-31",
    status: "ACTIVE",
  },
  {
    id: "lot-inayagan-1",
    facility_id: INAYAGAN_ID,
    medicine_id: "med-folic",
    batch_number: "0827028",
    brand_name: "Ritemed",
    quantity: 100,
    date_received: "2026-10-27",
    expiration_date: "2026-12-31",
    status: "ACTIVE",
  },
];

test("CHO dispensing fetches and hydrates only City Health Office inventory stocks", async () => {
  globalThis.localStorage = createMemoryStorage();
  setNetworkOnlineState(false);

  saveUserSession(
    { id: "user-cho", email: "cho@naga.gov.ph" },
    { id: "user-cho", role: "PHARMA_II", facility_id: CHO_ID }
  );
  saveSnapshot(STORAGE_KEYS.FACILITIES, MOCK_FACILITIES);
  saveSnapshot(STORAGE_KEYS.MEDICINES, MOCK_MEDICINES);
  saveSnapshot(STORAGE_KEYS.INVENTORY, MOCK_INVENTORY);
  saveSnapshot(STORAGE_KEYS.STOCK_RETURNS, []);

  const syncLots = getSyncSnapshotWalkInInventory(CHO_ID);
  assert.equal(syncLots.length, 2);
  assert.ok(syncLots.every((lot) => lot.facility_id === CHO_ID));

  const localLots = await getLocalWalkInInventory("CHO");
  assert.equal(localLots.length, 2);

  const walkInLots = await getWalkInInventory(CHO_ID);
  assert.equal(walkInLots.length, 2);
  assert.equal(walkInLots[0].medicine.generic_name, "Albendazole");
  assert.equal(walkInLots[1].medicine.generic_name, "Multivitamins");

  const options = buildMedicineOptions(walkInLots, "");
  assert.equal(options.length, 2);
});

test("BHW dispensing fetches and hydrates only the assigned Barangay Health Center inventory stocks", async () => {
  globalThis.localStorage = createMemoryStorage();
  setNetworkOnlineState(false);

  saveUserSession(
    { id: "user-bhw", email: "inayagan@naga.gov.ph" },
    { id: "user-bhw", role: "BHW", facility_id: INAYAGAN_ID }
  );
  saveSnapshot(STORAGE_KEYS.FACILITIES, MOCK_FACILITIES);
  saveSnapshot(STORAGE_KEYS.MEDICINES, MOCK_MEDICINES);
  saveSnapshot(STORAGE_KEYS.INVENTORY, MOCK_INVENTORY);

  const syncLots = getSyncSnapshotWalkInInventory(INAYAGAN_ID);
  assert.equal(syncLots.length, 1);
  assert.equal(syncLots[0].facility_id, INAYAGAN_ID);
  assert.equal(syncLots[0].medicine.generic_name, "Folic acid");

  const walkInLots = await getWalkInInventory(INAYAGAN_ID);
  assert.equal(walkInLots.length, 1);
  assert.equal(walkInLots[0].id, "lot-inayagan-1");
  assert.equal(walkInLots[0].facility.facility_name, "Inayagan Barangay Health Center");

  const options = buildMedicineOptions(walkInLots, "");
  assert.equal(options.length, 1);
  assert.equal(options[0].total_quantity, 100);
});

