/**
 * Other Programs Service
 * Handles planning, reservation, ongoing execution, stock return reconciliation,
 * completion, and cancellation of Other Programs with full offline outbox queueing
 * and automatic background synchronization.
 */

import { supabase } from "../client/supabase.js";
import { dataClient } from "../client/dataClient.js";
import { getSnapshot, saveSnapshot, getCachedUserSession, STORAGE_KEYS } from "../database/snapshotStore.js";
import { getSqliteDb, isTauriEnvironment } from "../database/sqliteClient.js";
import { isCurrentNetworkOnline } from "../sync/networkStatus.js";
import { enqueueMutation } from "../sync/outboxQueue.js";
import { deductWalkInInventoryFefo } from "../../shared/utils/dispensingUtils.js";

export const ACTION_SAVE_OTHER_PROGRAM = "save_other_program";
export const ACTION_START_OTHER_PROGRAM = "start_other_program";
export const ACTION_COMPLETE_OTHER_PROGRAM = "complete_other_program";
export const ACTION_CANCEL_OTHER_PROGRAM = "cancel_other_program";

export function normalizeProgramMedicine(line = {}, programStatus = "UPCOMING") {
  const rawAllocated = Number(
    (line.quantity_allocated !== undefined && line.quantity_allocated !== null && Number(line.quantity_allocated) > 0
      ? line.quantity_allocated
      : null) ??
      line.quantity_used ??
      line.quantity ??
      0
  );
  const rawReturned = Math.max(
    0,
    Math.min(rawAllocated, Number(line.quantity_returned || 0))
  );
  const actualDispensed =
    programStatus === "COMPLETED"
      ? Math.max(0, rawAllocated - rawReturned)
      : rawAllocated;

  return {
    ...line,
    quantity_allocated: rawAllocated,
    quantity_returned: programStatus === "COMPLETED" ? rawReturned : 0,
    quantity_used: actualDispensed,
  };
}

export function normalizeProgramRecord(program = {}) {
  if (!program || typeof program !== "object") return null;

  let resolvedStatus = String(program.status || "").toUpperCase();
  if (resolvedStatus === "CANCELLED" || program.cancelled_at) {
    resolvedStatus = "CANCELLED";
  } else if (resolvedStatus === "COMPLETED" || program.completed_at) {
    resolvedStatus = "COMPLETED";
  } else if (resolvedStatus === "ONGOING" || program.started_at) {
    resolvedStatus = "ONGOING";
  } else {
    resolvedStatus = "UPCOMING";
  }

  const rawMedicines = Array.isArray(program.medicines)
    ? program.medicines
    : Array.isArray(program.items)
    ? program.items
    : [];

  const normalizedMedicines = rawMedicines
    .filter((m) => {
      if (!m?.medicine_id) return false;
      if (m.quantity_allocated !== undefined && m.quantity_allocated !== null && Number(m.quantity_allocated) <= 0) {
        return false;
      }
      const fallbackQty = Number(m.quantity_allocated ?? m.quantity_used ?? m.quantity ?? 0);
      return fallbackQty > 0;
    })
    .map((m) => normalizeProgramMedicine(m, resolvedStatus));

  return {
    ...program,
    status: resolvedStatus,
    medicines: normalizedMedicines,
  };
}

