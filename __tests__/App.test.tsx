/**
 * Unit tests for Netra's pure, native-free core logic.
 *
 * These modules (recognition matching + liveness predicates) carry no native /
 * worklet dependencies, so they run under plain Jest. The camera, storage and
 * sync layers depend on native modules and are validated on-device.
 *
 * @format
 */

import {
  l2normalize,
  cosineSimilarity,
  isMatch,
  bestMatch,
} from '../src/recognition/match';
import {
  shuffledChallenges,
  ALL_CHALLENGES,
  isChallengeSatisfied,
  eyesClosed,
  eyesOpen,
  type LivenessSignals,
} from '../src/liveness/challenges';

const baseSignals: LivenessSignals = {
  hasFace: true,
  leftEyeOpen: 1,
  rightEyeOpen: 1,
  smiling: 0,
  yaw: 0,
};

describe('recognition/match', () => {
  test('l2normalize yields a unit vector', () => {
    const n = l2normalize([3, 4]);
    expect(Math.hypot(n[0], n[1])).toBeCloseTo(1, 6);
  });

  test('l2normalize leaves a zero vector unchanged', () => {
    expect(l2normalize([0, 0])).toEqual([0, 0]);
  });

  test('cosineSimilarity is 1 for identical and ~ -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  test('cosineSimilarity returns 0 on length mismatch / empty', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });

  test('isMatch respects the provided threshold', () => {
    expect(isMatch(0.8, 0.6)).toBe(true);
    expect(isMatch(0.5, 0.6)).toBe(false);
  });

  test('bestMatch picks the closest candidate and flags a match', () => {
    const probe = [1, 0, 0];
    const result = bestMatch(
      probe,
      [
        { personId: 'a', embedding: [0, 1, 0] },
        { personId: 'b', embedding: [0.9, 0.1, 0] },
      ],
      0.6,
    );
    expect(result?.personId).toBe('b');
    expect(result?.matched).toBe(true);
  });

  test('bestMatch returns null with no candidates', () => {
    expect(bestMatch([1, 0], [], 0.6)).toBeNull();
  });
});

describe('liveness/challenges', () => {
  test('shuffledChallenges returns a permutation of all challenges', () => {
    const s = shuffledChallenges();
    expect(s.slice().sort()).toEqual(ALL_CHALLENGES.slice().sort());
  });

  test('eyesClosed / eyesOpen are mutually exclusive', () => {
    const closed: LivenessSignals = { ...baseSignals, leftEyeOpen: 0, rightEyeOpen: 0 };
    expect(eyesClosed(closed)).toBe(true);
    expect(eyesOpen(closed)).toBe(false);
    expect(eyesOpen(baseSignals)).toBe(true);
  });

  test('smile / turn predicates require their thresholds and a face', () => {
    expect(isChallengeSatisfied('smile', { ...baseSignals, smiling: 0.99 })).toBe(true);
    expect(isChallengeSatisfied('smile', { ...baseSignals, smiling: 0.01 })).toBe(false);
    expect(isChallengeSatisfied('turn', { ...baseSignals, yaw: 45 })).toBe(true);
    expect(isChallengeSatisfied('turn', { ...baseSignals, yaw: 1 })).toBe(false);
    expect(
      isChallengeSatisfied('smile', { ...baseSignals, hasFace: false, smiling: 0.99 }),
    ).toBe(false);
  });
});
