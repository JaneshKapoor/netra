/**
 * useFaceCapture.ts — orchestrates one capture session for enroll/verify.
 *
 * Sequences the flow shared by both screens:
 *   1. `liveness` — run the randomized challenge-response (blink/smile/turn).
 *   2. `capturing` — once liveness passes, grab `sampleCount` embeddings.
 *   3. `done` — hand the collected samples back via `onSamples`.
 *
 * Wires the CameraView callbacks (`onSignals` → liveness, `onEmbedding` →
 * sample collection) and drives the `capture` toggle the worklet reads.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveness, type LivenessController } from '../liveness/useLiveness';
import type { LivenessSignals } from '../liveness/challenges';

export type CapturePhase = 'liveness' | 'capturing' | 'done';

export interface FaceCaptureController {
  liveness: LivenessController;
  phase: CapturePhase;
  capture: boolean;
  capturedCount: number;
  sampleCount: number;
  handleSignals: (s: LivenessSignals) => void;
  handleEmbedding: (embedding: number[]) => void;
  restart: () => void;
}

export function useFaceCapture(
  sampleCount: number,
  onSamples: (samples: number[][]) => void,
): FaceCaptureController {
  const liveness = useLiveness();
  const [phase, setPhase] = useState<CapturePhase>('liveness');
  const [capture, setCapture] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);
  const samplesRef = useRef<number[][]>([]);

  // Liveness passed → begin capturing embeddings.
  useEffect(() => {
    if (phase === 'liveness' && liveness.passed) {
      setPhase('capturing');
      setCapture(true);
    }
  }, [phase, liveness.passed]);

  const handleSignals = useCallback(
    (s: LivenessSignals) => {
      liveness.handleSignals(s);
    },
    [liveness],
  );

  const handleEmbedding = useCallback(
    (embedding: number[]) => {
      if (phase !== 'capturing') {
        return;
      }
      // Ignore degenerate/empty embeddings; keep the slot open.
      if (embedding.length > 0) {
        samplesRef.current = [...samplesRef.current, embedding];
        setCapturedCount(samplesRef.current.length);
      }
      setCapture(false);
      if (samplesRef.current.length >= sampleCount) {
        setPhase('done');
        onSamples(samplesRef.current);
      }
    },
    [phase, sampleCount, onSamples],
  );

  // Re-arm the capture toggle for the next sample.
  useEffect(() => {
    if (phase === 'capturing' && !capture && capturedCount < sampleCount) {
      const id = setTimeout(() => setCapture(true), 120);
      return () => clearTimeout(id);
    }
  }, [phase, capture, capturedCount, sampleCount]);

  const restart = useCallback(() => {
    samplesRef.current = [];
    setCapturedCount(0);
    setCapture(false);
    setPhase('liveness');
    liveness.reset();
  }, [liveness]);

  return {
    liveness,
    phase,
    capture,
    capturedCount,
    sampleCount,
    handleSignals,
    handleEmbedding,
    restart,
  };
}

export default useFaceCapture;
