/**
 * useSyncEngine.ts — React binding for the SyncEngine singleton.
 *
 * Starts the netinfo-driven engine on mount, subscribes to its state, and
 * exposes the current status/log plus manual `syncNow` / `refresh` actions for
 * the UI (sync status panel, airplane-mode banner, "Sync now" button).
 */
import { useEffect, useState } from 'react';
import { syncEngine, type SyncState } from './syncEngine';

export interface UseSyncEngine extends SyncState {
  syncNow: () => void;
  refresh: () => void;
}

export function useSyncEngine(): UseSyncEngine {
  const [state, setState] = useState<SyncState>({
    status: 'idle',
    online: false,
    pending: 0,
    lastSyncAt: null,
    log: [],
  });

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe(setState);
    syncEngine.start();
    return unsubscribe;
  }, []);

  return {
    ...state,
    syncNow: () => {
      void syncEngine.sync();
    },
    refresh: () => {
      void syncEngine.refreshPending();
    },
  };
}

export default useSyncEngine;
