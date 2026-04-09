import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppStore } from '../store/app-store';

type RootStackParamList = {
  Home: undefined;
  ServerDetail: { serverUrl: string };
  Settings: undefined;
  ModelBrowser: undefined;
};

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const { servers, activeServer, loading, connect, disconnect, refreshStats, stats } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Auto-connect if configured
    if (activeServer) {
      connect();
    }
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await refreshStats();
    setRefreshing(false);
  }

  function handleServerSelect(server: typeof activeServer) {
    if (!server) return;
    useAppStore.getState().setActiveServer(server);
    connect();
    navigation.navigate('ServerDetail', { serverUrl: server.url });
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'online': return '#3fb950';
      case 'offline': return '#f85149';
      default: return '#8b949e';
    }
  }

  function renderServer({ item }: { item: typeof servers[number] }) {
    const isActive = activeServer?.id === item.id;

    return (
      <TouchableOpacity
        style={[styles.serverCard, isActive && styles.serverCardActive]}
        onPress={() => handleServerSelect(item)}
      >
        <View style={styles.serverHeader}>
          <Text style={styles.serverName}>{item.name}</Text>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
        </View>
        <Text style={styles.serverUrl}>{item.url}</Text>
        {isActive && stats && (
          <View style={styles.statsRow}>
            <Text style={styles.statText}>{stats.inference?.tokens_per_second?.toFixed(1)} t/s</Text>
            <Text style={styles.statText}>•</Text>
            <Text style={styles.statText}>{stats.memory_used_mb} MB</Text>
          </View>
        )}
        {item.model && (
          <Text style={styles.serverModel}>Model: {item.model}</Text>
        )}
        {isActive && (
          <TouchableOpacity
            style={styles.disconnectBtn}
            onPress={() => {
              disconnect();
              Alert.alert('Disconnected', 'Server connection closed');
            }}
          >
            <Text style={styles.disconnectBtnText}>Disconnect</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {loading && !activeServer ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#58a6ff" />
          <Text style={styles.loadingText}>Connecting...</Text>
        </View>
      ) : (
        <FlatList
          data={servers}
          renderItem={renderServer}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#58a6ff"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No Servers</Text>
              <Text style={styles.emptyText}>
                Add a Haven LLM server to get started
              </Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => navigation.navigate('Settings')}
              >
                <Text style={styles.addButtonText}>+ Add Server</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Settings')}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Local Chat FAB */}
      <TouchableOpacity
        style={styles.localChatFab}
        onPress={() => navigation.navigate('LocalInference')}
      >
        <Text style={styles.localChatFabText}>💬</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#8b949e', marginTop: 12, fontSize: 16 },
  listContent: { padding: 16 },
  serverCard: {
    backgroundColor: '#161b22',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  serverCardActive: {
    borderColor: '#58a6ff',
    backgroundColor: 'rgba(88, 166, 255, 0.05)',
  },
  serverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  serverName: { fontSize: 18, fontWeight: '600', color: '#f0f6fc' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  serverUrl: { fontSize: 14, color: '#8b949e', marginBottom: 4 },
  statsRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  statText: { fontSize: 12, color: '#58a6ff' },
  serverModel: { fontSize: 13, color: '#58a6ff', marginTop: 4 },
  disconnectBtn: {
    marginTop: 12,
    padding: 8,
    backgroundColor: 'rgba(248, 81, 73, 0.1)',
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f85149',
  },
  disconnectBtnText: { fontSize: 13, fontWeight: '600', color: '#f85149' },
  emptyContainer: { alignItems: 'center', marginTop: 64 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#f0f6fc', marginBottom: 8 },
  emptyText: { fontSize: 16, color: '#8b949e', marginBottom: 24 },
  addButton: {
    backgroundColor: '#58a6ff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#58a6ff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: { fontSize: 28, color: '#fff', fontWeight: 'bold' },
  localChatFab: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3fb950',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  localChatFabText: { fontSize: 28 },
});