export async function ensureScheduledProgramNotifications(programs = [], profile = null) {
  if (!Array.isArray(programs) || programs.length === 0) return;

  let activeProfile = profile;
  if (!activeProfile) {
    try {
      const session = getCachedUserSession();
      activeProfile = session?.profile || null;
    } catch {
      // fallback
    }
  }

  // Only City Health Office staff (Pharma I / Pharma II) manage other programs and receive reminder alerts.
  // BHWs do not manage programs, preventing cross-role reminder noise and unauthorized outbox inserts.
  if (activeProfile?.role && activeProfile.role !== "PHARMA_II" && activeProfile.role !== "PHARMA_I") {
    return;
  }

  const todayIso = new Date().toLocaleDateString("en-CA");
  const duePrograms = programs.filter((prog) => {
    const normalized = normalizeProgramRecord(prog);
    return (
      normalized &&
      normalized.status === "UPCOMING" &&
      normalized.program_date &&
      normalized.program_date <= todayIso
    );
  });

  if (duePrograms.length === 0) return;

  try {
    const existingNotifications = getSnapshot(STORAGE_KEYS.NOTIFICATIONS, []);
    const newNotifications = [];

    for (const prog of duePrograms) {
      const markerKey = `[PROGRAM_DUE:${prog.id}:${prog.program_date}]`;
      const alreadyNotified = existingNotifications.some(
        (n) =>
          String(n?.meta_key || "") === markerKey ||
          String(n?.id || "") === `prog_due_${prog.id}_${prog.program_date}` ||
          (String(n?.message || "").includes(prog.program_name) &&
            String(n?.title || "").includes("Scheduled Program") &&
            String(n?.created_at || "").slice(0, 10) === todayIso)
      );

      if (!alreadyNotified) {
        const totalUnits = (prog.medicines || []).reduce(
          (sum, m) => sum + Number(m.quantity_allocated ?? m.quantity_used ?? 0),
          0
        );
        const notifUuid =
          typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID
            ? globalThis.crypto.randomUUID()
            : null;
        const notifId = notifUuid || `prog_due_${prog.id}_${prog.program_date}`;

        const notif = {
          id: notifId,
          user_id: activeProfile?.id || null,
          title:
            prog.program_date === todayIso
              ? "Scheduled Program Today"
              : "Scheduled Program Ready to Start",
          message: `"${prog.program_name}" is scheduled for ${prog.program_date} with ${totalUnits.toLocaleString()} reserved unit${totalUnits === 1 ? "" : "s"}. Mark it as Ongoing when the outreach begins.`,
          is_read: false,
          created_at: new Date().toISOString(),
          recipient_first_name: activeProfile?.first_name || "City Health Office",
          recipient_last_name: activeProfile?.last_name || "(CHO)",
          recipient_role: activeProfile?.role || "PHARMA_II",
          recipient_facility_id: activeProfile?.facility_id || null,
          facility_name: activeProfile?.facility_name || "City Health Office - City of Naga",
          facility_code: activeProfile?.facility_code || "CHO-NAGA",
          category: "programs",
          program_id: prog.id,
          meta_key: markerKey,
        };
        newNotifications.push(notif);

        // Also persist to remote notifications if online & valid uuid and Pharma II
        if (notifUuid && activeProfile?.id && activeProfile.role === "PHARMA_II") {
          if (isCurrentNetworkOnline() && supabase) {
            supabase
              .from("notifications")
              .insert({
                id: notifUuid,
                user_id: activeProfile.id,
                title: notif.title,
                message: notif.message,
                is_read: false,
              })
              .then(({ error }) => {
                if (error) {
                  console.warn("Could not insert notification into remote table:", error);
                }
              })
              .catch((err) => {
                console.warn("Error inserting notification to remote:", err);
              });
          }
          // Note: When offline, scheduled reminder notifications are purely client-side alerts
          // already stored in local snapshot store (STORAGE_KEYS.NOTIFICATIONS).
          // We do NOT enqueue an offline DB insert mutation, preventing cross-user permission conflicts on shared terminals.
        }
      }
    }

    if (newNotifications.length > 0) {
      const mergedNotifications = [...newNotifications, ...existingNotifications];
      saveSnapshot(STORAGE_KEYS.NOTIFICATIONS, mergedNotifications);

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("prds:notifications-changed"));
      }
    }
  } catch (err) {
    console.warn("Unable to generate scheduled program notifications:", err);
  }
}

