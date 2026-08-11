import { supabase } from "../../services/supabase";

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

  return {
    facilities: facilitiesResult.data || [],
    medicines: medicinesResult.data || [],
    transfers,
  };
};

export const getTransferSourceAvailability = async ({ sourceFacilityId = null } = {}) => {
  const { data, error } = await supabase.rpc("get_transfer_source_availability", {
    p_source_facility_id: sourceFacilityId,
  });

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

  const { data, error } = await supabase.rpc("submit_bhw_stock_transfer_request", {
    p_items: transferItems,
    p_remarks: remarks || null,
    p_source_facility_id: sourceFacilityId,
  });

  if (error) {
    throw error;
  }

  return data;
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

  const { data, error } = await supabase.rpc("create_cho_stock_transfer", {
    p_destination_facility_id: destinationFacilityId,
    p_items: transferItems,
    p_remarks: remarks || null,
    p_source_facility_id: sourceFacilityId,
  });

  if (error) {
    throw error;
  }

  return data;
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
