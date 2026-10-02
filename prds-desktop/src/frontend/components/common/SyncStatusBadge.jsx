import { useEffect, useState } from "react";
import { useNetworkStatus } from "@backend/sync/networkStatus";
import {
  getFailedMutationCount,
  subscribeOutboxQueue,
  subscribeQueueCount,
} from "@backend/sync/outboxQueue";
import { subscribeSyncStatus, syncAllData } from "@backend/sync/syncManager";
import { getFriendlySyncTooltip } from "@backend/sync/syncUtils";
import SyncOutboxModal from "../layout/SyncOutboxModal";

export default function SyncStatusBadge() {
  const isOnline = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [syncState, setSyncState] = useState({ status: "IDLE" });
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const refreshCounts = async () => {
    try {
      const count = await getFailedMutationCount();
      setFailedCount(count);
    } catch {
      setFailedCount(0);
    }
  };

  useEffect(() => {
    const unsubQueue = subscribeQueueCount(setPendingCount);
    const unsubSync = subscribeSyncStatus(setSyncState);
    const unsubOutbox = subscribeOutboxQueue(refreshCounts);
    refreshCounts();

    return () => {
      unsubQueue();
      unsubSync();
      unsubOutbox();
    };
  }, []);

  const handleManualSync = async () => {
    if (!isOnline || syncState.status === "SYNCING") {
      setIsDrawerOpen(true);
      return;
    }
    setIsManualSyncing(true);
    await syncAllData({ retryFailed: true });
    setIsManualSyncing(false);
    await refreshCounts();
  };

  const handleClickBadge = () => {
    setIsDrawerOpen(true);
  };

  const isSyncing = syncState.status === "SYNCING" || isManualSyncing;

  const tooltip = getFriendlySyncTooltip({
    isOnline,
    isSyncing,
    syncStatus: syncState.status,
    error: syncState.error,
    pendingCount,
    lastSyncTime: syncState.lastSyncTime,
  });

  return (
    <>
      <div className="relative inline-flex items-center">
        {!isOnline ? (
          <button
            type="button"
            onClick={handleClickBadge}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
            title={`${tooltip} (Click to open Outbox monitor)`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>Offline</span>
            {failedCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-red-200 text-red-900 text-[11px] font-bold">
                {failedCount} failed
              </span>
            ) : pendingCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[11px] font-semibold">
                {pendingCount} queued
              </span>
            ) : null}
          </button>
        ) : isSyncing ? (
          <button
            type="button"
            onClick={handleClickBadge}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 transition-colors cursor-pointer"
            title={`${tooltip} (Click to open Outbox monitor)`}
          >
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />
            <span>Syncing...</span>
          </button>
        ) : failedCount > 0 || syncState.status === "ERROR" ? (
          <button
            type="button"
            onClick={handleClickBadge}
            className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 transition-colors hover:bg-red-100 cursor-pointer"
            title={`${tooltip} (Click to inspect sync issues)`}
          >
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span>{failedCount > 0 ? `${failedCount} sync issue${failedCount === 1 ? "" : "s"}` : "Sync issue"}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleClickBadge}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
            title={`${tooltip} (Click to open Outbox monitor)`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Online</span>
            {pendingCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[11px] font-semibold">
                {pendingCount} syncing
              </span>
            ) : (
              <span className="text-emerald-600 text-[11px]">Synced</span>
            )}
          </button>
        )}
      </div>

      <SyncOutboxModal
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </>
  );
}

