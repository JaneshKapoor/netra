/**
 * enroll.ts — enrollment + verification glue between embeddings and storage.
 *
 * Both enroll and verify are gated behind a passed liveness check at the screen
 * level (see EnrollScreen / VerifyScreen).
 */
import { l2normalize, bestMatch, type MatchResult } from './match';
import {
  upsertEnrollment,
  getEnrollments,
  insertAttendance,
  type AttendanceRecord,
} from '../storage/repo';

/** Number of frames averaged during enrollment for a stable template. */
export const ENROLL_SAMPLE_COUNT = 5;

/**
 * Average several embeddings (component-wise mean) and L2-normalize the result.
 * Empty input returns an empty vector.
 */
export function averageEmbeddings(samples: number[][]): number[] {
  if (samples.length === 0) {
    return [];
  }
  const dim = samples[0].length;
  const acc = new Array<number>(dim).fill(0);
  for (const s of samples) {
    for (let i = 0; i < dim && i < s.length; i++) {
      acc[i] += s[i];
    }
  }
  for (let i = 0; i < dim; i++) {
    acc[i] /= samples.length;
  }
  return l2normalize(acc);
}

/** Average the captured samples and persist the template for `personId`. */
export async function enrollPerson(personId: string, samples: number[][]): Promise<number[]> {
  const template = averageEmbeddings(samples);
  if (template.length === 0) {
    throw new Error('Cannot enroll: no embedding samples captured.');
  }
  await upsertEnrollment(personId, template);
  return template;
}

/** Compare a probe embedding against all enrolled templates. */
export async function verifyEmbedding(probe: number[]): Promise<MatchResult | null> {
  const enrollments = await getEnrollments();
  return bestMatch(
    l2normalize(probe),
    enrollments.map(e => ({ personId: e.personId, embedding: e.embedding })),
  );
}

/** Persist an attendance record for a verified person. */
export async function logAttendance(
  personId: string,
  lat: number | null,
  lng: number | null,
): Promise<AttendanceRecord> {
  return insertAttendance({ personId, ts: Date.now(), lat, lng });
}
