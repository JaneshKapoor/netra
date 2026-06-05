/**
 * EnrollScreen.tsx — enroll a person fully offline.
 *
 * Flow: enter a person id → pass the randomized liveness challenge → capture
 * several face embeddings → average + L2-normalize → persist the template in the
 * encrypted DB. No network is required at any point.
 */
import React, { useCallback, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView } from '../camera/CameraView';
import { LivenessOverlay } from '../components/LivenessOverlay';
import { useFaceCapture } from '../recognition/useFaceCapture';
import { enrollPerson, ENROLL_SAMPLE_COUNT } from '../recognition/enroll';

export interface EnrollScreenProps {
  onDone: () => void;
}

export function EnrollScreen({ onDone }: EnrollScreenProps) {
  const [personId, setPersonId] = useState('');
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSamples = useCallback(
    async (samples: number[][]) => {
      setBusy(true);
      try {
        await enrollPerson(personId.trim(), samples);
        Alert.alert('Enrolled', `Saved template for "${personId.trim()}".`, [
          { text: 'OK', onPress: onDone },
        ]);
      } catch (e) {
        Alert.alert('Enrollment failed', e instanceof Error ? e.message : 'Unknown error');
        setStarted(false);
      } finally {
        setBusy(false);
      }
    },
    [personId, onDone],
  );

  const capture = useFaceCapture(ENROLL_SAMPLE_COUNT, onSamples);

  if (!started) {
    return (
      <View style={styles.form}>
        <Text style={styles.label}>Person ID</Text>
        <TextInput
          style={styles.input}
          value={personId}
          onChangeText={setPersonId}
          placeholder="e.g. emp-1042"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.btn, personId.trim() === '' && styles.btnDisabled]}
          disabled={personId.trim() === ''}
          onPress={() => setStarted(true)}>
          <Text style={styles.btnText}>Start enrollment</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={onDone}>
          <Text style={styles.linkText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        isActive
        capture={capture.capture}
        onSignals={capture.handleSignals}
        onEmbedding={capture.handleEmbedding}
        style={StyleSheet.absoluteFill}
      />
      <LivenessOverlay
        liveness={capture.liveness}
        phase={capture.phase}
        capturedCount={capture.capturedCount}
        sampleCount={capture.sampleCount}
      />
      {busy && (
        <View style={styles.busy}>
          <Text style={styles.busyText}>Saving template…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  form: { flex: 1, padding: 24, justifyContent: 'center' },
  label: { fontSize: 14, color: '#444', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  btn: { backgroundColor: '#1f6feb', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { backgroundColor: '#9bb6e0' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkBtn: { marginTop: 16, alignItems: 'center' },
  linkText: { color: '#1f6feb', fontSize: 15 },
  busy: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  busyText: { color: '#fff', fontSize: 16 },
});

export default EnrollScreen;
