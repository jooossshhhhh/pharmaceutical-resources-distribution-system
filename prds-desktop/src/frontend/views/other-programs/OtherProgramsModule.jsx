import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Edit3, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";

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
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
};

const formatDateTime = (date) => new Intl.DateTimeFormat("en-PH", {
  month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
}).format(date);

const getTodayIso = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  UPCOMING: "bg-blue-50 text-blue-700 ring-blue-100",
  COMPLETED: "bg-slate-100 text-slate-600 ring-slate-200",
  CANCELLED: "bg-red-50 text-red-700 ring-red-100",
};

const statusLabel = { UPCOMING: "Upcoming", COMPLETED: "Completed", CANCELLED: "Cancelled" };

const getErrorMessage = (error) => error?.message || "Unable to save the program.";

const getInventoryMedicines = (rows = []) => {
  const today = new Date().toISOString().slice(0, 10);
  const medicinesById = new Map();

  rows
    .filter((row) => Number(row.quantity) > 0 && (!row.expiration_date || row.expiration_date >= today))
    .forEach((row) => {
      if (row.medicine?.id) medicinesById.set(row.medicine.id, row.medicine);
    });

  return [...medicinesById.values()].sort((first, second) =>
    (first.generic_name || "").localeCompare(second.generic_name || "")
  );
};

