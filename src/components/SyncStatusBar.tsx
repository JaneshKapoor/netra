/**
 * SyncStatusBar.tsx — connectivity banner + sync status / log panel.
 *
 * Subscribes to the SyncEngine via useSyncEngine and surfaces: online/offline
 * (airplane-mode) state, number of pending (unsynced) rows, last sync time, a
 * manual "Sync now" action, and a scrolling event log.
 */
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSyncEngine } from '../sync/useSyncEngine';

function statusColor(online: boolean): string {
  return online ? '#1b7f3b' : '#9a6a00';
}

export function SyncStatusBar() {
  const sync = useSyncEngine();

  return (
    <View style={styles.root}>
      <View style={[styles.banner, { backgroundColor: statusColor(sync.online) }]}>
        <Text style={styles.bannerText}>
          {sync.online ? 'Online' : 'Offline — attendance stored locally'}
        </Text>
        <Text style={styles.bannerText}>Pending: {sync.pending}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.meta}>
          {sync.status === 'syncing'
            ? 'Syncing…'
            : sync.lastSyncAt
              ? `Last sync ${new Date(sync.lastSyncAt).toLocaleTimeString()}`
              : 'Not synced yet'}
        </Text>
        <TouchableOpacity
          style={[styles.syncBtn, (!sync.online || sync.pending === 0) && styles.syncBtnDisabled]}
          disabled={!sync.online || sync.pending === 0}
          onPress={sync.syncNow}>
          <Text style={styles.syncBtnText}>Sync now</Text>
        </TouchableOpacity>
      </View>

      {sync.log.length > 0 && (
        <ScrollView style={styles.log} nestedScrollEnabled>
          {sync.log.map((e, i) => (
            <Text key={`${e.ts}-${i}`} style={[styles.logLine, logColor(e.level)]}>
              {new Date(e.ts).toLocaleTimeString()} — {e.message}
            </Text>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function logColor(level: 'info' | 'warn' | 'error') {
  if (level === 'error') {
    return { color: '#c0392b' };
  }
  if (level === 'warn') {
    return { color: '#9a6a00' };
  }
  return { color: '#444' };
}

const styles = StyleSheet.create({
  root: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ddd' },
  banner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bannerText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  meta: { color: '#444', fontSize: 13 },
  syncBtn: {
    backgroundColor: '#1f6feb',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  syncBtnDisabled: { backgroundColor: '#9bb6e0' },
  syncBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  log: { maxHeight: 96, paddingHorizontal: 16, paddingBottom: 8 },
  logLine: { fontSize: 11, fontFamily: 'Courier', marginTop: 2 },
});

export default SyncStatusBar;
