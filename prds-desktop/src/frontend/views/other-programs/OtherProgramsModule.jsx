import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Edit3,
  FileText,
  Info,
  Pill,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import AdminShell from "../../components/layout/AdminShell";
import ModalShell from "../../components/ModalShell";
import PaginationControls from "../../components/PaginationControls";
import { useAuth } from "../../context/useAuth";
import { logoutUser } from "@backend/services/auth/authService";
import { supabase } from "@backend/client/supabase";
import { getSnapshot, saveSnapshot, STORAGE_KEYS } from "@backend/database/snapshotStore";
import { isCurrentNetworkOnline } from "@backend/sync/networkStatus";
import { usePaginatedRows } from "../../hooks/usePaginatedRows";
import {
  fetchOtherPrograms,
  saveOtherProgram,
  startOtherProgram,
  completeOtherProgram,
  cancelOtherProgram,
  normalizeProgramRecord,
} from "@backend/services/otherProgramsService";

const emptyForm = { program_name: "", program_date: "", description: "", medicines: [] };

const formatDate = (value) => {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
};

const formatDateTime = (date) =>
  new Intl.DateTimeFormat("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

const getTodayIso = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getRelativeDateLabel = (dateStr) => {
  if (!dateStr) return null;
  const today = getTodayIso();
  if (dateStr === today) {
    return { label: "Today", style: "bg-[#E8F5F1] text-[#2D7A5D] ring-[#4C9F80]/30" };
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);
  if (dateStr === tomorrowIso) {
    return { label: "Tomorrow", style: "bg-[#e6f0f7] text-[#34769B] ring-[#34769B]/30" };
  }
  if (dateStr < today) {
    return { label: "Ready to Start", style: "bg-[#FEF6E7] text-[#9A6700] ring-[#D99B26]/30" };
  }
  return null;
};

const getProgramStatus = (program) => {
  const normalized = normalizeProgramRecord(program);
  return normalized?.status || "UPCOMING";
};

const getLineAllocated = (line) =>
  Number(
    (line?.quantity_allocated !== undefined &&
    line?.quantity_allocated !== null &&
    Number(line.quantity_allocated) > 0
      ? line.quantity_allocated
      : null) ??
      line?.quantity_used ??
      0
  );

const getLineReturned = (line, status = "UPCOMING") =>
  status === "COMPLETED"
    ? Math.max(0, Math.min(getLineAllocated(line), Number(line?.quantity_returned || 0)))
    : 0;

const getLineDispensed = (line, status = "UPCOMING") =>
  status === "COMPLETED"
    ? Math.max(0, getLineAllocated(line) - getLineReturned(line, "COMPLETED"))
    : getLineAllocated(line);

const statusClass = {
  UPCOMING: "bg-[#e6f0f7] text-[#34769B] ring-[#34769B]/30",
  ONGOING: "bg-[#FEF6E7] text-[#9A6700] ring-[#D99B26]/40",
  COMPLETED: "bg-[#E8F5F1] text-[#2D7A5D] ring-[#4C9F80]/30",
  CANCELLED: "bg-[#E5EFF1] text-[#5B7077] ring-[#CFDDE0]",
};

const statusLabel = {
  UPCOMING: "Upcoming",
  ONGOING: "Ongoing",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const getErrorMessage = (error) => error?.message || "Unable to save the program.";

const getInventoryMedicines = (rows = []) => {
  const today = new Date().toISOString().slice(0, 10);
  const medicinesById = new Map();

  rows
    .filter(
      (row) =>
        Number(row.quantity) > 0 &&
        (!row.expiration_date || row.expiration_date >= today)
    )
    .forEach((row) => {
      if (row.medicine?.id) {
        medicinesById.set(row.medicine.id, row.medicine);
      }
    });

  return [...medicinesById.values()].sort((first, second) =>
    (first.generic_name || "").localeCompare(second.generic_name || "")
  );
};

export default function OtherProgramsModule() {
  const { profile } = useAuth();
  const [programs, setPrograms] = useState(() =>
    (getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []) || [])
      .map((p) => normalizeProgramRecord(p))
      .filter(Boolean)
  );
  const [inventory, setInventory] = useState(() =>
    getSnapshot(STORAGE_KEYS.INVENTORY, [])
  );
  const [medicines, setMedicines] = useState(() =>
    getInventoryMedicines(getSnapshot(STORAGE_KEYS.INVENTORY, []))
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("date-desc");
  const [isLoading, setIsLoading] = useState(
    () => getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []).length === 0
  );
  const [error, setError] = useState("");
  const [successModal, setSuccessModal] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingProgram, setEditingProgram] = useState(null);
  const [viewingProgram, setViewingProgram] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [reconcilingProgram, setReconcilingProgram] = useState(null);
  const [returnInputs, setReturnInputs] = useState({});
  const [isActionSaving, setIsActionSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const today = useMemo(() => formatDateTime(new Date()), []);
  const todayIso = useMemo(() => getTodayIso(), []);

  const loadPrograms = useCallback(async () => {
    const cachedFacilities = getSnapshot(STORAGE_KEYS.FACILITIES, []);
    const choFacility = cachedFacilities.find(
      (f) => f.facility_type === "CHO" || f.facility_code === "CHO-NAGA"
    );
    const resolvedChoFacilityId =
      choFacility?.id || profile?.facility_id || "0b7e2eaa-1072-4fb1-8e14-d6fb46097aad";

    if (!isCurrentNetworkOnline()) {
      const localPrograms = await fetchOtherPrograms(profile);
      setPrograms(localPrograms);
      const cachedInventory = getSnapshot(STORAGE_KEYS.INVENTORY, []);
      const choInventory = cachedInventory.filter(
        (row) => row.facility_id === resolvedChoFacilityId || !row.facility_id
      );
      setInventory(choInventory.length > 0 ? choInventory : cachedInventory);
      setMedicines(getInventoryMedicines(choInventory.length > 0 ? choInventory : cachedInventory));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    const [fetchedPrograms, inventoryResult, facilitiesResult] = await Promise.all([
      fetchOtherPrograms(profile),
      supabase
        .from("inventory")
        .select(
          "id, facility_id, medicine_id, quantity, expiration_date, medicine:medicines(id, generic_name, dosage, unit_of_measure)"
        )
        .eq("facility_id", resolvedChoFacilityId)
        .gt("quantity", 0),
      cachedFacilities.length === 0
        ? supabase.from("facilities").select("id, facility_name, facility_code, facility_type, status")
        : Promise.resolve({ data: cachedFacilities, error: null }),
    ]);

    if (facilitiesResult?.data?.length) {
      saveSnapshot(STORAGE_KEYS.FACILITIES, facilitiesResult.data);
    }

    setPrograms(Array.isArray(fetchedPrograms) ? fetchedPrograms : []);

    if (!inventoryResult.error && Array.isArray(inventoryResult.data)) {
      setInventory(inventoryResult.data);
      setMedicines(getInventoryMedicines(inventoryResult.data));
      saveSnapshot(STORAGE_KEYS.INVENTORY, inventoryResult.data);
    }
    setIsLoading(false);
  }, [profile]);

  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);

  // Keep viewingProgram synchronized when programs list updates
  useEffect(() => {
    if (!viewingProgram) return;
    const updated = programs.find((p) => String(p.id) === String(viewingProgram.id));
    if (updated) {
      setViewingProgram(updated);
    }
  }, [programs, viewingProgram]);

  // Derived KPI counts
  const counts = useMemo(() => {
    let upcoming = 0;
    let ongoing = 0;
    let completed = 0;
    let cancelled = 0;
    let totalReservedUnits = 0;

    programs.forEach((program) => {
      const status = getProgramStatus(program);
      if (status === "UPCOMING") {
        upcoming += 1;
        (program.medicines || []).forEach((item) => {
          totalReservedUnits += getLineAllocated(item);
        });
      } else if (status === "ONGOING") {
        ongoing += 1;
        (program.medicines || []).forEach((item) => {
          totalReservedUnits += getLineAllocated(item);
        });
      } else if (status === "COMPLETED") {
        completed += 1;
      } else if (status === "CANCELLED") {
        cancelled += 1;
      }
    });

    return {
      all: programs.length,
      upcoming,
      ongoing,
      completed,
      cancelled,
      totalReservedUnits,
    };
  }, [programs]);

  // Programs whose scheduled date has arrived (Today or earlier) and are ready to be marked as ONGOING
  const dueToStartPrograms = useMemo(
    () =>
      programs.filter(
        (program) =>
          getProgramStatus(program) === "UPCOMING" &&
          program.program_date &&
          program.program_date <= todayIso
      ),
    [programs, todayIso]
  );

  const filteredPrograms = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const searchTokens = keyword ? keyword.split(/\s+/).filter(Boolean) : [];

    const filtered = programs.filter((program) => {
      const status = getProgramStatus(program);

      if (statusFilter !== "ALL" && status !== statusFilter) {
        return false;
      }

      if (searchTokens.length === 0) {
        return true;
      }

      const medicineText = (program.medicines || [])
        .map((item) => {
          const med = item.medicine || {};
          return [
            med.generic_name || "",
            med.dosage || "",
            med.unit_of_measure || "",
            med.brand_name || "",
            `${getLineAllocated(item)} units`,
          ].join(" ");
        })
        .join(" ")
        .toLowerCase();

      const relDate =
        status === "UPCOMING" ? getRelativeDateLabel(program.program_date) : null;
      const relLabel = relDate?.label || "";
      const formattedDate = formatDate(program.program_date).toLowerCase();
      const rawDate = (program.program_date || "").toLowerCase();
      const statusStr = (statusLabel[status] || status || "").toLowerCase();

      const searchable = [
        program.program_name || "",
        program.description || "",
        rawDate,
        formattedDate,
        relLabel,
        statusStr,
        medicineText,
      ]
        .join(" ")
        .toLowerCase();

      return searchTokens.every((token) => searchable.includes(token));
    });

    return filtered.sort((a, b) => {
      if (sortBy === "date-desc") {
        return (b.program_date || "").localeCompare(a.program_date || "");
      }
      if (sortBy === "date-asc") {
        return (a.program_date || "").localeCompare(b.program_date || "");
      }
      if (sortBy === "name-asc") {
        return (a.program_name || "").localeCompare(b.program_name || "");
      }
      if (sortBy === "name-desc") {
        return (b.program_name || "").localeCompare(a.program_name || "");
      }
      return 0;
    });
  }, [programs, searchTerm, statusFilter, sortBy]);

  const pagination = usePaginatedRows(filteredPrograms);

  const openCreate = () => {
    setEditingProgram(null);
    setForm({ ...emptyForm, program_date: getTodayIso() });
    setError("");
    setIsModalOpen(true);
  };

  const openEdit = (program, overrideDate = null) => {
    setEditingProgram(program);
    setForm({
      program_name: program.program_name || "",
      program_date: overrideDate || program.program_date || "",
      description: program.description || "",
      medicines: (program.medicines || []).map((item) => ({
        medicine_id: item.medicine_id,
        quantity_used: getLineAllocated(item),
      })),
    });
    setError("");
    setIsModalOpen(true);
  };

  const openView = (program) => setViewingProgram(program);

  const openActionConfirmation = (action, program) => {
    setPendingAction({ action, program });
  };

  const openReconcileModal = (program) => {
    const initialReturns = {};
    (program?.medicines || []).forEach((item) => {
      initialReturns[item.medicine_id] = String(Number(item.quantity_returned || 0));
    });
    setReturnInputs(initialReturns);
    setReconcilingProgram(program);
  };

  const closeModal = () => {
    if (!isSaving) {
      setIsModalOpen(false);
      setEditingProgram(null);
      setForm(emptyForm);
    }
  };

  const updateForm = (name, value) =>
    setForm((current) => ({ ...current, [name]: value }));

  const addMedicineLine = () =>
    setForm((current) => ({
      ...current,
      medicines: [...current.medicines, { medicine_id: "", quantity_used: "" }],
    }));

  const updateMedicineLine = (index, name, value) =>
    setForm((current) => ({
      ...current,
      medicines: current.medicines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [name]: value } : line
      ),
    }));

  const removeMedicineLine = (index) =>
    setForm((current) => ({
      ...current,
      medicines: current.medicines.filter((_, lineIndex) => lineIndex !== index),
    }));

  const medicineMap = useMemo(() => {
    const map = new Map();
    medicines.forEach((med) => map.set(med.id, med));
    return map;
  }, [medicines]);

  const getAvailableStock = useCallback(
    (medicineId) => {
      const todayValue = new Date().toISOString().slice(0, 10);
      const physical = inventory
        .filter(
          (row) =>
            row.medicine_id === medicineId &&
            Number(row.quantity) > 0 &&
            (!row.expiration_date || row.expiration_date >= todayValue)
        )
        .reduce((sum, row) => sum + Number(row.quantity || 0), 0);

      const reserved = programs
        .filter((program) => {
          const status = getProgramStatus(program);
          return (
            (status === "UPCOMING" || status === "ONGOING") &&
            String(program.id) !== String(editingProgram?.id)
          );
        })
        .flatMap((program) => program.medicines || [])
        .filter((line) => line.medicine_id === medicineId)
        .reduce((sum, line) => sum + getLineAllocated(line), 0);

      return Math.max(0, physical - reserved);
    },
    [inventory, programs, editingProgram?.id]
  );

  // Validate form errors in real time
  const formValidation = useMemo(() => {
    const lines = form.medicines.filter((line) => line.medicine_id);
    const isEditingOngoing =
      editingProgram && getProgramStatus(editingProgram) === "ONGOING";
    let errorMsg = "";
    let hasOverAllocation = false;

    if (!form.program_name.trim()) {
      errorMsg = "Program name is required.";
    } else if (!form.program_date) {
      errorMsg = "Scheduled date is required.";
    } else if (!isEditingOngoing && form.program_date < getTodayIso()) {
      errorMsg = "Program date cannot be in the past.";
    } else if (lines.length === 0) {
      errorMsg = "Add at least one medicine allocation.";
    } else if (
      lines.some(
        (line) =>
          !Number.isInteger(Number(line.quantity_used)) ||
          Number(line.quantity_used) <= 0
      )
    ) {
      errorMsg = "All medicine quantities must be positive whole numbers.";
    } else {
      for (const line of lines) {
        const available = getAvailableStock(line.medicine_id);
        if (Number(line.quantity_used) > available) {
          hasOverAllocation = true;
          errorMsg = "One or more allocations exceed available dispensable stock.";
          break;
        }
      }
    }

    const totalUnits = lines.reduce(
      (sum, line) => sum + (Number(line.quantity_used) || 0),
      0
    );

    return {
      isValid: !errorMsg && !hasOverAllocation,
      errorMsg,
      totalUnits,
      totalMedicines: lines.length,
    };
  }, [form, getAvailableStock, editingProgram]);

  const saveProgram = async (event) => {
    event.preventDefault();

    if (!formValidation.isValid) {
      setError(formValidation.errorMsg);
      return;
    }

    const lines = form.medicines.filter((line) => line.medicine_id);

    setIsSaving(true);
    setError("");

    const result = await saveOtherProgram({
      programId: editingProgram?.id || null,
      programName: form.program_name,
      programDate: form.program_date,
      description: form.description,
      items: lines.map((l) => ({
        medicine_id: l.medicine_id,
        quantity_allocated: Number(l.quantity_used),
        quantity_used: Number(l.quantity_used),
      })),
      profile,
      medicineMap,
    });

    if (!result.success) {
      setError(getErrorMessage(result.error));
      setIsSaving(false);
      return;
    }

    setPrograms((prev) => {
      const exists = prev.some((p) => String(p.id) === String(result.program.id));
      return exists
        ? prev.map((p) =>
            String(p.id) === String(result.program.id) ? { ...p, ...result.program } : p
          )
        : [result.program, ...prev];
    });

    setIsSaving(false);
    closeModal();
    setSuccessModal({
      title: editingProgram ? "Program Updated" : "Program Created",
      message: result.isOfflineQueued
        ? "Program saved to offline queue. Will sync automatically when connected."
        : editingProgram
        ? "Program schedule and reserved medicine allocations updated."
        : "Program created and planned medicine quantities placed on Reserved Stock.",
    });
    if (!result.isOfflineQueued) {
      await loadPrograms();
    }
  };

  const handleStartProgram = async (program, rescheduleToTodayFirst = false) => {
    setIsActionSaving(true);
    setError("");
    try {
      if (rescheduleToTodayFirst && program.program_date > getTodayIso()) {
        const rescheduleRes = await saveOtherProgram({
          programId: program.id,
          programName: program.program_name,
          programDate: getTodayIso(),
          description: program.description,
          items: (program.medicines || []).map((m) => ({
            medicine_id: m.medicine_id,
            quantity_allocated: getLineAllocated(m),
            quantity_used: getLineAllocated(m),
          })),
          profile,
          medicineMap,
        });
        if (!rescheduleRes.success) {
          setError(getErrorMessage(rescheduleRes.error));
          return;
        }
      }

      const result = await startOtherProgram({
        programId: program.id,
        profile,
      });

      if (!result.success) {
        setError(getErrorMessage(result.error));
        return;
      }

      const nowIso = result.startedAt || new Date().toISOString();
      const updatedDate =
        rescheduleToTodayFirst && program.program_date > getTodayIso()
          ? getTodayIso()
          : program.program_date;

      setPrograms((prev) =>
        prev.map((p) =>
          String(p.id) === String(program.id)
            ? normalizeProgramRecord({
                ...p,
                program_date: updatedDate,
                status: "ONGOING",
                started_at: p.started_at || nowIso,
                is_offline_pending: result.isOfflineQueued,
              })
            : p
        )
      );

      setSuccessModal({
        title: "Program Marked as Ongoing",
        message: result.isOfflineQueued
          ? `"${program.program_name}" is now Ongoing (queued offline). Reserved stock remains protected until final completion.`
          : `"${program.program_name}" is now Ongoing. Reserved stock remains held until you Complete & Reconcile Stock.`,
      });

      if (!result.isOfflineQueued) {
        await loadPrograms();
      }
    } finally {
      setIsActionSaving(false);
    }
  };

  const deleteProgram = async (program) => {
    setIsActionSaving(true);
    setError("");
    try {
      const result = await cancelOtherProgram({
        programId: program.id,
        profile,
      });
      if (!result.success) {
        setError(getErrorMessage(result.error));
        return;
      }
      setPrograms((prev) =>
        prev.map((p) =>
          String(p.id) === String(program.id)
            ? normalizeProgramRecord({
                ...p,
                status: "CANCELLED",
                cancelled_at: new Date().toISOString(),
                is_offline_pending: result.isOfflineQueued,
              })
            : p
        )
      );
      setViewingProgram(null);
      setSuccessModal({
        title: "Program Cancelled",
        message: result.isOfflineQueued
          ? "Program cancellation saved to offline queue. Will sync when connected."
          : "Program cancelled. All reserved medicine quantities have been released back to dispensable stock.",
      });
      if (!result.isOfflineQueued) {
        await loadPrograms();
      }
    } finally {
      setIsActionSaving(false);
    }
  };

  // Reconciliation math for the active Complete & Reconcile modal
  const reconciliationSummary = useMemo(() => {
    if (!reconcilingProgram) {
      return { lines: [], totalAllocated: 0, totalReturned: 0, totalDispensed: 0, isValid: false, errorMsg: "" };
    }

    let totalAllocated = 0;
    let totalReturned = 0;
    let totalDispensed = 0;
    let errorMsg = "";

    const lines = (reconcilingProgram.medicines || []).map((item) => {
      const allocated = getLineAllocated(item);
      const rawInput = returnInputs[item.medicine_id] ?? "0";
      const parsedReturned = rawInput === "" ? 0 : Number(rawInput);
      const isInvalid =
        rawInput === "" ||
        !Number.isInteger(parsedReturned) ||
        parsedReturned < 0 ||
        parsedReturned > allocated;

      if (isInvalid && !errorMsg) {
        errorMsg = `Returned stock for ${item.medicine?.generic_name || "medicine"} must be a whole number between 0 and ${allocated.toLocaleString()}.`;
      }

      const returned = isInvalid ? 0 : parsedReturned;
      const dispensed = Math.max(0, allocated - returned);

      totalAllocated += allocated;
      totalReturned += returned;
      totalDispensed += dispensed;

      return {
        ...item,
        allocated,
        rawInput,
        returned,
        dispensed,
        isInvalid,
      };
    });

    return {
      lines,
      totalAllocated,
      totalReturned,
      totalDispensed,
      isValid: !errorMsg,
      errorMsg,
    };
  }, [reconcilingProgram, returnInputs]);

  const handleConfirmReconcileAndComplete = async () => {
    if (!reconcilingProgram || !reconciliationSummary.isValid || isActionSaving) return;

    setIsActionSaving(true);
    setError("");
    try {
      const returnsPayload = reconciliationSummary.lines.map((line) => ({
        medicine_id: line.medicine_id,
        quantity_returned: line.returned,
      }));

      const result = await completeOtherProgram({
        programId: reconcilingProgram.id,
        returns: returnsPayload,
        profile,
        program: reconcilingProgram,
      });

      if (!result.success) {
        setError(getErrorMessage(result.error));
        return;
      }

      const completedProgramName = reconcilingProgram.program_name;
      const { totalAllocated, totalReturned, totalDispensed } = reconciliationSummary;

      setReconcilingProgram(null);
      setViewingProgram(null);

      setSuccessModal({
        title: "Program Completed & Stock Reconciled",
        message: result.isOfflineQueued
          ? `"${completedProgramName}" completed (queued offline). ${totalDispensed.toLocaleString()} dispensed units deducted; ${totalReturned.toLocaleString()} returned units restored to dispensable stock.`
          : `"${completedProgramName}" finalized. Allocated: ${totalAllocated.toLocaleString()} · Returned to Stock: ${totalReturned.toLocaleString()} · Actual Dispensed (Deducted): ${totalDispensed.toLocaleString()} units.`,
      });

      await loadPrograms();
    } finally {
      setIsActionSaving(false);
    }
  };

  const confirmProgramAction = async () => {
    if (!pendingAction || isActionSaving) return;
    const { action, program } = pendingAction;
    setPendingAction(null);
    if (action === "cancel") {
      await deleteProgram(program);
    } else if (action === "start") {
      await handleStartProgram(program, false);
    } else if (action === "reschedule-start") {
      await handleStartProgram(program, true);
    }
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <div className="space-y-6">
        {/* Top Header Card */}
        <section className="prds-fade-in rounded-xl border border-[#d8dadc] bg-white shadow-sm">
          <header className="flex flex-col gap-4 border-b border-[#e5e7eb] px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-[#0d1117]">
                Other Programs
              </h1>
              <p className="mt-1 text-sm text-[#5f6673]">
                Plan, reserve, and track medicine distributions for community outreach,
                medical missions, and special health drives.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="btn-primary inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold text-white shadow-xs transition active:scale-[0.98] cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Add Program
            </button>
          </header>

          {/* Feedback Error Notice */}
          {error && (
            <div className="mx-6 mt-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError("")}
                className="text-sm font-bold opacity-70 hover:opacity-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Scheduled Date Detection Notification Banner */}
          {dueToStartPrograms.length > 0 && (
            <div className="mx-6 mt-5 rounded-xl border border-amber-300/80 bg-amber-50/90 px-4 py-3.5 shadow-2xs">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-800">
                    <BellRing className="h-4 w-4 animate-bounce" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-black uppercase tracking-wider text-amber-900">
                        Scheduled Program Today
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-amber-800">
                      {dueToStartPrograms.length === 1 ? (
                        <>
                          <strong>{dueToStartPrograms[0].program_name}</strong> is scheduled for{" "}
                          <strong>{formatDate(dueToStartPrograms[0].program_date)}</strong>. Mark it
                          as <strong>Ongoing</strong> when the outreach begins.
                        </>
                      ) : (
                        <>
                          {dueToStartPrograms.map((p) => p.program_name).join(", ")} are scheduled and
                          ready to transition to <strong>Ongoing</strong>.
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {dueToStartPrograms.length === 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openView(dueToStartPrograms[0])}
                        className="h-8 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-900 hover:bg-amber-100/60 transition cursor-pointer"
                      >
                        View Program
                      </button>
                      <button
                        type="button"
                        disabled={isActionSaving}
                        onClick={() => handleStartProgram(dueToStartPrograms[0], false)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 text-xs font-bold text-white shadow-2xs hover:bg-amber-700 transition cursor-pointer disabled:opacity-50"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Mark as Ongoing
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStatusFilter("UPCOMING")}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 text-xs font-bold text-white shadow-2xs hover:bg-amber-700 transition cursor-pointer"
                    >
                      Review Upcoming ({dueToStartPrograms.length})
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Top Interactive KPI Cards (Primary Status Filtering) */}
          <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-5">
            {/* Card 1: Total Programs */}
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all duration-150 hover:-translate-y-0.5 cursor-pointer ${
                statusFilter === "ALL"
                  ? "border-[#1F4E5A] bg-white shadow-md ring-2 ring-[#1F4E5A]/15"
                  : "border-[#CFDDE0] bg-white shadow-xs hover:border-[#1F4E5A]/40 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-[#5B7077]">
                  Total Programs
                </span>
                <span
                  className={`rounded-lg p-2 transition-colors duration-150 ${
                    statusFilter === "ALL"
                      ? "bg-[#1F4E5A] text-white"
                      : "bg-[#E5EFF1] text-[#1F4E5A] group-hover:bg-[#1F4E5A] group-hover:text-white"
                  }`}
                >
                  <ClipboardList className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-black text-[#1B2B30] leading-none">
                  {counts.all}
                </p>
                <p className="mt-1 text-xs text-[#5B7077]">
                  All recorded outreach missions
                </p>
              </div>
            </button>

            {/* Card 2: Upcoming Missions */}
            <button
              type="button"
              onClick={() =>
                setStatusFilter(statusFilter === "UPCOMING" ? "ALL" : "UPCOMING")
              }
              className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all duration-150 hover:-translate-y-0.5 cursor-pointer ${
                statusFilter === "UPCOMING"
                  ? "border-[#34769B] bg-white shadow-md ring-2 ring-[#34769B]/15"
                  : "border-[#CFDDE0] bg-white shadow-xs hover:border-[#34769B]/40 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-[#5B7077]">
                  Upcoming Missions
                </span>
                <span
                  className={`rounded-lg p-2 transition-colors duration-150 ${
                    statusFilter === "UPCOMING"
                      ? "bg-[#34769B] text-white"
                      : "bg-[#E3EEF5] text-[#34769B] group-hover:bg-[#34769B] group-hover:text-white"
                  }`}
                >
                  <CalendarDays className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-black text-[#1B2B30] leading-none">
                  {counts.upcoming}
                </p>
                <p className="mt-1 text-xs text-[#5B7077]">
                  Planned & reserved in stock
                </p>
              </div>
            </button>

            {/* Card 3: Ongoing Missions */}
            <button
              type="button"
              onClick={() =>
                setStatusFilter(statusFilter === "ONGOING" ? "ALL" : "ONGOING")
              }
              className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all duration-150 hover:-translate-y-0.5 cursor-pointer ${
                statusFilter === "ONGOING"
                  ? "border-[#D99B26] bg-white shadow-md ring-2 ring-[#D99B26]/15"
                  : "border-[#CFDDE0] bg-white shadow-xs hover:border-[#D99B26]/50 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-[#5B7077]">
                  Ongoing Missions
                </span>
                <span
                  className={`rounded-lg p-2 transition-colors duration-150 ${
                    statusFilter === "ONGOING"
                      ? "bg-[#D99B26] text-white"
                      : "bg-[#FEF6E7] text-[#9A6700] group-hover:bg-[#D99B26] group-hover:text-white"
                  }`}
                >
                  <Activity className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-black text-[#1B2B30] leading-none">
                  {counts.ongoing}
                </p>
                <p className="mt-1 text-xs text-[#5B7077]">
                  Active today · Awaiting return count
                </p>
              </div>
            </button>

            {/* Card 4: Completed Missions */}
            <button
              type="button"
              onClick={() =>
                setStatusFilter(statusFilter === "COMPLETED" ? "ALL" : "COMPLETED")
              }
              className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all duration-150 hover:-translate-y-0.5 cursor-pointer ${
                statusFilter === "COMPLETED"
                  ? "border-[#4C9F80] bg-white shadow-md ring-2 ring-[#4C9F80]/15"
                  : "border-[#CFDDE0] bg-white shadow-xs hover:border-[#4C9F80]/40 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-[#5B7077]">
                  Completed Missions
                </span>
                <span
                  className={`rounded-lg p-2 transition-colors duration-150 ${
                    statusFilter === "COMPLETED"
                      ? "bg-[#4C9F80] text-white"
                      : "bg-[#E2F3EC] text-[#226048] group-hover:bg-[#4C9F80] group-hover:text-white"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-black text-[#1B2B30] leading-none">
                  {counts.completed}
                </p>
                <p className="mt-1 text-xs text-[#5B7077]">
                  Reconciled & stock deducted
                </p>
              </div>
            </button>

            {/* Card 5: Total Reserved Units */}
            <div className="flex flex-col justify-between rounded-xl border border-[#CFDDE0] bg-white p-4 shadow-xs">
              <div className="flex items-start justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-[#5B7077]">
                  Reserved Units
                </span>
                <span className="rounded-lg bg-[#E5EFF1] p-2 text-[#1F4E5A]">
                  <Boxes className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-black text-[#1B2B30] leading-none">
                  {counts.totalReservedUnits.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-[#5B7077]">
                  Held for upcoming & ongoing drives
                </p>
              </div>
            </div>
          </div>

          {/* Dynamic Search, Filter, Sort & Refresh Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#CFDDE0] px-6 py-4">
            <div className="flex flex-1 flex-wrap items-center gap-2.5">
              {/* Dynamic Search Bar */}
              <div className="relative min-w-[240px] flex-1 max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5B7077]" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by program, description, medicine, or date..."
                  className="h-10 w-full rounded-lg border border-[#CFDDE0] bg-white pl-9 pr-9 text-sm text-[#1B2B30] placeholder:text-[#5B7077]/70 outline-none transition focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5B7077] hover:text-[#1B2B30] cursor-pointer"
                    title="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Sorting Dropdown */}
              <div className="relative min-w-[160px]">
                <span className="sr-only">Sort programs</span>
                <select
                  aria-label="Sort programs"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="h-10 w-full appearance-none rounded-lg border border-[#CFDDE0] bg-white pl-3.5 pr-8 text-xs font-bold text-[#1B2B30] outline-none transition hover:border-[#1F4E5A]/50 focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20 cursor-pointer shadow-xs"
                >
                  <option value="date-desc">Latest to Oldest</option>
                  <option value="date-asc">Oldest to Latest</option>
                  <option value="name-asc">Program Name (A–Z)</option>
                  <option value="name-desc">Program Name (Z–A)</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5B7077]" />
              </div>

              {/* Reset filter/sorting icon button */}
              {(searchTerm || statusFilter !== "ALL" || sortBy !== "date-desc") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("ALL");
                    setSortBy("date-desc");
                  }}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#CFDDE0] bg-[#F4F8F8] text-[#5B7077] hover:border-[#1F4E5A] hover:bg-white hover:text-[#1F4E5A] transition cursor-pointer shadow-xs"
                  title="Reset filters and sorting"
                  aria-label="Reset filters and sorting"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Right Side: Refresh */}
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={loadPrograms}
                disabled={isLoading}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#CFDDE0] bg-white px-3.5 text-xs font-bold text-[#1B2B30] shadow-xs hover:bg-[#F4F8F8] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-[#1F4E5A]" : ""}`}
                />
                Refresh
              </button>
            </div>
          </div>

          {/* Main Table */}
          <div className="overflow-x-auto border-t border-[#CFDDE0]">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b border-[#CFDDE0] bg-[#F4F8F8] text-[11px] font-bold uppercase tracking-wider text-[#5B7077]">
                <tr>
                  <th className="px-6 py-3.5">Program & Objectives</th>
                  <th className="px-4 py-3.5">Scheduled Date</th>
                  <th className="px-4 py-3.5">Allocated Medicines</th>
                  <th className="px-4 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#CFDDE0]/60">
                {pagination.paginatedRows.map((program) => {
                  const status = getProgramStatus(program);
                  const relDate =
                    status === "UPCOMING"
                      ? getRelativeDateLabel(program.program_date)
                      : null;
                  const totalAllocated = (program.medicines || []).reduce(
                    (sum, item) => sum + getLineAllocated(item),
                    0
                  );
                  const totalReturned = (program.medicines || []).reduce(
                    (sum, item) => sum + getLineReturned(item, status),
                    0
                  );
                  const totalDispensed = (program.medicines || []).reduce(
                    (sum, item) => sum + getLineDispensed(item, status),
                    0
                  );

                  return (
                    <tr
                      key={program.id}
                      onClick={() => openView(program)}
                      className="group cursor-pointer transition duration-150 hover:bg-[#E5EFF1]/60"
                      title="Click to view program details"
                    >
                      {/* Program & Description */}
                      <td className="px-6 py-4">
                        <p className="font-bold text-[#1B2B30] transition group-hover:text-[#1F4E5A]">
                          {program.program_name}
                        </p>
                        <p className="mt-1 max-w-sm truncate text-xs text-[#5B7077]">
                          {program.description || (
                            <span className="italic text-[#5B7077]/60">
                              No description recorded
                            </span>
                          )}
                        </p>
                      </td>

                      {/* Scheduled Date */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-[#1B2B30]">
                            <CalendarDays className="h-4 w-4 text-[#1F4E5A]" />
                            {formatDate(program.program_date)}
                          </span>
                          {relDate && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ${relDate.style}`}
                            >
                              {relDate.label}
                            </span>
                          )}
                          {status === "ONGOING" && (
                            <span className="rounded-full bg-[#FEF6E7] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#9A6700] ring-1 ring-[#D99B26]/30">
                              In Progress
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Medicine Allocation Chips */}
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-[#5B7077]">
                            <span>
                              {program.medicines?.length || 0} medicine
                              {(program.medicines?.length || 0) === 1 ? "" : "s"} ·{" "}
                            </span>
                            {status === "COMPLETED" ? (
                              <>
                                <span className="text-[#1B2B30]">
                                  {totalDispensed.toLocaleString()} dispensed
                                </span>
                                {totalReturned > 0 && (
                                  <span className="rounded-full bg-amber-50 px-2 py-0.2 text-[10px] font-bold text-amber-800 border border-amber-200">
                                    {totalReturned.toLocaleString()} returned
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-[#1B2B30]">
                                {totalAllocated.toLocaleString()} units reserved
                              </span>
                            )}
                          </div>
                          <div className="flex max-w-xs flex-wrap gap-1">
                            {(program.medicines || []).slice(0, 2).map((item) => {
                              const displayQty =
                                status === "COMPLETED"
                                  ? getLineDispensed(item, "COMPLETED")
                                  : getLineAllocated(item);
                              return (
                                <span
                                  key={item.id}
                                  className="rounded bg-[#E8F5F1] px-2 py-0.5 text-[11px] font-bold text-[#2D7A5D]"
                                >
                                  {item.medicine?.generic_name || "Medicine"}
                                  {item.medicine?.dosage
                                    ? ` ${item.medicine.dosage}`
                                    : ""}{" "}
                                  ×{displayQty.toLocaleString()}
                                </span>
                              );
                            })}
                            {(program.medicines?.length || 0) > 2 && (
                              <span className="rounded bg-[#E5EFF1] px-2 py-0.5 text-[11px] font-bold text-[#5B7077]">
                                +{program.medicines.length - 2} more
                              </span>
                            )}
                            {!program.medicines?.length && (
                              <span className="text-xs font-semibold text-[#5B7077]/70">
                                No allocation
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ring-1 ${statusClass[status]}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                status === "UPCOMING"
                                  ? "bg-[#34769B]"
                                  : status === "ONGOING"
                                  ? "bg-[#D99B26] animate-pulse"
                                  : status === "COMPLETED"
                                  ? "bg-[#4C9F80]"
                                  : "bg-[#5B7077]"
                              }`}
                            />
                            {statusLabel[status] || status}
                          </span>
                          {program.is_offline_pending && (
                            <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-300/60">
                              Queued Offline
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* Empty State */}
                {!isLoading && pagination.totalCount === 0 && (
                  <tr>
                    <td colSpan="4" className="px-6 py-16 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E5EFF1] border border-[#CFDDE0] text-[#1F4E5A]">
                        <ClipboardList className="h-6 w-6" />
                      </div>
                      <p className="mt-3 text-base font-bold text-[#0d1117]">
                        {searchTerm
                          ? "No matching programs found"
                          : statusFilter === "UPCOMING"
                          ? "No upcoming missions scheduled"
                          : statusFilter === "ONGOING"
                          ? "No ongoing missions right now"
                          : statusFilter === "COMPLETED"
                          ? "No completed missions recorded"
                          : "No programs recorded yet"}
                      </p>
                      <p className="mt-1 text-sm text-[#5B7077]">
                        {searchTerm
                          ? "Try searching for a different program name, description, or medicine."
                          : statusFilter !== "ALL"
                          ? "There are currently no outreach missions matching this status filter."
                          : "Add an outreach mission or program to allocate and reserve medicines."}
                      </p>
                      <div className="mt-4 flex items-center justify-center gap-2">
                        {(searchTerm || statusFilter !== "ALL" || sortBy !== "date-desc") && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchTerm("");
                              setStatusFilter("ALL");
                              setSortBy("date-desc");
                            }}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#CFDDE0] bg-white px-3 text-xs font-bold text-[#1F4E5A] hover:bg-[#F4F8F8] transition cursor-pointer"
                          >
                            Reset Filters
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={openCreate}
                          className="btn-primary inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-bold text-white shadow-xs transition cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Program
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <PaginationControls
            currentPage={pagination.currentPage}
            pageSize={pagination.pageSize}
            totalCount={pagination.totalCount}
            totalPages={pagination.totalPages}
            itemLabel="programs"
            onPageChange={pagination.setCurrentPage}
          />
        </section>
      </div>

      {/* ========================================================================= */}
      {/* ADD / EDIT PROGRAM MODAL                                                  */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <ModalShell
          labelledBy="program-modal-title"
          onClose={closeModal}
          panelClassName="max-w-3xl"
        >
          <form
            onSubmit={saveProgram}
            className="w-full overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-2xl"
          >
            <header className="border-b border-[#e5e7eb] px-6 py-5">
              <div className="flex items-center justify-between gap-2">
                <h2
                  id="program-modal-title"
                  className="text-xl font-black text-[#0d1117]"
                >
                  {editingProgram ? "Edit Program & Schedule" : "Add Other Program"}
                </h2>
                {editingProgram && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide ring-1 ${
                      statusClass[getProgramStatus(editingProgram)]
                    }`}
                  >
                    {statusLabel[getProgramStatus(editingProgram)]}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[#69717d]">
                {editingProgram
                  ? "Update the scheduled date, details, or reserved medicine quantities."
                  : "Record the outreach activity and allocate medicines to reserve from CHO central inventory."}
              </p>
            </header>

            <div className="max-h-[72vh] space-y-6 overflow-y-auto px-6 py-5">
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Section 1: Activity Details */}
              <div className="rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] p-4">
                <div className="flex items-center justify-between border-b border-[#CFDDE0] pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#1F4E5A]" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-[#1B2B30]">
                      1. Activity Information
                    </h3>
                  </div>
                  {editingProgram && form.program_date !== todayIso && (
                    <button
                      type="button"
                      onClick={() => updateForm("program_date", todayIso)}
                      className="inline-flex items-center gap-1 rounded-md border border-[#1F4E5A]/30 bg-white px-2.5 py-1 text-[11px] font-bold text-[#1F4E5A] hover:bg-[#E5EFF1] transition cursor-pointer"
                    >
                      <CalendarDays className="h-3 w-3" />
                      Set Date to Today ({formatDate(todayIso)})
                    </button>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-[1fr_210px]">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-[#1B2B30]">
                      Program Name <span className="text-[#D9826B]">*</span>
                    </span>
                    <input
                      value={form.program_name}
                      onChange={(event) =>
                        updateForm("program_name", event.target.value)
                      }
                      placeholder="e.g. Community Medical Mission - Brgy. Inayagan"
                      className="h-10 w-full rounded-lg border border-[#CFDDE0] bg-white px-3 text-sm text-[#1B2B30] placeholder:text-[#5B7077]/70 outline-none transition focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-[#1B2B30]">
                      Scheduled Date <span className="text-[#D9826B]">*</span>
                    </span>
                    <input
                      type="date"
                      min={
                        editingProgram && getProgramStatus(editingProgram) === "ONGOING"
                          ? undefined
                          : getTodayIso()
                      }
                      value={form.program_date}
                      onChange={(event) =>
                        updateForm("program_date", event.target.value)
                      }
                      className="h-10 w-full rounded-lg border border-[#CFDDE0] bg-white px-3 text-sm text-[#1B2B30] outline-none transition focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
                      required
                    />
                    {form.program_date &&
                      !(editingProgram && getProgramStatus(editingProgram) === "ONGOING") &&
                      form.program_date < getTodayIso() && (
                        <p className="mt-1 text-xs font-bold text-[#D9826B]">
                          Date cannot be in past.
                        </p>
                      )}
                  </label>
                </div>

                <label className="block mt-4">
                  <span className="mb-1.5 block text-xs font-bold text-[#1B2B30]">
                    Description{" "}
                    <span className="text-xs font-normal text-[#5B7077]">
                      (Optional)
                    </span>
                  </span>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(event) =>
                      updateForm("description", event.target.value)
                    }
                    placeholder="Add descriptive notes or details about this program..."
                    className="w-full rounded-lg border border-[#CFDDE0] bg-white p-3 text-sm text-[#1B2B30] placeholder:text-[#5B7077]/70 outline-none transition focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
                  />
                </label>
              </div>

              {/* Section 2: Medicine Allocation Table */}
              <div className="rounded-xl border border-[#CFDDE0] bg-white">
                <div className="flex items-center justify-between border-b border-[#CFDDE0] bg-[#F4F8F8] px-4 py-3 rounded-t-xl">
                  <div>
                    <div className="flex items-center gap-2">
                      <Pill className="h-4 w-4 text-[#1F4E5A]" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-[#1B2B30]">
                        2. Medicine Allocation (Reserved Stock)
                      </h3>
                    </div>
                    <p className="mt-0.5 text-xs text-[#5B7077]">
                      Select medicines and planned quantities to reserve from CHO dispensable stock.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addMedicineLine}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-3 text-xs font-bold text-white shadow-xs transition hover:brightness-105 active:scale-[0.98]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Medicine
                  </button>
                </div>

                {form.medicines.length > 0 && (
                  <div className="hidden border-b border-[#CFDDE0] bg-[#F4F8F8] px-4 py-2 text-[11px] font-black uppercase tracking-wider text-[#5B7077] sm:grid sm:grid-cols-[1fr_140px_140px_40px] gap-3">
                    <span>Medicine</span>
                    <span>Dispensable Stock</span>
                    <span>Reserved Qty</span>
                    <span className="text-center">Action</span>
                  </div>
                )}

                <div className="divide-y divide-[#CFDDE0]/60 p-2 sm:p-0">
                  {form.medicines.map((line, index) => {
                    const availableStock = line.medicine_id
                      ? getAvailableStock(line.medicine_id)
                      : 0;
                    const selectedMed = medicineMap.get(line.medicine_id);
                    const unitLabel =
                      selectedMed?.unit_of_measure?.toLowerCase() || "units";
                    const isOverAllocated =
                      line.medicine_id &&
                      Number(line.quantity_used) > availableStock;

                    const otherSelectedIds = new Set(
                      form.medicines
                        .map((m, mIndex) =>
                          mIndex !== index ? m.medicine_id : null
                        )
                        .filter(Boolean)
                    );

                    return (
                      <div
                        key={`${index}-${line.medicine_id}`}
                        className="flex flex-col gap-2 p-3 sm:grid sm:grid-cols-[1fr_140px_140px_40px] sm:items-center sm:gap-3 sm:px-4 sm:py-3 transition hover:bg-[#F4F8F8]"
                      >
                        <div>
                          <label className="text-[10px] font-bold uppercase text-[#5B7077] sm:hidden block mb-1">
                            Medicine
                          </label>
                          <select
                            value={line.medicine_id}
                            onChange={(event) =>
                              updateMedicineLine(index, "medicine_id", event.target.value)
                            }
                            className="h-10 w-full rounded-lg border border-[#CFDDE0] bg-white px-3 text-xs font-semibold text-[#1B2B30] outline-none transition focus:border-[#1F4E5A] focus:ring-1 focus:ring-[#1F4E5A] truncate"
                            disabled={isSaving}
                            required
                          >
                            <option value="">Select a medicine...</option>
                            {medicines.map((medicine) => {
                              const isAlreadySelected =
                                otherSelectedIds.has(medicine.id) &&
                                line.medicine_id !== medicine.id;
                              return (
                                <option
                                  key={medicine.id}
                                  value={medicine.id}
                                  disabled={isAlreadySelected}
                                >
                                  {medicine.generic_name}
                                  {medicine.dosage ? ` ${medicine.dosage}` : ""}
                                  {medicine.brand_name && medicine.brand_name !== "-"
                                    ? ` • ${medicine.brand_name}`
                                    : ""}
                                  {isAlreadySelected ? " — (Already Added)" : ""}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div className="flex items-center">
                          <label className="text-[10px] font-bold uppercase text-[#5B7077] sm:hidden mr-2">
                            Dispensable:
                          </label>
                          {line.medicine_id ? (
                            availableStock > 0 ? (
                              <span className="inline-flex items-center rounded-md bg-[#E8F5F1] px-2 py-1 text-xs font-bold text-[#2D7A5D]">
                                {availableStock.toLocaleString()} {unitLabel}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md bg-[#faedf0] px-2 py-1 text-xs font-bold text-[#D9826B]">
                                Out of Stock
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-[#5B7077]/70">
                              — Select medicine
                            </span>
                          )}
                        </div>

                        <div>
                          <label className="text-[10px] font-bold uppercase text-[#5B7077] sm:hidden block mb-1">
                            Reserved Qty
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="1"
                              max={availableStock || undefined}
                              step="1"
                              value={line.quantity_used}
                              onChange={(event) =>
                                updateMedicineLine(
                                  index,
                                  "quantity_used",
                                  event.target.value
                                )
                              }
                              placeholder="Qty"
                              className={`h-10 w-full rounded-lg border bg-white px-3 pr-10 text-sm font-semibold outline-none transition ${
                                isOverAllocated
                                  ? "border-[#D9826B] bg-[#faedf0]/30 text-[#D9826B] ring-2 ring-[#D9826B]/20"
                                  : "border-[#CFDDE0] text-[#1B2B30] focus:border-[#1F4E5A] focus:ring-1 focus:ring-[#1F4E5A]"
                              }`}
                              disabled={!line.medicine_id || availableStock <= 0}
                              required
                            />
                            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[#5B7077]">
                              {unitLabel}
                            </span>
                          </div>
                          {isOverAllocated && (
                            <p className="mt-1 text-[11px] font-bold text-[#D9826B]">
                              Exceeds dispensable stock (max {availableStock.toLocaleString()})
                            </p>
                          )}
                        </div>

                        <div className="flex justify-end sm:justify-center">
                          <button
                            type="button"
                            onClick={() => removeMedicineLine(index)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#CFDDE0] text-[#5B7077] transition hover:border-[#D9826B]/40 hover:bg-[#faedf0] hover:text-[#D9826B]"
                            aria-label="Remove medicine"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {form.medicines.length === 0 && (
                    <div className="p-8 text-center">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#E5EFF1] text-[#5B7077]">
                        <Boxes className="h-5 w-5" />
                      </div>
                      <p className="mt-2 text-sm font-bold text-[#1B2B30]">
                        No medicines allocated yet
                      </p>
                      <p className="mt-1 text-xs text-[#5B7077]">
                        Click the &quot;+ Add Medicine&quot; button above to select and
                        reserve stock for this program.
                      </p>
                    </div>
                  )}
                </div>

                {form.medicines.length > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-[#CFDDE0] bg-[#F4F8F8] px-4 py-3 rounded-b-xl gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-[#5B7077]">
                      <Info className="h-3.5 w-3.5 text-[#1F4E5A]" />
                      <span>
                        Allocated stock is held on <strong>RESERVED</strong> status until completion reconciliation.
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-[#5B7077]">
                        Total Reserved:{" "}
                      </span>
                      <span className="text-sm font-black text-[#1B2B30]">
                        {formValidation.totalMedicines} medicine
                        {formValidation.totalMedicines === 1 ? "" : "s"} ·{" "}
                        {formValidation.totalUnits.toLocaleString()} units
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <footer className="flex items-center justify-between border-t border-[#e5e7eb] px-6 py-4 bg-slate-50/50">
              <span className="text-xs text-[#69717d]">
                {formValidation.isValid ? (
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                    <Check className="h-3.5 w-3.5" /> Ready to save
                  </span>
                ) : (
                  <span className="text-slate-500">
                    {formValidation.errorMsg || "Fill in all required fields to proceed"}
                  </span>
                )}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSaving}
                  className="h-10 rounded-lg border border-[#d8dadc] bg-white px-4 text-sm font-bold text-[#42474e] hover:bg-[#f7f8fa]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !formValidation.isValid}
                  className="btn-primary inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-bold text-white shadow-xs transition active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  {isSaving
                    ? "Saving..."
                    : editingProgram
                    ? "Save Changes"
                    : "Create Program & Reserve"}
                </button>
              </div>
            </footer>
          </form>
        </ModalShell>
      )}

      {/* ========================================================================= */}
      {/* VIEW PROGRAM DETAILS MODAL                                                */}
      {/* ========================================================================= */}
      {viewingProgram && (
        <ModalShell
          labelledBy="program-details-title"
          onClose={() => setViewingProgram(null)}
          panelClassName="max-w-2xl"
        >
          {(() => {
            const viewStatus = getProgramStatus(viewingProgram);
            const isDueTodayOrEarlier =
              viewingProgram.program_date && viewingProgram.program_date <= todayIso;
            const totalAllocated = (viewingProgram.medicines || []).reduce(
              (sum, item) => sum + getLineAllocated(item),
              0
            );
            const totalReturned = (viewingProgram.medicines || []).reduce(
              (sum, item) => sum + getLineReturned(item, viewStatus),
              0
            );
            const totalDispensed = (viewingProgram.medicines || []).reduce(
              (sum, item) => sum + getLineDispensed(item, viewStatus),
              0
            );

            return (
              <div className="w-full overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-2xl">
                {/* Modal Header */}
                <header className="flex items-start justify-between border-b border-[#e5e7eb] px-6 py-5">
                  <div>
                    <h2
                      id="program-details-title"
                      className="text-xl font-black text-[#0d1117]"
                    >
                      {viewingProgram.program_name}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide ring-1 ${
                          statusClass[viewStatus]
                        }`}
                      >
                        {statusLabel[viewStatus]}
                      </span>
                      <span className="text-xs font-semibold text-[#69717d]">
                        Scheduled: {formatDate(viewingProgram.program_date)}
                      </span>
                      {viewStatus === "UPCOMING" && isDueTodayOrEarlier && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">
                          Scheduled Today · Ready to Start
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(viewStatus === "UPCOMING" || viewStatus === "ONGOING") && (
                      <button
                        type="button"
                        onClick={() => {
                          const target = viewingProgram;
                          setViewingProgram(null);
                          openEdit(target);
                        }}
                        className="inline-flex h-9 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border border-[#1F4E5A]/20 bg-[#EBF3F5] px-3 text-xs font-bold text-[#1F4E5A] transition hover:bg-[#1F4E5A] hover:text-white cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5 shrink-0" />
                        <span>{viewStatus === "UPCOMING" ? "Edit / Reschedule" : "Edit Allocation"}</span>
                      </button>
                    )}
                  </div>
                </header>

                {/* Modal Body */}
                <div className="max-h-[72vh] space-y-5 overflow-y-auto px-6 py-5">
                  {/* Context Status Banner */}
                  {viewStatus === "UPCOMING" && (
                    <div className="flex items-start justify-between gap-3 rounded-lg border border-[#34769B]/30 bg-[#e6f0f7] p-3.5 text-xs text-[#34769B]">
                      <div className="flex items-start gap-2.5">
                        <Info className="h-4 w-4 shrink-0 text-[#34769B] mt-0.5" />
                        <div>
                          <span className="font-bold">Active Stock Reservation: </span>
                          <strong>{totalAllocated.toLocaleString()} units</strong> are currently
                          held on RESERVED status. Physical CHO stock will only be deducted once the
                          program is marked <strong>Ongoing</strong> and finalized via{" "}
                          <strong>Complete &amp; Reconcile Stock</strong>.
                          {!isDueTodayOrEarlier && (
                            <p className="mt-1 text-[11px] font-semibold text-[#285E7D]">
                              Need to hold this program today instead of {formatDate(viewingProgram.program_date)}? Use{" "}
                              <strong>Reschedule to Today &amp; Start</strong> below.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {viewStatus === "ONGOING" && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-[#D99B26]/40 bg-[#FEF6E7] p-3.5 text-xs text-[#9A6700]">
                      <Activity className="h-4 w-4 shrink-0 text-[#D99B26] mt-0.5 animate-pulse" />
                      <div>
                        <span className="font-bold">Program Currently Ongoing: </span>
                        <strong>{totalAllocated.toLocaleString()} units</strong> are deployed for
                        this outreach. You can still click <strong>Edit Allocation</strong> if
                        adjustments are needed, or click <strong>Complete &amp; Reconcile Stock</strong>{" "}
                        to enter returned unused stock and calculate actual dispensed units.
                      </div>
                    </div>
                  )}

                  {viewStatus === "COMPLETED" && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-[#4C9F80]/20 bg-[#E8F5F1] p-3.5 text-xs text-[#2D7A5D]">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2D7A5D] mt-0.5" />
                      <div>
                        <span className="font-bold">Program Completed &amp; Stock Reconciled: </span>
                        Out of <strong>{totalAllocated.toLocaleString()} allocated units</strong>,{" "}
                        <strong>{totalReturned.toLocaleString()} unused units</strong> were returned
                        to CHO dispensable stock and{" "}
                        <strong>{totalDispensed.toLocaleString()} actual dispensed units</strong>{" "}
                        were deducted from physical inventory via FEFO.
                      </div>
                    </div>
                  )}

                  {viewStatus === "CANCELLED" && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
                      <div>
                        <span className="font-bold">Program Cancelled: </span>
                        This activity was called off. All reserved medicine quantities were
                        released back to available central stock.
                      </div>
                    </div>
                  )}

                  {/* Mission Snapshot Cards */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-[#e1e4e8] bg-[#f8fafb] p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-[#7a828d]">
                        Scheduled Date
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#0d1117]">
                        {formatDate(viewingProgram.program_date)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[#e1e4e8] bg-[#f8fafb] p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-[#7a828d]">
                        Medicines
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#0d1117]">
                        {viewingProgram.medicines?.length || 0} distinct type
                        {(viewingProgram.medicines?.length || 0) === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[#e1e4e8] bg-[#f8fafb] p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-[#7a828d]">
                        Allocated (Reserved)
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#0d1117]">
                        {totalAllocated.toLocaleString()} units
                      </p>
                    </div>
                    <div className="rounded-lg border border-[#e1e4e8] bg-[#f8fafb] p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-[#7a828d]">
                        {viewStatus === "COMPLETED" ? "Returned / Dispensed" : "Program Stage"}
                      </p>
                      {viewStatus === "COMPLETED" ? (
                        <p className="mt-1 text-xs font-bold text-[#0d1117]">
                          <span className="text-amber-700">{totalReturned.toLocaleString()} Ret</span>
                          {" · "}
                          <span className="text-[#2D7A5D]">{totalDispensed.toLocaleString()} Disp</span>
                        </p>
                      ) : (
                        <p className="mt-1 text-sm font-bold text-[#0d1117]">
                          {statusLabel[viewStatus]}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-[#7a828d]">
                      Description
                    </p>
                    <div className="mt-1.5 rounded-lg border border-[#e1e4e8] bg-white p-3 text-sm text-[#42474e]">
                      {viewingProgram.description || (
                        <span className="italic text-slate-400">
                          No descriptive notes recorded.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Medicine Distribution / Reconciliation Table */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-wide text-[#5B7077]">
                        Medicine Distribution &amp; Stock Reconciliation
                      </p>
                      <span className="text-xs font-bold text-[#1F4E5A]">
                        {viewStatus === "UPCOMING" || viewStatus === "ONGOING"
                          ? "Reserved Allocation"
                          : viewStatus === "COMPLETED"
                          ? "Reconciled & Deducted"
                          : "Released"}
                      </span>
                    </div>
                    <div className="overflow-hidden rounded-lg border border-[#CFDDE0]">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-[#CFDDE0] bg-[#F4F8F8] text-[10px] font-bold uppercase tracking-wider text-[#5B7077]">
                          <tr>
                            <th className="px-3.5 py-2.5">Medicine Name</th>
                            <th className="px-3 py-2.5">Unit</th>
                            <th className="px-3.5 py-2.5 text-right">
                              {viewStatus === "COMPLETED" ? "Allocated" : "Reserved Qty"}
                            </th>
                            {viewStatus === "COMPLETED" && (
                              <>
                                <th className="px-3.5 py-2.5 text-right text-amber-800">
                                  Returned
                                </th>
                                <th className="px-3.5 py-2.5 text-right text-[#226048]">
                                  Actual Dispensed
                                </th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#CFDDE0]/60">
                          {(viewingProgram.medicines || []).map((item) => {
                            const allocated = getLineAllocated(item);
                            const returned = getLineReturned(item, viewStatus);
                            const dispensed = getLineDispensed(item, viewStatus);
                            return (
                              <tr key={item.id}>
                                <td className="px-3.5 py-3 font-semibold text-[#1B2B30]">
                                  {item.medicine?.generic_name || "Unknown medicine"}
                                  {item.medicine?.dosage ? ` ${item.medicine.dosage}` : ""}
                                  {item.medicine?.brand_name
                                    ? ` (${item.medicine.brand_name})`
                                    : ""}
                                </td>
                                <td className="px-3 py-3 text-xs text-[#5B7077]">
                                  {item.medicine?.unit_of_measure || "units"}
                                </td>
                                <td className="px-3.5 py-3 text-right font-bold text-[#1B2B30]">
                                  {allocated.toLocaleString()}
                                </td>
                                {viewStatus === "COMPLETED" && (
                                  <>
                                    <td className="px-3.5 py-3 text-right font-bold text-amber-800">
                                      {returned.toLocaleString()}
                                    </td>
                                    <td className="px-3.5 py-3 text-right font-black text-[#226048]">
                                      {dispensed.toLocaleString()}
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                          <tr className="bg-[#F9FBFB] font-black">
                            <td colSpan="2" className="px-3.5 py-3 text-[#1B2B30]">
                              Total Units
                            </td>
                            <td className="px-3.5 py-3 text-right text-[#1F4E5A]">
                              {totalAllocated.toLocaleString()}
                            </td>
                            {viewStatus === "COMPLETED" && (
                              <>
                                <td className="px-3.5 py-3 text-right text-amber-800">
                                  {totalReturned.toLocaleString()}
                                </td>
                                <td className="px-3.5 py-3 text-right text-[#226048]">
                                  {totalDispensed.toLocaleString()}
                                </td>
                              </>
                            )}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e5e7eb] px-6 py-4 bg-slate-50/50">
                  {viewStatus === "UPCOMING" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openActionConfirmation("cancel", viewingProgram)}
                        className="h-10 rounded-lg border border-red-200 bg-white px-4 text-xs font-bold text-red-700 transition hover:bg-red-50 cursor-pointer"
                      >
                        Cancel Program
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewingProgram(null)}
                          className="h-10 rounded-lg border border-[#d8dadc] bg-white px-4 text-xs font-bold text-[#0d1117] hover:bg-slate-50 cursor-pointer"
                        >
                          Close
                        </button>
                        {isDueTodayOrEarlier ? (
                          <button
                            type="button"
                            disabled={isActionSaving}
                            onClick={() => openActionConfirmation("start", viewingProgram)}
                            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#D99B26] px-5 text-xs font-bold text-white shadow-xs hover:bg-[#b8821d] transition cursor-pointer disabled:opacity-50"
                          >
                            <Play className="h-3.5 w-3.5" /> Mark as Ongoing
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isActionSaving}
                            onClick={() =>
                              openActionConfirmation("reschedule-start", viewingProgram)
                            }
                            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#1F4E5A] px-4 text-xs font-bold text-white shadow-xs hover:bg-[#163a43] transition cursor-pointer disabled:opacity-50"
                            title="Reschedule this program's date to today and mark it as Ongoing"
                          >
                            <CalendarDays className="h-3.5 w-3.5" /> Reschedule to Today &amp; Mark Ongoing
                          </button>
                        )}
                      </div>
                    </>
                  ) : viewStatus === "ONGOING" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openActionConfirmation("cancel", viewingProgram)}
                        className="h-10 rounded-lg border border-red-200 bg-white px-4 text-xs font-bold text-red-700 transition hover:bg-red-50 cursor-pointer"
                      >
                        Cancel Program
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewingProgram(null)}
                          className="h-10 rounded-lg border border-[#d8dadc] bg-white px-4 text-xs font-bold text-[#0d1117] hover:bg-slate-50 cursor-pointer"
                        >
                          Close
                        </button>
                        <button
                          type="button"
                          onClick={() => openReconcileModal(viewingProgram)}
                          className="btn-primary inline-flex h-10 items-center gap-1.5 rounded-lg px-5 text-xs font-bold text-white shadow-xs transition cursor-pointer"
                        >
                          <Check className="h-4 w-4" /> Complete &amp; Reconcile Stock
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setViewingProgram(null)}
                      className="ml-auto h-10 rounded-lg border border-[#d8dadc] bg-white px-5 text-xs font-bold text-[#0d1117] hover:bg-slate-50 cursor-pointer"
                    >
                      Close
                    </button>
                  )}
                </footer>
              </div>
            );
          })()}
        </ModalShell>
      )}

      {/* ========================================================================= */}
      {/* COMPLETE & RECONCILE STOCK MODAL (Stage 3 Finalization)                   */}
      {/* ========================================================================= */}
      {reconcilingProgram && (
        <ModalShell
          labelledBy="reconcile-program-title"
          onClose={() => !isActionSaving && setReconcilingProgram(null)}
          panelClassName="max-w-2xl"
        >
          <div className="w-full overflow-hidden rounded-xl border border-[#CFDDE0] bg-white shadow-2xl">
            <header className="border-b border-[#e5e7eb] px-6 py-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#1F4E5A]">
                  Stage 3 · Finalize Program &amp; Stock Return
                </p>
                <span className="rounded-full bg-[#FEF6E7] px-2.5 py-0.5 text-[10px] font-black uppercase text-[#9A6700] ring-1 ring-[#D99B26]/30">
                  Reconciling Stock
                </span>
              </div>
              <h2
                id="reconcile-program-title"
                className="mt-1 text-xl font-black text-[#0d1117]"
              >
                Complete &ldquo;{reconcilingProgram.program_name}&rdquo;
              </h2>
              <p className="mt-1 text-xs text-[#5B7077]">
                Enter the unused medicine quantities returned from the program. The system
                automatically calculates{" "}
                <strong>Actual Dispensed = Allocated Stock &minus; Returned Stock</strong> and
                deducts only the dispensed amount from CHO physical inventory.
              </p>
            </header>

            <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
              {/* 3-Card Live Calculation Strip */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#CFDDE0] bg-[#F4F8F8] p-3.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#5B7077]">
                    1. Allocated (Reserved)
                  </p>
                  <p className="mt-1 text-2xl font-black text-[#1B2B30]">
                    {reconciliationSummary.totalAllocated.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-[#5B7077]">
                    Initial units taken to program
                  </p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-800">
                    2. Returned Unused Stock
                  </p>
                  <p className="mt-1 text-2xl font-black text-amber-900">
                    {reconciliationSummary.totalReturned.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-amber-800">
                    Restored to CHO dispensable stock
                  </p>
                </div>

                <div className="rounded-xl border border-[#4C9F80]/40 bg-[#E8F5F1] p-3.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#226048]">
                    3. Actual Dispensed
                  </p>
                  <p className="mt-1 text-2xl font-black text-[#226048]">
                    {reconciliationSummary.totalDispensed.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-[#2D7A5D]">
                    Deducted from CHO physical stock
                  </p>
                </div>
              </div>

              {reconciliationSummary.errorMsg && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{reconciliationSummary.errorMsg}</span>
                </div>
              )}

              {/* Per-Medicine Reconciliation Table */}
              <div className="overflow-hidden rounded-xl border border-[#CFDDE0]">
                <div className="flex items-center justify-between border-b border-[#CFDDE0] bg-[#F4F8F8] px-4 py-2.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#1B2B30]">
                    Medicine Stock Return &amp; Dispensed Calculation
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const zeroed = {};
                      (reconcilingProgram.medicines || []).forEach((m) => {
                        zeroed[m.medicine_id] = "0";
                      });
                      setReturnInputs(zeroed);
                    }}
                    className="text-[11px] font-bold text-[#1F4E5A] hover:underline cursor-pointer"
                  >
                    Reset Returned to 0 (100% Dispensed)
                  </button>
                </div>

                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#CFDDE0] bg-white text-[10px] font-bold uppercase tracking-wider text-[#5B7077]">
                    <tr>
                      <th className="px-4 py-2.5">Medicine</th>
                      <th className="px-3 py-2.5 text-right">Allocated</th>
                      <th className="px-4 py-2.5 text-center">Returned Unused Stock</th>
                      <th className="px-4 py-2.5 text-right text-[#226048]">
                        Actual Dispensed
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#CFDDE0]/60">
                    {reconciliationSummary.lines.map((line) => {
                      const unit = line.medicine?.unit_of_measure || "units";
                      return (
                        <tr key={line.id || line.medicine_id} className="hover:bg-[#F9FBFB]">
                          <td className="px-4 py-3">
                            <p className="font-bold text-[#1B2B30]">
                              {line.medicine?.generic_name || "Medicine"}
                              {line.medicine?.dosage ? ` ${line.medicine.dosage}` : ""}
                            </p>
                            <p className="text-[11px] text-[#5B7077]">Unit: {unit}</p>
                          </td>

                          <td className="px-3 py-3 text-right font-bold text-[#1B2B30] whitespace-nowrap">
                            {line.allocated.toLocaleString()}{" "}
                            <span className="text-[11px] font-normal text-[#5B7077]">
                              {unit}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <div className="mx-auto flex max-w-[150px] items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max={line.allocated}
                                step="1"
                                value={line.rawInput}
                                onChange={(e) =>
                                  setReturnInputs((prev) => ({
                                    ...prev,
                                    [line.medicine_id]: e.target.value,
                                  }))
                                }
                                className={`h-9 w-full rounded-lg border px-2.5 text-center text-sm font-black outline-none transition ${
                                  line.isInvalid
                                    ? "border-red-400 bg-red-50 text-red-700"
                                    : "border-[#CFDDE0] bg-white text-[#1B2B30] focus:border-[#1F4E5A] focus:ring-2 focus:ring-[#1F4E5A]/20"
                                }`}
                              />
                            </div>
                            <p className="mt-0.5 text-center text-[10px] text-[#5B7077]">
                              0 – {line.allocated.toLocaleString()} max
                            </p>
                          </td>

                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span className="inline-flex items-baseline gap-1 rounded-lg bg-[#E8F5F1] px-2.5 py-1 text-sm font-black text-[#226048]">
                              {line.dispensed.toLocaleString()}
                              <span className="text-[10px] font-bold lowercase">
                                {unit}
                              </span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <footer className="flex items-center justify-between border-t border-[#e5e7eb] px-6 py-4 bg-slate-50/50">
              <button
                type="button"
                disabled={isActionSaving}
                onClick={() => setReconcilingProgram(null)}
                className="h-10 rounded-lg border border-[#d8dadc] bg-white px-4 text-xs font-bold text-[#42474e] hover:bg-[#f7f8fa] disabled:opacity-50 cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!reconciliationSummary.isValid || isActionSaving}
                onClick={handleConfirmReconcileAndComplete}
                className="btn-primary inline-flex h-10 items-center gap-1.5 rounded-lg px-5 text-xs font-bold text-white shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isActionSaving
                  ? "Finalizing Stock..."
                  : `Confirm Completion & Deduct ${reconciliationSummary.totalDispensed.toLocaleString()} Units`}
              </button>
            </footer>
          </div>
        </ModalShell>
      )}

      {/* ========================================================================= */}
      {/* ACTION CONFIRMATION MODAL (Start Ongoing / Reschedule & Start / Cancel)   */}
      {/* ========================================================================= */}
      {pendingAction && (
        <ModalShell
          labelledBy="program-action-confirmation-title"
          onClose={() => !isActionSaving && setPendingAction(null)}
          panelClassName="max-w-md"
        >
          <div className="w-full overflow-hidden rounded-xl border border-[#CFDDE0] bg-[#F9FBFB] shadow-2xl">
            <header className="flex items-start gap-3 border-b border-[#CFDDE0] px-6 py-5">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  pendingAction.action === "cancel"
                    ? "bg-[#faedf0] text-[#D9826B]"
                    : "bg-[#FEF6E7] text-[#9A6700]"
                }`}
              >
                {pendingAction.action === "cancel" ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#1F4E5A]">
                  Confirm Action
                </p>
                <h2
                  id="program-action-confirmation-title"
                  className="mt-1 text-base font-black text-[#1B2B30]"
                >
                  {pendingAction.action === "cancel"
                    ? `Cancel ${pendingAction.program.program_name}?`
                    : pendingAction.action === "reschedule-start"
                    ? `Reschedule to Today & Mark ${pendingAction.program.program_name} as Ongoing?`
                    : `Mark ${pendingAction.program.program_name} as Ongoing?`}
                </h2>
              </div>
            </header>
            <div className="px-6 py-5">
              <p className="text-sm leading-6 text-[#5B7077]">
                {pendingAction.action === "cancel"
                  ? "This will release the reserved medicine allocation back into CHO dispensable stock and mark the program as Cancelled."
                  : pendingAction.action === "reschedule-start"
                  ? `This will update the scheduled date from ${formatDate(pendingAction.program.program_date)} to Today (${formatDate(todayIso)}) and transition the program status to Ongoing while keeping its allocated stock reserved.`
                  : "This will transition the program status from Upcoming to Ongoing. Allocated medicines will remain protected under Reserved Stock until you Complete & Reconcile Stock."}
              </p>
            </div>
            <footer className="flex justify-end gap-2 border-t border-[#e5e7eb] px-6 py-4 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                disabled={isActionSaving}
                className="h-10 rounded-lg border border-[#d8dadc] bg-white px-4 text-xs font-bold text-[#42474e] hover:bg-[#f7f8fa] disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={confirmProgramAction}
                disabled={isActionSaving}
                className={`h-10 rounded-lg px-4 text-xs font-bold text-white shadow-xs cursor-pointer transition disabled:opacity-60 ${
                  pendingAction.action === "cancel"
                    ? "bg-red-700 hover:bg-red-800"
                    : "bg-[#D99B26] hover:bg-[#b8821d]"
                }`}
              >
                {isActionSaving
                  ? "Processing..."
                  : pendingAction.action === "cancel"
                  ? "Confirm Cancellation"
                  : pendingAction.action === "reschedule-start"
                  ? "Reschedule & Mark Ongoing"
                  : "Mark as Ongoing"}
              </button>
            </footer>
          </div>
        </ModalShell>
      )}

      {/* Success Popup Modal */}
      {successModal && (
        <ModalShell
          labelledBy="other-program-success-title"
          onClose={() => setSuccessModal(null)}
          panelClassName="max-w-sm"
        >
          <div className="w-full overflow-hidden rounded-2xl border border-[#CFDDE0] bg-[#F9FBFB] p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F5F1] text-[#2D7A5D]">
              <CheckCircle2 className="h-8 w-8 text-[#2D7A5D]" />
            </div>
            <h3 id="other-program-success-title" className="text-lg font-black text-[#1B2B30]">
              {successModal.title || "Success"}
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-[#5B7077] leading-relaxed">
              {successModal.message}
            </p>
            <button
              type="button"
              onClick={() => setSuccessModal(null)}
              className="mt-6 w-full rounded-xl bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] px-4 py-2.5 text-sm font-bold text-white shadow-xs transition hover:brightness-105 active:scale-[0.99] cursor-pointer"
            >
              OK
            </button>
          </div>
        </ModalShell>
      )}
    </AdminShell>
  );
}
