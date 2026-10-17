import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Eye,
  FileText,
  Info,
  Package,
  Pill,
  Plus,
  RefreshCw,
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
    return { label: "Today", style: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);
  if (dateStr === tomorrowIso) {
    return { label: "Tomorrow", style: "bg-blue-50 text-blue-700 ring-blue-200" };
  }
  if (dateStr < today) {
    return { label: "Past Due", style: "bg-amber-50 text-amber-700 ring-amber-200" };
  }
  return null;
};

const getProgramStatus = (program) => {
  if (program?.status) return program.status;
  const date = program?.program_date;
  if (!date) return "UPCOMING";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const programDate = new Date(`${date}T00:00:00`);
  return programDate < today ? "COMPLETED" : "UPCOMING";
};

const statusClass = {
  UPCOMING: "bg-blue-50 text-blue-700 ring-blue-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-200",
};

const statusLabel = {
  UPCOMING: "Upcoming",
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
    getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, [])
  );
  const [inventory, setInventory] = useState(() =>
    getSnapshot(STORAGE_KEYS.INVENTORY, [])
  );
  const [medicines, setMedicines] = useState(() =>
    getInventoryMedicines(getSnapshot(STORAGE_KEYS.INVENTORY, []))
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(
    () => getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []).length === 0
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingProgram, setEditingProgram] = useState(null);
  const [viewingProgram, setViewingProgram] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [isActionSaving, setIsActionSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const today = useMemo(() => formatDateTime(new Date()), []);

  const loadPrograms = useCallback(async () => {
    // Resolve CHO facility ID reliably
    const cachedFacilities = getSnapshot(STORAGE_KEYS.FACILITIES, []);
    const choFacility = cachedFacilities.find(
      (f) => f.facility_type === "CHO" || f.facility_code === "CHO-NAGA"
    );
    const resolvedChoFacilityId =
      choFacility?.id || profile?.facility_id || "0b7e2eaa-1072-4fb1-8e14-d6fb46097aad";

    if (!isCurrentNetworkOnline()) {
      setPrograms(getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []));
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

    const [programResult, inventoryResult, facilitiesResult] = await Promise.all([
      supabase
        .from("other_programs")
        .select(`
          id, facility_id, program_name, program_date, description, status, completed_at, cancelled_at,
          medicines:program_medicines(
            id, medicine_id, quantity_used,
            medicine:medicines(id, generic_name, dosage, unit_of_measure)
          )
        `)
        .order("program_date", { ascending: false }),
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

    if (programResult.error) {
      setPrograms(getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []));
      setError(programResult.error.message || "Unable to load Other Programs.");
    } else {
      setPrograms(programResult.data || []);
      saveSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, programResult.data || []);
    }

    if (!inventoryResult.error) {
      setInventory(inventoryResult.data || []);
      setMedicines(getInventoryMedicines(inventoryResult.data || []));
      saveSnapshot(STORAGE_KEYS.INVENTORY, inventoryResult.data || []);
    }
    setIsLoading(false);
  }, [profile?.facility_id]);

  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);

  // Derived KPI counts
  const counts = useMemo(() => {
    let upcoming = 0;
    let completed = 0;
    let cancelled = 0;
    let totalReservedUnits = 0;

    programs.forEach((program) => {
      const status = getProgramStatus(program);
      if (status === "UPCOMING") {
        upcoming += 1;
        (program.medicines || []).forEach((item) => {
          totalReservedUnits += Number(item.quantity_used || 0);
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
      completed,
      cancelled,
      totalReservedUnits,
    };
  }, [programs]);

  const filteredPrograms = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return programs.filter((program) => {
      const status = getProgramStatus(program);
      const medicineNames = (program.medicines || [])
        .map(
          (item) =>
            `${item.medicine?.generic_name || ""} ${item.medicine?.brand_name || ""}`
        )
        .join(" ")
        .toLowerCase();
      const searchable =
        `${program.program_name || ""} ${program.description || ""} ${medicineNames}`.toLowerCase();

      return (
        (!keyword || searchable.includes(keyword)) &&
        (statusFilter === "ALL" || status === statusFilter)
      );
    });
  }, [programs, searchTerm, statusFilter]);

  const pagination = usePaginatedRows(filteredPrograms);

  const openCreate = () => {
    setEditingProgram(null);
    setForm({ ...emptyForm, program_date: getTodayIso() });
    setError("");
    setIsModalOpen(true);
  };

  const openEdit = (program) => {
    setEditingProgram(program);
    setForm({
      program_name: program.program_name || "",
      program_date: program.program_date || "",
      description: program.description || "",
      medicines: (program.medicines || []).map((item) => ({
        medicine_id: item.medicine_id,
        quantity_used: item.quantity_used,
      })),
    });
    setError("");
    setIsModalOpen(true);
  };

  const openView = (program) => setViewingProgram(program);

  const openActionConfirmation = (action, program) => {
    if (isCurrentNetworkOnline()) {
      setPendingAction({ action, program });
    }
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
        .filter(
          (program) =>
            getProgramStatus(program) === "UPCOMING" &&
            program.id !== editingProgram?.id
        )
        .flatMap((program) => program.medicines || [])
        .filter((line) => line.medicine_id === medicineId)
        .reduce((sum, line) => sum + Number(line.quantity_used || 0), 0);

      return Math.max(0, physical - reserved);
    },
    [inventory, programs, editingProgram?.id]
  );

  // Validate form errors in real time
  const formValidation = useMemo(() => {
    const lines = form.medicines.filter((line) => line.medicine_id);
    let errorMsg = "";
    let hasOverAllocation = false;

    if (!form.program_name.trim()) {
      errorMsg = "Program name is required.";
    } else if (!form.program_date) {
      errorMsg = "Scheduled date is required.";
    } else if (form.program_date < getTodayIso()) {
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
          errorMsg = "One or more allocations exceed available stock.";
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
  }, [form, getAvailableStock]);

  const saveProgram = async (event) => {
    event.preventDefault();
    if (!isCurrentNetworkOnline()) {
      setError("Connect to the internet before saving an Other Program.");
      return;
    }

    if (!formValidation.isValid) {
      setError(formValidation.errorMsg);
      return;
    }

    const lines = form.medicines.filter((line) => line.medicine_id);

    setIsSaving(true);
    setError("");
    const payload = {
      program_name: form.program_name.trim(),
      program_date: form.program_date,
      description: form.description.trim() || null,
    };

    const { error: programError } = await supabase.rpc("save_other_program", {
      p_program_id: editingProgram?.id || null,
      p_program_name: payload.program_name,
      p_program_date: payload.program_date,
      p_description: payload.description,
      p_items: lines.map((line) => ({
        medicine_id: line.medicine_id,
        quantity_used: Number(line.quantity_used),
      })),
    });

    if (programError) {
      setError(getErrorMessage(programError));
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    closeModal();
    setNotice(
      editingProgram
        ? "Program updated successfully."
        : "Program created and medicines reserved."
    );
    await loadPrograms();
  };

  const deleteProgram = async (program) => {
    if (!isCurrentNetworkOnline()) return;
    setIsActionSaving(true);
    try {
      const { error: cancelError } = await supabase.rpc("cancel_other_program", {
        p_program_id: program.id,
      });
      if (cancelError) {
        setError(getErrorMessage(cancelError));
        return;
      }
      setViewingProgram(null);
      setNotice("Program cancelled. Reserved stock has been released.");
      await loadPrograms();
    } finally {
      setIsActionSaving(false);
    }
  };

  const completeProgram = async (program) => {
    if (!isCurrentNetworkOnline()) return;
    setIsActionSaving(true);
    try {
      const { error: completeError } = await supabase.rpc(
        "complete_other_program",
        { p_program_id: program.id }
      );
      if (completeError) {
        setError(getErrorMessage(completeError));
        return;
      }
      setViewingProgram(null);
      setNotice(
        "Program completed successfully. Allocated stock has been deducted."
      );
      await loadPrograms();
    } finally {
      setIsActionSaving(false);
    }
  };

  const confirmProgramAction = async () => {
    if (!pendingAction || isActionSaving) return;
    const { action, program } = pendingAction;
    setPendingAction(null);
    if (action === "cancel") await deleteProgram(program);
    else await completeProgram(program);
  };

  // Medicine details map for fast lookup
  const medicineMap = useMemo(() => {
    const map = new Map();
    medicines.forEach((med) => map.set(med.id, med));
    return map;
  }, [medicines]);

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
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0d1117] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[#25313b] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> Add Program
            </button>
          </header>

          {/* Feedback Notices */}
          {(error || notice) && (
            <div
              className={`mx-6 mt-4 flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-semibold ${
                error
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              <div className="flex items-center gap-2">
                {error ? (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                )}
                <span>{error || notice}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setNotice("");
                }}
                className="text-sm font-bold opacity-70 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Top Interactive KPI Cards (Primary Status Filtering) */}
          <div className="grid gap-3 p-6 sm:grid-cols-2 xl:grid-cols-4">
            {/* Card 1: Total Programs */}
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
                statusFilter === "ALL"
                  ? "border-[#007a52] bg-emerald-50/20 ring-2 ring-emerald-100"
                  : "border-[#d8dadc] bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-[#69717d]">
                  Total Programs
                </span>
                <span className="rounded-lg bg-slate-100 p-2 text-slate-700 group-hover:bg-slate-200">
                  <ClipboardList className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-black text-[#0d1117] leading-none">
                  {counts.all}
                </p>
                <p className="mt-1 text-xs text-[#69717d]">
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
              className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
                statusFilter === "UPCOMING"
                  ? "border-blue-500 bg-blue-50/30 ring-2 ring-blue-100"
                  : "border-[#d8dadc] bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-blue-700">
                  Upcoming Missions
                </span>
                <span className="rounded-lg bg-blue-50 p-2 text-blue-700 group-hover:bg-blue-100">
                  <CalendarDays className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-black text-[#0d1117] leading-none">
                  {counts.upcoming}
                </p>
                <p className="mt-1 text-xs text-[#69717d]">
                  Active & scheduled to dispatch
                </p>
              </div>
            </button>

            {/* Card 3: Completed Missions */}
            <button
              type="button"
              onClick={() =>
                setStatusFilter(statusFilter === "COMPLETED" ? "ALL" : "COMPLETED")
              }
              className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
                statusFilter === "COMPLETED"
                  ? "border-[#007a52] bg-emerald-50/30 ring-2 ring-emerald-100"
                  : "border-[#d8dadc] bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-[#007a52]">
                  Completed Missions
                </span>
                <span className="rounded-lg bg-emerald-50 p-2 text-[#007a52] group-hover:bg-emerald-100">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-black text-[#0d1117] leading-none">
                  {counts.completed}
                </p>
                <p className="mt-1 text-xs text-[#69717d]">
                  Fulfilled & stock deducted
                </p>
              </div>
            </button>

            {/* Card 4: Total Reserved Units */}
            <div className="flex flex-col justify-between rounded-xl border border-[#d8dadc] bg-white p-4">
              <div className="flex items-start justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-amber-700">
                  Reserved Units
                </span>
                <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                  <Boxes className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-black text-[#0d1117] leading-none">
                  {counts.totalReservedUnits.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-[#69717d]">
                  Committed for upcoming drives
                </p>
              </div>
            </div>
          </div>

          {/* Clean Search & Refresh Toolbar (Redundant tabs removed) */}
          <div className="flex items-center justify-between gap-3 border-t border-[#e5e7eb] px-6 py-4">
            <div className="relative min-w-0 flex-1 max-w-lg">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a919b]" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by program, description, or medicine name..."
                className="h-10 w-full rounded-lg border border-[#d8dadc] bg-white pl-9 pr-9 text-sm text-[#0d1117] outline-none transition focus:border-[#007a52] focus:ring-2 focus:ring-[#007a52]/15"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a919b] hover:text-[#0d1117]"
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={loadPrograms}
              disabled={isLoading}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#d8dadc] bg-white px-3.5 text-xs font-bold text-[#252a31] shadow-sm hover:bg-[#f7f8fa] active:scale-[0.98] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-[#007a52]" : ""}`}
              />
              Refresh
            </button>
          </div>

          {/* Main Table */}
          <div className="overflow-x-auto border-t border-[#e5e7eb]">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="border-b border-slate-200/80 bg-white text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3.5">Program & Objectives</th>
                  <th className="px-4 py-3.5">Scheduled Date</th>
                  <th className="px-4 py-3.5">Allocated Medicines</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef0f2]">
                {pagination.paginatedRows.map((program) => {
                  const status = getProgramStatus(program);
                  const relDate =
                    status === "UPCOMING"
                      ? getRelativeDateLabel(program.program_date)
                      : null;
                  const totalUnits = (program.medicines || []).reduce(
                    (sum, item) => sum + Number(item.quantity_used || 0),
                    0
                  );

                  return (
                    <tr
                      key={program.id}
                      className="transition duration-150 hover:bg-[#fbfdfc]"
                    >
                      {/* Program & Description */}
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => openView(program)}
                          className="group text-left"
                        >
                          <p className="font-bold text-[#0d1117] transition group-hover:text-[#007a52]">
                            {program.program_name}
                          </p>
                          <p className="mt-1 max-w-sm truncate text-xs text-[#69717d]">
                            {program.description || (
                              <span className="italic text-slate-400">
                                No description recorded
                              </span>
                            )}
                          </p>
                        </button>
                      </td>

                      {/* Scheduled Date */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-[#252a31]">
                            <CalendarDays className="h-4 w-4 text-[#007a52]" />
                            {formatDate(program.program_date)}
                          </span>
                          {relDate && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ${relDate.style}`}
                            >
                              {relDate.label}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Medicine Allocation Chips */}
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-bold text-[#42474e]">
                            {program.medicines?.length || 0} medicine
                            {(program.medicines?.length || 0) === 1 ? "" : "s"} ·{" "}
                            <span className="text-[#0d1117]">
                              {totalUnits.toLocaleString()} units
                            </span>
                          </span>
                          <div className="flex max-w-xs flex-wrap gap-1">
                            {(program.medicines || []).slice(0, 2).map((item) => (
                              <span
                                key={item.id}
                                className="rounded bg-[#effcf7] px-2 py-0.5 text-[11px] font-bold text-[#007a52]"
                              >
                                {item.medicine?.generic_name || "Medicine"}
                                {item.medicine?.dosage
                                  ? ` ${item.medicine.dosage}`
                                  : ""}{" "}
                                ×{Number(item.quantity_used || 0).toLocaleString()}
                              </span>
                            ))}
                            {(program.medicines?.length || 0) > 2 && (
                              <span className="rounded bg-[#f1f3f5] px-2 py-0.5 text-[11px] font-bold text-[#69717d]">
                                +{program.medicines.length - 2} more
                              </span>
                            )}
                            {!program.medicines?.length && (
                              <span className="text-xs font-semibold text-[#8a919b]">
                                No allocation
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ring-1 ${statusClass[status]}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              status === "UPCOMING"
                                ? "bg-blue-600"
                                : status === "COMPLETED"
                                ? "bg-emerald-600"
                                : "bg-slate-400"
                            }`}
                          />
                          {statusLabel[status] || status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openView(program)}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-[#d8dadc] bg-white px-2.5 text-xs font-bold text-[#0d1117] transition hover:border-[#007a52] hover:text-[#007a52]"
                          >
                            <Eye className="h-3.5 w-3.5" /> Details
                          </button>
                          {status === "UPCOMING" && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(program)}
                                className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                                title="Edit Program Details"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  openActionConfirmation("complete", program)
                                }
                                className="inline-flex h-8 items-center gap-1 rounded-md bg-[#0d1117] px-2.5 text-xs font-bold text-white transition hover:bg-[#25313b]"
                                title="Fulfill and Deduct Stock"
                              >
                                <Check className="h-3.5 w-3.5" /> Complete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* Empty State */}
                {!isLoading && pagination.totalCount === 0 && (
                  <tr>
                    <td colSpan="5" className="px-6 py-16 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <ClipboardList className="h-6 w-6" />
                      </div>
                      <p className="mt-3 text-base font-bold text-[#0d1117]">
                        {searchTerm
                          ? "No matching programs found"
                          : "No programs recorded yet"}
                      </p>
                      <p className="mt-1 text-sm text-[#69717d]">
                        {searchTerm
                          ? "Try searching for a different program name, description, or medicine."
                          : "Add an outreach mission or program to allocate and reserve medicines."}
                      </p>
                      {searchTerm ? (
                        <button
                          type="button"
                          onClick={() => setSearchTerm("")}
                          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d8dadc] bg-white px-3 text-xs font-bold text-[#0d1117] hover:bg-slate-50"
                        >
                          Clear Search
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={openCreate}
                          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0d1117] px-3.5 text-xs font-bold text-white hover:bg-[#25313b]"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Program
                        </button>
                      )}
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
            {/* Modal Header without eyebrow or close icon */}
            <header className="border-b border-[#e5e7eb] px-6 py-5">
              <h2
                id="program-modal-title"
                className="text-xl font-black text-[#0d1117]"
              >
                {editingProgram ? "Edit Program" : "Add Other Program"}
              </h2>
              <p className="mt-1 text-xs text-[#69717d]">
                Record the outreach activity and allocate medicines to reserve from
                CHO central inventory.
              </p>
            </header>

            {/* Modal Body */}
            <div className="max-h-[72vh] space-y-6 overflow-y-auto px-6 py-5">
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Section 1: Activity Details */}
              <div className="rounded-xl border border-[#e1e4e8] bg-[#fbfdfc] p-4">
                <div className="flex items-center gap-2 border-b border-[#e1e4e8] pb-3 mb-4">
                  <FileText className="h-4 w-4 text-[#007a52]" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#252a31]">
                    1. Activity Information
                  </h3>
                </div>

                {/* Program Name and Scheduled Date side-by-side */}
                <div className="grid gap-4 sm:grid-cols-[1fr_210px]">
                  {/* Program Name */}
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-[#0d1117]">
                      Program Name <span className="text-red-500">*</span>
                    </span>
                    <input
                      value={form.program_name}
                      onChange={(event) =>
                        updateForm("program_name", event.target.value)
                      }
                      placeholder="e.g. Community Medical Mission - Brgy. Inayagan"
                      className="h-10 w-full rounded-lg border border-[#d8dadc] bg-white px-3 text-sm text-[#0d1117] outline-none transition focus:border-[#007a52] focus:ring-2 focus:ring-[#007a52]/15"
                      required
                    />
                  </label>

                  {/* Scheduled Date */}
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-[#0d1117]">
                      Scheduled Date <span className="text-red-500">*</span>
                    </span>
                    <input
                      type="date"
                      min={getTodayIso()}
                      value={form.program_date}
                      onChange={(event) =>
                        updateForm("program_date", event.target.value)
                      }
                      className="h-10 w-full rounded-lg border border-[#d8dadc] bg-white px-3 text-sm text-[#0d1117] outline-none transition focus:border-[#007a52] focus:ring-2 focus:ring-[#007a52]/15"
                      required
                    />
                    {form.program_date && form.program_date < getTodayIso() && (
                      <p className="mt-1 text-xs font-bold text-red-600">
                        Date cannot be in past.
                      </p>
                    )}
                  </label>
                </div>

                {/* Description / Beneficiaries */}
                <label className="block mt-4">
                  <span className="mb-1.5 block text-xs font-bold text-[#0d1117]">
                    Description & Target Beneficiaries{" "}
                    <span className="text-xs font-normal text-[#69717d]">
                      (Optional)
                    </span>
                  </span>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(event) =>
                      updateForm("description", event.target.value)
                    }
                    placeholder="Specify location, partner organizations, target patient demographics, or mission goals..."
                    className="w-full rounded-lg border border-[#d8dadc] bg-white p-3 text-sm text-[#0d1117] outline-none transition focus:border-[#007a52] focus:ring-2 focus:ring-[#007a52]/15"
                  />
                </label>
              </div>

              {/* Section 2: Medicine Allocation Table */}
              <div className="rounded-xl border border-[#e1e4e8] bg-white">
                <div className="flex items-center justify-between border-b border-[#e1e4e8] bg-[#fbfdfc] px-4 py-3 rounded-t-xl">
                  <div>
                    <div className="flex items-center gap-2">
                      <Pill className="h-4 w-4 text-[#007a52]" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-[#252a31]">
                        2. Medicine Allocation
                      </h3>
                    </div>
                    <p className="mt-0.5 text-xs text-[#69717d]">
                      Select medicines and quantities to reserve from CHO inventory.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addMedicineLine}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0d1117] px-3 text-xs font-bold text-white transition hover:bg-[#25313b] active:scale-[0.98]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Medicine
                  </button>
                </div>

                {/* Table Header */}
                {form.medicines.length > 0 && (
                  <div className="hidden border-b border-[#e1e4e8] bg-[#f7f8fa] px-4 py-2 text-[11px] font-black uppercase tracking-wider text-[#69717d] sm:grid sm:grid-cols-[1fr_130px_130px_40px] gap-3">
                    <span>Medicine</span>
                    <span>Available Stock</span>
                    <span>Allocated Qty</span>
                    <span className="text-center">Action</span>
                  </div>
                )}

                {/* Medicine Rows */}
                <div className="divide-y divide-[#f0f2f4] p-2 sm:p-0">
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

                    // Filter out medicines selected in other lines to prevent duplicates
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
                        className="flex flex-col gap-2 p-3 sm:grid sm:grid-cols-[1fr_130px_130px_40px] sm:items-center sm:gap-3 sm:px-4 sm:py-3 transition hover:bg-slate-50/50"
                      >
                        {/* Medicine Selector */}
                        <div>
                          <label className="text-[10px] font-bold uppercase text-[#69717d] sm:hidden block mb-1">
                            Medicine
                          </label>
                          <select
                            value={line.medicine_id}
                            onChange={(event) =>
                              updateMedicineLine(index, "medicine_id", event.target.value)
                            }
                            className="h-10 w-full rounded-lg border border-[#d8dadc] bg-white px-3 text-xs font-semibold text-[#0d1117] outline-none transition focus:border-[#007a52] focus:ring-1 focus:ring-[#007a52] truncate"
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

                        {/* Available Stock Indicator */}
                        <div className="flex items-center">
                          <label className="text-[10px] font-bold uppercase text-[#69717d] sm:hidden mr-2">
                            Available:
                          </label>
                          {line.medicine_id ? (
                            availableStock > 0 ? (
                              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">
                                {availableStock.toLocaleString()} {unitLabel}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
                                Out of Stock
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-[#8a919b]">
                              — Select medicine
                            </span>
                          )}
                        </div>

                        {/* Quantity Input (Without Max Button) */}
                        <div>
                          <label className="text-[10px] font-bold uppercase text-[#69717d] sm:hidden block mb-1">
                            Allocated Qty
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
                                  ? "border-red-400 bg-red-50/30 text-red-700 ring-2 ring-red-100"
                                  : "border-[#d8dadc] text-[#0d1117] focus:border-[#007a52] focus:ring-1 focus:ring-[#007a52]"
                              }`}
                              disabled={!line.medicine_id || availableStock <= 0}
                              required
                            />
                            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                              {unitLabel}
                            </span>
                          </div>
                          {isOverAllocated && (
                            <p className="mt-1 text-[11px] font-bold text-red-600">
                              Exceeds stock (max {availableStock.toLocaleString()})
                            </p>
                          )}
                        </div>

                        {/* Remove Action */}
                        <div className="flex justify-end sm:justify-center">
                          <button
                            type="button"
                            onClick={() => removeMedicineLine(index)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                            aria-label="Remove medicine"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Empty Medicine State */}
                  {form.medicines.length === 0 && (
                    <div className="p-8 text-center">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <Boxes className="h-5 w-5" />
                      </div>
                      <p className="mt-2 text-sm font-bold text-[#252a31]">
                        No medicines allocated yet
                      </p>
                      <p className="mt-1 text-xs text-[#69717d]">
                        Click the &quot;+ Add Medicine&quot; button above to select and
                        reserve stock for this program.
                      </p>
                    </div>
                  )}
                </div>

                {/* Reservation Summary Footer Strip */}
                {form.medicines.length > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-[#e1e4e8] bg-[#fbfdfc] px-4 py-3 rounded-b-xl gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-[#69717d]">
                      <Info className="h-3.5 w-3.5 text-[#007a52]" />
                      <span>
                        Allocated stock will be placed on <strong>RESERVED</strong> status.
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-[#69717d]">
                        Total Planned:{" "}
                      </span>
                      <span className="text-sm font-black text-[#0d1117]">
                        {formValidation.totalMedicines} medicine
                        {formValidation.totalMedicines === 1 ? "" : "s"} ·{" "}
                        {formValidation.totalUnits.toLocaleString()} units
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <footer className="flex items-center justify-between border-t border-[#e5e7eb] px-6 py-4 bg-slate-50/50">
              <span className="text-xs text-[#69717d]">
                {formValidation.isValid ? (
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                    <Check className="h-3.5 w-3.5" /> Ready to save
                  </span>
                ) : (
                  <span className="text-slate-500">
                    Fill in all required fields to proceed
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
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0d1117] px-5 text-sm font-black text-white shadow-sm transition hover:bg-[#25313b] active:scale-[0.98] disabled:opacity-50"
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
                      statusClass[getProgramStatus(viewingProgram)]
                    }`}
                  >
                    {statusLabel[getProgramStatus(viewingProgram)]}
                  </span>
                  <span className="text-xs font-semibold text-[#69717d]">
                    Scheduled: {formatDate(viewingProgram.program_date)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getProgramStatus(viewingProgram) === "UPCOMING" && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = viewingProgram;
                      setViewingProgram(null);
                      openEdit(target);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#b9efd9] bg-white px-3 text-xs font-bold text-[#007a52] hover:bg-emerald-50"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewingProgram(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            {/* Modal Body */}
            <div className="max-h-[72vh] space-y-5 overflow-y-auto px-6 py-5">
              {/* Context Status Banner */}
              {getProgramStatus(viewingProgram) === "UPCOMING" && (
                <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900">
                  <Info className="h-4 w-4 shrink-0 text-blue-700 mt-0.5" />
                  <div>
                    <span className="font-bold">Active Stock Reservation: </span>
                    Medicines for this outreach mission are held on RESERVED status.
                    When completed, stock will be officially deducted from central inventory via FEFO.
                  </div>
                </div>
              )}
              {getProgramStatus(viewingProgram) === "COMPLETED" && (
                <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 mt-0.5" />
                  <div>
                    <span className="font-bold">Program Fulfilled: </span>
                    This mission was executed and all allocated medicine batches were
                    deducted from CHO inventory.
                  </div>
                </div>
              )}
              {getProgramStatus(viewingProgram) === "CANCELLED" && (
                <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
                  <div>
                    <span className="font-bold">Program Cancelled: </span>
                    This activity was called off. All reserved medicine quantities were
                    restored to available central stock.
                  </div>
                </div>
              )}

              {/* Mission Snapshot Cards */}
              <div className="grid gap-3 sm:grid-cols-2">
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
                    Allocated Items
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#0d1117]">
                    {viewingProgram.medicines?.length || 0} distinct medicines
                  </p>
                </div>
                <div className="rounded-lg border border-[#e1e4e8] bg-[#f8fafb] p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-[#7a828d]">
                    Total Allocated Volume
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#0d1117]">
                    {(viewingProgram.medicines || [])
                      .reduce((sum, item) => sum + Number(item.quantity_used || 0), 0)
                      .toLocaleString()}{" "}
                    units
                  </p>
                </div>
                <div className="rounded-lg border border-[#e1e4e8] bg-[#f8fafb] p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-[#7a828d]">
                    Program Status
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#0d1117]">
                    {statusLabel[getProgramStatus(viewingProgram)]}
                  </p>
                </div>
              </div>

              {/* Description */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-[#7a828d]">
                  Description & Beneficiaries
                </p>
                <div className="mt-1.5 rounded-lg border border-[#e1e4e8] bg-white p-3 text-sm text-[#42474e]">
                  {viewingProgram.description || (
                    <span className="italic text-slate-400">
                      No descriptive notes recorded.
                    </span>
                  )}
                </div>
              </div>

              {/* Medicine Table */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-wide text-[#7a828d]">
                    Medicine Distribution List
                  </p>
                  <span className="text-xs font-bold text-[#007a52]">
                    {getProgramStatus(viewingProgram) === "UPCOMING"
                      ? "Reserved"
                      : getProgramStatus(viewingProgram) === "COMPLETED"
                      ? "Deducted"
                      : "Released"}
                  </span>
                </div>
                <div className="overflow-hidden rounded-lg border border-[#e1e4e8]">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200/80 bg-white text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3.5 py-2.5">Medicine Name</th>
                        <th className="px-3 py-2.5">Unit</th>
                        <th className="px-3.5 py-2.5 text-right">Planned Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef0f2]">
                      {(viewingProgram.medicines || []).map((item) => (
                        <tr key={item.id}>
                          <td className="px-3.5 py-3 font-semibold text-[#0d1117]">
                            {item.medicine?.generic_name || "Unknown medicine"}
                            {item.medicine?.dosage ? ` ${item.medicine.dosage}` : ""}
                            {item.medicine?.brand_name
                              ? ` (${item.medicine.brand_name})`
                              : ""}
                          </td>
                          <td className="px-3 py-3 text-xs text-[#69717d]">
                            {item.medicine?.unit_of_measure || "units"}
                          </td>
                          <td className="px-3.5 py-3 text-right font-black text-[#0d1117]">
                            {Number(item.quantity_used || 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-[#fbfdfc] font-black">
                        <td colSpan="2" className="px-3.5 py-3 text-[#0d1117]">
                          Total Units
                        </td>
                        <td className="px-3.5 py-3 text-right text-[#007a52]">
                          {(viewingProgram.medicines || [])
                            .reduce(
                              (sum, item) => sum + Number(item.quantity_used || 0),
                              0
                            )
                            .toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <footer className="flex items-center justify-between border-t border-[#e5e7eb] px-6 py-4 bg-slate-50/50">
              {getProgramStatus(viewingProgram) === "UPCOMING" ? (
                <>
                  <button
                    type="button"
                    onClick={() => openActionConfirmation("cancel", viewingProgram)}
                    className="h-10 rounded-lg border border-red-200 bg-white px-4 text-xs font-bold text-red-700 transition hover:bg-red-50"
                  >
                    Cancel Program
                  </button>
                  <button
                    type="button"
                    onClick={() => openActionConfirmation("complete", viewingProgram)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#0d1117] px-5 text-xs font-black text-white shadow-sm transition hover:bg-[#25313b]"
                  >
                    <Check className="h-4 w-4" /> Complete & Deduct Stock
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setViewingProgram(null)}
                  className="ml-auto h-10 rounded-lg border border-[#d8dadc] bg-white px-5 text-xs font-bold text-[#0d1117] hover:bg-slate-50"
                >
                  Close
                </button>
              )}
            </footer>
          </div>
        </ModalShell>
      )}

      {/* ========================================================================= */}
      {/* ACTION CONFIRMATION MODAL (Complete / Cancel)                             */}
      {/* ========================================================================= */}
      {pendingAction && (
        <ModalShell
          labelledBy="program-action-confirmation-title"
          onClose={() => !isActionSaving && setPendingAction(null)}
          panelClassName="max-w-md"
        >
          <div className="w-full overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-2xl">
            <header className="flex items-start gap-3 border-b border-[#e5e7eb] px-6 py-5">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  pendingAction.action === "cancel"
                    ? "bg-red-50 text-red-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {pendingAction.action === "cancel" ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#007a52]">
                  Confirm Action
                </p>
                <h2
                  id="program-action-confirmation-title"
                  className="mt-1 text-base font-black text-[#0d1117]"
                >
                  {pendingAction.action === "cancel"
                    ? `Cancel ${pendingAction.program.program_name}?`
                    : `Complete ${pendingAction.program.program_name}?`}
                </h2>
              </div>
            </header>
            <div className="px-6 py-5">
              <p className="text-sm leading-6 text-[#69717d]">
                {pendingAction.action === "cancel"
                  ? "This will release the reserved medicine allocation back into active inventory and mark the program as Cancelled."
                  : "This will officially deduct the reserved medicine batches from CHO inventory using FEFO and mark the program as Completed."}
              </p>
            </div>
            <footer className="flex justify-end gap-2 border-t border-[#e5e7eb] px-6 py-4 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                disabled={isActionSaving}
                className="h-10 rounded-lg border border-[#d8dadc] bg-white px-4 text-xs font-bold text-[#42474e] hover:bg-[#f7f8fa] disabled:opacity-50"
              >
                Keep Program
              </button>
              <button
                type="button"
                onClick={confirmProgramAction}
                disabled={isActionSaving}
                className={`h-10 rounded-lg px-4 text-xs font-black text-white shadow-sm disabled:opacity-60 ${
                  pendingAction.action === "cancel"
                    ? "bg-red-700 hover:bg-red-800"
                    : "bg-[#0d1117] hover:bg-[#25313b]"
                }`}
              >
                {isActionSaving
                  ? "Processing..."
                  : pendingAction.action === "cancel"
                  ? "Confirm Cancellation"
                  : "Confirm & Deduct Stock"}
              </button>
            </footer>
          </div>
        </ModalShell>
      )}
    </AdminShell>
  );
}
