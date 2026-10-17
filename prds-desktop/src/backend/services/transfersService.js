import { supabase } from "../client/supabase";
import { getCachedUserSession, saveSnapshot, getSnapshot, STORAGE_KEYS } from "../database/snapshotStore";
import { isCurrentNetworkOnline } from "../sync/networkStatus";

const retiredTransferResult = () => {
  throw new Error("Stock transfers are retired in this PRDS build.");
};

const getCachedTransferAvailability = (sourceFacilityId) => {
  const { profile } = getCachedUserSession();
  const isBhw = profile?.role === "BHW";
  const today = new Date().toISOString().slice(0, 10);
  const facilities = new Map(getSnapshot(STORAGE_KEYS.FACILITIES, []).map((facility) => [facility.id, facility]));
  const medicines = new Map(getSnapshot(STORAGE_KEYS.MEDICINES, []).map((medicine) => [medicine.id, medicine]));
  const inventory = getSnapshot(STORAGE_KEYS.INVENTORY, []);
  const physicalByKey = new Map();

  inventory.forEach((row) => {
    if (!row.facility_id || !row.medicine_id || Number(row.quantity) <= 0 || !row.expiration_date || row.expiration_date <= today) return;
    const facility = facilities.get(row.facility_id);
    if (facility?.status !== "ACTIVE" || (isBhw && row.facility_id === profile.facility_id) ||
        (sourceFacilityId && row.facility_id !== sourceFacilityId)) return;
    const key = `${row.facility_id}:${row.medicine_id}`;
    const stock = physicalByKey.get(key) || { facility_id: row.facility_id, medicine_id: row.medicine_id, quantity: 0 };
    stock.quantity += Number(row.quantity);
    physicalByKey.set(key, stock);
  });

  return [...physicalByKey.values()].map((stock) => {
    const facility = facilities.get(stock.facility_id);
    const medicine = medicines.get(stock.medicine_id);
    return {
      source_facility_id: stock.facility_id,
      source_facility_name: facility?.facility_name,
      source_facility_code: facility?.facility_code,
      medicine_id: stock.medicine_id,
      generic_name: medicine?.generic_name,
      brand_name: medicine?.brand_name,
      dosage: medicine?.dosage,
      unit_of_measure: medicine?.unit_of_measure,
      physical_quantity: stock.quantity,
      reserved_quantity: 0,
      available_quantity: stock.quantity,
    };
  }).filter((row) => row.available_quantity > 0);
};

const getCachedTransfersData = ({ facilityId, clearTransfers = false } = {}) => {
  if (clearTransfers) {
    saveSnapshot(STORAGE_KEYS.TRANSFERS, []);
  }

  const cachedTransfers = clearTransfers ? [] : getSnapshot(STORAGE_KEYS.TRANSFERS, []);
  const cachedFacilities = getSnapshot(STORAGE_KEYS.FACILITIES, []);
  const cachedMedicines = getSnapshot(STORAGE_KEYS.MEDICINES, []);

  return {
    facilities: cachedFacilities,
    medicines: cachedMedicines,
    transfers: facilityId
      ? cachedTransfers.filter(
          (t) => t.source_facility_id === facilityId || t.destination_facility_id === facilityId
        )
      : cachedTransfers,
  };
};

export const fetchTransferById = async (transferId) => {
  return getSnapshot(STORAGE_KEYS.TRANSFERS, []).find((transfer) => transfer.id === transferId) || null;
};

export const getTransfersData = async ({ facilityId } = {}) => {
  return getCachedTransfersData({ facilityId, clearTransfers: true });
};

export const getTransferSourceAvailability = async ({ sourceFacilityId = null } = {}) => {
  saveSnapshot(STORAGE_KEYS.TRANSFERS, []);
  return getCachedTransferAvailability(sourceFacilityId);
};

export const getOwnFacilityInventory = async (facilityId) => {
  if (!facilityId) {
    return [];
  }

  if (!isCurrentNetworkOnline()) {
    return getSnapshot(STORAGE_KEYS.INVENTORY, []).filter((row) => row.facility_id === facilityId);
  }

  const { data, error } = await supabase
    .from("inventory")
    .select(`
      id,
      medicine_id,
      quantity,
      threshold,
      batch_number,
      date_received,
      expiration_date,
      brand_name,
      unit_cost,
      medicine:medicines(id, generic_name, dosage, unit_of_measure)
    `)
    .eq("facility_id", facilityId)
    .order("expiration_date", { ascending: true })
    .order("date_received", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
};

export const getStockTransferAllocationBatches = async (transferId) => {
  return [];
};

export const submitBhwStockTransferRequest = async ({ items, remarks, sourceFacilityId }) => {
  return retiredTransferResult();
};

export const createChoStockTransfer = async ({
  destinationFacilityId,
  items,
  remarks,
  sourceFacilityId,
}) => {
  return retiredTransferResult();
};

export const approveStockTransfer = async ({ remarks, transferId }) => {
  return retiredTransferResult();
};

export const allocateStockTransferForPickup = async ({ allocations, remarks, transferId }) => {
  return retiredTransferResult();
};

export const rejectStockTransfer = async ({ remarks, transferId }) => {
  return retiredTransferResult();
};

export const confirmStockTransferReceived = async ({ transferId }) => {
  return retiredTransferResult();
};
