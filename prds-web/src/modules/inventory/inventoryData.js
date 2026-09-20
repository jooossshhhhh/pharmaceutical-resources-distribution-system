import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "../../context/useAuth";
import { supabase } from "../../services/supabase";
import { computeAdc, computeReorderQty } from "./demandUtils";
import {
  buildInventoryImportPayloads,
  emptyInventoryForm,
  formatDateTime,
  getExpiryStatus,
  getMedicineName,
  getStockStatus,
  pageSize,
  parseInventoryCsv,
} from "./inventoryUtils";

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

  const [inventory, setInventory] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [dispensingSummary, setDispensingSummary] = useState([]);
  const [searchTerm, setSearchTerm] = useState(
    () => readStored(`${STORAGE_PREFIX}${profile?.id}:search`) || ""
  );
  const [facilityFilter, setFacilityFilter] = useState(() => {
    const facilityParam = new URLSearchParams(location.search).get("facility");
    if (facilityParam) {
      return facilityParam;
    }
    return readStored(`${STORAGE_PREFIX}${profile?.id}:facility`) || profile?.facility_id || "";
  });
  const [stockFilter, setStockFilter] = useState(() => {
    const stockParam = new URLSearchParams(location.search).get("stock");
    if (stockParam && STOCK_PARAM_MAP[stockParam]) {
      return STOCK_PARAM_MAP[stockParam];
    }
    return readStored(`${STORAGE_PREFIX}${profile?.id}:stock`) || "ALL";
  });
  const [inventorySort, setInventorySort] = useState({ key: "updated_at", direction: "DESC" });
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [inventoryError, setInventoryError] = useState("");
  const [modalMode, setModalMode] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [formValues, setFormValues] = useState(emptyInventoryForm);
  const formSnapshotRef = useRef(null);

  const EDITABLE_FIELDS = [
    "facility_id",
    "medicine_id",
    "supplier_id",
    "quantity",
    "threshold",
    "batch_number",
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

  const viewingOwnFacility = facilityFilter === ownFacilityId;

  const scopeInventory = useMemo(() => {
    if (isBhw || !facilityFilter) {
      return inventory;
    }

    return inventory.filter((item) => item.facility_id === facilityFilter);
  }, [inventory, facilityFilter, isBhw]);

  const selectedFacility = useMemo(
    () => facilities.find((facility) => facility.id === facilityFilter) || null,
    [facilities, facilityFilter]
  );

  const ownFacilityName =
    profile?.facility_name ||
    facilities.find((facility) => facility.id === ownFacilityId)?.facility_name ||
    "Your facility";

  const summary = useMemo(() => {
    return scopeInventory.reduce(
      (counts, item) => {
        const status = getStockStatus(item).key;
        const expiryStatus = getExpiryStatus(item).key;

        counts.totalItems += 1;
        counts.stockedOut += status === "CRITICAL" && Number(item.quantity) === 0 ? 1 : 0;
        counts.critical += status === "CRITICAL" ? 1 : 0;
        counts.low += status === "LOW" ? 1 : 0;
        counts.expired += expiryStatus === "EXPIRED" ? 1 : 0;
        counts.expiring += expiryStatus === "EXPIRED" || expiryStatus === "EXPIRING" ? 1 : 0;

        return counts;
      },
      { totalItems: 0, stockedOut: 0, critical: 0, low: 0, expired: 0, expiring: 0 }
    );
  }, [scopeInventory]);

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
    const scopeIds = isBhw || !facilityFilter ? null : new Set([facilityFilter]);
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
  }, [dispensingSummary, facilityFilter, isBhw]);

  const reorderQtyByItemId = useMemo(() => {
    const map = {};
    scopeInventory.forEach((item) => {
      const adc = consumptionByMedicine[item.medicine_id];
      const reorderQty = adc != null ? computeReorderQty(item.quantity, adc) : 0;
      if (reorderQty > 0) {
        map[item.id] = reorderQty;
      }
    });
    return map;
  }, [scopeInventory, consumptionByMedicine]);

  const preFilteredInventory = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return scopeInventory.filter((item) => {
      const searchableText = [
        item.medicine?.generic_name,
        item.medicine?.brand_name,
        item.medicine?.dosage,
        item.medicine?.unit_of_measure,
        item.facility?.facility_name,
        item.supplier?.supplier_name,
        item.batch_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return !normalizedSearch || searchableText.includes(normalizedSearch);
    });
  }, [scopeInventory, searchTerm]);

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
    const { key, direction } = inventorySort;
    const factor = direction === "ASC" ? 1 : -1;

    return [...filteredInventory].sort((first, second) => {
      let comparison = 0;

      if (key === "medicine") {
        comparison = (first.medicine?.generic_name || "").localeCompare(
          second.medicine?.generic_name || "",
          undefined,
          { sensitivity: "base" }
        );
      } else if (key === "quantity") {
        comparison = Number(first.quantity || 0) - Number(second.quantity || 0);
      } else if (key === "expiration_date") {
        comparison = (first.expiration_date || "").localeCompare(second.expiration_date || "");
      } else if (key === "updated_at") {
        comparison = (first.updated_at || "").localeCompare(second.updated_at || "");
      }

      return comparison * factor;
    });
  }, [filteredInventory, inventorySort]);

  const paginatedInventory = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedInventory.slice(startIndex, startIndex + pageSize);
  }, [currentPage, sortedInventory]);

  const totalPages = Math.max(1, Math.ceil(sortedInventory.length / pageSize));

  const relatedStock = useMemo(() => {
    if (!selectedItem) {
      return [];
    }

    return inventory
      .filter(
        (item) =>
          item.medicine_id === selectedItem.medicine_id &&
          item.facility_id !== selectedItem.facility_id
      )
      .slice(0, 5);
  }, [inventory, selectedItem]);

  const hasActiveFilters = useMemo(() => {
    return (
      searchTerm.trim() !== "" ||
      stockFilter !== "ALL" ||
      (!isBhw && facilityFilter !== ownFacilityId && facilityFilter !== "")
    );
  }, [searchTerm, stockFilter, facilityFilter, ownFacilityId, isBhw]);

  const loadInventory = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    }
    setInventoryError("");

    const [
      inventoryResult,
      facilitiesResult,
      medicinesResult,
      suppliersResult,
      dispensingResult,
    ] = await Promise.all([
      supabase
        .from("inventory")
        .select(`
          id,
          facility_id,
          medicine_id,
          supplier_id,
          quantity,
          threshold,
          batch_number,
          date_received,
          expiration_date,
          updated_at,
          facility:facilities(id, facility_name, facility_code),
          medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure, unit_cost),
          supplier:suppliers(id, supplier_name)
        `)
        .order("updated_at", { ascending: false }),
      supabase
        .from("facilities")
        .select("id, facility_name, facility_code, facility_type")
        .eq("status", "ACTIVE")
        .order("facility_name", { ascending: true }),
      supabase
        .from("medicines")
        .select("id, generic_name, brand_name, dosage, unit_of_measure, unit_cost")
        .order("generic_name", { ascending: true }),
      supabase
        .from("suppliers")
        .select("id, supplier_name")
        .eq("status", "ACTIVE")
        .order("supplier_name", { ascending: true }),
      supabase
        .from("monthly_dispensing_summary")
        .select("facility_id, medicine_id, month, total_dispensed"),
    ]);

    const firstError = [
      inventoryResult,
      facilitiesResult,
      medicinesResult,
      suppliersResult,
      dispensingResult,
    ].find((result) => result.error)?.error;

    if (firstError) {
      setInventoryError(firstError.message);
      setIsLoading(false);
      return;
    }

    setInventory(inventoryResult.data || []);
    setFacilities(facilitiesResult.data || []);
    setMedicines(medicinesResult.data || []);
    setSuppliers(suppliersResult.data || []);
    setDispensingSummary(dispensingResult.data || []);
    setFacilityFilter((currentFilter) => {
      const loaded = facilitiesResult.data || [];
      if (loaded.some((facility) => facility.id === currentFilter)) {
        return currentFilter;
      }

      return (
        loaded.find((facility) => facility.id === ownFacilityId)?.id ||
        loaded[0]?.id ||
        ""
      );
    });
    setIsLoading(false);
  }, [ownFacilityId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadInventory();
    }, 0);

    return () => window.clearTimeout(timerId);
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

  const openCreateModal = () => {
    setSelectedItem(null);
    const initialValues = {
      ...emptyInventoryForm,
      facility_id: ownFacilityId || "",
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

  const selectFacility = (facilityId) => {
    setFacilityFilter(facilityId);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFacilityFilter(ownFacilityId || facilities[0]?.id || "");
    setStockFilter("ALL");
    setCurrentPage(1);
  };

  const toggleStockFilter = (value) => {
    setStockFilter((currentFilter) => (currentFilter === value ? "ALL" : value));
    setCurrentPage(1);
  };

  const handleExportCsv = () => {
    const headers = [
      "Medicine",
      "Brand",
      "Unit",
      "Batch",
      "Facility",
      "Supplier",
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
        item.medicine?.brand_name || "",
        item.medicine?.unit_of_measure || "",
        item.batch_number,
        item.facility?.facility_name || "",
        item.supplier?.supplier_name || "",
        item.quantity,
        item.threshold,
        status.label,
        adc ? Math.round(adc * 30) : "",
        daysOfSupply || "",
        item.expiration_date ? new Date(item.expiration_date).toISOString().slice(0, 10) : "",
        item.updated_at ? new Date(item.updated_at).toLocaleDateString("en-US") : "",
      ];
    });

    const escapeCell = (value) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCell).join(","))
      .join("\n");

    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const openItemModal = (item, mode) => {
    setSelectedItem(item);
    const initialValues = {
      facility_id: item.facility_id,
      medicine_id: item.medicine_id,
      supplier_id: item.supplier_id,
      quantity: String(item.quantity ?? ""),
      threshold: String(item.threshold ?? ""),
      batch_number: item.batch_number || "",
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
      [name]: name === "batch_number" ? value.toUpperCase() : value,
    }));
  };

  const validateForm = () => {
    if (!formValues.facility_id) {
      return "Inventory location could not be detected. Please reload the page and try again.";
    }

    if (!formValues.medicine_id || !formValues.supplier_id) {
      return "Medicine and supplier are required.";
    }

    if (!formValues.batch_number.trim()) {
      return "Batch number is required.";
    }

    if (Number(formValues.quantity) < 0 || formValues.quantity === "") {
      return "Quantity must be zero or higher.";
    }

    if (Number(formValues.threshold) < 0 || formValues.threshold === "") {
      return "Threshold must be zero or higher.";
    }

    if (!formValues.date_received || !formValues.expiration_date) {
      return "Date received and expiration date are required.";
    }

    if (new Date(formValues.expiration_date) <= new Date(formValues.date_received)) {
      return "Expiration date must be later than date received.";
    }

    return "";
  };

  const handleSaveInventory = async (event) => {
    event.preventDefault();

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

    const payload = {
      facility_id: formValues.facility_id,
      medicine_id: formValues.medicine_id,
      supplier_id: formValues.supplier_id,
      quantity: Number(formValues.quantity),
      threshold: Number(formValues.threshold),
      batch_number: formValues.batch_number.trim(),
      date_received: formValues.date_received,
      expiration_date: formValues.expiration_date,
      updated_at: new Date().toISOString(),
    };

    const { error } = isEditing
      ? await supabase.rpc("update_inventory_batch", {
          p_batch_number: payload.batch_number,
          p_date_received: payload.date_received,
          p_expiration_date: payload.expiration_date,
          p_inventory_id: selectedItem.id,
          p_quantity: payload.quantity,
          p_supplier_id: payload.supplier_id,
          p_threshold: payload.threshold,
        })
      : await supabase.from("inventory").insert(payload);

    if (error) {
      setInventoryError(error.message);
      setIsSaving(false);
      return;
    }

    if (!isEditing) {
      const medicineForLog = medicines.find(
        (medicine) => medicine.id === formValues.medicine_id
      );
      const facilityForLog = facilities.find(
        (facility) => facility.id === formValues.facility_id
      );
      const medicineLabel = `${medicineForLog?.generic_name || "Medicine"} ${medicineForLog?.dosage || ""}`.trim();
      const facilityLabel = facilityForLog?.facility_name || "facility";

      const { error: logError } = await supabase.from("activity_logs").insert({
        action: "Stock Added",
        details: `${medicineLabel} (${payload.batch_number}) added at ${facilityLabel}: ${payload.quantity} units.`,
        module: "Inventory",
        user_id: profile?.id,
      });

      if (logError) {
        setInventoryError(logError.message);
        setIsSaving(false);
        return;
      }
    }

    setIsSaving(false);
    closeModal();
    await loadInventory();
  };

  const handleDeleteItem = async (item) => {
    setIsSaving(true);
    setInventoryError("");

    const { error } = await supabase.from("inventory").delete().eq("id", item.id);

    if (error) {
      setInventoryError(error.message);
      setIsSaving(false);
      return false;
    }

    const { error: logError } = await supabase.from("activity_logs").insert({
      action: "Stock Removed",
      details: `${getMedicineName(item)} (${item.batch_number}) removed from ${item.facility?.facility_name || "facility"}.`,
      module: "Inventory",
      user_id: profile?.id,
    });

    if (logError) {
      setInventoryError(logError.message);
      setIsSaving(false);
      return false;
    }

    setIsSaving(false);
    closeModal();
    await loadInventory();
    return true;
  };

  const fetchStockHistory = useCallback(async (item) => {
    const { data, error } = await supabase
      .from("activity_logs")
      .select(`
        id,
        action,
        details,
        created_at,
        user:profiles(id, first_name, last_name, role)
      `)
      .eq("module", "Inventory")
      .ilike("details", `%(${item.batch_number})%`)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return [];
    }

    return data || [];
  }, []);

  const handleImportCsv = async (file) => {
    let text;
    try {
      text = await file.text();
    } catch {
      return {
        imported: 0,
        failed: 1,
        errors: [{ row: 0, message: "Could not read the selected file." }],
        cancelled: true,
      };
    }

    const { rows, errors: parseErrors } = parseInventoryCsv(text);
    const { payloads, errors: buildErrors } = buildInventoryImportPayloads(rows, {
      medicines,
      suppliers,
      facilityId: facilityFilter || ownFacilityId,
    });

    const allErrors = [...parseErrors, ...buildErrors];

    if (payloads.length === 0) {
      return { imported: 0, failed: allErrors.length, errors: allErrors, cancelled: true };
    }

    setIsSaving(true);
    setInventoryError("");

    const chunkSize = 50;
    let imported = 0;
    const failed = [...allErrors];

    for (let index = 0; index < payloads.length; index += chunkSize) {
      const chunk = payloads.slice(index, index + chunkSize);
      const { error } = await supabase.from("inventory").insert(chunk);

      if (error) {
        for (let rowIndex = index; rowIndex < index + chunk.length; rowIndex += 1) {
          failed.push({ row: rowIndex + 2, message: error.message });
        }
      } else {
        imported += chunk.length;
      }
    }

    const { error: logError } = await supabase.from("activity_logs").insert({
      action: "Stock Imported",
      details: `Imported ${imported} stock record(s) into ${selectedFacility?.facility_name || "facility"} via CSV.`,
      module: "Inventory",
      user_id: profile?.id,
    });

    if (logError) {
      setInventoryError(logError.message);
    }

    setIsSaving(false);
    await loadInventory();

    return { imported, failed: failed.length, errors: failed };
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
    summary,
    reorderQtyByItemId,
    searchTerm,
    setSearchTerm,
    facilityFilter,
    stockFilter,
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
    relatedStock,
    hasActiveFilters,
    openCreateModal,
    handleSort,
    selectFacility,
    clearFilters,
    toggleStockFilter,
    handleExportCsv,
    openItemModal,
    closeModal,
    handleFieldChange,
    handleSaveInventory,
    handleDeleteItem,
    fetchStockHistory,
    handleImportCsv,
  };
}
