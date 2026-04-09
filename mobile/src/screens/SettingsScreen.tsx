import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

type RootStackParamList = {
  Home: undefined;
  ServerDetail: { serverUrl: string };
  Settings: undefined;
  ModelBrowser: undefined;
};

type SettingsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

interface ServerConfig {
  name: string;
  url: string;
}

interface InferenceSettings {
  temperature: string;
  topK: string;
  topP: string;
  maxTokens: string;
  repeatPenalty: string;
  gpuLayers: string;
  autoConnect: boolean;
  darkMode: boolean;
}

interface ClusterSettings {
  enabled: boolean;
  role: 'master' | 'worker';
  masterUrl: string;
  nodeId: string;
  nodeName: string;
  port: string;
  maxWorkers: string;
  authToken: string;
}

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const [serverConfig, setServerConfig] = useState<ServerConfig>({
    name: '',
    url: 'http://192.168.1.100:1234',
  });

  const [inference, setInference] = useState<InferenceSettings>({
    temperature: '0.8',
    topK: '40',
    topP: '0.9',
    maxTokens: '256',
    repeatPenalty: '1.1',
    gpuLayers: '0',
    autoConnect: true,
    darkMode: true,
  });

  const [cluster, setCluster] = useState<ClusterSettings>({
    enabled: false,
    role: 'master',
    masterUrl: 'ws://192.168.1.100:1235',
    nodeId: '',
    nodeName: '',
    port: '1235',
    maxWorkers: '10',
    authToken: '',
  });

  useEffect(() => {
    // TODO: Load saved settings from secure storage
  }, []);

  async function handleSaveServer() {
    if (!serverConfig.url) {
      Alert.alert('Error', 'Server URL is required');
      return;
    }

    // TODO: Save to secure storage
    Alert.alert('Success', 'Server configuration saved', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  }

  async function handleTestConnection() {
    try {
      const response = await fetch(`${serverConfig.url}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        Alert.alert(
          'Connection Successful',
          `Server is running (${data.native ? 'native' : 'mock'} mode)`,
        );
      } else {
        Alert.alert('Connection Failed', `Server returned ${response.status}`);
      }
    } catch (error: any) {
      Alert.alert('Connection Failed', error.message);
    }
  }

  function updateInference(key: keyof InferenceSettings, value: string) {
    setInference(prev => ({ ...prev, [key]: value }));
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Server Configuration */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Server Configuration</Text>
        <View style={styles.card}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Server Name</Text>
            <TextInput
              style={styles.input}
              value={serverConfig.name}
              onChangeText={(text) => setServerConfig(prev => ({ ...prev, name: text }))}
              placeholder="My Haven Server"
              placeholderTextColor="#484f58"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Server URL</Text>
            <TextInput
              style={styles.input}
              value={serverConfig.url}
              onChangeText={(text) => setServerConfig(prev => ({ ...prev, url: text }))}
              placeholder="http://192.168.1.100:1234"
              placeholderTextColor="#484f58"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={handleTestConnection}
            >
              <Text style={styles.secondaryButtonText}>Test Connection</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleSaveServer}
            >
              <Text style={styles.primaryButtonText}>Save Server</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Inference Defaults */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Inference Defaults</Text>
        <View style={styles.card}>
          <SettingRow
            label="Temperature"
            value={inference.temperature}
            onChangeText={(v) => updateInference('temperature', v)}
            keyboardType="numeric"
          />
          <Divider />
          <SettingRow
            label="Top K"
            value={inference.topK}
            onChangeText={(v) => updateInference('topK', v)}
            keyboardType="numeric"
          />
          <Divider />
          <SettingRow
            label="Top P"
            value={inference.topP}
            onChangeText={(v) => updateInference('topP', v)}
            keyboardType="numeric"
          />
          <Divider />
          <SettingRow
            label="Max Tokens"
            value={inference.maxTokens}
            onChangeText={(v) => updateInference('maxTokens', v)}
            keyboardType="numeric"
          />
          <Divider />
          <SettingRow
            label="Repeat Penalty"
            value={inference.repeatPenalty}
            onChangeText={(v) => updateInference('repeatPenalty', v)}
            keyboardType="numeric"
          />
          <Divider />
          <SettingRow
            label="GPU Layers"
            value={inference.gpuLayers}
            onChangeText={(v) => updateInference('gpuLayers', v)}
            keyboardType="numeric"
          />
        </View>
      </View>

      {/* App Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Settings</Text>
        <View style={styles.card}>
          <SwitchRow
            label="Auto-connect on Launch"
            value={inference.autoConnect}
            onValueChange={(v) => setInference(prev => ({ ...prev, autoConnect: v }))}
          />
          <Divider />
          <SwitchRow
            label="Dark Mode"
            value={inference.darkMode}
            onValueChange={(v) => setInference(prev => ({ ...prev, darkMode: v }))}
          />
        </View>
      </View>

      {/* Model Browser Link */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('ModelBrowser')}
        >
          <Text style={styles.actionCardTitle}>Browse Models</Text>
          <Text style={styles.actionCardDesc}>
            Search and download models from HuggingFace
          </Text>
        </TouchableOpacity>
      </View>

      {/* Cluster Settings */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Cluster</Text>
          <Switch
            value={cluster.enabled}
            onValueChange={(v) => setCluster(prev => ({ ...prev, enabled: v }))}
            trackColor={{ false: '#30363d', true: '#58a6ff' }}
            thumbColor="#f0f6fc"
          />
        </View>

        {cluster.enabled && (
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Role</Text>
              <View style={styles.roleButtons}>
                <TouchableOpacity
                  style={[styles.roleBtn, cluster.role === 'master' && styles.roleBtnActive]}
                  onPress={() => setCluster(prev => ({ ...prev, role: 'master' }))}
                >
                  <Text style={[styles.roleBtnText, cluster.role === 'master' && styles.roleBtnTextActive]}>
                    Master
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleBtn, cluster.role === 'worker' && styles.roleBtnActive]}
                  onPress={() => setCluster(prev => ({ ...prev, role: 'worker' }))}
                >
                  <Text style={[styles.roleBtnText, cluster.role === 'worker' && styles.roleBtnTextActive]}>
                    Worker
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {cluster.role === 'worker' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Master URL</Text>
                <TextInput
                  style={styles.input}
                  value={cluster.masterUrl}
                  onChangeText={(text) => setCluster(prev => ({ ...prev, masterUrl: text }))}
                  placeholder="ws://192.168.1.100:1235"
                  placeholderTextColor="#484f58"
                  keyboardType="url"
                  autoCapitalize="none"
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Node Name</Text>
              <TextInput
                style={styles.input}
                value={cluster.nodeName}
                onChangeText={(text) => setCluster(prev => ({ ...prev, nodeName: text }))}
                placeholder="Haven Node 1"
                placeholderTextColor="#484f58"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Port</Text>
                <TextInput
                  style={styles.input}
                  value={cluster.port}
                  onChangeText={(text) => setCluster(prev => ({ ...prev, port: text }))}
                  keyboardType="numeric"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>Max Workers</Text>
                <TextInput
                  style={styles.input}
                  value={cluster.maxWorkers}
                  onChangeText={(text) => setCluster(prev => ({ ...prev, maxWorkers: text }))}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Auth Token (optional)</Text>
              <TextInput
                style={styles.input}
                value={cluster.authToken}
                onChangeText={(text) => setCluster(prev => ({ ...prev, authToken: text }))}
                placeholder="your-haven-cluster-token"
                placeholderTextColor="#484f58"
                secureTextEntry
              />
            </View>
          </View>
        )}
      </View>

      {/* Danger Zone */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Danger Zone</Text>
        <TouchableOpacity
          style={styles.dangerCard}
          onPress={() => {
            Alert.alert(
              'Clear All Data',
              'This will remove all saved server configurations. Continue?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear',
                  style: 'destructive',
                  onPress: () => {
                    // TODO: Clear all data
                    Alert.alert('Cleared', 'All data has been removed');
                  },
                },
              ],
            );
          }}
        >
          <Text style={styles.dangerText}>Clear All Data</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function SettingRow({
  label,
  value,
  onChangeText,
  keyboardType = 'numeric',
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: 'numeric' | 'default';
}) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <TextInput
        style={styles.settingInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        textAlign="right"
      />
    </View>
  );
}

function SwitchRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#30363d', true: '#58a6ff' }}
        thumbColor="#f0f6fc"
      />
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f0f6fc',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#161b22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  inputGroup: {
    padding: 16,
  },
  label: {
    fontSize: 13,
    color: '#8b949e',
    marginBottom: 8,
  },
  input: {
    fontSize: 15,
    color: '#f0f6fc',
    backgroundColor: '#21262d',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  buttonRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#58a6ff',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    backgroundColor: '#21262d',
    borderWidth: 1,
    borderColor: '#30363d',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f0f6fc',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingLabel: {
    fontSize: 14,
    color: '#f0f6fc',
  },
  settingInput: {
    fontSize: 14,
    color: '#58a6ff',
    width: 80,
    textAlign: 'right',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#30363d',
  },
  actionCard: {
    backgroundColor: '#161b22',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#30363d',
    marginBottom: 8,
  },
  actionCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f0f6fc',
    marginBottom: 4,
  },
  actionCardDesc: {
    fontSize: 13,
    color: '#8b949e',
  },
  dangerCard: {
    backgroundColor: 'rgba(248, 81, 73, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f85149',
    alignItems: 'center',
  },
  dangerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f85149',
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  roleBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#21262d',
    borderWidth: 1,
    borderColor: '#30363d',
  },
  roleBtnActive: {
    backgroundColor: 'rgba(88, 166, 255, 0.2)',
    borderColor: '#58a6ff',
  },
  roleBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8b949e',
  },
  roleBtnTextActive: {
    color: '#58a6ff',
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
});
