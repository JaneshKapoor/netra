/**
 * syncEngine.ts — offline-first sync-and-purge for attendance rows.
 *
 * Attendance is captured fully offline and persisted encrypted. This engine
 * waits for connectivity (netinfo), batches unsynced rows, POSTs them to
 * SYNC_ENDPOINT with a per-row idempotency key, and only after a successful
 * (mock) ACK marks them synced and purges them from the device.
 *
 * The endpoint is env-driven (never hardcoded). No AWS credentials live in the
 * client — SYNC_ENDPOINT is expected to be an API Gateway route that performs
 * any auth server-side (see SECURITY note in src/config/env.ts).
 */
import NetInfo from '@react-native-community/netinfo';
import { env } from '../config/env';
import {
  getUnsyncedAttendance,
  markAttendanceSynced,
  purgeSyncedAttendance,
  type AttendanceRecord,
} from '../storage/repo';

export type SyncStatus = 'idle' | 'offline' | 'syncing' | 'success' | 'error';

export interface SyncLogEntry {
  ts: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface SyncState {
  status: SyncStatus;
  online: boolean;
  pending: number;
  lastSyncAt: number | null;
  log: SyncLogEntry[];
}

type Listener = (state: SyncState) => void;

const MAX_LOG = 50;
const BATCH_SIZE = 50;

/** Shape POSTed to the backend. Idempotency key lets the server dedupe retries. */
function toPayload(rows: AttendanceRecord[]) {
  return {
    records: rows.map(r => ({
      id: r.id,
      personId: r.personId,
      ts: r.ts,
      lat: r.lat,
      lng: r.lng,
      idempotencyKey: r.idempotencyKey,
    })),
  };
}

class SyncEngine {
  private state: SyncState = {
    status: 'idle',
    online: false,
    pending: 0,
    lastSyncAt: null,
    log: [],
  };
  private listeners = new Set<Listener>();
  private unsubscribeNet: (() => void) | null = null;
  private inFlight = false;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  start(): void {
    if (this.unsubscribeNet) {
      return;
    }
    this.unsubscribeNet = NetInfo.addEventListener(s => {
      const online = Boolean(s.isConnected && s.isInternetReachable !== false);
      this.patch({ online, status: online ? this.state.status : 'offline' });
      if (online) {
        void this.sync();
      }
    });
    void this.refreshPending();
  }

  stop(): void {
    this.unsubscribeNet?.();
    this.unsubscribeNet = null;
  }

  /** Pull the current pending count into state (e.g. after a new capture). */
  async refreshPending(): Promise<void> {
    const rows = await getUnsyncedAttendance();
    this.patch({ pending: rows.length });
  }

  /** Attempt one sync pass. Safe to call repeatedly; self-guards re-entry. */
  async sync(): Promise<void> {
    if (this.inFlight) {
      return;
    }
    if (!env.SYNC_ENDPOINT) {
      this.log('warn', 'SYNC_ENDPOINT not configured; skipping sync.');
      return;
    }
    const rows = await getUnsyncedAttendance();
    if (rows.length === 0) {
      this.patch({ pending: 0, status: 'idle' });
      return;
    }
    this.inFlight = true;
    this.patch({ status: 'syncing' });
    this.log('info', `Syncing ${rows.length} record(s)…`);
    try {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const res = await fetch(env.SYNC_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toPayload(batch)),
        });
        if (!res.ok) {
          throw new Error(`Sync failed: HTTP ${res.status}`);
        }
        await markAttendanceSynced(batch.map(r => r.id));
      }
      const purged = await purgeSyncedAttendance();
      this.log('info', `ACK received; purged ${purged} synced record(s).`);
      this.patch({ status: 'success', lastSyncAt: Date.now() });
      await this.refreshPending();
    } catch (e) {
      this.log('error', e instanceof Error ? e.message : 'Unknown sync error');
      this.patch({ status: 'error' });
    } finally {
      this.inFlight = false;
    }
  }

  private log(level: SyncLogEntry['level'], message: string): void {
    const entry: SyncLogEntry = { ts: Date.now(), level, message };
    this.patch({ log: [entry, ...this.state.log].slice(0, MAX_LOG) });
  }

  private patch(partial: Partial<SyncState>): void {
    this.state = { ...this.state, ...partial };
    for (const fn of this.listeners) {
      fn(this.state);
    }
  }
}

/** App-wide singleton. */
export const syncEngine = new SyncEngine();
