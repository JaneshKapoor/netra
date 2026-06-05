/**
 * db.ts — encrypted SQLite (SQLCipher) bootstrap.
 *
 * The database is encrypted at rest using SQLCipher (enabled via the
 * `"op-sqlite": { "sqlcipher": true }` flag in package.json). The encryption
 * key is NOT an env var and is never bundled: it is generated once with a
 * CSPRNG at first launch and stored in the OS Keychain / Android Keystore via
 * react-native-keychain.
 */
import 'react-native-get-random-values';
import { open, type DB } from '@op-engineering/op-sqlite';
import * as Keychain from 'react-native-keychain';
import RNFS from 'react-native-fs';

const DB_NAME = 'netra.db';
const KEYCHAIN_SERVICE = 'com.netra.db-encryption-key';
const KEYCHAIN_USERNAME = 'netra-db';
const KEY_BYTES = 32;

// Singleton promise (not just instance) so concurrent callers \u2014 we have ~8
// repo.ts sites that each `await getDatabase()` in parallel during startup \u2014
// share a single bootstrap and never race on open/probe/reset/unlink.
let dbBootstrap: Promise<DB> | null = null;

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Returns the DB encryption key, generating + persisting one on first launch.
 * The key lives only in the device secure store, never in source or `.env`.
 */
export async function getOrCreateEncryptionKey(): Promise<string> {
  const existing = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
  if (existing && existing.password) {
    return existing.password;
  }
  const bytes = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(bytes); // CSPRNG (react-native-get-random-values)
  const key = toHex(bytes);
  await Keychain.setGenericPassword(KEYCHAIN_USERNAME, key, {
    service: KEYCHAIN_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

function migrate(db: DB): void {
  db.executeSync(
    `CREATE TABLE IF NOT EXISTS enrollments (
       person_id  TEXT PRIMARY KEY NOT NULL,
       embedding  BLOB NOT NULL,
       dim        INTEGER NOT NULL,
       created_at INTEGER NOT NULL
     );`,
  );
  db.executeSync(
    `CREATE TABLE IF NOT EXISTS attendance (
       id              TEXT PRIMARY KEY NOT NULL,
       person_id       TEXT NOT NULL,
       ts              INTEGER NOT NULL,
       lat             REAL,
       lng             REAL,
       idempotency_key TEXT NOT NULL,
       synced          INTEGER NOT NULL DEFAULT 0
     );`,
  );
  db.executeSync(
    'CREATE INDEX IF NOT EXISTS idx_attendance_synced ON attendance (synced);',
  );
}

/**
 * Probe whether the DB can actually be decrypted with the current key. A
 * SQLCipher key mismatch surfaces on the first page read, not on open() — so
 * we issue a trivial query and treat any failure as a decryption failure.
 */
function canDecrypt(db: DB): boolean {
  try {
    db.executeSync('SELECT count(*) FROM sqlite_master;');
    return true;
  } catch {
    return false;
  }
}

/**
 * Unlink the DB file and its SQLite sidecars (WAL, SHM, journal) if present.
 * op-sqlite on iOS stores under NSLibraryDirectory (see OPSQLite.mm), so we
 * MUST unlink from `LibraryDirectoryPath` — not Documents. We also try the
 * Documents path defensively so the same routine works on Android / future
 * platform changes.
 */
async function unlinkDbFiles(): Promise<void> {
  const bases = [
    `${RNFS.LibraryDirectoryPath}/${DB_NAME}`,
    `${RNFS.DocumentDirectoryPath}/${DB_NAME}`,
  ];
  for (const base of bases) {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const path = base + suffix;
      try {
        if (await RNFS.exists(path)) {
          await RNFS.unlink(path);
        }
      } catch {
        // best-effort
      }
    }
  }
}

async function bootstrapDatabase(): Promise<DB> {
  let encryptionKey = await getOrCreateEncryptionKey();
  let db = open({ name: DB_NAME, encryptionKey });
  if (!canDecrypt(db)) {
    console.warn('[netra/db] decryption failed — resetting encrypted database.');
    try { db.close(); } catch {}
    await unlinkDbFiles();
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
    encryptionKey = await getOrCreateEncryptionKey();
    db = open({ name: DB_NAME, encryptionKey });
    if (!canDecrypt(db)) {
      throw new Error('[netra/db] decryption still failing after reset; aborting.');
    }
  }
  migrate(db);
  return db;
}

/**
 * Opens (once) and returns the encrypted database, running migrations.
 *
 * If the on-disk DB was encrypted under a previous key (e.g. the Keychain
 * entry was lost/rotated between installs), the open succeeds but the first
 * page read fails. In that case we close the poisoned handle, unlink the DB
 * file at the filesystem level (op-sqlite's db.delete() doesn't work on a
 * decryption-errored handle), reset the stale Keychain entry, generate a
 * fresh key, and re-open. This is destructive — any prior enrollments and
 * attendance on the device are lost — but it self-heals the app instead of
 * leaving it in an unusable state.
 *
 * Bootstrap is memoized as a Promise (not a resolved DB) so the very first
 * burst of concurrent callers shares one open/probe/reset cycle.
 */
export async function getDatabase(): Promise<DB> {
  if (!dbBootstrap) {
    dbBootstrap = bootstrapDatabase().catch(err => {
      // Allow a retry on next call if bootstrap itself errored.
      dbBootstrap = null;
      throw err;
    });
  }
  return dbBootstrap;
}

/** Closes the cached connection (used in tests / teardown). */
export async function closeDatabase(): Promise<void> {
  if (!dbBootstrap) {
    return;
  }
  const bootstrap = dbBootstrap;
  dbBootstrap = null;
  try {
    const db = await bootstrap;
    db.close();
  } catch {
    // already errored; nothing to close
  }
}