export async function fetchOtherPrograms(profile = null) {
  const cached = getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []);
  let sqliteData = [];
  if (isTauriEnvironment()) {
    try {
      const db = await getSqliteDb();
      const rows = await db.select(
        "SELECT id, program_name, program_date, description, data_json, updated_at FROM other_programs"
      );
      if (rows && rows.length > 0) {
        sqliteData = rows
          .map((r) => {
            if (r.data_json) {
              try {
                return typeof r.data_json === "string" ? JSON.parse(r.data_json) : r.data_json;
              } catch {
                return r;
              }
            }
            return r;
          })
          .filter(Boolean);
      }
    } catch (e) {
      console.warn("Failed to fetch other_programs from SQLite:", e);
    }
  }

  let remoteData = null;
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("other_programs")
        .select(`
          id, facility_id, program_name, program_date, description, status, started_at, completed_at, cancelled_at, created_at, updated_at,
          medicines:program_medicines(
            id, medicine_id, quantity_allocated, quantity_returned, quantity_used,
            medicine:medicines(id, generic_name, dosage, unit_of_measure)
          )
        `)
        .order("program_date", { ascending: false });
      if (!error && Array.isArray(data)) {
        remoteData = data;
      }
    } catch (e) {
      console.warn("Failed to fetch other_programs from Supabase:", e);
    }
  }

  // Merge SQLite, snapshot, and remote data by id
  const mergedMap = new Map();
  sqliteData.forEach((p) => {
    if (p?.id) mergedMap.set(String(p.id), normalizeProgramRecord(p));
  });
  cached.forEach((p) => {
    if (p?.id) {
      const existing = mergedMap.get(String(p.id)) || {};
      mergedMap.set(String(p.id), normalizeProgramRecord({ ...existing, ...p }));
    }
  });
  if (remoteData) {
    remoteData.forEach((p) => {
      const normalizedRemote = normalizeProgramRecord(p);
      const existing = mergedMap.get(String(p.id));
      if (
        existing?.is_offline_pending &&
        ((!normalizedRemote.completed_at && existing.completed_at) ||
          (!normalizedRemote.started_at && existing.started_at) ||
          (!normalizedRemote.cancelled_at && existing.cancelled_at))
      ) {
        mergedMap.set(String(p.id), normalizeProgramRecord({ ...normalizedRemote, ...existing }));
      } else {
        mergedMap.set(String(p.id), normalizeProgramRecord({ ...(existing || {}), ...normalizedRemote }));
      }
    });
  }

  const mergedList = Array.from(mergedMap.values()).filter(Boolean);
  mergedList.sort((a, b) => {
    const dateA = a.program_date || a.completed_at || a.created_at || "";
    const dateB = b.program_date || b.completed_at || b.created_at || "";
    return dateB.localeCompare(dateA);
  });

  saveSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, mergedList);
  ensureScheduledProgramNotifications(mergedList, profile);
  return mergedList;
}

