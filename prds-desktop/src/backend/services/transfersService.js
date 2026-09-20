import { supabase } from "../client/supabase";
import { getCachedUserSession, saveSnapshot, getSnapshot, STORAGE_KEYS } from "../database/snapshotStore";
import { isCurrentNetworkOnline } from "../sync/networkStatus";
import { dataClient } from "../client/dataClient";

const getCachedTransferAvailability = (sourceFacilityId) => {
  const { profile } = getCachedUserSession();
  const isBhw = profile?.role === "BHW";
  const today = new Date().toISOString().slice(0, 10);
  const facilities = new Map(getSnapshot(STORAGE_KEYS.FACILITIES, []).map((facility) => [facility.id, facility]));
  const medicines = new Map(getSnapshot(STORAGE_KEYS.MEDICINES, []).map((medicine) => [medicine.id, medicine]));
  const inventory = getSnapshot(STORAGE_KEYS.INVENTORY, []);
  const transfers = getSnapshot(STORAGE_KEYS.TRANSFERS, []);
  const physicalByKey = new Map();
  const reservedByKey = new Map();

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

  transfers.forEach((transfer) => {
    const remainsReserved = transfer.status === "PENDING" ||
      (transfer.status === "APPROVED" && !(transfer.fulfillments || []).length);
    if (!remainsReserved) return;
    (transfer.items || []).forEach((item) => {
      const key = `${transfer.source_facility_id}:${item.medicine_id}`;
      reservedByKey.set(key, (reservedByKey.get(key) || 0) + Number(item.quantity || 0));
    });
  });

  return [...physicalByKey.values()].map((stock) => {
    const key = `${stock.facility_id}:${stock.medicine_id}`;
    const facility = facilities.get(stock.facility_id);
    const medicine = medicines.get(stock.medicine_id);
    const reserved = reservedByKey.get(key) || 0;
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
      reserved_quantity: reserved,
      available_quantity: Math.max(stock.quantity - reserved, 0),
    };
  }).filter((row) => row.available_quantity > 0);
};

const callQueueableTransferRpc = async (functionName, params, facilityId) => {
  const result = await dataClient.rpc(functionName, {
    p_operation_id: globalThis.crypto.randomUUID(),
    ...params,
  }, { facilityId });
  if (result.error) throw result.error;
  return result.isOfflineQueued
    ? { queued: true, mutationId: result.data.mutationId }
    : result.data;
};

const TRANSFER_SELECT = `
  id,
  source_facility_id,
  destination_facility_id,
  requested_by,
  approved_by,
  approved_at,
  status,
  created_at,
  transfer_date,
  received_by,
  received_at,
  remarks,
  source:facilities!stock_transfers_source_facility_id_fkey(
    id,
    facility_name,
    facility_code,
    facility_type,
    address
  ),
  destination:facilities!stock_transfers_destination_facility_id_fkey(
    id,
    facility_name,
    facility_code,
    facility_type,
    address
  ),
  requester:profiles!stock_transfers_requested_by_fkey(
    id,
    first_name,
    last_name,
    email,
    phone_number,
    role
  ),
  approver:profiles!stock_transfers_approved_by_fkey(
    id,
    first_name,
    last_name
  ),
  receiver:profiles!stock_transfers_received_by_fkey(
    id,
    first_name,
    last_name
  ),
  items:stock_transfer_items(
    id,
    medicine_id,
    quantity,
    medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure, unit_cost)
  ),
  fulfillments:stock_transfer_fulfillments(
    id,
    transfer_item_id,
    source_inventory_id,
    destination_inventory_id,
    quantity,
    fulfilled_at,
    received_by,
    received_at,
    source_batch:inventory!stock_transfer_fulfillments_source_inventory_id_fkey(
      id,
      batch_number,
      expiration_date,
      supplier:suppliers(id, supplier_name)
    )
  )
`;

