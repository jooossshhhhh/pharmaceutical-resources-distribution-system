import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "@frontend/context/useAuth";
import { downloadExportFile } from "@frontend/services/downloadManager";
import { supabase } from "../client/supabase";
import { saveSnapshot, getSnapshot, STORAGE_KEYS } from "../database/snapshotStore";
import { getSqliteDb, isTauriEnvironment } from "../database/sqliteClient";
import { isCurrentNetworkOnline } from "../sync/networkStatus";
import { createOfflineInsertPayload, enqueueMutation } from "../sync/outboxQueue";
import { computeAdc, computeReorderQty } from "@shared/utils/demandUtils";
import {
  buildInventoryMedicineRows,
  calculateDynamicThreshold,
  getThresholdCalculationDetails,
  createEmptyPoItem,
  emptyPoReceiptForm,
  emptyReturnReceiptForm,
  normalizePoNumber,
  daysUntilExpiry,
  emptyInventoryForm,
  findDuplicateLotsInBatch,
  formatDateTime,
  getExpiryStatus,
  getMedicineName,
  getStockStatus,
  getTomorrowDateString,
  isDisposedLot,
  isLotExpired,
  isLotNumberUsed,
  isPoNumberUsed,
  isReturnedLot,
  isStrictlyFutureDate,
  normalizeLotNumber,
  pageSize,
  sortInventoryRows,
} from "@shared/utils/inventoryUtils";
import { reconcileConfirmedReturnsIntoInventory } from "./stockReturnsService";
import { isChoFacility } from "@shared/utils/facilityUtils";

const STORAGE_PREFIX = "prds-inventory:";

const STOCK_PARAM_MAP = {
  low: "LOW",
  critical: "CRITICAL",
  expiring: "EXPIRING",
};

