/**
 * App.tsx — Netra demo shell.
 *
 * Offline facial-recognition attendance with active liveness. A lightweight
 * state-based router (no nav dependency) switches between Home, Enroll and
 * Verify; the persistent SyncStatusBar surfaces connectivity + sync/purge.
 *
 * @format
 */

import React, { useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EnrollScreen } from './src/screens/EnrollScreen';
import { VerifyScreen } from './src/screens/VerifyScreen';
import { SyncStatusBar } from './src/components/SyncStatusBar';

type Route = 'home' | 'enroll' | 'verify';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [route, setRoute] = useState<Route>('home');

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {route === 'home' && <Home onNavigate={setRoute} />}
          {route === 'enroll' && <EnrollScreen onDone={() => setRoute('home')} />}
          {route === 'verify' && <VerifyScreen onDone={() => setRoute('home')} />}
        </View>
        <SyncStatusBar />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Home({ onNavigate }: { onNavigate: (r: Route) => void }) {
  return (
    <View style={styles.home}>
      <Text style={styles.brand}>Netra</Text>
      <Text style={styles.tagline}>Offline face attendance + liveness</Text>
      <TouchableOpacity style={styles.tile} onPress={() => onNavigate('enroll')}>
        <Text style={styles.tileText}>Enroll a person</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tile, styles.tilePrimary]}
        onPress={() => onNavigate('verify')}>
        <Text style={[styles.tileText, styles.tileTextPrimary]}>Verify + log attendance</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1 },
  home: { flex: 1, padding: 24, justifyContent: 'center' },
  brand: { fontSize: 40, fontWeight: '800', color: '#111', textAlign: 'center' },
  tagline: { fontSize: 15, color: '#666', textAlign: 'center', marginTop: 8, marginBottom: 40 },
  tile: {
    backgroundColor: '#eef2f7',
    borderRadius: 14,
    paddingVertical: 22,
    alignItems: 'center',
    marginTop: 16,
  },
  tilePrimary: { backgroundColor: '#1f6feb' },
  tileText: { fontSize: 17, fontWeight: '600', color: '#111' },
  tileTextPrimary: { color: '#fff' },
});

export default App;
