import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { localInference } from '../services/local-inference';
import type { LocalInferenceConfig } from '../services/local-inference';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tokensPerSecond?: number;
}

export default function LocalInferenceScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [thermalStatus, setThermalStatus] = useState<string>('normal');
  const flatListRef = useRef<FlatList>(null);

  const config: LocalInferenceConfig = {
    temperature: 0.8,
    top_k: 40,
    top_p: 0.9,
    max_tokens: 256,
  };

  useEffect(() => {
    checkModelStatus();
    checkThermalStatus();

    // Listen for model events
    const unsubLoaded = localInference.onModelLoaded(() => {
      setModelLoaded(true);
    });

    const unsubUnloaded = localInference.onModelUnloaded(() => {
      setModelLoaded(false);
      setCurrentModel(null);
    });

    return () => {
      unsubLoaded.remove();
      unsubUnloaded.remove();
    };
  }, []);

  async function checkModelStatus() {
    const loaded = await localInference.isModelLoaded();
    setModelLoaded(loaded);
  }

  async function checkThermalStatus() {
    const status = await localInference.getDeviceThermalStatus();
    setThermalStatus(status.thermalStatus);

    // Warn if thermal is severe/critical
    if (status.thermalStatus === 'severe' || status.thermalStatus === 'critical') {
      Alert.alert(
        'Device Overheating',
        'Your device is running hot. Inference may be throttled.',
      );
    }
  }

  async function handleSend() {
    if (!input.trim() || isGenerating) return;

    if (!modelLoaded) {
      Alert.alert(
        'No Model Loaded',
        'Please download and load a model first.',
      );
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsGenerating(true);

    // Build conversation context
    const conversationHistory = messages
      .slice(-5) // Last 5 messages for context
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const prompt = `${conversationHistory}\nUser: ${userMessage.content}\nAssistant:`;

    try {
      let assistantContent = '';

      await localInference.inferStreaming(
        prompt,
        config,
        (token, isEnd) => {
          assistantContent += token;

          if (isEnd) {
            const assistantMessage: Message = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: assistantContent.trim(),
              timestamp: Date.now(),
            };
            setMessages(prev => [...prev, assistantMessage]);
            setIsGenerating(false);
            flatListRef.current?.scrollToEnd({ animated: true });
          }
        },
      );
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsGenerating(false);
    }
  }

  function renderMessage({ item }: { item: Message }) {
    const isUser = item.role === 'user';

    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
          {item.content}
        </Text>
        {item.tokensPerSecond && (
          <Text style={styles.speedText}>{item.tokensPerSecond.toFixed(1)} t/s</Text>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Local Chat</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: modelLoaded ? '#3fb950' : '#f85149' }]} />
          <Text style={styles.statusText}>
            {modelLoaded ? `Loaded: ${currentModel?.split('/').pop()}` : 'No model'}
          </Text>
          {thermalStatus !== 'normal' && (
            <Text style={[styles.thermalBadge, styles[`thermal${thermalStatus}`]]}>
              🔥 {thermalStatus}
            </Text>
          )}
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messagesList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Start a Conversation</Text>
            <Text style={styles.emptyText}>
              Messages are processed entirely on your device.
            </Text>
          </View>
        }
      />

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Type a message..."
          placeholderTextColor="#484f58"
          multiline
          editable={!isGenerating}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || isGenerating) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || isGenerating}
        >
          {isGenerating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>↑</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    padding: 16,
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#f0f6fc', marginBottom: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, color: '#8b949e' },
  thermalBadge: {
    fontSize: 11,
    padding: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    fontWeight: '600',
  },
  thermallight: { backgroundColor: 'rgba(210, 153, 34, 0.2)', color: '#d29922' },
  thermalmoderate: { backgroundColor: 'rgba(248, 81, 73, 0.2)', color: '#f85149' },
  thermalsevere: { backgroundColor: 'rgba(248, 81, 73, 0.3)', color: '#f85149' },
  thermalcritical: { backgroundColor: 'rgba(248, 81, 73, 0.4)', color: '#f85149' },
  messagesList: { padding: 16 },
  messageBubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  userBubble: {
    backgroundColor: '#58a6ff',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageText: { fontSize: 15, lineHeight: 22 },
  userText: { color: '#fff' },
  assistantText: { color: '#f0f6fc' },
  speedText: { fontSize: 11, color: '#58a6ff', marginTop: 4 },
  emptyContainer: { alignItems: 'center', marginTop: 64 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#f0f6fc', marginBottom: 8 },
  emptyText: { fontSize: 16, color: '#8b949e', textAlign: 'center' },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#161b22',
    borderTopWidth: 1,
    borderTopColor: '#30363d',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#f0f6fc',
    backgroundColor: '#21262d',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#58a6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { fontSize: 24, color: '#fff', fontWeight: 'bold' },
});
