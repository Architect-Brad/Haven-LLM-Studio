import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

type RootStackParamList = {
  Home: undefined;
  ServerDetail: { serverUrl: string };
  Settings: undefined;
  ModelBrowser: undefined;
};

type ModelBrowserScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ModelBrowser'>;
};

interface HFModel {
  id: string;
  modelId: string;
  author: string;
  downloads: number;
  likes: number;
  tags: string[];
  siblings: { rfilename: string }[];
}

interface GGUFFile {
  filename: string;
  size: number;
  repoId: string;
}

export default function ModelBrowserScreen({ navigation }: ModelBrowserScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [models, setModels] = useState<HFModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<HFModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    searchModels('llama');
  }, []);

  async function searchModels(query: string) {
    if (!query.trim()) return;

    setLoading(true);
    setSelectedModel(null);

    try {
      // HuggingFace API search
      const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query + ' gguf')}&limit=20&sort=downloads&direction=-1`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      setModels(data);
    } catch (error: any) {
      Alert.alert('Search Failed', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await searchModels(searchQuery || 'llama');
    setRefreshing(false);
  }

  function handleModelSelect(model: HFModel) {
    setSelectedModel(model);
  }

  async function handleDownloadFile(repoId: string, filename: string) {
    setDownloading(filename);
    setDownloadProgress(0);

    try {
      // TODO: Connect to Haven server download endpoint
      // const response = await fetch(`${serverUrl}/api/models/download`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ repo_id: repoId, filename }),
      // });

      // Simulate download for demo
      await simulateDownload();

      Alert.alert('Download Complete', `${filename} has been downloaded`);
    } catch (error: any) {
      Alert.alert('Download Failed', error.message);
    } finally {
      setDownloading(null);
      setDownloadProgress(0);
    }
  }

  async function simulateDownload() {
    // Simulate progress for demo
    for (let i = 0; i <= 100; i += 10) {
      setDownloadProgress(i);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  function formatSize(bytes: number): string {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
    return `${bytes} B`;
  }

  function getGGUFFiles(model: HFModel): GGUFFile[] {
    return model.siblings
      .filter(s => s.rfilename.endsWith('.gguf'))
      .map(s => ({
        filename: s.rfilename,
        size: 0, // Would need API call to get individual file sizes
        repoId: model.modelId,
      }));
  }

  function renderModel({ item }: { item: HFModel }) {
    const ggufCount = item.siblings.filter(s => s.rfilename.endsWith('.gguf')).length;

    return (
      <TouchableOpacity
        style={[
          styles.modelCard,
          selectedModel?.modelId === item.modelId && styles.modelCardSelected,
        ]}
        onPress={() => handleModelSelect(item)}
      >
        <View style={styles.modelHeader}>
          <Text style={styles.modelName} numberOfLines={1}>
            {item.modelId}
          </Text>
          <View style={styles.modelStats}>
            <Text style={styles.statText}>⬇ {formatDownloads(item.downloads)}</Text>
            <Text style={styles.statText}>❤ {item.likes}</Text>
          </View>
        </View>

        <Text style={styles.modelAuthor}>by {item.author}</Text>

        {ggufCount > 0 && (
          <View style={styles.ggufBadge}>
            <Text style={styles.ggufBadgeText}>{ggufCount} GGUF file{ggufCount > 1 ? 's' : ''}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  function renderSelectedModel() {
    if (!selectedModel) return null;

    const ggufFiles = getGGUFFiles(selectedModel);

    if (ggufFiles.length === 0) {
      return (
        <View style={styles.selectedSection}>
          <Text style={styles.selectedTitle}>Selected Model</Text>
          <Text style={styles.selectedName}>{selectedModel.modelId}</Text>
          <Text style={styles.noFiles}>No GGUF files found</Text>
        </View>
      );
    }

    return (
      <View style={styles.selectedSection}>
        <Text style={styles.selectedTitle}>Selected Model</Text>
        <Text style={styles.selectedName}>{selectedModel.modelId}</Text>

        <Text style={styles.filesTitle}>GGUF Files</Text>

        {ggufFiles.map(file => (
          <View key={file.filename} style={styles.fileRow}>
            <View style={styles.fileInfo}>
              <Text style={styles.fileName} numberOfLines={1}>
                {file.filename}
              </Text>
              {file.size > 0 && (
                <Text style={styles.fileSize}>{formatSize(file.size)}</Text>
              )}
            </View>

            {downloading === file.filename ? (
              <View style={styles.downloadProgress}>
                <Text style={styles.progressText}>{downloadProgress}%</Text>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${downloadProgress}%` },
                    ]}
                  />
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.downloadButton}
                onPress={() => handleDownloadFile(selectedModel.modelId, file.filename)}
              >
                <Text style={styles.downloadButtonText}>↓</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search models..."
          placeholderTextColor="#484f58"
          onSubmitEditing={() => searchModels(searchQuery)}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={() => searchModels(searchQuery)}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#58a6ff" />
          ) : (
            <Text style={styles.searchButtonText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Selected Model Details */}
      {renderSelectedModel()}

      {/* Model List */}
      <FlatList
        data={models}
        renderItem={renderModel}
        keyExtractor={(item) => item.modelId}
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
            <Text style={styles.emptyTitle}>No Models Found</Text>
            <Text style={styles.emptyText}>
              Search for GGUF models on HuggingFace
            </Text>
          </View>
        }
      />
    </View>
  );
}

function formatDownloads(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#f0f6fc',
    backgroundColor: '#21262d',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  searchButton: {
    backgroundColor: '#58a6ff',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  selectedSection: {
    padding: 16,
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
  },
  selectedTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8b949e',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  selectedName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f0f6fc',
    marginBottom: 12,
  },
  filesTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#f0f6fc',
    marginBottom: 8,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#21262d',
    borderRadius: 8,
    marginBottom: 8,
  },
  fileInfo: {
    flex: 1,
    marginRight: 12,
  },
  fileName: {
    fontSize: 14,
    color: '#f0f6fc',
  },
  fileSize: {
    fontSize: 12,
    color: '#8b949e',
    marginTop: 2,
  },
  downloadButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#58a6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadButtonText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  downloadProgress: {
    alignItems: 'center',
    minWidth: 80,
  },
  progressText: {
    fontSize: 12,
    color: '#58a6ff',
    marginBottom: 4,
  },
  progressBar: {
    width: 80,
    height: 4,
    backgroundColor: '#30363d',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#58a6ff',
    borderRadius: 2,
  },
  noFiles: {
    fontSize: 14,
    color: '#8b949e',
    fontStyle: 'italic',
  },
  listContent: {
    padding: 12,
  },
  modelCard: {
    backgroundColor: '#161b22',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  modelCardSelected: {
    borderColor: '#58a6ff',
    backgroundColor: 'rgba(88, 166, 255, 0.05)',
  },
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modelName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#f0f6fc',
  },
  modelStats: {
    flexDirection: 'row',
    gap: 12,
  },
  statText: {
    fontSize: 12,
    color: '#8b949e',
  },
  modelAuthor: {
    fontSize: 13,
    color: '#8b949e',
    marginBottom: 8,
  },
  ggufBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(63, 185, 80, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  ggufBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3fb950',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 64,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f0f6fc',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#8b949e',
  },
});
