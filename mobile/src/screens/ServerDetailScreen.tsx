import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppStore } from '../store/app-store';

type RootStackParamList = {
  Home: undefined;
  ServerDetail: { serverUrl: string };
  Settings: undefined;
  ModelBrowser: undefined;
};

type ServerDetailScreenProps = {
  route: RouteProp<RootStackParamList, 'ServerDetail'>;
  navigation: NativeStackNavigationProp<RootStackParamList, 'ServerDetail'>;
};

export default function ServerDetailScreen({ route, navigation }: ServerDetailScreenProps) {
  const { serverUrl } = route.params;
  const { stats, models, systemInfo, loading, refreshStats, refreshModels, loadModel, unloadModel, client } = useAppStore();
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    refreshStats();
    refreshModels();

    if (polling) {
      const interval = setInterval(refreshStats, 2000);
      return () => clearInterval(interval);
    }
  }, [serverUrl, polling]);

  async function handleDisconnect() {
    setPolling(false);
    navigation.goBack();
  }

  async function handleLoadModel(modelPath: string) {
    try {
      await loadModel(modelPath);
      Alert.alert('Success', 'Model loaded');
    } catch (error: any) {
      Alert.alert('Failed', error.message);
    }
  }

  if (loading && !stats) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#58a6ff" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Server Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Server Info</Text>
        <View style={styles.infoCard}>
          <InfoRow label="URL" value={serverUrl} />
          <InfoRow label="Status" value={client ? 'Online' : 'Offline'} valueColor={client ? '#3fb950' : '#f85149'} />
          <InfoRow label="Platform" value={systemInfo?.platform || '—'} />
          <InfoRow label="Architecture" value={systemInfo?.arch || '—'} />
        </View>
      </View>

      {/* Performance */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance</Text>
        <View style={styles.statsGrid}>
          <StatCard label="Tokens/sec" value={stats?.inference?.tokens_per_second?.toFixed(1) || '0'} />
          <StatCard label="Memory" value={`${stats?.memory_used_mb || 0} MB`} />
          <StatCard label="CPU" value={`${stats?.cpu_percent || 0}%`} />
          <StatCard label="Active" value={stats?.inference?.active ? 'Yes' : 'No'} />
        </View>
      </View>

      {/* Models */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Models ({models.length})</Text>
        {models.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No models available</Text>
            <TouchableOpacity
              style={styles.browseButton}
              onPress={() => navigation.navigate('ModelBrowser')}
            >
              <Text style={styles.browseButtonText}>Browse HuggingFace</Text>
            </TouchableOpacity>
          </View>
        ) : (
          models.map(m => (
            <View key={m.path} style={styles.modelCard}>
              <View style={styles.modelInfo}>
                <Text style={styles.modelName} numberOfLines={1}>{m.name}</Text>
                <Text style={styles.modelMeta}>
                  {(m.size / 1024 / 1024 / 1024).toFixed(1)} GB • {m.type.toUpperCase()}
                  {m.metadata?.quantization ? ` • ${m.metadata.quantization}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.modelBtn, m.loaded ? styles.unloadBtn : styles.loadBtn]}
                onPress={() => m.loaded ? unloadModel() : handleLoadModel(m.path)}
              >
                <Text style={styles.modelBtnText}>{m.loaded ? 'Unload' : 'Load'}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('ModelBrowser')}
        >
          <Text style={styles.actionButtonText}>Browse Models</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={refreshStats}
        >
          <Text style={styles.actionButtonText}>Refresh Stats</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.dangerButton]}
          onPress={handleDisconnect}
        >
          <Text style={[styles.actionButtonText, styles.dangerText]}>Disconnect</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, { color: valueColor || '#f0f6fc' }]}>{value}</Text>
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  content: { padding: 16 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#f0f6fc', marginBottom: 12 },
  infoCard: {
    backgroundColor: '#161b22',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
  },
  infoLabel: { fontSize: 14, color: '#8b949e' },
  infoValue: { fontSize: 14, fontWeight: '500' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#161b22',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#30363d',
  },
  statValue: { fontSize: 24, fontWeight: '700', color: '#58a6ff', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#8b949e' },
  modelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161b22',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  modelInfo: { flex: 1, marginRight: 12 },
  modelName: { fontSize: 14, fontWeight: '500', color: '#f0f6fc' },
  modelMeta: { fontSize: 12, color: '#8b949e', marginTop: 2 },
  modelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  loadBtn: { backgroundColor: '#58a6ff' },
  unloadBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#f85149' },
  modelBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  emptyCard: {
    backgroundColor: '#161b22',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#30363d',
  },
  emptyText: { fontSize: 14, color: '#8b949e', marginBottom: 12 },
  browseButton: {
    backgroundColor: '#58a6ff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  browseButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  actionButton: {
    backgroundColor: '#21262d',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  dangerButton: {
    borderColor: '#f85149',
    backgroundColor: 'rgba(248, 81, 73, 0.1)',
  },
  actionButtonText: { fontSize: 16, fontWeight: '600', color: '#f0f6fc' },
  dangerText: { color: '#f85149' },
});