export default function OtherProgramsModule() {
  const { profile } = useAuth();
  const [programs, setPrograms] = useState(() => getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []));
  const [inventory, setInventory] = useState(() => getSnapshot(STORAGE_KEYS.INVENTORY, []));
  const [medicines, setMedicines] = useState(() => getInventoryMedicines(getSnapshot(STORAGE_KEYS.INVENTORY, [])));
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(() => getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []).length === 0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingProgram, setEditingProgram] = useState(null);
  const [viewingProgram, setViewingProgram] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [isActionSaving, setIsActionSaving] = useState(false);
  const [dateValidationOpen, setDateValidationOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const today = useMemo(() => formatDateTime(new Date()), []);

  const loadPrograms = useCallback(async () => {
    if (!isCurrentNetworkOnline()) {
      setPrograms(getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []));
      const cachedInventory = getSnapshot(STORAGE_KEYS.INVENTORY, []);
      setInventory(cachedInventory);
      setMedicines(getInventoryMedicines(cachedInventory));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");
    const [programResult, inventoryResult] = await Promise.all([
      supabase.from("other_programs").select(`
        id, facility_id, program_name, program_date, description, status, completed_at, cancelled_at,
        medicines:program_medicines(
          id, medicine_id, quantity_used,
          medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure)
        )
      `).order("program_date", { ascending: false }),
      supabase.from("inventory").select("id, facility_id, medicine_id, quantity, expiration_date, medicine:medicines(id, generic_name, brand_name, dosage, unit_of_measure)").eq("facility_id", profile?.facility_id || "").gt("quantity", 0),
    ]);

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

  useEffect(() => { loadPrograms(); }, [loadPrograms]);

  const filteredPrograms = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return programs.filter((program) => {
      const status = getProgramStatus(program);
      const searchable = `${program.program_name || ""} ${program.description || ""}`.toLowerCase();
      return (!keyword || searchable.includes(keyword)) && (statusFilter === "ALL" || status === statusFilter);
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
      medicines: (program.medicines || []).map((item) => ({ medicine_id: item.medicine_id, quantity_used: item.quantity_used })),
    });
    setError("");
    setIsModalOpen(true);
  };

  const openView = (program) => setViewingProgram(program);

  const openActionConfirmation = (action, program) => {
    if (isCurrentNetworkOnline()) setPendingAction({ action, program });
  };

  const closeModal = () => {
    if (!isSaving) {
      setIsModalOpen(false);
      setEditingProgram(null);
      setForm(emptyForm);
    }
  };

  const updateForm = (name, value) => setForm((current) => ({ ...current, [name]: value }));

  const addMedicineLine = () => setForm((current) => ({
    ...current,
    medicines: [...current.medicines, { medicine_id: "", quantity_used: "" }],
  }));

  const updateMedicineLine = (index, name, value) => setForm((current) => ({
    ...current,
    medicines: current.medicines.map((line, lineIndex) => lineIndex === index ? { ...line, [name]: value } : line),
  }));

  const removeMedicineLine = (index) => setForm((current) => ({
    ...current,
    medicines: current.medicines.filter((_, lineIndex) => lineIndex !== index),
  }));

  const saveProgram = async (event) => {
    event.preventDefault();
    if (!isCurrentNetworkOnline()) {
      setError("Connect to the internet before saving an Other Program.");
      return;
    }

    const lines = form.medicines.filter((line) => line.medicine_id);
    if (!form.program_name.trim() || !form.program_date) {
      setError("Program name and scheduled date are required.");
      return;
    }
    if (form.program_date < getTodayIso()) {
      setDateValidationOpen(true);
      return;
    }
    if (lines.length === 0 || lines.some((line) => !Number.isInteger(Number(line.quantity_used)) || Number(line.quantity_used) <= 0)) {
      setError("Add at least one medicine with a quantity greater than zero.");
      return;
    }
    if (new Set(lines.map((line) => line.medicine_id)).size !== lines.length) {
      setError("Each medicine can only be listed once in a program.");
      return;
    }

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
      p_items: lines.map((line) => ({ medicine_id: line.medicine_id, quantity_used: Number(line.quantity_used) })),
    });

    if (programError) {
      setError(getErrorMessage(programError));
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    closeModal();
    setNotice(editingProgram ? "Program updated." : "Program added.");
    await loadPrograms();
  };

  const deleteProgram = async (program) => {
    if (!isCurrentNetworkOnline()) return;
    setIsActionSaving(true);
    try {
      const { error: cancelError } = await supabase.rpc("cancel_other_program", { p_program_id: program.id });
      if (cancelError) {
        setError(getErrorMessage(cancelError));
        return;
      }
      setViewingProgram(null);
      setNotice("Program cancelled. Reserved stock is available again.");
      await loadPrograms();
    } finally {
      setIsActionSaving(false);
    }
  };

  const completeProgram = async (program) => {
    if (!isCurrentNetworkOnline()) return;
    setIsActionSaving(true);
    try {
      const { error: completeError } = await supabase.rpc("complete_other_program", { p_program_id: program.id });
      if (completeError) {
        setError(getErrorMessage(completeError));
        return;
      }
      setViewingProgram(null);
      setNotice("Program completed and allocated stock was deducted.");
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

  const getAvailableStock = (medicineId) => {
    const todayValue = new Date().toISOString().slice(0, 10);
    const physical = inventory
      .filter((row) => row.facility_id === profile?.facility_id && row.medicine_id === medicineId && Number(row.quantity) > 0 && (!row.expiration_date || row.expiration_date >= todayValue))
      .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const reserved = programs
      .filter((program) => getProgramStatus(program) === "UPCOMING" && program.id !== editingProgram?.id)
      .flatMap((program) => program.medicines || [])
      .filter((line) => line.medicine_id === medicineId)
      .reduce((sum, line) => sum + Number(line.quantity_used || 0), 0);
    return Math.max(0, physical - reserved);
  };

  return (
    <AdminShell currentDateTime={today} profile={profile} onSignOut={logoutUser}>
      <section className="prds-fade-in rounded-xl border border-[#d8dadc] bg-white shadow-sm">
        <header className="flex flex-col gap-4 border-b border-[#e5e7eb] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#007a52]">Program Registry</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-[#0d1117]">Other Programs</h1>
            <p className="mt-1 text-sm text-[#5f6673]">Plan medicine activities such as medical missions and community outreach.</p>
          </div>
          <button type="button" onClick={openCreate} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0d1117] px-4 text-sm font-black text-white transition hover:bg-[#25313b]">
            <Plus className="h-4 w-4" /> Add Program
          </button>
        </header>

        {(error || notice) && <div className={`mx-5 mt-4 rounded-lg border px-3 py-2 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || notice}</div>}

        <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="relative min-w-0 flex-1 md:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a919b]" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search program name or description" className="h-10 w-full rounded-lg border border-[#d8dadc] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#00b47d] focus:ring-2 focus:ring-[#00b47d]/15" />
          </div>
          <div className="flex gap-2">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-[#d8dadc] bg-white px-3 text-sm font-semibold text-[#42474e]">
              <option value="ALL">All programs</option><option value="UPCOMING">Upcoming</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option>
            </select>
            <button type="button" onClick={loadPrograms} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d8dadc] bg-white px-3 text-sm font-bold text-[#252a31] hover:bg-[#f7f8fa]"><RefreshCw className="h-4 w-4" /> Refresh</button>
          </div>
        </div>

        <div className="overflow-x-auto border-y border-[#e5e7eb]">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-[#f7f8fa] text-[11px] font-black uppercase tracking-[0.14em] text-[#69717d]"><tr><th className="px-5 py-3">Program</th><th className="px-4 py-3">Scheduled date</th><th className="px-4 py-3">Medicines</th><th className="px-4 py-3">Status</th></tr></thead>
            <tbody className="divide-y divide-[#eef0f2]">
              {pagination.paginatedRows.map((program) => {
                const status = getProgramStatus(program);
                return <tr key={program.id} className="transition hover:bg-[#fbfdfc]">
                  <td className="px-5 py-4"><button type="button" onClick={() => openView(program)} className="text-left"><p className="font-black text-[#0d1117] hover:text-[#008f68]">{program.program_name}</p><p className="mt-1 max-w-sm truncate text-xs text-[#69717d]">{program.description || "No description"}</p></button></td>
                  <td className="px-4 py-4 whitespace-nowrap"><span className="inline-flex items-center gap-2 font-semibold text-[#42474e]"><CalendarDays className="h-4 w-4 text-[#008f68]" />{formatDate(program.program_date)}</span></td>
                  <td className="px-4 py-4"><div className="flex max-w-xs flex-wrap gap-1.5">{(program.medicines || []).slice(0, 2).map((item) => <span key={item.id} className="rounded bg-[#effcf7] px-2 py-1 text-[11px] font-bold text-[#007a52]">{item.medicine?.generic_name || "Medicine"} x{Number(item.quantity_used || 0).toLocaleString()}</span>)}{(program.medicines?.length || 0) > 2 && <span className="rounded bg-[#f1f3f5] px-2 py-1 text-[11px] font-bold text-[#69717d]">+{program.medicines.length - 2} more</span>}{!program.medicines?.length && <span className="text-xs font-semibold text-[#69717d]">No medicines</span>}</div></td>
                  <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ring-1 ${statusClass[status]}`}>{statusLabel[status] || status}</span></td>
                </tr>;
              })}
              {!isLoading && pagination.totalCount === 0 && <tr><td colSpan="4" className="px-5 py-16 text-center"><ClipboardList className="mx-auto h-8 w-8 text-[#a4abb5]" /><p className="mt-3 font-bold text-[#42474e]">No programs recorded yet.</p><p className="mt-1 text-sm text-[#69717d]">Add a program to plan its medicine requirements.</p></td></tr>}
            </tbody>
          </table>
        </div>
        <PaginationControls currentPage={pagination.currentPage} pageSize={pagination.pageSize} totalCount={pagination.totalCount} totalPages={pagination.totalPages} itemLabel="programs" onPageChange={pagination.setCurrentPage} />
      </section>

      {isModalOpen && <ModalShell labelledBy="program-modal-title" onClose={closeModal} panelClassName="max-w-3xl"><form onSubmit={saveProgram} className="w-full overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-[#e5e7eb] px-5 py-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#007a52]">Program setup</p><h2 id="program-modal-title" className="mt-1 text-xl font-black text-[#0d1117]">{editingProgram ? "Edit Program" : "Add Program"}</h2><p className="mt-1 text-sm text-[#69717d]">Record the activity and its planned medicine quantities.</p></div><button type="button" onClick={closeModal} className="rounded-md p-1 text-[#69717d] hover:bg-[#f1f3f5]" aria-label="Close"><X className="h-5 w-5" /></button></header>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}
          <div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-[#69717d]">Program name</span><input value={form.program_name} onChange={(event) => updateForm("program_name", event.target.value)} placeholder="e.g. Medical Mission" className="h-10 w-full rounded-lg border border-[#d8dadc] px-3 text-sm outline-none focus:border-[#00b47d] focus:ring-2 focus:ring-[#00b47d]/15" /></label><label><span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-[#69717d]">Program date</span><input type="date" value={form.program_date} onChange={(event) => updateForm("program_date", event.target.value)} className="h-10 w-full rounded-lg border border-[#d8dadc] px-3 text-sm outline-none focus:border-[#00b47d] focus:ring-2 focus:ring-[#00b47d]/15" /></label><label><span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-[#69717d]">Description <span className="font-normal normal-case">(optional)</span></span><input value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="Short purpose or target group" className="h-10 w-full rounded-lg border border-[#d8dadc] px-3 text-sm outline-none focus:border-[#00b47d] focus:ring-2 focus:ring-[#00b47d]/15" /></label></div>
          <section className="rounded-lg border border-[#e1e4e8]"><div className="flex items-center justify-between border-b border-[#e1e4e8] px-4 py-3"><div><h3 className="text-sm font-black text-[#252a31]">Medicine Allocation</h3><p className="text-xs text-[#69717d]">Only available CHO inventory medicines can be allocated.</p></div><button type="button" onClick={addMedicineLine} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#0d1117] px-2.5 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" /> Add line</button></div><div className="space-y-2 p-3">{form.medicines.map((line, index) => <div key={`${index}-${line.medicine_id}`} className="grid gap-2 sm:grid-cols-[1fr_130px_36px]"><div><select value={line.medicine_id} onChange={(event) => updateMedicineLine(index, "medicine_id", event.target.value)} className="h-10 w-full rounded-lg border border-[#d8dadc] bg-white px-3 text-sm"><option value="">Select medicine</option>{medicines.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.generic_name}{medicine.dosage ? ` ${medicine.dosage}` : ""}{medicine.brand_name ? ` - ${medicine.brand_name}` : ""}</option>)}</select>{line.medicine_id && <p className="mt-1 text-[11px] font-semibold text-[#69717d]">Available to reserve: {getAvailableStock(line.medicine_id)}</p>}</div><input type="number" min="1" step="1" value={line.quantity_used} onChange={(event) => updateMedicineLine(index, "quantity_used", event.target.value)} placeholder="Quantity" className="h-10 rounded-lg border border-[#d8dadc] px-3 text-sm" /><button type="button" onClick={() => removeMedicineLine(index)} className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d8dadc] text-[#69717d] hover:border-red-200 hover:bg-red-50 hover:text-red-700" aria-label="Remove medicine"><Trash2 className="h-4 w-4" /></button></div>)}{form.medicines.length === 0 && <p className="px-2 py-4 text-center text-sm text-[#69717d]">No medicine allocations added.</p>}</div></section>
        </div>
        <footer className="flex justify-end gap-2 border-t border-[#e5e7eb] px-5 py-4"><button type="button" onClick={closeModal} className="h-10 rounded-lg px-4 text-sm font-bold text-[#42474e] hover:bg-[#f7f8fa]">Cancel</button><button type="submit" disabled={isSaving} className="h-10 rounded-lg bg-[#0d1117] px-4 text-sm font-black text-white disabled:opacity-60">{isSaving ? "Saving..." : editingProgram ? "Save Changes" : "Save Program"}</button></footer>
      </form></ModalShell>}

      {viewingProgram && <ModalShell labelledBy="program-details-title" onClose={() => setViewingProgram(null)} panelClassName="max-w-xl"><div className="w-full overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-[#e5e7eb] px-5 py-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#007a52]">Program details</p><h2 id="program-details-title" className="mt-1 text-xl font-black text-[#0d1117]">{viewingProgram.program_name}</h2><div className="mt-2 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ring-1 ${statusClass[getProgramStatus(viewingProgram)]}`}>{statusLabel[getProgramStatus(viewingProgram)]}</span><span className="text-sm font-semibold text-[#69717d]">{formatDate(viewingProgram.program_date)}</span></div></div><div className="flex items-center gap-2">{getProgramStatus(viewingProgram) === "UPCOMING" && <button type="button" onClick={() => { setViewingProgram(null); openEdit(viewingProgram); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#b9efd9] px-3 text-sm font-bold text-[#007a52]"><Edit3 className="h-4 w-4" /> Edit</button>}<button type="button" onClick={() => setViewingProgram(null)} className="rounded-md p-1 text-[#69717d] hover:bg-[#f1f3f5]" aria-label="Close"><X className="h-5 w-5" /></button></div></header>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-[#e1e4e8] bg-[#f8fafb] p-3"><p className="text-[10px] font-black uppercase tracking-wide text-[#7a828d]">Program name</p><p className="mt-1 text-sm font-bold text-[#252a31]">{viewingProgram.program_name}</p></div><div className="rounded-lg border border-[#e1e4e8] bg-[#f8fafb] p-3"><p className="text-[10px] font-black uppercase tracking-wide text-[#7a828d]">Scheduled date</p><p className="mt-1 text-sm font-bold text-[#252a31]">{formatDate(viewingProgram.program_date)}</p></div><div className="rounded-lg border border-[#e1e4e8] bg-[#f8fafb] p-3"><p className="text-[10px] font-black uppercase tracking-wide text-[#7a828d]">Total medicines</p><p className="mt-1 text-sm font-bold text-[#252a31]">{viewingProgram.medicines?.length || 0} items</p></div><div className="rounded-lg border border-[#e1e4e8] bg-[#f8fafb] p-3"><p className="text-[10px] font-black uppercase tracking-wide text-[#7a828d]">Total allocated quantity</p><p className="mt-1 text-sm font-bold text-[#252a31]">{(viewingProgram.medicines || []).reduce((sum, item) => sum + Number(item.quantity_used || 0), 0).toLocaleString()} units</p></div></div><div><p className="text-[10px] font-black uppercase tracking-wide text-[#7a828d]">Description</p><p className="mt-2 rounded-lg border border-[#e1e4e8] px-3 py-3 text-sm text-[#42474e]">{viewingProgram.description || "No description recorded."}</p></div><div><div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-wide text-[#7a828d]">Medicine Allocation</p><span className="text-xs font-bold text-[#69717d]">{getProgramStatus(viewingProgram) === "UPCOMING" ? "Reserved" : getProgramStatus(viewingProgram) === "COMPLETED" ? "Deducted" : "Released"}</span></div><div className="overflow-hidden rounded-lg border border-[#e1e4e8]"><table className="w-full text-left text-sm"><thead className="bg-[#f7f8fa] text-[10px] font-black uppercase tracking-wide text-[#69717d]"><tr><th className="px-3 py-2">Medicine</th><th className="px-3 py-2 text-right">Planned quantity</th></tr></thead><tbody className="divide-y divide-[#eef0f2]">{(viewingProgram.medicines || []).map((item) => <tr key={item.id}><td className="px-3 py-3 font-semibold text-[#252a31]">{item.medicine?.generic_name || "Unknown medicine"}{item.medicine?.dosage ? ` ${item.medicine.dosage}` : ""}</td><td className="px-3 py-3 text-right font-black text-[#252a31]">{Number(item.quantity_used || 0).toLocaleString()}</td></tr>)}<tr className="bg-[#fbfdfc]"><td className="px-3 py-3 font-black">Total</td><td className="px-3 py-3 text-right font-black">{(viewingProgram.medicines || []).reduce((sum, item) => sum + Number(item.quantity_used || 0), 0).toLocaleString()}</td></tr></tbody></table></div></div></div>
        {getProgramStatus(viewingProgram) === "UPCOMING" && <footer className="flex items-center justify-between border-t border-[#e5e7eb] px-5 py-4"><button type="button" onClick={() => openActionConfirmation("cancel", viewingProgram)} className="h-10 rounded-lg border border-red-200 px-4 text-sm font-bold text-red-700 hover:bg-red-50">Cancel Program</button><button type="button" onClick={() => openActionConfirmation("complete", viewingProgram)} className="h-10 rounded-lg bg-[#0d1117] px-4 text-sm font-black text-white">Complete Program</button></footer>}
      </div></ModalShell>}

      {pendingAction && <ModalShell labelledBy="program-action-confirmation-title" onClose={() => !isActionSaving && setPendingAction(null)} panelClassName="max-w-md"><div className="w-full overflow-hidden rounded-xl border border-[#d8dadc] bg-white shadow-2xl"><header className="flex items-start gap-3 border-b border-[#e5e7eb] px-5 py-4"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${pendingAction.action === "cancel" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{pendingAction.action === "cancel" ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}</div><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#007a52]">Confirm action</p><h2 id="program-action-confirmation-title" className="mt-1 text-lg font-black text-[#0d1117]">{pendingAction.action === "cancel" ? `Cancel ${pendingAction.program.program_name}?` : `Complete ${pendingAction.program.program_name}?`}</h2></div><button type="button" onClick={() => setPendingAction(null)} disabled={isActionSaving} className="ml-auto rounded-md p-1 text-[#69717d] hover:bg-[#f1f3f5] disabled:opacity-50" aria-label="Close confirmation"><X className="h-5 w-5" /></button></header><div className="px-5 py-5"><p className="text-sm leading-6 text-[#69717d]">{pendingAction.action === "cancel" ? "This will release the reserved medicine allocation and mark the program as cancelled." : "This will deduct the reserved medicine allocation from CHO stock using FEFO and mark the program as completed."}</p></div><footer className="flex justify-end gap-2 border-t border-[#e5e7eb] px-5 py-4"><button type="button" onClick={() => setPendingAction(null)} disabled={isActionSaving} className="h-10 rounded-lg px-4 text-sm font-bold text-[#42474e] hover:bg-[#f7f8fa] disabled:opacity-50">Keep Program</button><button type="button" onClick={confirmProgramAction} disabled={isActionSaving} className={`h-10 rounded-lg px-4 text-sm font-black text-white disabled:opacity-60 ${pendingAction.action === "cancel" ? "bg-red-700 hover:bg-red-800" : "bg-[#0d1117] hover:bg-[#20252d]"}`}>{isActionSaving ? "Processing..." : pendingAction.action === "cancel" ? "Cancel Program" : "Complete Program"}</button></footer></div></ModalShell>}

      {dateValidationOpen && <ModalShell labelledBy="program-date-error-title" onClose={() => setDateValidationOpen(false)} panelClassName="max-w-sm"><div className="w-full rounded-xl border border-[#f2c4c4] bg-white p-5 shadow-2xl"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">!</div><div><h2 id="program-date-error-title" className="text-base font-black text-[#252a31]">Invalid program date</h2><p className="mt-1 text-sm leading-6 text-[#69717d]">The program date cannot be before the current date. Select today or a future date.</p></div></div><div className="mt-5 flex justify-end"><button type="button" onClick={() => setDateValidationOpen(false)} className="h-10 rounded-lg bg-[#0d1117] px-4 text-sm font-black text-white">Choose another date</button></div></div></ModalShell>}
    </AdminShell>
  );
}
