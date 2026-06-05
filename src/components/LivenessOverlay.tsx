/**
 * LivenessOverlay.tsx — instruction + progress HUD drawn over the camera.
 *
 * Pure presentational component driven by the capture controller's phase and
 * liveness state. No detection logic lives here.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CapturePhase } from '../recognition/useFaceCapture';
import type { LivenessController } from '../liveness/useLiveness';

export interface LivenessOverlayProps {
  liveness: LivenessController;
  phase: CapturePhase;
  capturedCount: number;
  sampleCount: number;
}

export function LivenessOverlay({
  liveness,
  phase,
  capturedCount,
  sampleCount,
}: LivenessOverlayProps) {
  let title: string;
  let subtitle: string;
  if (!liveness.faceVisible && phase === 'liveness') {
    title = 'Position your face in the frame';
    subtitle = '';
  } else if (phase === 'liveness') {
    title = liveness.instruction;
    subtitle = `Step ${liveness.index + 1} of ${liveness.sequence.length}`;
  } else if (phase === 'capturing') {
    title = 'Hold still';
    subtitle = `Capturing ${capturedCount}/${sampleCount}`;
  } else {
    title = 'Done';
    subtitle = '';
  }

  return (
    <View pointerEvents="none" style={styles.root}>
      <View style={styles.frame} />
      <View style={styles.banner}>
        <Text style={styles.title}>{title}</Text>
        {subtitle !== '' && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  frame: {
    position: 'absolute',
    top: '15%',
    left: '12%',
    right: '12%',
    bottom: '28%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 160,
  },
  banner: {
    margin: 24,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '600', textAlign: 'center' },
  subtitle: { color: '#cfcfcf', fontSize: 14, marginTop: 6 },
});

export default LivenessOverlay;
