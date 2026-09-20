import { useEffect, useState } from "react";
import { useNetworkStatus } from "@backend/sync/networkStatus";
import { subscribeQueueCount } from "@backend/sync/outboxQueue";
import { subscribeSyncStatus, syncAllData } from "@backend/sync/syncManager";

export default function SyncStatusBadge() {
  const isOnline = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncState, setSyncState] = useState({ status: "IDLE" });
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  useEffect(() => {
    const unsubQueue = subscribeQueueCount(setPendingCount);
    const unsubSync = subscribeSyncStatus(setSyncState);

    return () => {
      unsubQueue();
      unsubSync();
    };
  }, []);

  const handleManualSync = async () => {
    if (!isOnline || syncState.status === "SYNCING") {
      return;
    }
    setIsManualSyncing(true);
    await syncAllData({ retryFailed: true });
    setIsManualSyncing(false);
  };

  const isSyncing = syncState.status === "SYNCING" || isManualSyncing;

  if (!isOnline) {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-800 border border-amber-200"
        title="Offline Mode: Changes are saved to local SQLite and will sync when internet returns."
      >
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span>Offline</span>
        {pendingCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[11px] font-semibold">
            {pendingCount} queued
          </span>
        )}
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-sky-50 text-sky-800 border border-sky-200"
        title="Syncing local changes with Supabase..."
      >
        <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />
        <span>Syncing...</span>
      </div>
    );
  }

  if (syncState.status === "ERROR") {
    return (
      <button
        type="button"
        onClick={handleManualSync}
        className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 transition-colors hover:bg-red-100"
        title={syncState.error || "Some local changes could not be synced. Click to retry."}
      >
        <span className="h-2 w-2 rounded-full bg-red-500" />
        <span>Sync issue</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleManualSync}
      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
      title="Connected to Supabase. Click to refresh sync."
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
  );
}
