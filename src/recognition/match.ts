/**
 * match.ts — pure face-embedding comparison utilities.
 *
 * No native deps and no I/O so this module is fully unit-testable. The match
 * threshold is sourced from env (MATCH_THRESHOLD), never hardcoded.
 */
import { env } from '../config/env';

/** L2-normalize a vector. Returns a new array; zero vectors are returned as-is. */
export function l2normalize(v: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < v.length; i++) {
    sumSq += v[i] * v[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) {
    return v.slice();
  }
  return v.map(x => x / norm);
}

/** Cosine similarity in [-1, 1]. Returns 0 for length mismatch or empty input. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) {
    return 0;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Whether a similarity score clears the configured (or provided) threshold. */
export function isMatch(score: number, threshold: number = env.MATCH_THRESHOLD): boolean {
  return score >= threshold;
}

export interface Candidate {
  personId: string;
  embedding: number[];
}

export interface MatchResult {
  personId: string;
  score: number;
  matched: boolean;
}

/**
 * Find the closest candidate to `probe` by cosine similarity. Returns null when
 * there are no candidates.
 */
export function bestMatch(
  probe: number[],
  candidates: Candidate[],
  threshold: number = env.MATCH_THRESHOLD,
): MatchResult | null {
  let best: MatchResult | null = null;
  for (const c of candidates) {
    const score = cosineSimilarity(probe, c.embedding);
    if (best === null || score > best.score) {
      best = { personId: c.personId, score, matched: false };
    }
  }
  if (best) {
    best.matched = isMatch(best.score, threshold);
  }
  return best;
}
