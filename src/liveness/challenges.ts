/**
 * challenges.ts — active (challenge-response) liveness from face signals.
 *
 * Geometric/derived liveness only — there is NO separate liveness model. Signals
 * come from the face landmarker's classification + head pose. All decision
 * thresholds are sourced from env (LIVENESS_*), never hardcoded.
 *
 * Three challenges (blink / smile / turn) are issued in a randomized order each
 * session, which defeats simple replay attacks.
 */
import { env } from '../config/env';

export type ChallengeType = 'blink' | 'smile' | 'turn';

export const ALL_CHALLENGES: ChallengeType[] = ['blink', 'smile', 'turn'];

/**
 * Per-frame liveness signals.
 * - eye-open / smiling probabilities are in [0, 1]
 * - yaw is the head's left/right rotation in degrees
 */
export interface LivenessSignals {
  hasFace: boolean;
  leftEyeOpen: number;
  rightEyeOpen: number;
  smiling: number;
  yaw: number;
}

export function challengeInstruction(c: ChallengeType): string {
  switch (c) {
    case 'blink':
      return 'Blink your eyes';
    case 'smile':
      return 'Smile';
    case 'turn':
      return 'Turn your head to the side';
  }
}

/** Fisher–Yates shuffle producing a fresh randomized challenge order. */
export function shuffledChallenges(): ChallengeType[] {
  const arr = ALL_CHALLENGES.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** True when the eyes are currently considered closed (below blink threshold). */
export function eyesClosed(s: LivenessSignals): boolean {
  const avg = (s.leftEyeOpen + s.rightEyeOpen) / 2;
  return avg < env.LIVENESS_BLINK_THRESHOLD;
}

/** True when the eyes are clearly open (used by the blink FSM). */
export function eyesOpen(s: LivenessSignals): boolean {
  const avg = (s.leftEyeOpen + s.rightEyeOpen) / 2;
  return avg >= env.LIVENESS_BLINK_THRESHOLD;
}

/**
 * Per-frame satisfaction predicate for smile/turn. Blink is handled as a small
 * open→closed→open state machine in useLiveness for robustness.
 */
export function isChallengeSatisfied(c: ChallengeType, s: LivenessSignals): boolean {
  if (!s.hasFace) {
    return false;
  }
  switch (c) {
    case 'blink':
      return eyesClosed(s);
    case 'smile':
      return s.smiling > env.LIVENESS_SMILE_THRESHOLD;
    case 'turn':
      return Math.abs(s.yaw) > env.LIVENESS_YAW_DEGREES;
  }
}
