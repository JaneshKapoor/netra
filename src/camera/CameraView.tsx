/**
 * CameraView.tsx — front camera + frame processor (vision-camera, worklets-core).
 *
 * Each frame: detect the face and emit `LivenessSignals` to JS (drives the
 * liveness challenges). When `capture` is requested, crop+resize the face and
 * run MobileFaceNet inside the same worklet, emitting the embedding to JS. The
 * JS thread stays free the whole time.
 *
 * Face signals come from ML Kit (react-native-vision-camera-face-detector).
 * TODO: swap to MediaPipe Face Landmarker blendshapes for full open-source
 * (Apache-2.0) compliance once its RN binding is stable.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { useSharedValue, useRunOnJS } from 'react-native-worklets-core';
import { useEmbedder, faceCropRect, frameToEmbedding } from '../recognition/embedder';
import type { LivenessSignals } from '../liveness/challenges';

export interface CameraViewProps {
  isActive: boolean;
  capture: boolean;
  onSignals: (s: LivenessSignals) => void;
  onEmbedding: (embedding: number[]) => void;
  style?: ViewStyle;
}

const NO_FACE: LivenessSignals = {
  hasFace: false,
  leftEyeOpen: 0,
  rightEyeOpen: 0,
  smiling: 0,
  yaw: 0,
};

export function CameraView({ isActive, capture, onSignals, onEmbedding, style }: CameraViewProps) {
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const faceDetector = useFaceDetector({
    performanceMode: 'fast',
    classificationMode: 'all',
    landmarkMode: 'all',
    contourMode: 'none',
    trackingEnabled: false,
  });
  const { model, resize, state, inputDataType, outputDataType } = useEmbedder();

  const captureRequested = useSharedValue(false);
  useEffect(() => {
    captureRequested.value = capture;
  }, [capture, captureRequested]);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const emitSignals = useRunOnJS(onSignals, [onSignals]);
  const emitEmbedding = useRunOnJS(onEmbedding, [onEmbedding]);

  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';
      const faces = faceDetector.detectFaces(frame);
      if (faces.length === 0) {
        emitSignals(NO_FACE);
        return;
      }
      const f = faces[0];
      emitSignals({
        hasFace: true,
        leftEyeOpen: f.leftEyeOpenProbability,
        rightEyeOpen: f.rightEyeOpenProbability,
        smiling: f.smilingProbability,
        yaw: f.yawAngle,
      });
      if (captureRequested.value && model != null && inputDataType != null && outputDataType != null) {
        const crop = faceCropRect(f.bounds, frame.width, frame.height);
        const embedding = frameToEmbedding(frame, resize, model, crop, inputDataType, outputDataType);
        emitEmbedding(embedding);
        captureRequested.value = false;
      }
    },
    [faceDetector, model, resize, inputDataType, outputDataType, emitSignals, emitEmbedding, captureRequested],
  );

  if (!hasPermission) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackText}>Camera permission required.</Text>
      </View>
    );
  }
  if (device == null) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackText}>No front camera available.</Text>
      </View>
    );
  }
  return (
    <View style={[styles.container, style]}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        frameProcessor={frameProcessor}
      />
      {state !== 'loaded' && (
        <View style={styles.modelBadge}>
          <Text style={styles.modelBadgeText}>
            {state === 'error' ? 'Model failed to load' : 'Loading model…'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#000' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  fallbackText: { color: '#fff', fontSize: 16, textAlign: 'center', padding: 16 },
  modelBadge: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  modelBadgeText: { color: '#fff', fontSize: 12 },
});

export default CameraView;
