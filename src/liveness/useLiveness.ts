/**
 * useLiveness.ts — drives the randomized challenge-response session.
 *
 * Fed per-frame `LivenessSignals` (from CameraView, on the JS thread). Advances
 * through a shuffled blink/smile/turn sequence; `passed` flips true only after
 * every challenge in the session has been satisfied.
 */
import { useCallback, useRef, useState } from 'react';
import {
  type ChallengeType,
  type LivenessSignals,
  challengeInstruction,
  isChallengeSatisfied,
  shuffledChallenges,
  eyesOpen,
  eyesClosed,
} from './challenges';

/** Consecutive satisfied frames required for smile/turn (debounce). */
const REQUIRED_STREAK = 3;

export interface LivenessController {
  sequence: ChallengeType[];
  index: number;
  current: ChallengeType | null;
  instruction: string;
  progress: number;
  passed: boolean;
  faceVisible: boolean;
  handleSignals: (s: LivenessSignals) => void;
  reset: () => void;
}

export function useLiveness(): LivenessController {
  const [sequence, setSequence] = useState<ChallengeType[]>(() => shuffledChallenges());
  const [index, setIndex] = useState(0);
  const [passed, setPassed] = useState(false);
  const [faceVisible, setFaceVisible] = useState(false);

  const sequenceRef = useRef(sequence);
  const indexRef = useRef(0);
  const streakRef = useRef(0);
  const blinkStageRef = useRef<'await-open' | 'await-close'>('await-open');

  const resetChallengeFsm = useCallback(() => {
    streakRef.current = 0;
    blinkStageRef.current = 'await-open';
  }, []);

  const reset = useCallback(() => {
    const next = shuffledChallenges();
    sequenceRef.current = next;
    indexRef.current = 0;
    resetChallengeFsm();
    setSequence(next);
    setIndex(0);
    setPassed(false);
    setFaceVisible(false);
  }, [resetChallengeFsm]);

  const advance = useCallback(() => {
    const nextIndex = indexRef.current + 1;
    indexRef.current = nextIndex;
    resetChallengeFsm();
    setIndex(nextIndex);
    if (nextIndex >= sequenceRef.current.length) {
      setPassed(true);
    }
  }, [resetChallengeFsm]);

  const handleSignals = useCallback(
    (s: LivenessSignals) => {
      setFaceVisible(s.hasFace);
      if (indexRef.current >= sequenceRef.current.length) {
        return;
      }
      const current = sequenceRef.current[indexRef.current];

      if (current === 'blink') {
        // open -> closed -> counts as a blink (requires a real transition)
        if (blinkStageRef.current === 'await-open' && eyesOpen(s)) {
          blinkStageRef.current = 'await-close';
        } else if (blinkStageRef.current === 'await-close' && eyesClosed(s)) {
          advance();
        }
        return;
      }

      if (isChallengeSatisfied(current, s)) {
        streakRef.current += 1;
        if (streakRef.current >= REQUIRED_STREAK) {
          advance();
        }
      } else {
        streakRef.current = 0;
      }
    },
    [advance],
  );

  const current = index < sequence.length ? sequence[index] : null;
  return {
    sequence,
    index,
    current,
    instruction: current ? challengeInstruction(current) : 'Liveness passed',
    progress: sequence.length === 0 ? 0 : index / sequence.length,
    passed,
    faceVisible,
    handleSignals,
    reset,
  };
}