export async function saveOtherProgram({
  programId = null,
  programName,
  programDate,
  description = null,
  items = [],
  profile = null,
  medicineMap = new Map(),
}) {
  const isEditing = Boolean(programId);
  const targetProgramId = programId || globalThis.crypto.randomUUID();
  const cachedPrograms = getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []);
  const existingProgram = isEditing
    ? cachedPrograms.find((p) => String(p.id) === String(targetProgramId))
    : null;

  const rpcPayload = {
    p_program_id: targetProgramId,
    p_program_name: (programName || "").trim(),
    p_program_date: programDate,
    p_description: (description || "").trim() || null,
    p_items: items.map((line) => {
      const allocatedQty = Number(line.quantity_allocated ?? line.quantity_used ?? 0);
      return {
        medicine_id: line.medicine_id,
        quantity_allocated: allocatedQty,
        quantity_used: allocatedQty,
      };
    }),
  };

  let { data, error, isOfflineQueued } = await dataClient.rpc(
    "save_other_program",
    rpcPayload,
    {
      userId: profile?.id,
      facilityId: profile?.facility_id,
    }
  );

  // If creating a new program and server rejects with "Program was not found" because it requires p_program_id: null
  if (
    error &&
    !isEditing &&
    (error.code === "P0002" || String(error.message || "").toLowerCase().includes("not found"))
  ) {
    const fallbackPayload = { ...rpcPayload, p_program_id: null };
    const retryRes = await dataClient.rpc("save_other_program", fallbackPayload, {
      userId: profile?.id,
      facilityId: profile?.facility_id,
    });
    if (!retryRes.error) {
      data = retryRes.data;
      error = null;
      isOfflineQueued = retryRes.isOfflineQueued;
    }
  }

  if (error) {
    return { success: false, error };
  }

  const resolvedId = (typeof data === "string" ? data : data?.program_id) || targetProgramId;

  const preservedStatus =
    existingProgram &&
    (existingProgram.status === "ONGOING" || Boolean(existingProgram.started_at))
      ? "ONGOING"
      : "UPCOMING";

  // Format program medicines with medicine info for optimistic display
  const formattedMedicines = items.map((line, idx) => {
    const medDetails = medicineMap.get(line.medicine_id) || {};
    const allocatedQty = Number(line.quantity_allocated ?? line.quantity_used ?? 0);
    return {
      id: line.id || `pm_${Date.now()}_${idx}`,
      medicine_id: line.medicine_id,
      quantity_allocated: allocatedQty,
      quantity_returned: 0,
      quantity_used: allocatedQty,
      medicine: {
        id: line.medicine_id,
        generic_name: medDetails.generic_name || "Medicine",
        dosage: medDetails.dosage || "",
        unit_of_measure: medDetails.unit_of_measure || "units",
        brand_name: medDetails.brand_name || "",
      },
    };
  });

  const optimisticProgram = normalizeProgramRecord({
    ...(existingProgram || {}),
    id: resolvedId,
    facility_id: existingProgram?.facility_id || profile?.facility_id,
    program_name: rpcPayload.p_program_name,
    program_date: rpcPayload.p_program_date,
    description: rpcPayload.p_description,
    status: preservedStatus,
    started_at: existingProgram?.started_at || null,
    medicines: formattedMedicines,
    is_offline_pending: Boolean(isOfflineQueued),
    updated_at: new Date().toISOString(),
  });

  // Optimistically update snapshot store
  try {
    const exists = cachedPrograms.some((p) => String(p.id) === String(resolvedId));
    const updatedPrograms = exists
      ? cachedPrograms.map((p) =>
          String(p.id) === String(resolvedId) ? { ...p, ...optimisticProgram } : p
        )
      : [optimisticProgram, ...cachedPrograms];
    saveSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, updatedPrograms);
    ensureScheduledProgramNotifications(updatedPrograms, profile);

    // Also update SQLite in desktop mode
    if (isTauriEnvironment()) {
      getSqliteDb()
        .then(async (db) => {
          await db.execute(
            `INSERT OR REPLACE INTO other_programs (id, program_name, program_date, description, data_json, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              resolvedId,
              optimisticProgram.program_name,
              optimisticProgram.program_date,
              optimisticProgram.description,
              JSON.stringify(optimisticProgram),
              optimisticProgram.updated_at,
            ]
          );
        })
        .catch((e) => console.warn("Failed to update SQLite other_programs:", e));
    }
  } catch (snapErr) {
    console.warn("Failed to update other_programs snapshot:", snapErr);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("prds:other-programs-changed", {
        detail: { programId: resolvedId, action: isEditing ? "UPDATE" : "CREATE" },
      })
    );
    window.dispatchEvent(
      new CustomEvent("prds:inventory-changed", {
        detail: { action: "PROGRAM_SAVED", programId: resolvedId },
      })
    );
  }

  return {
    success: true,
    programId: resolvedId,
    program: optimisticProgram,
    isOfflineQueued: Boolean(isOfflineQueued),
  };
}

export async function startOtherProgram({
  programId,
  profile = null,
}) {
  const { data, error, isOfflineQueued } = await dataClient.rpc(
    "start_other_program",
    { p_program_id: programId },
    {
      userId: profile?.id,
      facilityId: profile?.facility_id,
    }
  );

  if (error) {
    return { success: false, error };
  }

  const startedAt = data?.started_at || new Date().toISOString();

  try {
    const cachedPrograms = getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []);
    const updatedPrograms = cachedPrograms.map((p) =>
      String(p.id) === String(programId)
        ? normalizeProgramRecord({
            ...p,
            status: "ONGOING",
            started_at: p.started_at || startedAt,
            updated_at: new Date().toISOString(),
            is_offline_pending: Boolean(isOfflineQueued),
          })
        : p
    );
    saveSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, updatedPrograms);

    if (isTauriEnvironment()) {
      getSqliteDb()
        .then(async (db) => {
          const target = updatedPrograms.find((p) => String(p.id) === String(programId));
          if (target) {
            await db.execute(
              `UPDATE other_programs SET data_json = ?, updated_at = ? WHERE id = ?`,
              [JSON.stringify(target), new Date().toISOString(), programId]
            );
          }
        })
        .catch((e) => console.warn("Failed to update SQLite on start:", e));
    }
  } catch (snapErr) {
    console.warn("Failed to update snapshot on start:", snapErr);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("prds:other-programs-changed", {
        detail: { programId, action: "START", status: "ONGOING" },
      })
    );
    window.dispatchEvent(
      new CustomEvent("prds:inventory-changed", {
        detail: { action: "PROGRAM_STARTED", programId },
      })
    );
  }

  return {
    success: true,
    startedAt,
    isOfflineQueued: Boolean(isOfflineQueued),
  };
}

export async function completeOtherProgram({
  programId,
  returns = [],
  profile = null,
  program = null,
}) {
  const normalizedReturns = Array.isArray(returns)
    ? returns.map((item) => ({
        medicine_id: item.medicine_id,
        quantity_returned: Math.max(0, Number(item.quantity_returned || 0)),
      }))
    : [];

  const returnsMap = new Map(
    normalizedReturns.map((r) => [String(r.medicine_id), r.quantity_returned])
  );

  const { data, error, isOfflineQueued } = await dataClient.rpc(
    "complete_other_program",
    {
      p_program_id: programId,
      p_returns: normalizedReturns,
    },
    {
      userId: profile?.id,
      facilityId: profile?.facility_id,
    }
  );

  if (error) {
    return { success: false, error };
  }

  // Update snapshot store & reconcile medicine quantities
  try {
    const cachedPrograms = getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []);
    const nowIso = new Date().toISOString();

    const updatedPrograms = cachedPrograms.map((p) => {
      if (String(p.id) !== String(programId)) return p;

      const reconciledMedicines = (p.medicines || []).map((m) => {
        const allocated = Number(
          (m.quantity_allocated > 0 ? m.quantity_allocated : null) ??
            m.quantity_used ??
            0
        );
        const returned = Math.max(
          0,
          Math.min(
            allocated,
            Number(returnsMap.get(String(m.medicine_id)) ?? m.quantity_returned ?? 0)
          )
        );
        const dispensed = Math.max(0, allocated - returned);
        return {
          ...m,
          quantity_allocated: allocated,
          quantity_returned: returned,
          quantity_used: dispensed,
        };
      });

      return normalizeProgramRecord({
        ...p,
        status: "COMPLETED",
        started_at: p.started_at || nowIso,
        completed_at: nowIso,
        updated_at: nowIso,
        medicines: reconciledMedicines,
        is_offline_pending: Boolean(isOfflineQueued),
      });
    });

    saveSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, updatedPrograms);

    // Optimistically deduct only Actual Dispensed (Allocated - Returned) from local inventory snapshot
    const targetProgram =
      updatedPrograms.find((p) => String(p.id) === String(programId)) || program;
    if (targetProgram?.medicines?.length) {
      const cachedInventory = getSnapshot(STORAGE_KEYS.INVENTORY, []);
      const targetFacilityId = targetProgram.facility_id || profile?.facility_id;
      const deductItems = targetProgram.medicines
        .map((m) => {
          const allocated = Number(
            (m.quantity_allocated > 0 ? m.quantity_allocated : null) ??
              m.quantity_used ??
              0
          );
          const returned = Math.max(
            0,
            Math.min(
              allocated,
              Number(returnsMap.get(String(m.medicine_id)) ?? m.quantity_returned ?? 0)
            )
          );
          return {
            medicine_id: m.medicine_id,
            quantity: Math.max(0, allocated - returned),
          };
        })
        .filter((item) => item.quantity > 0);

      if (deductItems.length > 0 && cachedInventory.length > 0) {
        const updatedInventory = deductWalkInInventoryFefo({
          facilityId: targetFacilityId,
          inventoryRows: cachedInventory,
          items: deductItems,
        });
        saveSnapshot(STORAGE_KEYS.INVENTORY, updatedInventory);
      }
    }

    // Update SQLite in desktop mode
    if (isTauriEnvironment()) {
      getSqliteDb()
        .then(async (db) => {
          const target = updatedPrograms.find((p) => String(p.id) === String(programId));
          if (target) {
            await db.execute(
              `UPDATE other_programs SET data_json = ?, updated_at = ? WHERE id = ?`,
              [JSON.stringify(target), nowIso, programId]
            );
          }
        })
        .catch((e) => console.warn("Failed to update SQLite on complete:", e));
    }
  } catch (snapErr) {
    console.warn("Failed to update snapshot on complete:", snapErr);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("prds:other-programs-changed", {
        detail: { programId, action: "COMPLETE", status: "COMPLETED" },
      })
    );
    window.dispatchEvent(
      new CustomEvent("prds:inventory-changed", {
        detail: { action: "PROGRAM_COMPLETED", programId },
      })
    );
  }

  return {
    success: true,
    summary: data || null,
    isOfflineQueued: Boolean(isOfflineQueued),
  };
}

export async function cancelOtherProgram({
  programId,
  profile = null,
}) {
  const { error, isOfflineQueued } = await dataClient.rpc(
    "cancel_other_program",
    { p_program_id: programId },
    {
      userId: profile?.id,
      facilityId: profile?.facility_id,
    }
  );

  if (error) {
    return { success: false, error };
  }

  // Update snapshot store
  try {
    const cachedPrograms = getSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, []);
    const updatedPrograms = cachedPrograms.map((p) =>
      String(p.id) === String(programId)
        ? normalizeProgramRecord({
            ...p,
            status: "CANCELLED",
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_offline_pending: Boolean(isOfflineQueued),
          })
        : p
    );
    saveSnapshot(STORAGE_KEYS.OTHER_PROGRAMS, updatedPrograms);

    // Update SQLite in desktop mode
    if (isTauriEnvironment()) {
      getSqliteDb()
        .then(async (db) => {
          const target = updatedPrograms.find((p) => String(p.id) === String(programId));
          if (target) {
            await db.execute(
              `UPDATE other_programs SET data_json = ?, updated_at = ? WHERE id = ?`,
              [JSON.stringify(target), new Date().toISOString(), programId]
            );
          }
        })
        .catch((e) => console.warn("Failed to update SQLite on cancel:", e));
    }
  } catch (snapErr) {
    console.warn("Failed to update snapshot on cancel:", snapErr);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("prds:other-programs-changed", {
        detail: { programId, action: "CANCEL", status: "CANCELLED" },
      })
    );
    window.dispatchEvent(
      new CustomEvent("prds:inventory-changed", {
        detail: { action: "PROGRAM_CANCELLED", programId },
      })
    );
  }

  return {
    success: true,
    isOfflineQueued: Boolean(isOfflineQueued),
  };
}
