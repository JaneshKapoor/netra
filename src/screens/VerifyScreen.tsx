/**
 * VerifyScreen.tsx — verify a face offline and log attendance.
 *
 * Flow: pass the randomized liveness challenge → capture one embedding →
 * cosine-match against enrolled templates → on a match, write an encrypted
 * attendance row locally. The sync engine purges it later once online.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView } from '../camera/CameraView';
import { LivenessOverlay } from '../components/LivenessOverlay';
import { useFaceCapture } from '../recognition/useFaceCapture';
import { verifyEmbedding, logAttendance } from '../recognition/enroll';
import { syncEngine } from '../sync/syncEngine';

export interface VerifyScreenProps {
  onDone: () => void;
}

interface Outcome {
  ok: boolean;
  title: string;
  detail: string;
}

export function VerifyScreen({ onDone }: VerifyScreenProps) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const onSamples = useCallback(async (samples: number[][]) => {
    const probe = samples[0] ?? [];
    const result = await verifyEmbedding(probe);
    if (result && result.matched) {
      await logAttendance(result.personId, null, null);
      void syncEngine.refreshPending();
      setOutcome({
        ok: true,
        title: `Welcome, ${result.personId}`,
        detail: `Attendance logged (score ${result.score.toFixed(3)}).`,
      });
    } else {
      setOutcome({
        ok: false,
        title: 'Not recognized',
        detail: result
          ? `Best score ${result.score.toFixed(3)} below threshold.`
          : 'No enrolled faces yet.',
      });
    }
  }, []);

  const capture = useFaceCapture(1, onSamples);

  const retry = useCallback(() => {
    setOutcome(null);
    capture.restart();
  }, [capture]);

  return (
    <View style={styles.root}>
      <CameraView
        isActive={outcome === null}
        capture={capture.capture}
        onSignals={capture.handleSignals}
        onEmbedding={capture.handleEmbedding}
        style={StyleSheet.absoluteFill}
      />
      {outcome === null ? (
        <LivenessOverlay
          liveness={capture.liveness}
          phase={capture.phase}
          capturedCount={capture.capturedCount}
          sampleCount={capture.sampleCount}
        />
      ) : (
        <View style={styles.result}>
          <Text style={[styles.resultTitle, { color: outcome.ok ? '#2ecc71' : '#e74c3c' }]}>
            {outcome.title}
          </Text>
          <Text style={styles.resultDetail}>{outcome.detail}</Text>
          <TouchableOpacity style={styles.btn} onPress={retry}>
            <Text style={styles.btnText}>Verify again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkBtn} onPress={onDone}>
            <Text style={styles.linkText}>Back</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  result: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 24,
  },
  resultTitle: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  resultDetail: { color: '#eee', fontSize: 15, marginTop: 12, textAlign: 'center' },
  btn: {
    marginTop: 28,
    backgroundColor: '#1f6feb',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkBtn: { marginTop: 16 },
  linkText: { color: '#9bb6e0', fontSize: 15 },
});

export default VerifyScreen;