const fetchTransfersQuery = async ({ facilityId } = {}) => {
  let query = supabase.from("stock_transfers").select(TRANSFER_SELECT);

  if (facilityId) {
    query = query.or(`source_facility_id.eq.${facilityId},destination_facility_id.eq.${facilityId}`);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
};

export const fetchTransferById = async (transferId) => {
  const { data, error } = await supabase
    .from("stock_transfers")
    .select(TRANSFER_SELECT)
    .eq("id", transferId)
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const getTransfersData = async ({ facilityId } = {}) => {
  if (!isCurrentNetworkOnline()) {
    const cachedTransfers = getSnapshot(STORAGE_KEYS.TRANSFERS, []);
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
  }

  try {
    const [transfers, facilitiesResult, medicinesResult] = await Promise.all([
      fetchTransfersQuery({ facilityId }),
      supabase
        .from("facilities")
        .select("id, facility_name, facility_code, facility_type, address, status")
        .eq("status", "ACTIVE")
        .order("facility_name", { ascending: true }),
      supabase
        .from("medicines")
        .select("id, generic_name, brand_name, dosage, unit_of_measure, unit_cost")
        .order("generic_name", { ascending: true }),
    ]);

    const firstError = facilitiesResult.error || medicinesResult.error;

    if (firstError) {
      throw firstError;
    }

    if (transfers && (!facilityId || facilityId.length === 0)) {
      saveSnapshot(STORAGE_KEYS.TRANSFERS, transfers);
    }

    return {
      facilities: facilitiesResult.data || [],
      medicines: medicinesResult.data || [],
      transfers,
    };
  } catch (err) {
    console.warn("getTransfersData online error, using snapshots:", err);
    const cachedTransfers = getSnapshot(STORAGE_KEYS.TRANSFERS, []);
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
  }
};

export const getTransferSourceAvailability = async ({ sourceFacilityId = null } = {}) => {
  if (!isCurrentNetworkOnline()) return getCachedTransferAvailability(sourceFacilityId);

  const { data, error } = await supabase.rpc("get_transfer_source_availability", {
    p_source_facility_id: sourceFacilityId,
  });

  if (error) {
    throw error;
  }

  return data || [];
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
      supplier_id,
      quantity,
      threshold,
      batch_number,
      date_received,
      expiration_date,
      medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure, unit_cost),
      supplier:suppliers(id, supplier_name)
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
  const { data, error } = await supabase.rpc("get_stock_transfer_allocation_batches", {
    p_transfer_id: transferId,
  });

  if (error) {
    throw error;
  }

  return (data || []).map((batch) => ({
    ...batch,
    id: batch.source_inventory_id,
  }));
};

export const submitBhwStockTransferRequest = async ({ items, remarks, sourceFacilityId }) => {
  const transferItems = items.map((item) => ({
    medicine_id: item.medicine_id,
    quantity: Number(item.quantity),
  }));

  return callQueueableTransferRpc("submit_bhw_stock_transfer_request_idempotent", {
    p_items: transferItems,
    p_remarks: remarks || null,
    p_source_facility_id: sourceFacilityId,
  });
};

export const createChoStockTransfer = async ({
  destinationFacilityId,
  items,
  remarks,
  sourceFacilityId,
}) => {
  const transferItems = items.map((item) => ({
    medicine_id: item.medicine_id,
    quantity: Number(item.quantity),
  }));

  return callQueueableTransferRpc("create_cho_stock_transfer_idempotent", {
    p_destination_facility_id: destinationFacilityId,
    p_items: transferItems,
    p_remarks: remarks || null,
    p_source_facility_id: sourceFacilityId,
  });
};

export const approveStockTransfer = async ({ remarks, transferId }) => {
  const { data, error } = await supabase.rpc("approve_stock_transfer_request", {
    p_remarks: remarks || null,
    p_transfer_id: transferId,
  });

  if (error) {
    throw error;
  }

  return fetchTransferById(data || transferId);
};

export const allocateStockTransferForPickup = async ({ allocations, remarks, transferId }) => {
  const { data, error } = await supabase.rpc("allocate_stock_transfer_for_pickup", {
    p_allocations: allocations,
    p_remarks: remarks || null,
    p_transfer_id: transferId,
  });

  if (error) {
    throw error;
  }

  return fetchTransferById(data || transferId);
};

export const rejectStockTransfer = async ({ remarks, transferId }) => {
  const { data, error } = await supabase.rpc("reject_stock_transfer_request", {
    p_remarks: remarks || null,
    p_transfer_id: transferId,
  });

  if (error) {
    throw error;
  }

  return fetchTransferById(data || transferId);
};

export const confirmStockTransferReceived = async ({ transferId }) => {
  const { data, error } = await supabase.rpc("confirm_stock_transfer_received", {
    p_transfer_id: transferId,
  });

  if (error) {
    throw error;
  }

  return data;
};
