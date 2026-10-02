# Offline and Online Sync Architecture Optimization Recommendations

**Project:** Pharmaceutical Resources Distribution System (PRDS)  
**Target Scope:** City Health Office (CHO) of Naga, Cebu & 28 Barangay Health Stations (BHWs)  
**Report Type:** Architecture Audit & Optimization Strategy Log  
**Date:** September 28, 2026  
**Audited Subsystems:** `syncManager.js`, `outboxQueue.js`, `sqliteClient.js`, `dataClient.js`, `snapshotStore.js`  

---

## 1. Executive Summary

A comprehensive architectural audit was conducted on the offline-first data replication and outbox synchronization engines of `prds-desktop`. 

While the existing foundation (Tauri SQLite `prds.db` + LevelDB LocalStorage view snapshots + outbox mutation queue) provides reliable offline autonomy, five key optimizations have been identified to prepare the system for long-term scalability across all 28 Barangay Health Stations.

---

## 2. Identified Bottlenecks & Optimization Strategies

### 2.1 Optimization 1: Incremental Delta Synchronization (Bandwidth Optimization)

* **Current State:**
  On every synchronization cycle (`syncAllData()`), the sync manager purges local SQLite tables (`DELETE FROM table`) and performs a full-table download of all 14 datasets from Supabase.
* **The Risk:**
  As the operational history grows to thousands of dispensing records, patient profiles, and inventory batches, full downloads will cause high mobile data consumption and slow down sync cycles on spotty rural connections.
* **Recommended Strategy:**
  Transition to **Timestamp-Based Delta Synchronization**:
  ```javascript
  // Pull only records modified since the last successful sync:
  const { data } = await supabase
    .from("inventory")
    .select(...)
    .gt("updated_at", lastSyncTimestamp);
  ```
  * **Expected Impact:** Reduces downstream network payload by **90%–98%** during regular field operations.

---

### 2.2 Optimization 2: SQLite Write Transaction Batching (Disk I/O Optimization)

* **Current State:**
  Records fetched from the cloud are inserted one-by-one in sequential JavaScript loops:
  ```javascript
  for (const inv of inventoryRes.data) {
    await db.execute("INSERT OR REPLACE INTO inventory ...", [...]);
  }
  ```
* **The Risk:**
  Each individual `db.execute()` opens, locks, and commits a separate SQLite disk journal transaction. Inserting 500 rows generates 500 discrete disk write operations, causing micro-stutters in the desktop UI thread on low-power barangay workstations.
* **Recommended Strategy:**
  Wrap batch inserts within explicit SQLite transactions:
  ```sql
  BEGIN TRANSACTION;
  -- Batch insert statements
  COMMIT;
  ```
  * **Expected Impact:** Accelerates local database write speed by **10x to 50x** and protects physical solid-state drives (SSDs) from excessive write cycles.

---

### 2.3 Optimization 3: Visual Sync Health & Outbox Drawer (User Experience)

* **Current State:**
  The `outboxQueue.js` tracks mutation statuses (`PENDING`, `SYNCED`, `FAILED`), but the user interface only provides high-level icon indicators.
* **The Risk:**
  If an offline walk-in dispensing transaction fails to sync due to a server-side business rule or expired batch, the health worker has no direct UI mechanism to view the failed record details or trigger a targeted retry.
* **Recommended Strategy:**
  Implement an interactive **Sync Status & Outbox Drawer** in the desktop header:
  * **Pending Queue View:** Lists queued actions with human-readable timestamps and item descriptions.
  * **Failed Item Inspector:** Displays the exact rejection reason (e.g., *"Batch #204 expired on server before sync"*) alongside **[Retry]** and **[Dismiss]** actions.

---

### 2.4 Optimization 4: Append-Only Conflict Resolution for Clinical Dispensing

* **The Conflict Scenario:**
  A health worker dispenses 10 units of an antibiotic while offline in a remote barangay. Concurrently, the City Health Office online reallocates those same 10 units to another facility. Upon network reconnection, local physical reality clashes with cloud ledger totals.
* **Recommended Strategy:**
  * **Clinical Priority Rule:** Clinical dispensing events are immutable and **Append-Only**. A patient who physically received medicine must never have their clinical dispensing history deleted.
  * **Compensatory Stock Auditing:** If the cloud inventory is insufficient upon outbox flush, the Supabase stored procedure should accept the dispensing transaction, drive the inventory ledger into a temporary deficit or flagged state, and log an automated **"Stock Discrepancy Notification"** to the Chief Pharmacist (`PHARMA_II`) for manual adjustment.

---

### 2.5 Optimization 5: Non-Blocking Background Sync Scheduling

* **Current State:**
  Sync triggers immediately on app launch, upon network reconnection, or via manual button clicks.
* **Recommended Strategy:**
  Introduce an idle background sync timer (every 5–10 minutes) equipped with an **Active User Guard**:
  * If the user is actively entering patient data, dispensing items, or editing forms, postpone background sync until the form is submitted or canceled.
  * Prevents jarring table re-renders or cursor displacement during active clinical input.

---

## 3. Implementation Roadmap & Priority Matrix

| Phase | Enhancement | Complexity | Priority | Target Benefit |
|---|---|---|---|---|
| **Phase 1** | SQLite Transaction Batching (`BEGIN ... COMMIT`) | Low | **High** | Eliminates desktop UI lag during synchronization. |
| **Phase 2** | Interactive Outbox Drawer UI | Medium | **High** | BHW transparency and failed mutation recovery. |
| **Phase 3** | Delta Sync (`.gt('updated_at', lastSync)`) | Medium | **Medium** | Massive mobile data reduction in rural health centers. |
| **Phase 4** | Append-Only Clinical Conflict Resolution | Medium | **Medium** | Legal & clinical record preservation during stock collisions. |

---

## 4. Related Architecture References

* [PRDS Offline and Online Sync Architecture](../3-Application/PRDS%20Offline%20and%20Online%20Sync%20Architecture.md)
* [PRDS Offline and Online Sync Framework](../3-Application/PRDS%20Offline%20and%20Online%20Sync%20Framework.md)
* [PRDS System Architecture](../1-Planning/PRDS%20System%20Architecture.md)
