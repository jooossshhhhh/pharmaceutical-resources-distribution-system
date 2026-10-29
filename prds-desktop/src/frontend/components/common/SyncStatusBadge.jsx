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
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/30 hover:bg-[#FBE9E3]/80 transition-colors cursor-pointer"
            title={`${tooltip} (Click to open Outbox monitor)`}
          >
            <span className="w-2 h-2 rounded-full bg-[#D9826B] animate-pulse" />
            <span>Offline</span>
            {failedCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-[#D9826B] text-white text-[11px] font-bold">
                {failedCount} failed
              </span>
            ) : pendingCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/30 text-[11px] font-semibold">
                {pendingCount} queued
              </span>
            ) : null}
          </button>
        ) : isSyncing ? (
          <button
            type="button"
            onClick={handleClickBadge}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-[#E3EEF5] text-[#1F4A66] border border-[#34769B]/30 hover:bg-[#E3EEF5]/80 transition-colors cursor-pointer"
            title={`${tooltip} (Click to open Outbox monitor)`}
          >
            <span className="w-2 h-2 rounded-full bg-[#34769B] animate-ping" />
            <span>Syncing...</span>
          </button>
        ) : failedCount > 0 || syncState.status === "ERROR" ? (
          <button
            type="button"
            onClick={handleClickBadge}
            className="flex items-center gap-1.5 rounded-full border border-[#D9826B]/40 bg-[#FBE9E3] px-2.5 py-1 text-xs font-semibold text-[#8F3F2B] transition-colors hover:bg-[#FBE9E3]/80 cursor-pointer"
            title={`${tooltip} (Click to inspect sync issues)`}
          >
            <span className="h-2 w-2 rounded-full bg-[#D9826B]" />
            <span>{failedCount > 0 ? `${failedCount} sync issue${failedCount === 1 ? "" : "s"}` : "Sync issue"}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleClickBadge}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-[#E2F3EC] text-[#226048] border border-[#4C9F80]/30 hover:bg-[#E2F3EC]/80 transition-colors cursor-pointer"
            title={`${tooltip} (Click to open Outbox monitor)`}
          >
            <span className="w-2 h-2 rounded-full bg-[#4C9F80]" />
            <span>Online</span>
            {pendingCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-[#FBE9E3] text-[#8F3F2B] border border-[#D9826B]/30 text-[11px] font-semibold">
                {pendingCount} syncing
              </span>
            ) : (
              <span className="text-[#226048] text-[11px] font-semibold">Synced</span>
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

