/**
 * repo.ts — CRUD over the encrypted DB for enrolled embeddings + attendance.
 * Embeddings are stored as raw float32 BLOBs.
 */
import 'react-native-get-random-values';
import { getDatabase } from './db';

export interface EnrollmentRecord {
  personId: string;
  embedding: number[];
  createdAt: number;
}

export interface AttendanceInput {
  personId: string;
  ts: number;
  lat: number | null;
  lng: number | null;
}

export interface AttendanceRecord extends AttendanceInput {
  id: string;
  idempotencyKey: string;
  synced: number;
}

/** RFC4122 v4 UUID backed by the CSPRNG polyfill. */
export function uuidv4(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h: string[] = [];
  for (let i = 0; i < 16; i++) {
    h.push(b[i].toString(16).padStart(2, '0'));
  }
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}

function embeddingToBlob(embedding: number[]): ArrayBuffer {
  return new Float32Array(embedding).buffer;
}

function blobToEmbedding(blob: unknown): number[] {
  if (blob instanceof ArrayBuffer) {
    return Array.from(new Float32Array(blob));
  }
  if (ArrayBuffer.isView(blob)) {
    const view = blob as ArrayBufferView;
    return Array.from(new Float32Array(view.buffer, view.byteOffset, view.byteLength / 4));
  }
  return [];
}

export async function upsertEnrollment(personId: string, embedding: number[]): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO enrollments (person_id, embedding, dim, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(person_id) DO UPDATE SET
       embedding = excluded.embedding,
       dim = excluded.dim,
       created_at = excluded.created_at;`,
    [personId, embeddingToBlob(embedding), embedding.length, Date.now()],
  );
}

export async function getEnrollments(): Promise<EnrollmentRecord[]> {
  const db = await getDatabase();
  const res = await db.execute('SELECT person_id, embedding, created_at FROM enrollments;');
  return (res.rows ?? []).map(r => ({
    personId: r.person_id as string,
    embedding: blobToEmbedding(r.embedding),
    createdAt: r.created_at as number,
  }));
}

export async function deleteEnrollment(personId: string): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM enrollments WHERE person_id = ?;', [personId]);
}

export async function insertAttendance(input: AttendanceInput): Promise<AttendanceRecord> {
  const db = await getDatabase();
  const record: AttendanceRecord = {
    id: uuidv4(),
    idempotencyKey: uuidv4(),
    synced: 0,
    ...input,
  };
  await db.execute(
    `INSERT INTO attendance (id, person_id, ts, lat, lng, idempotency_key, synced)
     VALUES (?, ?, ?, ?, ?, ?, 0);`,
    [record.id, record.personId, record.ts, record.lat, record.lng, record.idempotencyKey],
  );
  return record;
}

function mapAttendance(r: Record<string, unknown>): AttendanceRecord {
  return {
    id: r.id as string,
    personId: r.person_id as string,
    ts: r.ts as number,
    lat: (r.lat as number | null) ?? null,
    lng: (r.lng as number | null) ?? null,
    idempotencyKey: r.idempotency_key as string,
    synced: r.synced as number,
  };
}

export async function getUnsyncedAttendance(): Promise<AttendanceRecord[]> {
  const db = await getDatabase();
  const res = await db.execute('SELECT * FROM attendance WHERE synced = 0 ORDER BY ts ASC;');
  return (res.rows ?? []).map(mapAttendance);
}

export async function getAllAttendance(): Promise<AttendanceRecord[]> {
  const db = await getDatabase();
  const res = await db.execute('SELECT * FROM attendance ORDER BY ts DESC;');
  return (res.rows ?? []).map(mapAttendance);
}

export async function markAttendanceSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await db.execute(`UPDATE attendance SET synced = 1 WHERE id IN (${placeholders});`, ids);
}

/** Purge rows that have been acknowledged by the backend (synced = 1). */
export async function purgeSyncedAttendance(): Promise<number> {
  const db = await getDatabase();
  const res = await db.execute('DELETE FROM attendance WHERE synced = 1;');
  return res.rowsAffected ?? 0;
}