const readStored = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export function useInventoryData({ isBhw = false }) {
  const location = useLocation();
  const { profile } = useAuth();
  const canManage = profile?.role === "PHARMA_I" || profile?.role === "PHARMA_II";
  const ownFacilityId = profile?.facility_id || null;

  const [inventory, setInventory] = useState(() => getSnapshot(STORAGE_KEYS.INVENTORY, []));
  const [facilities, setFacilities] = useState(() => getSnapshot(STORAGE_KEYS.FACILITIES, []));
  const [medicines, setMedicines] = useState(() => getSnapshot(STORAGE_KEYS.MEDICINES, []));
  const [suppliers, setSuppliers] = useState(() => getSnapshot(STORAGE_KEYS.SUPPLIERS, []));
  const [dispensingSummary, setDispensingSummary] = useState(() => getSnapshot(STORAGE_KEYS.DISPENSING_SUMMARY, []));
  const [searchTerm, setSearchTerm] = useState(
    () => readStored(`${STORAGE_PREFIX}${profile?.id}:search`) || ""
  );
  const [facilityFilter, setFacilityFilter] = useState(() => {
    if (location.state?.facilityFilter && location.state.facilityFilter !== "ALL") {
      return location.state.facilityFilter;
    }
    const facilityParam = new URLSearchParams(location.search).get("facility");
    if (facilityParam && facilityParam !== "ALL") {
      return facilityParam;
    }
    if (isBhw) {
      return profile?.facility_id || "";
    }
    const stored = readStored(`${STORAGE_PREFIX}${profile?.id}:facility`);
    if (stored && stored !== "ALL") {
      return stored;
    }
    return ownFacilityId || "";
  });
  const [stockFilter, setStockFilter] = useState(() => {
    if (location.state?.stockFilter) {
      return location.state.stockFilter;
    }
    const stockParam = new URLSearchParams(location.search).get("stock");
    if (stockParam && STOCK_PARAM_MAP[stockParam]) {
      return STOCK_PARAM_MAP[stockParam];
    }
    return readStored(`${STORAGE_PREFIX}${profile?.id}:stock`) || "ALL";
  });
  const [inventoryTab, setInventoryTab] = useState(() => {
    const tabParam = new URLSearchParams(location.search).get("tab");
    if (tabParam && ["EXPIRED", "DISPENSABLE", "RETURNED"].includes(tabParam.toUpperCase())) {
      return tabParam.toUpperCase();
    }
    const stored = readStored(`${STORAGE_PREFIX}${profile?.id}:tab`);
    if (stored && ["EXPIRED", "DISPENSABLE", "RETURNED"].includes(stored.toUpperCase())) {
      return stored.toUpperCase();
    }
    return "DISPENSABLE";
  });
  const [inventorySort, setInventorySort] = useState({ key: "medicine", direction: "ASC" });
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(() => {
    const cachedInv = getSnapshot(STORAGE_KEYS.INVENTORY, []);
    return cachedInv.length === 0;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [inventoryError, setInventoryError] = useState("");
  const [modalMode, setModalMode] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [formValues, setFormValues] = useState(emptyInventoryForm);
  const formSnapshotRef = useRef(null);

  const EDITABLE_FIELDS = [
    "facility_id",
    "medicine_id",
    "brand_name",
    "supplier_name",
    "supplier_address",
    "supplier_contact",
    "quantity",
    "threshold",
    "batch_number",
    "po_number",
    "unit_cost",
    "date_received",
    "expiration_date",
  ];

  const formHasChanges = () => {
    const snapshot = formSnapshotRef.current;
    if (!snapshot) {
      return true;
    }

    return EDITABLE_FIELDS.some(
      (field) => String(formValues[field] ?? "") !== String(snapshot[field] ?? "")
    );
  };

  const today = useMemo(() => formatDateTime(new Date()), []);

  useEffect(() => {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${profile?.id}:search`, searchTerm);
    } catch {
      // Storage unavailable (e.g. private mode) — ignore.
    }
  }, [profile?.id, searchTerm]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${profile?.id}:facility`, facilityFilter);
    } catch {
      // Storage unavailable (e.g. private mode) — ignore.
    }
  }, [profile?.id, facilityFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${profile?.id}:stock`, stockFilter);
    } catch {
      // Storage unavailable (e.g. private mode) — ignore.
    }
  }, [profile?.id, stockFilter]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${profile?.id}:tab`, inventoryTab);
    } catch {
      // Storage unavailable (e.g. private mode) — ignore.
    }
  }, [profile?.id, inventoryTab]);

  const defaultFacilityId = useMemo(() => {
    return (
      ownFacilityId ||
      facilities.find((f) => isChoFacility(f))?.id ||
      facilities[0]?.id ||
      null
    );
  }, [ownFacilityId, facilities]);

  // Keep facilityFilter synced with a valid health facility if it is currently unset or "ALL"
  useEffect(() => {
    if (!isBhw && (!facilityFilter || facilityFilter === "ALL") && defaultFacilityId) {
      setFacilityFilter(defaultFacilityId);
    }
  }, [isBhw, facilityFilter, defaultFacilityId]);

  const activeFacilityId = useMemo(() => {
    if (facilityFilter && facilityFilter !== "ALL") {
      return facilityFilter;
    }
    return defaultFacilityId;
  }, [facilityFilter, defaultFacilityId]);

  const viewingOwnFacility = Boolean(
    (facilityFilter && facilityFilter === ownFacilityId) ||
    (!facilityFilter && defaultFacilityId === ownFacilityId)
  );

  const scopeInventory = useMemo(() => {
    // Include both procurement stock and confirmed restocked returns in inventory
    const baseLots = inventory;

    if (isBhw) {
      return ownFacilityId
        ? baseLots.filter((item) => item.facility_id === ownFacilityId)
        : [];
    }

    // On Expired Stocks tab, show all quarantined expired stocks across facilities for condemnation tracking
    if (inventoryTab === "EXPIRED") {
      return baseLots;
    }

    // For CHO Pharmacist: Filter by selected health center (default to CHO Naga)
    const targetId = activeFacilityId;
    if (targetId) {
      return baseLots.filter((item) => item.facility_id === targetId);
    }

    return baseLots;
  }, [inventory, isBhw, ownFacilityId, activeFacilityId, inventoryTab]);

  const selectedFacility = useMemo(() => {
    const targetId = activeFacilityId;
    if (!targetId) return null;
    return facilities.find((facility) => facility.id === targetId) || null;
  }, [facilities, activeFacilityId]);

  // Partition scope inventory into dispensable and expired quarantined commercial lots
  const dispensableLots = useMemo(() => {
    return scopeInventory.filter((lot) => !isLotExpired(lot) && !isDisposedLot(lot));
  }, [scopeInventory]);

  const expiredLots = useMemo(() => {
    return scopeInventory.filter(
      (lot) => isLotExpired(lot) && Number(lot.quantity || 0) > 0 && !isDisposedLot(lot)
    );
  }, [scopeInventory]);

  const returnedLots = useMemo(() => {
    const rawReturned = inventory.filter(
      (item) => isReturnedLot(item) && !isLotExpired(item) && !isDisposedLot(item) && Number(item.quantity || 0) > 0
    );

    if (isBhw) {
      return ownFacilityId
        ? rawReturned.filter((item) => item.facility_id === ownFacilityId || item.origin_facility_id === ownFacilityId)
        : [];
    }

    const targetFilter = activeFacilityId;

    if (targetFilter) {
      return rawReturned.filter(
        (item) => item.facility_id === targetFilter || item.origin_facility_id === targetFilter
      );
    }

    return rawReturned;
  }, [inventory, isBhw, ownFacilityId, activeFacilityId]);

  // Grouped medicine rows for dispensable stock
  const groupedDispensableInventory = useMemo(
    () => buildInventoryMedicineRows(dispensableLots),
    [dispensableLots]
  );

  // Grouped medicine rows for expired stock
  const groupedExpiredInventory = useMemo(
    () => buildInventoryMedicineRows(expiredLots),
    [expiredLots]
  );

  // Grouped medicine rows for returned stock
  const groupedReturnedInventory = useMemo(
    () => buildInventoryMedicineRows(returnedLots),
    [returnedLots]
  );

  // Active grouped inventory based on selected tab
  const groupedInventory = useMemo(() => {
    if (inventoryTab === "EXPIRED") return groupedExpiredInventory;
    if (inventoryTab === "RETURNED") return groupedReturnedInventory;
    return groupedDispensableInventory;
  }, [inventoryTab, groupedExpiredInventory, groupedReturnedInventory, groupedDispensableInventory]);

  const dispensableItemCount = groupedDispensableInventory.length;
  const expiredItemCount = groupedExpiredInventory.length;
  const returnedItemCount = groupedReturnedInventory.length;

  const ownFacilityName =
    profile?.facility_name ||
    facilities.find((facility) => facility.id === ownFacilityId)?.facility_name ||
    "Your facility";

  // Summary metrics for Dispensable Stock tab
  const summary = useMemo(() => {
    return groupedDispensableInventory.reduce(
      (counts, item) => {
        const status = getStockStatus(item).key;
        const expiryStatus = getExpiryStatus(item).key;

        counts.totalItems += 1;
        counts.stockedOut += status === "CRITICAL" && Number(item.quantity) === 0 ? 1 : 0;
        counts.critical += status === "CRITICAL" ? 1 : 0;
        counts.low += status === "LOW" ? 1 : 0;
        counts.expired += 0;
        counts.expiring += expiryStatus === "EXPIRING" ? 1 : 0;

        return counts;
      },
      { totalItems: 0, stockedOut: 0, critical: 0, low: 0, expired: 0, expiring: 0 }
    );
  }, [groupedDispensableInventory]);

  // Dedicated metrics for Expired Stocks tab
  const expiredSummary = useMemo(() => {
    const totalItems = groupedExpiredInventory.length;
    let totalUnits = 0;
    let totalLossValue = 0;

    expiredLots.forEach((lot) => {
      const qty = Number(lot.quantity || 0);
      const unitCost = Number(lot.medicine?.unit_cost || 0);
      totalUnits += qty;
      totalLossValue += qty * unitCost;
    });

    return {
      totalItems,
      totalUnits,
      totalLots: expiredLots.length,
      totalLossValue: isBhw ? 0 : totalLossValue,
      status: "Pending Condemnation",
    };
  }, [groupedExpiredInventory, expiredLots, isBhw]);

  // Dedicated metrics for Returned Stock Inventory tab
  const returnedSummary = useMemo(() => {
    const totalItems = groupedReturnedInventory.length;
    let totalUnits = 0;
    let totalValue = 0;

    returnedLots.forEach((lot) => {
      const qty = Number(lot.quantity || 0);
      const unitCost = Number(lot.unit_cost || lot.medicine?.unit_cost || 0);
      totalUnits += qty;
      totalValue += qty * unitCost;
    });

    return {
      totalItems,
      totalUnits,
      totalLots: returnedLots.length,
      totalValue: isBhw ? 0 : totalValue,
      status: "Available for Dispensing",
    };
  }, [groupedReturnedInventory, returnedLots, isBhw]);

  const returnsSummary = returnedSummary;

  const facilityOptions = useMemo(() => {
    return [...facilities].sort((first, second) => {
      const firstIsOwn = first.id === ownFacilityId;
      const secondIsOwn = second.id === ownFacilityId;

      if (firstIsOwn !== secondIsOwn) {
        return firstIsOwn ? -1 : 1;
      }

      return first.facility_name.localeCompare(second.facility_name);
    });
  }, [facilities, ownFacilityId]);

  const consumptionByMedicine = useMemo(() => {
    const targetFacilityId = isBhw ? ownFacilityId : activeFacilityId;
    const scopeIds = targetFacilityId ? new Set([targetFacilityId]) : null;
    const rows = scopeIds
      ? dispensingSummary.filter((row) => scopeIds.has(row.facility_id))
      : dispensingSummary;

    const rowsByMedicine = {};
    rows.forEach((row) => {
      (rowsByMedicine[row.medicine_id] ||= []).push(row);
    });

    const map = {};
    Object.entries(rowsByMedicine).forEach(([medicineId, medicineRows]) => {
      map[medicineId] = computeAdc(medicineRows);
    });

    return map;
  }, [dispensingSummary, activeFacilityId, isBhw, ownFacilityId]);

  const reorderQtyByItemId = useMemo(() => {
    const map = {};
    groupedInventory.forEach((item) => {
      const adc = consumptionByMedicine[item.medicine_id];
      const reorderQty = adc != null ? computeReorderQty(item.quantity, adc) : 0;
      if (reorderQty > 0) {
        map[item.id] = reorderQty;
      }
    });
    return map;
  }, [groupedInventory, consumptionByMedicine]);

  const preFilteredInventory = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return groupedInventory.filter((item) => {
      const searchableText = [
        item.medicine?.generic_name,
        item.brand_name,
        item.medicine?.brand_name,
        item.supplier_name,
        item.medicine?.dosage,
        item.medicine?.unit_of_measure,
        item.facility?.facility_name,
        ...(item.lots || []).map((lot) => lot.brand_name),
        ...(item.lots || []).map((lot) => lot.supplier_name || lot.supplier?.supplier_name),
        ...(item.lots || []).map((lot) => lot.batch_number),
        ...(item.lots || []).map((lot) => lot.po_number),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return !normalizedSearch || searchableText.includes(normalizedSearch);
    });
  }, [groupedInventory, searchTerm]);

  const filteredInventory = useMemo(() => {
    return preFilteredInventory.filter((item) => {
      if (stockFilter === "REORDER") {
        return reorderQtyByItemId[item.id] != null;
      }

      const status = getStockStatus(item).key;
      const expiryStatus = getExpiryStatus(item).key;

      return (
        stockFilter === "ALL" ||
        (stockFilter === "EXPIRING"
          ? expiryStatus === "EXPIRED" || expiryStatus === "EXPIRING"
          : status === stockFilter)
      );
    });
  }, [preFilteredInventory, stockFilter, reorderQtyByItemId]);

  const sortedInventory = useMemo(() => {
    return sortInventoryRows(filteredInventory, inventorySort);
  }, [filteredInventory, inventorySort]);

  const paginatedInventory = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedInventory.slice(startIndex, startIndex + pageSize);
  }, [currentPage, sortedInventory]);

  const totalPages = Math.max(1, Math.ceil(sortedInventory.length / pageSize));

  const hasActiveFilters = useMemo(() => {
    return (
      searchTerm.trim() !== "" ||
      stockFilter !== "ALL" ||
      (!isBhw && inventoryTab !== "EXPIRED" && Boolean(activeFacilityId) && activeFacilityId !== defaultFacilityId)
    );
  }, [searchTerm, stockFilter, activeFacilityId, isBhw, inventoryTab, defaultFacilityId]);

  const loadInventory = useCallback(async (silent = false) => {
    const cachedInv = getSnapshot(STORAGE_KEYS.INVENTORY, []);
    if (!silent && cachedInv.length === 0) {
      setIsLoading(true);
    }
    setInventoryError("");

    // If completely offline, use local cached snapshot / SQLite and reconcile confirmed returns
    if (!isCurrentNetworkOnline()) {
      let offlineInv = getSnapshot(STORAGE_KEYS.INVENTORY, []);
      let facData = getSnapshot(STORAGE_KEYS.FACILITIES, []);
      let medData = getSnapshot(STORAGE_KEYS.MEDICINES, []);
      let offlineThresholdMap = new Map();
      if (isTauriEnvironment()) {
        try {
          const db = await getSqliteDb();
          const localInv = await db.select("SELECT * FROM inventory");
          if (localInv && localInv.length > 0) {
            offlineInv = localInv;
          }
          if (facData.length === 0) {
            facData = await db.select("SELECT * FROM facilities");
          }
          if (medData.length === 0) {
            medData = await db.select("SELECT * FROM medicines");
          }
          const fmtRows = await db.select(
            "SELECT facility_id, medicine_id, threshold FROM facility_medicine_thresholds"
          );
          for (const fmt of fmtRows || []) {
            offlineThresholdMap.set(`${fmt.facility_id}:${fmt.medicine_id}`, Number(fmt.threshold || 0));
          }
        } catch {}
      }
      const hydratedOfflineInv = offlineInv.map((item) => ({
        ...item,
        threshold: offlineThresholdMap.get(`${item.facility_id}:${item.medicine_id}`) ?? item.threshold ?? 0,
        facility:
          item.facility ||
          (item.facility_id ? facData.find((facility) => facility.id === item.facility_id) || null : null),
        medicine:
          item.medicine ||
          (item.medicine_id ? medData.find((med) => med.id === item.medicine_id) || null : null),
        origin_facility:
          item.origin_facility ||
          (item.origin_facility_id
            ? facData.find((facility) => facility.id === item.origin_facility_id) || null
            : null),
      }));
      const reconciledInv = await reconcileConfirmedReturnsIntoInventory(hydratedOfflineInv, {
        facilities: facData,
        medicines: medData,
      });
      setInventory(reconciledInv);
      saveSnapshot(STORAGE_KEYS.INVENTORY, reconciledInv);
      setIsLoading(false);
      return;
    }

    try {
      const fetchInventorySafely = async () => {
        let result = await supabase
          .from("inventory")
          .select(`
            id,
            facility_id,
            medicine_id,
            quantity,
            batch_number,
            po_number,
            unit_cost,
            brand_name,
            supplier_name,
            intake_type,
            return_reason,
            status,
            date_received,
            expiration_date,
            updated_at,
            facility:facilities!inventory_facility_id_fkey(id, facility_name, facility_code),
            medicine:medicines(id, generic_name, dosage, unit_of_measure, categories)
          `)
          .order("updated_at", { ascending: false });

        if (
          result.error &&
          (result.error.code === "42703" ||
            result.error.code === "PGRST204" ||
            String(result.error.message || "").toLowerCase().includes("does not exist") ||
            String(result.error.message || "").toLowerCase().includes("column"))
        ) {
          result = await supabase
            .from("inventory")
            .select(`
              id,
              facility_id,
              medicine_id,
              quantity,
              batch_number,
              date_received,
              expiration_date,
              updated_at,
              facility:facilities!inventory_facility_id_fkey(id, facility_name, facility_code),
              medicine:medicines(id, generic_name, dosage, unit_of_measure, categories)
            `)
            .order("updated_at", { ascending: false });
        }

        let localLotMap = new Map();
        let localBatchKeyMap = new Map();
        let localRows = [];
        if (isTauriEnvironment()) {
          try {
            const db = await getSqliteDb();
            localRows = await db.select(
              "SELECT id, facility_id, medicine_id, batch_number, po_number, unit_cost, origin_facility_id, intake_type, return_reason, status, brand_name, supplier_name, supplier_address, supplier_contact, disposed_at, disposal_method, disposed_by, quantity, date_received, expiration_date FROM inventory"
            );
            for (const r of localRows || []) {
              if (r.id) localLotMap.set(r.id, r);
              const bKey = `${r.facility_id || ""}:${r.medicine_id || ""}:${normalizeLotNumber(r.batch_number)}`;
              localBatchKeyMap.set(bKey, r);
            }
          } catch (err) {
            console.warn("Could not query local SQLite inventory:", err);
          }
        }

        if (result.data) {
          const remoteRows = result.data.map((item) => {
            const bKey = `${item.facility_id || ""}:${item.medicine_id || ""}:${normalizeLotNumber(item.batch_number)}`;
            const local = localLotMap.get(item.id) || localBatchKeyMap.get(bKey);
            return {
              ...item,
              po_number: item.po_number || local?.po_number || null,
              brand_name: item.brand_name || local?.brand_name || null,
              supplier_name: item.supplier_name || local?.supplier_name || null,
              supplier_address: item.supplier_address || local?.supplier_address || null,
              supplier_contact: item.supplier_contact || local?.supplier_contact || null,
              unit_cost: item.unit_cost ?? local?.unit_cost ?? 0,
              origin_facility_id: item.origin_facility_id || local?.origin_facility_id || null,
              intake_type: item.intake_type || local?.intake_type || "PROCUREMENT",
              return_reason: item.return_reason || local?.return_reason || null,
              status: item.status || local?.status || "ACTIVE",
              disposed_at: item.disposed_at || local?.disposed_at || null,
              disposal_method: item.disposal_method || local?.disposal_method || null,
              disposed_by: item.disposed_by || local?.disposed_by || null,
            };
          });

          const remoteIds = new Set(remoteRows.map((r) => r.id));
          const missingLocalRows = (localRows || []).filter(
            (r) => !remoteIds.has(r.id) && !isDisposedLot(r)
          );

          result.data = [...remoteRows, ...missingLocalRows];
        } else if (localRows.length > 0) {
          result.data = localRows.filter((r) => !isDisposedLot(r));
        }

        return result;
      };

      const [
        inventoryResult,
        facilitiesResult,
        medicinesResult,
        dispensingResult,
        thresholdsResult,
      ] = await Promise.all([
        fetchInventorySafely(),
        supabase
          .from("facilities")
          .select("id, facility_name, facility_code, facility_type")
          .eq("status", "ACTIVE")
          .order("facility_name", { ascending: true }),
        supabase
          .from("medicines")
          .select("id, generic_name, dosage, unit_of_measure, categories")
          .order("generic_name", { ascending: true }),
        supabase
          .from("monthly_dispensing_summary")
          .select("facility_id, medicine_id, month, total_dispensed"),
        supabase
          .from("facility_medicine_thresholds")
          .select("id, facility_id, medicine_id, threshold, is_custom"),
      ]);

      let facData = facilitiesResult.data || [];
      let medData = medicinesResult.data || [];
      let rawInvData = inventoryResult.data || [];

      const thresholdMap = new Map();
      (thresholdsResult?.data || []).forEach((t) => {
        if (t.facility_id && t.medicine_id) {
          thresholdMap.set(`${t.facility_id}:${t.medicine_id}`, Number(t.threshold || 0));
        }
      });

      if (isTauriEnvironment()) {
        try {
          const db = await getSqliteDb();
          if (facData.length === 0) facData = await db.select("SELECT * FROM facilities");
          if (medData.length === 0) medData = await db.select("SELECT * FROM medicines");
          if (rawInvData.length === 0) rawInvData = await db.select("SELECT * FROM inventory");

          const localThresholdRows = await db.select(
            "SELECT facility_id, medicine_id, threshold FROM facility_medicine_thresholds"
          );
          for (const lt of localThresholdRows || []) {
            const key = `${lt.facility_id}:${lt.medicine_id}`;
            if (!thresholdMap.has(key)) {
              thresholdMap.set(key, Number(lt.threshold || 0));
            }
          }

          if (thresholdsResult?.data && thresholdsResult.data.length > 0) {
            for (const t of thresholdsResult.data) {
              await db.execute(
                `INSERT INTO facility_medicine_thresholds (id, facility_id, medicine_id, threshold, is_custom, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT(facility_id, medicine_id) DO UPDATE SET threshold = excluded.threshold, is_custom = excluded.is_custom, updated_at = excluded.updated_at`,
                [t.id || crypto.randomUUID(), t.facility_id, t.medicine_id, t.threshold, t.is_custom ? 1 : 0, new Date().toISOString()]
              );
            }
          }
        } catch (dbErr) {
          console.warn("Could not query or sync local SQLite thresholds:", dbErr);
        }
      }

      const invData = rawInvData.map((item) => ({
        ...item,
        threshold: thresholdMap.get(`${item.facility_id}:${item.medicine_id}`) ?? item.threshold ?? 0,
        facility:
          item.facility ||
          (item.facility_id ? facData.find((facility) => facility.id === item.facility_id) || null : null),
        medicine:
          item.medicine ||
          (item.medicine_id ? medData.find((med) => med.id === item.medicine_id) || null : null),
        origin_facility:
          item.origin_facility ||
          (item.origin_facility_id
            ? facData.find((facility) => facility.id === item.origin_facility_id) || null
            : null),
      }));

      const reconciledInv = await reconcileConfirmedReturnsIntoInventory(invData, {
        facilities: facData,
        medicines: medData,
      });

      const supData = [];
      const dispData = dispensingResult.data || [];

      setInventory(reconciledInv);
      setFacilities(facData);
      setMedicines(medData);
      setSuppliers(supData);
      setDispensingSummary(dispData);

      // Save to local snapshot store for instant offline access!
      saveSnapshot(STORAGE_KEYS.INVENTORY, reconciledInv);
      saveSnapshot(STORAGE_KEYS.FACILITIES, facData);
      saveSnapshot(STORAGE_KEYS.MEDICINES, medData);
      saveSnapshot(STORAGE_KEYS.SUPPLIERS, supData);
      saveSnapshot(STORAGE_KEYS.DISPENSING_SUMMARY, dispData);

      setFacilityFilter((currentFilter) => {
        if (currentFilter === "ALL") {
          return "ALL";
        }
        if (facData.some((facility) => facility.id === currentFilter)) {
          return currentFilter;
        }

        return (
          facData.find((facility) => facility.id === ownFacilityId)?.id ||
          facData[0]?.id ||
          ""
        );
      });
    } catch (err) {
      console.warn("Network error during loadInventory, using cached snapshot:", err);
    } finally {
      setIsLoading(false);
    }
  }, [ownFacilityId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadInventory();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadInventory]);

  useEffect(() => {
    const handleInventoryChange = () => {
      loadInventory(true);
    };
    window.addEventListener("prds:inventory-changed", handleInventoryChange);
    window.addEventListener("prds:stock-returns-changed", handleInventoryChange);
    return () => {
      window.removeEventListener("prds:inventory-changed", handleInventoryChange);
      window.removeEventListener("prds:stock-returns-changed", handleInventoryChange);
    };
  }, [loadInventory]);

  useEffect(() => {
    const channel = supabase
      .channel("inventory-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory" },
        () => {
          loadInventory(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadInventory]);

  const openCreateModal = (_defaultIntakeType = "PROCUREMENT", preselectedMedicineId = "") => {
    setSelectedItem(null);
    const initialItem = createEmptyPoItem();
    if (preselectedMedicineId) {
      initialItem.medicine_id = preselectedMedicineId;
      const adc = consumptionByMedicine[preselectedMedicineId];
      initialItem.threshold = String(calculateDynamicThreshold({ adc, quantity: 0 }));
      initialItem.is_threshold_custom = false;
    }
    const initialValues = {
      ...emptyPoReceiptForm,
      intake_type: "PROCUREMENT",
      facility_id: ownFacilityId || facilities[0]?.id || "",
      date_received: new Date().toISOString().slice(0, 10),
      items: [initialItem],
    };
    setFormValues(initialValues);
    formSnapshotRef.current = initialValues;
    setInventoryError("");
    setModalMode("create");
  };

  const handleSort = (key) => {
    setInventorySort((currentSort) =>
      currentSort.key === key
        ? { key, direction: currentSort.direction === "ASC" ? "DESC" : "ASC" }
        : { key, direction: "ASC" }
    );
    setCurrentPage(1);
  };

  const handleMedicineOrder = (direction) => {
    setInventorySort({ key: "medicine", direction });
    setCurrentPage(1);
  };

  const selectFacility = (facilityId) => {
    setFacilityFilter(facilityId);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFacilityFilter(isBhw ? (ownFacilityId || "") : (defaultFacilityId || ""));
    setStockFilter("ALL");
    setCurrentPage(1);
  };

  const toggleStockFilter = (value) => {
    setStockFilter((currentFilter) => (currentFilter === value ? "ALL" : value));
    setCurrentPage(1);
  };

  const selectInventoryTab = (tab) => {
    const validTab = tab === "EXPIRED" ? "EXPIRED" : tab === "RETURNED" ? "RETURNED" : "DISPENSABLE";
    setInventoryTab(validTab);
    setStockFilter("ALL");
    setSearchTerm("");
    setCurrentPage(1);
  };

  const handleExportExcel = () => {
    if (inventoryTab === "RETURNED") {
      const headers = [
        "Medicine",
        "Brand",
        "Dosage",
        "Unit of Measurement",
        "Lot Number",
        "Return ID",
        "Returning Station",
        "Active Quantity",
        ...(!isBhw ? ["Unit Cost (PHP)", "Total Value (PHP)"] : []),
        "Expiration Date",
        "Status",
      ];

      const rows = sortedInventory.map((item) => {
        const unitCost = Number(item.unit_cost || item.medicine?.unit_cost || 0);
        const qty = Number(item.quantity || 0);
        const total = qty * unitCost;

        return [
          getMedicineName(item),
          item.brand_name || item.medicine?.brand_name || "",
          item.medicine?.dosage || "",
          item.medicine?.unit_of_measure || "",
          (item.lots || [item]).map((lot) => normalizeLotNumber(lot.batch_number)).filter(Boolean).join(" | "),
          (item.lots || [item]).map((lot) => lot.po_number).filter(Boolean).join(" | "),
          (item.lots || [item]).map((lot) => lot.origin_facility?.facility_name || lot.supplier_name || "").filter(Boolean).join(" | "),
          qty,
          ...(!isBhw ? [unitCost.toFixed(2), total.toFixed(2)] : []),
          item.expiration_date ? new Date(item.expiration_date).toISOString().slice(0, 10) : "",
          "Available for Dispensing",
        ];
      });

      downloadExportFile({
        filename: `PRDS-Returned-Stock-Inventory-${new Date().toISOString().slice(0, 10)}.xlsx`,
        headers,
        rows,
      });
      return;
    }

    if (inventoryTab === "EXPIRED") {
      const headers = [
        "Medicine",
        "Brand",
        "Unit of Measurement",
        "Lot Number",
        "Facility",
        ...(!isBhw ? ["Supplier"] : []),
        "Expired Quantity",
        ...(!isBhw ? ["Unit Cost (PHP)", "Estimated Loss (PHP)"] : []),
        "Date Expired",
        "Days Expired",
        "Disposal Status",
        "Last Updated",
      ];

      const rows = sortedInventory.map((item) => {
        const unitCost = Number(item.medicine?.unit_cost || 0);
        const qty = Number(item.quantity || 0);
        const loss = qty * unitCost;
        const days = daysUntilExpiry(item.expiration_date);
        const daysExpired = days !== null && days < 0 ? Math.abs(days) : 0;

        return [
          getMedicineName(item),
          item.brand_name || item.medicine?.brand_name || "",
          item.medicine?.unit_of_measure || "",
          (item.lots || [item]).map((lot) => normalizeLotNumber(lot.batch_number)).filter(Boolean).join(" | "),
          item.facility?.facility_name || "",
          ...(!isBhw ? [(item.lots || [item]).map((lot) => lot.supplier_name || lot.supplier?.supplier_name).filter(Boolean).join(" | ")] : []),
          qty,
          ...(!isBhw ? [unitCost.toFixed(2), loss.toFixed(2)] : []),
          item.expiration_date ? new Date(item.expiration_date).toISOString().slice(0, 10) : "",
          daysExpired,
          "Pending Condemnation",
          item.updated_at ? new Date(item.updated_at).toLocaleDateString("en-US") : "",
        ];
      });

      downloadExportFile({
        filename: `expired-stocks-condemnation-${new Date().toISOString().slice(0, 10)}`,
        headers,
        rows,
        recordCount: rows.length,
      });
      return;
    }

    const headers = [
      "Medicine",
      "Brand",
      "Unit of Measurement",
      "Lot Number",
      "Facility",
      ...(!isBhw ? ["Supplier"] : []),
      "Quantity",
      "Threshold",
      "Status",
      "Est. Daily Consumption",
      "Days of Supply",
      "Expiration Date",
      "Last Updated",
    ];

    const rows = sortedInventory.map((item) => {
      const status = getStockStatus(item);
      const adc = consumptionByMedicine[item.medicine_id];
      const daysOfSupply = adc
        ? Math.floor(Number(item.quantity || 0) / adc)
        : "";

      return [
        getMedicineName(item),
        item.brand_name || item.medicine?.brand_name || "",
        item.medicine?.unit_of_measure || "",
        (item.lots || [item]).map((lot) => normalizeLotNumber(lot.batch_number)).filter(Boolean).join(" | "),
        item.facility?.facility_name || "",
        ...(!isBhw ? [(item.lots || [item]).map((lot) => lot.supplier_name || lot.supplier?.supplier_name).filter(Boolean).join(" | ")] : []),
        item.quantity,
        item.threshold,
        status.label,
        adc ? Math.round(adc * 30) : "",
        daysOfSupply || "",
        item.expiration_date ? new Date(item.expiration_date).toISOString().slice(0, 10) : "",
        item.updated_at ? new Date(item.updated_at).toLocaleDateString("en-US") : "",
      ];
    });

    downloadExportFile({
      filename: `inventory-export-${new Date().toISOString().slice(0, 10)}`,
      headers,
      rows,
      recordCount: rows.length,
    });
  };

  const openItemModal = (item, mode) => {
    setSelectedItem(item);
    const initialValues = {
      facility_id: item.facility_id,
      medicine_id: item.medicine_id,
      brand_name: item.brand_name || "",
      supplier_name: item.supplier_name || item.supplier?.supplier_name || "",
      supplier_address: item.supplier_address || item.supplier?.address || "",
      supplier_contact: item.supplier_contact || item.supplier?.contact_number || "",
      origin_facility_id: null,
      intake_type: "PROCUREMENT",
      return_reason: null,
      quantity: String(item.quantity ?? ""),
      threshold: String(item.threshold ?? ""),
      batch_number: item.batch_number || "",
      po_number: item.po_number || "",
      unit_cost: item.unit_cost !== null && item.unit_cost !== undefined ? String(item.unit_cost) : "",
      date_received: item.date_received || "",
      expiration_date: item.expiration_date || "",
    };
    setFormValues(initialValues);
    formSnapshotRef.current = initialValues;
    setInventoryError("");
    setModalMode(mode);
  };

  const closeModal = () => {
    if (isSaving) {
      return;
    }

    setModalMode(null);
    setSelectedItem(null);
    setFormValues(emptyInventoryForm);
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((currentValues) => ({
      ...currentValues,
      [name]:
        name === "batch_number"
          ? normalizeLotNumber(value)
          : name === "po_number"
            ? normalizePoNumber(value)
            : value,
    }));
  };

  const handlePoItemChange = (itemId, field, value) => {
    setFormValues((currentValues) => {
      const currentItems = currentValues.items || [];
      const updatedItems = currentItems.map((item) => {
        if (item.id !== itemId) return item;
        let formattedValue = value;
        if (field === "batch_number") {
          formattedValue = normalizeLotNumber(value);
        }

        const nextItem = {
          ...item,
          [field]: formattedValue,
        };

        if (field === "medicine_id") {
          // Check if facility already has an established threshold for this medicine
          const existingInv = inventory.find(
            (inv) =>
              inv.facility_id === currentValues.facility_id &&
              inv.medicine_id === value &&
              Number(inv.threshold) > 0
          );
          if (existingInv) {
            nextItem.threshold = String(existingInv.threshold);
            nextItem.is_threshold_custom = true;
          } else if (!item.is_threshold_custom) {
            const adc = consumptionByMedicine[value];
            nextItem.threshold = String(
              calculateDynamicThreshold({ adc, quantity: item.quantity })
            );
            nextItem.is_threshold_custom = false;
          }
        } else if (field === "quantity") {
          if (!item.is_threshold_custom) {
            const existingInv = inventory.find(
              (inv) =>
                inv.facility_id === currentValues.facility_id &&
                inv.medicine_id === item.medicine_id &&
                Number(inv.threshold) > 0
            );
            if (existingInv) {
              nextItem.threshold = String(existingInv.threshold);
              nextItem.is_threshold_custom = true;
            } else {
              const adc = consumptionByMedicine[item.medicine_id];
              if (!adc || adc <= 0) {
                nextItem.threshold = String(
                  calculateDynamicThreshold({ adc: null, quantity: value })
                );
              }
            }
          }
        } else if (field === "threshold") {
          nextItem.is_threshold_custom = true;
        } else if (field === "threshold_reset") {
          const adc = consumptionByMedicine[item.medicine_id];
          nextItem.threshold = String(
            calculateDynamicThreshold({ adc, quantity: item.quantity })
          );
          nextItem.is_threshold_custom = false;
        }

        return nextItem;
      });
      return {
        ...currentValues,
        items: updatedItems,
      };
    });
  };

  const handleAddPoItem = () => {
    setFormValues((currentValues) => {
      const currentItems = currentValues.items || [];
      return {
        ...currentValues,
        items: [...currentItems, createEmptyPoItem()],
      };
    });
  };

  const handleRemovePoItem = (itemId) => {
    setFormValues((currentValues) => {
      const currentItems = currentValues.items || [];
      if (currentItems.length <= 1) {
        return {
          ...currentValues,
          items: [createEmptyPoItem()],
        };
      }
      return {
        ...currentValues,
        items: currentItems.filter((item) => item.id !== itemId),
      };
    });
  };

  const validateForm = () => {
    if (modalMode === "create") {
      if (!formValues.facility_id) {
        return "Inventory location could not be detected. Please reload the page and try again.";
      }

      if (!formValues.po_number?.trim()) {
        return "Purchase Order (PO) number is required.";
      }

      if (isPoNumberUsed(formValues.po_number, inventory, null, formValues.facility_id)) {
        return `Purchase Order (PO) number "${formValues.po_number}" is already used in existing inventory. PO numbers must be unique.`;
      }

      if (!formValues.supplier_name?.trim()) {
        return "Supplier name is required for this Purchase Order.";
      }

      if (!formValues.date_received) {
        return "Date received is required.";
      }

      const items = formValues.items || [];
      if (items.length === 0) {
        return "At least one medicine item is required.";
      }

      const seenLots = new Set();
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const rowNum = i + 1;

        if (!item.medicine_id) {
          return `Line #${rowNum}: Please select a medicine.`;
        }

        const normLot = normalizeLotNumber(item.batch_number);
        if (!normLot) {
          return `Line #${rowNum}: Lot Number is required and must contain alphanumeric characters.`;
        }

        if (seenLots.has(normLot)) {
          return `Line #${rowNum}: Duplicate Lot Number "${item.batch_number}" detected in this PO batch. Each medicine box must have a unique Lot Number.`;
        }
        seenLots.add(normLot);

        if (isLotNumberUsed(item.batch_number, inventory, null, formValues.facility_id)) {
          return `Line #${rowNum}: Lot Number "${item.batch_number}" is already used in existing inventory. Lot numbers must be unique.`;
        }

        if (item.quantity === "" || Number(item.quantity) <= 0) {
          return `Line #${rowNum}: Quantity must be greater than zero.`;
        }

        if (item.threshold !== "" && Number(item.threshold) < 0) {
          return `Line #${rowNum}: Minimum threshold cannot be negative.`;
        }

        if (item.unit_cost !== "" && Number(item.unit_cost) < 0) {
          return `Line #${rowNum}: Unit cost cannot be negative.`;
        }

        if (!item.expiration_date) {
          return `Line #${rowNum}: Expiration date is required.`;
        }

        if (!isStrictlyFutureDate(item.expiration_date)) {
          return `Line #${rowNum}: Expiration date must be a future date (cannot be today or in the past).`;
        }

        if (new Date(item.expiration_date) <= new Date(formValues.date_received)) {
          return `Line #${rowNum}: Expiration date must be later than date received.`;
        }
      }

      return "";
    }

    if (!formValues.facility_id) {
      return "Inventory location could not be detected. Please reload the page and try again.";
    }

    if (!formValues.medicine_id) {
      return "Medicine is required.";
    }

    if (!normalizeLotNumber(formValues.batch_number)) {
      return "Lot Number must contain letters and numbers only.";
    }

    const isEditing = Boolean(selectedItem?.id);
    const isLotChanged =
      isEditing &&
      normalizeLotNumber(formValues.batch_number) !== normalizeLotNumber(selectedItem?.batch_number);

    if (
      (!isEditing || isLotChanged) &&
      formValues.batch_number &&
      isLotNumberUsed(formValues.batch_number, inventory, selectedItem?.id, formValues.facility_id)
    ) {
      return `Lot Number "${formValues.batch_number}" is already used in another inventory record.`;
    }

    const isPoChanged =
      isEditing &&
      normalizePoNumber(formValues.po_number) !== normalizePoNumber(selectedItem?.po_number);

    if (
      (!isEditing || isPoChanged) &&
      formValues.po_number &&
      isPoNumberUsed(formValues.po_number, inventory, selectedItem?.id, formValues.facility_id)
    ) {
      return `Purchase Order (PO) number "${formValues.po_number}" is already used in another inventory record.`;
    }

    if (Number(formValues.quantity) < 0 || formValues.quantity === "") {
      return "Quantity must be zero or higher.";
    }

    if (Number(formValues.threshold) < 0 || formValues.threshold === "") {
      return "Threshold must be zero or higher.";
    }

    if (formValues.unit_cost !== "" && Number(formValues.unit_cost) < 0) {
      return "Unit cost cannot be negative.";
    }

    if (!formValues.date_received || !formValues.expiration_date) {
      return "Date received and expiration date are required.";
    }

    if (!isStrictlyFutureDate(formValues.expiration_date)) {
      return "Expiration date must be a future date (cannot be today or in the past).";
    }

    if (new Date(formValues.expiration_date) <= new Date(formValues.date_received)) {
      return "Expiration date must be later than date received.";
    }

    return "";
  };

  const handleSaveInventory = async (event) => {
    event?.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setInventoryError(validationError);
      return;
    }

    const isEditing = Boolean(selectedItem?.id);

    if (isEditing && !formHasChanges()) {
      setInventoryError("");
      closeModal();
      return;
    }

    setIsSaving(true);
    setInventoryError("");

    const resolveSupplier = async () => null;

    if (!isEditing) {
      // Create mode: Multi-item PO batch
      const generatedPoNumber = normalizePoNumber(formValues.po_number);
      const supplierName = (formValues.supplier_name || "").trim() || null;
      const supplierAddress = (formValues.supplier_address || "").trim() || null;
      const supplierContact = (formValues.supplier_contact || "").trim() || null;

      const thresholdsToUpsert = (formValues.items || []).map((item) => ({
        facility_id: formValues.facility_id,
        medicine_id: item.medicine_id,
        threshold:
          item.threshold !== ""
            ? Number(item.threshold)
            : calculateDynamicThreshold({
                adc: consumptionByMedicine[item.medicine_id],
                quantity: item.quantity,
              }),
        is_custom: Boolean(item.is_threshold_custom),
        updated_at: new Date().toISOString(),
      }));

      const recordsToInsert = (formValues.items || []).map((item) => {
        const id = item.id || crypto.randomUUID();
        const med = medicines.find((m) => m.id === item.medicine_id);
        const brandName = (item.brand_name || med?.brand_name || "").trim();
        return {
          id,
          facility_id: formValues.facility_id,
          intake_type: "PROCUREMENT",
          return_reason: null,
          status: "ACTIVE",
          po_number: generatedPoNumber,
          date_received: formValues.date_received,
          medicine_id: item.medicine_id,
          brand_name: brandName || null,
          supplier_name: supplierName,
          supplier_address: supplierAddress,
          supplier_contact: supplierContact,
          batch_number: normalizeLotNumber(item.batch_number),
          quantity: Number(item.quantity),
          unit_cost: item.unit_cost !== "" && item.unit_cost !== null ? Number(item.unit_cost) : 0,
          expiration_date: item.expiration_date,
          updated_at: new Date().toISOString(),
        };
      });

      const isOnline = isCurrentNetworkOnline();

      if (!isOnline) {
        if (isTauriEnvironment()) {
          try {
            const db = await getSqliteDb();
            for (const rec of recordsToInsert) {
              await db.execute(
                `INSERT OR REPLACE INTO inventory (id, facility_id, medicine_id, quantity, batch_number, po_number, unit_cost, date_received, expiration_date, origin_facility_id, intake_type, return_reason, status, brand_name, supplier_name, supplier_address, supplier_contact, data_json, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
                [
                  rec.id,
                  rec.facility_id,
                  rec.medicine_id,
                  rec.quantity,
                  rec.batch_number,
                  rec.po_number,
                  rec.unit_cost,
                  rec.date_received,
                  rec.expiration_date,
                  rec.origin_facility_id,
                  rec.intake_type,
                  rec.return_reason,
                  rec.status,
                  rec.brand_name,
                  rec.supplier_name,
                  rec.supplier_address,
                  rec.supplier_contact,
                  JSON.stringify(rec),
                  rec.updated_at,
                ]
              );
            }
            for (const thr of thresholdsToUpsert) {
              await db.execute(
                `INSERT INTO facility_medicine_thresholds (id, facility_id, medicine_id, threshold, is_custom, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT(facility_id, medicine_id) DO UPDATE SET threshold = excluded.threshold, is_custom = excluded.is_custom, updated_at = excluded.updated_at`,
                [crypto.randomUUID(), thr.facility_id, thr.medicine_id, thr.threshold, thr.is_custom ? 1 : 0, thr.updated_at]
              );
            }
          } catch (dbErr) {
            console.warn("Failed to write to local SQLite on offline save inventory:", dbErr);
          }
        }

        const offlineRecords = [];
        for (const payload of recordsToInsert) {
          const { origin_facility_id, intake_type, return_reason, status, po_number, unit_cost, brand_name, supplier_name, supplier_address, supplier_contact, ...standardPayload } = payload;
          const insertPayload = createOfflineInsertPayload({ id: payload.id, ...standardPayload });
          const newRecord = {
            ...payload,
            id: insertPayload.id,
            facility: facilities.find((f) => f.id === payload.facility_id),
            origin_facility: facilities.find((f) => f.id === payload.origin_facility_id),
            medicine: medicines.find((m) => m.id === payload.medicine_id),
            supplier: null,
          };
          await enqueueMutation({
            mutationType: "INSERT",
            target: "inventory",
            payload: insertPayload,
          });
          offlineRecords.push(newRecord);
        }

        setInventory((prev) => {
          const next = [...offlineRecords, ...prev];
          saveSnapshot(STORAGE_KEYS.INVENTORY, next);
          return next;
        });

        setIsSaving(false);
        closeModal();
        return;
      }

      try {
        if (isTauriEnvironment()) {
          try {
            const db = await getSqliteDb();
            for (const rec of recordsToInsert) {
              await db.execute(
                `INSERT OR REPLACE INTO inventory (id, facility_id, medicine_id, quantity, batch_number, po_number, unit_cost, date_received, expiration_date, origin_facility_id, intake_type, return_reason, status, brand_name, supplier_name, supplier_address, supplier_contact, data_json, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
                [
                  rec.id,
                  rec.facility_id,
                  rec.medicine_id,
                  rec.quantity,
                  rec.batch_number,
                  rec.po_number,
                  rec.unit_cost,
                  rec.date_received,
                  rec.expiration_date,
                  rec.origin_facility_id,
                  rec.intake_type,
                  rec.return_reason,
                  rec.status,
                  rec.brand_name,
                  rec.supplier_name,
                  rec.supplier_address,
                  rec.supplier_contact,
                  JSON.stringify(rec),
                  rec.updated_at,
                ]
              );
            }
            for (const thr of thresholdsToUpsert) {
              await db.execute(
                `INSERT INTO facility_medicine_thresholds (id, facility_id, medicine_id, threshold, is_custom, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT(facility_id, medicine_id) DO UPDATE SET threshold = excluded.threshold, is_custom = excluded.is_custom, updated_at = excluded.updated_at`,
                [crypto.randomUUID(), thr.facility_id, thr.medicine_id, thr.threshold, thr.is_custom ? 1 : 0, thr.updated_at]
              );
            }
          } catch (dbErr) {
            console.warn("Failed to write to local SQLite on save inventory:", dbErr);
          }
        }

        if (thresholdsToUpsert.length > 0) {
          try {
            await supabase
              .from("facility_medicine_thresholds")
              .upsert(thresholdsToUpsert, { onConflict: "facility_id,medicine_id" });
          } catch (thrErr) {
            console.warn("Could not upsert facility_medicine_thresholds:", thrErr);
          }
        }

        let insertRes = await supabase.from("inventory").insert(recordsToInsert);

        if (insertRes.error) {
          if (
            insertRes.error.code === "42703" ||
            String(insertRes.error.message || "").toLowerCase().includes("does not exist") ||
            String(insertRes.error.message || "").toLowerCase().includes("column")
          ) {
            const fallbackRecords = recordsToInsert.map((rec) => {
              const { origin_facility_id, intake_type, return_reason, status, po_number, unit_cost, brand_name, supplier_name, supplier_address, supplier_contact, ...rest } = rec;
              return { id: rec.id, ...rest };
            });
            insertRes = await supabase.from("inventory").insert(fallbackRecords);
          }
        }

        if (insertRes.error) {
          throw insertRes.error;
        }

        setIsSaving(false);
        closeModal();
        await loadInventory();
      } catch (error) {
        const isNetworkErr =
          !isCurrentNetworkOnline() ||
          error.message?.includes("Failed to fetch") ||
          error.message?.includes("NetworkError");

        if (isNetworkErr) {
          if (isTauriEnvironment()) {
            try {
              const db = await getSqliteDb();
              for (const rec of recordsToInsert) {
                await db.execute(
                  `INSERT OR REPLACE INTO inventory (id, facility_id, medicine_id, supplier_id, quantity, batch_number, po_number, unit_cost, date_received, expiration_date, origin_facility_id, intake_type, return_reason, status, updated_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
                  [
                    rec.id || crypto.randomUUID(),
                    rec.facility_id,
                    rec.medicine_id,
                    rec.supplier_id,
                    rec.quantity,
                    rec.batch_number,
                    rec.po_number,
                    rec.unit_cost,
                    rec.date_received,
                    rec.expiration_date,
                    rec.origin_facility_id,
                    rec.intake_type,
                    rec.return_reason,
                    rec.status,
                    rec.updated_at,
                  ]
                );
              }
            } catch (dbErr) {
              console.warn("Failed to write to local SQLite on offline save inventory:", dbErr);
            }
          }

          const offlineRecords = [];
          for (const payload of recordsToInsert) {
            const { origin_facility_id, intake_type, return_reason, status, po_number, unit_cost, ...standardPayload } = payload;
            const insertPayload = createOfflineInsertPayload(standardPayload);
            const newRecord = {
              ...payload,
              id: insertPayload.id,
              facility: facilities.find((f) => f.id === payload.facility_id),
              origin_facility: facilities.find((f) => f.id === payload.origin_facility_id),
              medicine: medicines.find((m) => m.id === payload.medicine_id),
              supplier: suppliers.find((s) => s.id === payload.supplier_id),
            };
            await enqueueMutation({
              mutationType: "INSERT",
              target: "inventory",
              payload: insertPayload,
            });
            offlineRecords.push(newRecord);
          }

          setInventory((prev) => {
            const next = [...offlineRecords, ...prev];
            saveSnapshot(STORAGE_KEYS.INVENTORY, next);
            return next;
          });

          setIsSaving(false);
          closeModal();
        } else {
          setInventoryError(error.message || "Failed to record inventory batch.");
          setIsSaving(false);
        }
      }
      return;
    }

    // Edit mode: single lot update
    const payload = {
      facility_id: formValues.facility_id,
      medicine_id: formValues.medicine_id,
      brand_name: formValues.brand_name?.trim() || null,
      supplier_name: formValues.supplier_name?.trim() || null,
      supplier_address: formValues.supplier_address?.trim() || null,
      supplier_contact: formValues.supplier_contact?.trim() || null,
      quantity: Number(formValues.quantity),
      threshold: Number(formValues.threshold ?? selectedItem?.threshold ?? 0),
      batch_number: normalizeLotNumber(formValues.batch_number),
      po_number: normalizePoNumber(formValues.po_number) || null,
      unit_cost: formValues.unit_cost !== "" && formValues.unit_cost !== null ? Number(formValues.unit_cost) : null,
      date_received: formValues.date_received,
      expiration_date: formValues.expiration_date,
      updated_at: new Date().toISOString(),
    };

    const isOnline = isCurrentNetworkOnline();

    if (!isOnline) {
      await enqueueMutation({
        mutationType: "RPC",
        target: "update_inventory_batch",
        payload: {
          p_batch_number: payload.batch_number,
          p_date_received: payload.date_received,
          p_expiration_date: payload.expiration_date,
          p_inventory_id: selectedItem.id,
          p_po_number: payload.po_number || null,
          p_quantity: payload.quantity,
          p_supplier_id: null,
          p_threshold: payload.threshold,
          p_unit_cost:
            payload.unit_cost !== "" && payload.unit_cost !== null && !isNaN(payload.unit_cost)
              ? Number(payload.unit_cost)
              : null,
          p_brand_name: payload.brand_name || null,
          p_supplier_name: payload.supplier_name || null,
          p_supplier_address: payload.supplier_address || null,
          p_supplier_contact: payload.supplier_contact || null,
        },
      });
      if (isTauriEnvironment()) {
        try {
          const db = await getSqliteDb();
          await db.execute(
            `UPDATE inventory SET batch_number = $1, date_received = $2, expiration_date = $3, quantity = $4, po_number = $5, unit_cost = $6, origin_facility_id = $7, intake_type = $8, return_reason = $9, brand_name = $10, supplier_name = $11, supplier_address = $12, supplier_contact = $13, updated_at = $14 WHERE id = $15`,
            [
              payload.batch_number,
              payload.date_received,
              payload.expiration_date,
              payload.quantity,
              payload.po_number,
              payload.unit_cost,
              null,
              "PROCUREMENT",
              null,
              payload.brand_name,
              payload.supplier_name,
              payload.supplier_address,
              payload.supplier_contact,
              payload.updated_at,
              selectedItem.id,
            ]
          );
          if (payload.threshold !== undefined && payload.threshold !== null) {
            await db.execute(
              `INSERT INTO facility_medicine_thresholds (id, facility_id, medicine_id, threshold, is_custom, updated_at)
               VALUES ($1, $2, $3, $4, 1, $5)
               ON CONFLICT(facility_id, medicine_id) DO UPDATE SET threshold = excluded.threshold, is_custom = 1, updated_at = excluded.updated_at`,
              [crypto.randomUUID(), payload.facility_id, payload.medicine_id, payload.threshold, payload.updated_at]
            );
          }
        } catch (dbErr) {
          console.warn("Failed to update local SQLite on batch edit:", dbErr);
        }
      }
      setInventory((prev) => {
        const next = prev.map((item) =>
          item.id === selectedItem.id
            ? {
                ...item,
                ...payload,
                origin_facility_id: null,
                intake_type: "PROCUREMENT",
                return_reason: null,
              }
            : item
        );
        saveSnapshot(STORAGE_KEYS.INVENTORY, next);
        return next;
      });
      setIsSaving(false);
      closeModal();
      return;
    }

    try {
      let rpcResult = await supabase.rpc("update_inventory_batch", {
        p_batch_number: payload.batch_number,
        p_date_received: payload.date_received,
        p_expiration_date: payload.expiration_date,
        p_inventory_id: selectedItem.id,
        p_po_number: payload.po_number || null,
        p_quantity: payload.quantity,
        p_supplier_id: null,
        p_threshold: payload.threshold,
        p_unit_cost:
          payload.unit_cost !== "" && payload.unit_cost !== null && !isNaN(payload.unit_cost)
            ? Number(payload.unit_cost)
            : null,
        p_brand_name: payload.brand_name || null,
        p_supplier_name: payload.supplier_name || null,
        p_supplier_address: payload.supplier_address || null,
        p_supplier_contact: payload.supplier_contact || null,
      });

      if (rpcResult.error) {
        // Fallback for older RPC signature if 13-param signature is not yet reloaded
        rpcResult = await supabase.rpc("update_inventory_batch", {
          p_batch_number: payload.batch_number,
          p_date_received: payload.date_received,
          p_expiration_date: payload.expiration_date,
          p_inventory_id: selectedItem.id,
          p_po_number: payload.po_number || null,
          p_quantity: payload.quantity,
          p_supplier_id: null,
          p_threshold: payload.threshold,
          p_unit_cost:
            payload.unit_cost !== "" && payload.unit_cost !== null && !isNaN(payload.unit_cost)
              ? Number(payload.unit_cost)
              : null,
          p_brand_name: payload.brand_name || null,
        });
      }

      if (rpcResult.error) {
        throw rpcResult.error;
      }

      if (isTauriEnvironment()) {
        try {
          const db = await getSqliteDb();
          await db.execute(
            `UPDATE inventory SET batch_number = $1, date_received = $2, expiration_date = $3, quantity = $4, po_number = $5, unit_cost = $6, origin_facility_id = $7, intake_type = $8, return_reason = $9, brand_name = $10, supplier_name = $11, supplier_address = $12, supplier_contact = $13, updated_at = $14 WHERE id = $15`,
            [
              payload.batch_number,
              payload.date_received,
              payload.expiration_date,
              payload.quantity,
              payload.po_number,
              payload.unit_cost,
              null,
              "PROCUREMENT",
              null,
              payload.brand_name,
              payload.supplier_name,
              payload.supplier_address,
              payload.supplier_contact,
              payload.updated_at,
              selectedItem.id,
            ]
          );
          if (payload.threshold !== undefined && payload.threshold !== null) {
            await db.execute(
              `INSERT INTO facility_medicine_thresholds (id, facility_id, medicine_id, threshold, is_custom, updated_at)
               VALUES ($1, $2, $3, $4, 1, $5)
               ON CONFLICT(facility_id, medicine_id) DO UPDATE SET threshold = excluded.threshold, is_custom = 1, updated_at = excluded.updated_at`,
              [crypto.randomUUID(), payload.facility_id, payload.medicine_id, payload.threshold, payload.updated_at]
            );
          }
        } catch (dbErr) {
          console.warn("Failed to update local SQLite on batch edit:", dbErr);
        }
      }

      setIsSaving(false);
      closeModal();
      await loadInventory();
    } catch (error) {
      const isNetworkErr =
        !isCurrentNetworkOnline() ||
        error.message?.includes("Failed to fetch") ||
        error.message?.includes("NetworkError");

      if (isNetworkErr) {
        await enqueueMutation({
          mutationType: "RPC",
          target: "update_inventory_batch",
          payload: {
            p_batch_number: payload.batch_number,
            p_date_received: payload.date_received,
            p_expiration_date: payload.expiration_date,
            p_inventory_id: selectedItem.id,
            p_po_number: payload.po_number || null,
            p_quantity: payload.quantity,
            p_supplier_id: null,
            p_threshold: payload.threshold,
            p_unit_cost:
              payload.unit_cost !== "" && payload.unit_cost !== null && !isNaN(payload.unit_cost)
                ? Number(payload.unit_cost)
                : null,
            p_brand_name: payload.brand_name || null,
          },
        });
        setInventory((prev) => {
          const next = prev.map((item) =>
            item.id === selectedItem.id ? { ...item, ...payload } : item
          );
          saveSnapshot(STORAGE_KEYS.INVENTORY, next);
          return next;
        });
        setIsSaving(false);
        closeModal();
      } else {
        setInventoryError(error.message || "Failed to update inventory batch.");
        setIsSaving(false);
      }
    }
  };

  const handleDisposeStock = async (lot, { method, remarks } = {}) => {
    if (!lot?.id) return false;
    setIsSaving(true);
    setInventoryError("");

    const disposalMethod = method || "LGU City Health Condemnation Protocol";
    const nowIso = new Date().toISOString();
    const updatedLot = {
      ...lot,
      status: "DISPOSED",
      quantity: 0,
      disposed_at: nowIso,
      disposal_method: disposalMethod,
      disposed_by: profile?.id,
      updated_at: nowIso,
    };

    const isOnline = isCurrentNetworkOnline();

    if (!isOnline) {
      await enqueueMutation({
        mutationType: "UPDATE",
        target: "inventory",
        payload: {
          id: lot.id,
          quantity: 0,
          updated_at: nowIso,
        },
      });

      if (isTauriEnvironment()) {
        try {
          const db = await getSqliteDb();
          await db.execute(
            `UPDATE inventory SET status = 'DISPOSED', quantity = 0, disposed_at = $1, disposal_method = $2, disposed_by = $3, updated_at = $4 WHERE id = $5`,
            [nowIso, disposalMethod, profile?.id, nowIso, lot.id]
          );
        } catch (dbErr) {
          console.warn("Failed to update local SQLite on stock disposal:", dbErr);
        }
      }

      setInventory((prev) => {
        const next = prev.map((item) => (item.id === lot.id ? updatedLot : item));
        saveSnapshot(STORAGE_KEYS.INVENTORY, next);
        return next;
      });

      setIsSaving(false);
      closeModal();
      return true;
    }

    try {
      const { error } = await supabase
        .from("inventory")
        .update({
          quantity: 0,
          updated_at: nowIso,
        })
        .eq("id", lot.id);

      if (error) {
        throw error;
      }

      try {
        await supabase.from("activity_logs").insert({
          user_id: profile?.id,
          action: "Stock Disposed",
          module: "Inventory",
          details: `Disposed ${lot.quantity || 0} units of ${getMedicineName(lot)} (Lot #${lot.batch_number || "N/A"}) due to expiration. Method: ${disposalMethod}${remarks ? ` (${remarks})` : ""}`,
        });
      } catch (logErr) {
        console.warn("Disposal activity log write skipped:", logErr);
      }

      if (isTauriEnvironment()) {
        try {
          const db = await getSqliteDb();
          await db.execute(
            `UPDATE inventory SET status = 'DISPOSED', quantity = 0, disposed_at = $1, disposal_method = $2, disposed_by = $3, updated_at = $4 WHERE id = $5`,
            [nowIso, disposalMethod, profile?.id, nowIso, lot.id]
          );
        } catch (dbErr) {
          console.warn("Failed to update local SQLite on stock disposal:", dbErr);
        }
      }

      setInventory((prev) => {
        const next = prev.map((item) => (item.id === lot.id ? updatedLot : item));
        saveSnapshot(STORAGE_KEYS.INVENTORY, next);
        return next;
      });

      setIsSaving(false);
      closeModal();
      await loadInventory();
      return true;
    } catch (err) {
      console.error("Disposal error:", err);
      setInventory((prev) => {
        const next = prev.map((item) => (item.id === lot.id ? updatedLot : item));
        saveSnapshot(STORAGE_KEYS.INVENTORY, next);
        return next;
      });
      setIsSaving(false);
      closeModal();
      return true;
    }
  };

  const handleUpdateThreshold = async ({ medicineId, threshold, facilityId }) => {
    const targetFacilityId = facilityId || profile?.facility_id;
    if (!targetFacilityId) {
      const err = new Error("Facility ID could not be detected. Please reload and try again.");
      setInventoryError(err.message);
      throw err;
    }

    if (isBhw && targetFacilityId !== profile?.facility_id) {
      const err = new Error("You can only edit inventory thresholds for your own barangay health station.");
      setInventoryError(err.message);
      throw err;
    }

    const numericThreshold = Number(threshold);
    if (!Number.isFinite(numericThreshold) || numericThreshold < 0) {
      const err = new Error("Threshold must be zero or higher.");
      setInventoryError(err.message);
      throw err;
    }

    setIsSaving(true);
    setInventoryError("");

    try {
      const isOnline = isCurrentNetworkOnline();

      if (!isOnline) {
        await enqueueMutation({
          mutationType: "RPC",
          target: "update_bhw_inventory_threshold",
          payload: {
            p_medicine_id: medicineId,
            p_threshold: numericThreshold,
            p_facility_id: targetFacilityId,
          },
        });

        if (isTauriEnvironment()) {
          try {
            const db = await getSqliteDb();
            const nowIso = new Date().toISOString();
            await db.execute(
              "INSERT INTO facility_medicine_thresholds (id, facility_id, medicine_id, threshold, is_custom, updated_at) VALUES ($1, $2, $3, $4, 1, $5) ON CONFLICT(facility_id, medicine_id) DO UPDATE SET threshold = excluded.threshold, is_custom = 1, updated_at = excluded.updated_at",
              [crypto.randomUUID(), targetFacilityId, medicineId, numericThreshold, nowIso]
            );
          } catch (dbErr) {
            console.warn("Failed to update local SQLite on threshold update:", dbErr);
          }
        }
      } else {
        const { error } = await supabase.rpc("update_bhw_inventory_threshold", {
          p_medicine_id: medicineId,
          p_threshold: numericThreshold,
          p_facility_id: targetFacilityId,
        });

        if (error) {
          throw error;
        }

        if (isTauriEnvironment()) {
          try {
            const db = await getSqliteDb();
            const nowIso = new Date().toISOString();
            await db.execute(
              "INSERT INTO facility_medicine_thresholds (id, facility_id, medicine_id, threshold, is_custom, updated_at) VALUES ($1, $2, $3, $4, 1, $5) ON CONFLICT(facility_id, medicine_id) DO UPDATE SET threshold = excluded.threshold, is_custom = 1, updated_at = excluded.updated_at",
              [crypto.randomUUID(), targetFacilityId, medicineId, numericThreshold, nowIso]
            );
          } catch (dbErr) {
            console.warn("Failed to update local SQLite cache on threshold update:", dbErr);
          }
        }
      }

      setInventory((prev) => {
        const updated = prev.map((item) => {
          if (item.facility_id === targetFacilityId && item.medicine_id === medicineId) {
            return {
              ...item,
              threshold: numericThreshold,
              is_threshold_custom: true,
              updated_at: new Date().toISOString(),
            };
          }
          return item;
        });
        saveSnapshot(STORAGE_KEYS.INVENTORY, updated);
        return updated;
      });

      return { success: true, threshold: numericThreshold };
    } catch (err) {
      const msg = err.message || "Failed to update inventory threshold.";
      setInventoryError(msg);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    profile,
    canManage,
    ownFacilityId,
    ownFacilityName,
    today,
    inventory,
    facilities,
    medicines,
    suppliers,
    consumptionByMedicine,
    facilityOptions,
    selectedFacility,
    viewingOwnFacility,
    scopeInventory,
    inventoryTab,
    selectInventoryTab,
    dispensableItemCount,
    expiredItemCount,
    returnedItemCount,
    returnedLots,
    summary,
    expiredSummary,
    returnedSummary,
    returnsSummary,
    reorderQtyByItemId,
    searchTerm,
    setSearchTerm,
    facilityFilter,
    stockFilter,
    setStockFilter,
    inventorySort,
    currentPage,
    setCurrentPage,
    isLoading,
    isSaving,
    inventoryError,
    modalMode,
    selectedItem,
    formValues,
    filteredInventory,
    sortedInventory,
    paginatedInventory,
    totalPages,
    hasActiveFilters,
    openCreateModal,
    handleSort,
    handleMedicineOrder,
    selectFacility,
    clearFilters,
    toggleStockFilter,
    handleExportExcel,
    openItemModal,
    closeModal,
    handleFieldChange,
    handlePoItemChange,
    handleAddPoItem,
    handleRemovePoItem,
    handleSaveInventory,
    handleDisposeStock,
    handleUpdateThreshold,
  };
}
