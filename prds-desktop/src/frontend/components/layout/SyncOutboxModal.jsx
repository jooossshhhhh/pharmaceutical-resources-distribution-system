import { useEffect, useState } from "react";
import ModalShell from "../ModalShell";
import {
  dismissMutation,
  getOutboxEntries,
  retryFailedMutations,
  retryMutation,
  subscribeOutboxQueue,
} from "@backend/sync/outboxQueue";
import { subscribeSyncStatus, syncAllData } from "@backend/sync/syncManager";
import { useNetworkStatus } from "@backend/sync/networkStatus";
import { describeMutation, formatFriendlySyncTime, getFriendlySyncErrorMessage } from "@backend/sync/syncUtils";

export default function SyncOutboxModal({ isOpen, onClose }) {
  const isOnline = useNetworkStatus();
  const [entries, setEntries] = useState([]);
  const [activeTab, setActiveTab] = useState("pending"); // "pending" | "failed"
  const [syncState, setSyncState] = useState({ status: "IDLE" });
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState(null);

  const reloadEntries = async () => {
    try {
      const items = await getOutboxEntries();
      setEntries(items);
    } catch (err) {
      console.warn("Failed to load outbox entries:", err);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    reloadEntries();
    const unsubQueue = subscribeOutboxQueue(reloadEntries);
    const unsubSync = subscribeSyncStatus(setSyncState);

    return () => {
      unsubQueue();
      unsubSync();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const pendingItems = entries.filter((item) => item.status === "PENDING");
  const failedItems = entries.filter((item) => item.status === "FAILED");
  const isSyncing = syncState.status === "SYNCING" || isManualSyncing;

  const handleSyncNow = async () => {
    if (!isOnline || isSyncing) return;
    setIsManualSyncing(true);
    try {
      await syncAllData({ retryFailed: true });
      await reloadEntries();
    } finally {
      setIsManualSyncing(false);
    }
  };

  const handleRetrySingle = async (id) => {
    setActionInProgressId(id);
    try {
      await retryMutation(id);
      await reloadEntries();
      if (isOnline) {
        await syncAllData();
      }
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleDismissSingle = async (id) => {
    if (!window.confirm("Are you sure you want to dismiss this item? It will be removed from the local outbox queue.")) {
      return;
    }
    setActionInProgressId(id);
    try {
      await dismissMutation(id);
      await reloadEntries();
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleRetryAllFailed = async () => {
    setIsManualSyncing(true);
    try {
      await retryFailedMutations();
      await reloadEntries();
      if (isOnline) {
        await syncAllData();
      }
    } finally {
      setIsManualSyncing(false);
    }
  };

  const formatTimestamp = (isoString) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      if (Number.isNaN(d.getTime())) return "—";
      return new Intl.DateTimeFormat("en-PH", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(d);
    } catch {
      return "—";
    }
  };

  return (
    <ModalShell
      labelledBy="sync-outbox-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/45 backdrop-blur-xs"
      panelClassName="w-full max-w-xl mx-4"
    >
      <div className="w-full overflow-hidden rounded-2xl border border-[#d8dadc] bg-white shadow-2xl flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#e2e4e8] bg-[#f8f9fc] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-2xs">
              <SyncIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 id="sync-outbox-modal-title" className="text-base font-black text-[#0d1117] tracking-tight">
                Sync & Outbox Monitor
              </h2>
              <p className="text-xs font-medium text-[#5f6673]">
                {isOnline ? "Online · Cloud replication active" : "Offline · Local offline storage"}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Status Bar */}
        <div className="border-b border-[#eef0f3] bg-[#fcfdfe] px-6 py-3">
          <div className="flex items-center justify-between rounded-xl border border-[#d8dadc]/80 bg-white p-3 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  !isOnline
                    ? "bg-amber-500 animate-pulse"
                    : isSyncing
                    ? "bg-sky-500 animate-ping"
                    : syncState.status === "ERROR"
                    ? failedItems.length > 0
                      ? "bg-red-500"
                      : "bg-amber-500 animate-pulse"
                    : "bg-emerald-500"
                }`}
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[#0d1117]">
                    {!isOnline
                      ? "Offline Mode"
                      : isSyncing
                      ? "Syncing data..."
                      : syncState.status === "ERROR"
                      ? failedItems.length > 0
                        ? "Sync issue"
                        : "Sync paused · Retrying"
                      : "Synchronized"}
                  </span>
                  {syncState.lastSyncTime && (
                    <span className="text-[11px] text-[#5f6673]">
                      · {formatFriendlySyncTime(syncState.lastSyncTime)}
                    </span>
                  )}
                </div>
                {syncState.status === "ERROR" && (
                  <p className="mt-0.5 text-[11px] font-medium text-amber-700 leading-tight max-w-sm truncate" title={syncState.error || ""}>
                    {getFriendlySyncErrorMessage(syncState.error, pendingItems.length)}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSyncNow}
              disabled={!isOnline || isSyncing}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                !isOnline || isSyncing
                  ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700 shadow-xs"
              }`}
            >
              <RefreshIcon className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              <span>{isSyncing ? "Syncing..." : "Sync Now"}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#eef0f3] bg-white px-6 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-bold transition cursor-pointer ${
              activeTab === "pending"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-[#5f6673] hover:text-[#0d1117]"
            }`}
          >
            <span>Pending Queue</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                pendingItems.length > 0
                  ? "bg-blue-100 text-blue-800"
                  : "bg-neutral-100 text-neutral-500"
              }`}
            >
              {pendingItems.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("failed")}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-bold transition cursor-pointer ${
              activeTab === "failed"
                ? "border-red-600 text-red-600"
                : "border-transparent text-[#5f6673] hover:text-[#0d1117]"
            }`}
          >
            <span>Failed Issues</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                failedItems.length > 0
                  ? "bg-red-100 text-red-800"
                  : "bg-neutral-100 text-neutral-500"
              }`}
            >
              {failedItems.length}
            </span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "pending" && (
            <div>
              {pendingItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <CheckCircleIcon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-3 text-xs font-black text-[#0d1117]">
                    Outbox Queue is Empty
                  </h3>
                  <p className="mt-1 max-w-xs text-[11px] text-[#5f6673]">
                    All local offline actions have been processed and synchronized with the central database.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[11px] font-medium text-[#5f6673]">
                    These changes are saved safely on this computer and will push to the central server automatically.
                  </p>
                  {pendingItems.map((item) => {
                    const { label, description } = describeMutation(item);
                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-[#d8dadc] bg-white p-3.5 shadow-2xs transition hover:border-neutral-400"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                            {label}
                          </span>
                          <span className="text-[10px] font-medium text-[#5f6673]">
                            {formatTimestamp(item.created_at)}
                          </span>
                        </div>

                        <div className="mt-2">
                          <p className="text-xs font-bold text-[#0d1117]">{description}</p>
                          <p className="mt-0.5 text-[10px] text-[#5f6673] font-mono">
                            Target: {item.target} · Type: {item.mutation_type}
                          </p>
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-[#eef0f3] pt-2.5">
                          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-700">
                            <ClockIcon className="h-3 w-3" />
                            Waiting to sync
                          </span>
                          <span className="text-[10px] text-[#5f6673]">
                            Retries: {item.retry_count || 0}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "failed" && (
            <div>
              {failedItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-500">
                    <ShieldCheckIcon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-3 text-xs font-black text-[#0d1117]">
                    No Failed Outbox Actions
                  </h3>
                  <p className="mt-1 max-w-xs text-[11px] text-[#5f6673]">
                    No sync errors or rejected mutations. All transactions processed cleanly.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-red-50 border border-red-200 p-3">
                    <div>
                      <p className="text-xs font-bold text-red-900">
                        {failedItems.length} sync issue{failedItems.length === 1 ? "" : "s"} detected
                      </p>
                      <p className="text-[10px] text-red-700">
                        Review error reasons below. You can retry items or dismiss them.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRetryAllFailed}
                      disabled={isSyncing}
                      className="rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700 transition cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      Retry All
                    </button>
                  </div>

                  {failedItems.map((item) => {
                    const { label, description } = describeMutation(item);
                    const isItemLoading = actionInProgressId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-red-200 bg-white p-3.5 shadow-2xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 uppercase tracking-wider">
                            {label}
                          </span>
                          <span className="text-[10px] font-medium text-[#5f6673]">
                            {formatTimestamp(item.created_at)}
                          </span>
                        </div>

                        <div className="mt-2">
                          <p className="text-xs font-bold text-[#0d1117]">{description}</p>
                          <p className="mt-0.5 text-[10px] text-[#5f6673] font-mono">
                            Target: {item.target} · Type: {item.mutation_type}
                          </p>
                        </div>

                        {/* Error Message Box */}
                        <div className="mt-2.5 rounded-lg bg-red-50/80 border border-red-100 p-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-red-800">
                            Rejection Reason:
                          </p>
                          <p className="mt-0.5 text-xs text-red-900 break-words font-mono">
                            {item.error_message || "Unknown error during cloud replication."}
                          </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-3 flex items-center justify-between border-t border-[#eef0f3] pt-2.5">
                          <span className="text-[10px] text-[#5f6673]">
                            Attempted: {item.retry_count || 1} time{(item.retry_count || 1) === 1 ? "" : "s"}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDismissSingle(item.id)}
                              disabled={isItemLoading}
                              className="rounded-lg px-2.5 py-1 text-xs font-bold text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition cursor-pointer"
                            >
                              Dismiss
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRetrySingle(item.id)}
                              disabled={isItemLoading || !isOnline}
                              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700 transition cursor-pointer shadow-xs disabled:opacity-50"
                            >
                              <RefreshIcon className={`h-3 w-3 ${isItemLoading ? "animate-spin" : ""}`} />
                              <span>Retry</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-[#eef0f3] bg-[#f8f9fc] px-6 py-3.5">
          <span className="text-[11px] text-[#5f6673]">
            {entries.length} total queued action{entries.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#d8dadc] bg-white px-4 py-2 text-xs font-bold text-[#0d1117] hover:bg-[#f1f3f5] transition cursor-pointer shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function SyncIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function RefreshIcon({ className = "h-3 w-3" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function CloseIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function CheckCircleIcon({ className = "h-6 w-6" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function ShieldCheckIcon({ className = "h-6 w-6" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

function ClockIcon({ className = "h-3 w-3" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
