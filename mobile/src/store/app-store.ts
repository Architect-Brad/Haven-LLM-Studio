/**
 * Mobile App State Store (Zustand)
 */

import { create } from 'zustand';
import { HavenClient } from '../api/haven-client';
import type { ServerStats, ServerModel, SystemInfo, HealthCheck } from '../api/haven-client';

interface ServerEntry {
  id: string;
  name: string;
  url: string;
  status: 'online' | 'offline' | 'unknown';
  model?: string;
}

interface AppState {
  // Servers
  servers: ServerEntry[];
  activeServer: ServerEntry | null;

  // Client
  client: HavenClient | null;

  // Data
  stats: ServerStats | null;
  models: ServerModel[];
  systemInfo: SystemInfo | null;
  health: HealthCheck | null;

  // Loading states
  loading: boolean;
  error: string | null;

  // Settings
  autoConnect: boolean;
  refreshInterval: number;

  // Actions
  addServer: (name: string, url: string) => void;
  removeServer: (id: string) => void;
  setActiveServer: (server: ServerEntry) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshStats: () => Promise<void>;
  refreshModels: () => Promise<void>;
  loadModel: (path: string) => Promise<void>;
  unloadModel: () => Promise<void>;
  updateSettings: (settings: Partial<Pick<AppState, 'autoConnect' | 'refreshInterval'>>) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  servers: [],
  activeServer: null,
  client: null,
  stats: null,
  models: [],
  systemInfo: null,
  health: null,
  loading: false,
  error: null,
  autoConnect: true,
  refreshInterval: 5000,

  addServer: (name: string, url: string) => {
    const id = Date.now().toString();
    set(state => ({
      servers: [...state.servers, { id, name, url, status: 'unknown' as const }],
    }));
  },

  removeServer: (id: string) => {
    set(state => ({
      servers: state.servers.filter(s => s.id !== id),
      activeServer: state.activeServer?.id === id ? null : state.activeServer,
    }));
  },

  setActiveServer: (server: ServerEntry) => {
    set({ activeServer: server });
  },

  connect: async () => {
    const { activeServer } = get();
    if (!activeServer) return;

    set({ loading: true, error: null });

    try {
      const client = new HavenClient(activeServer.url);
      const health = await client.health();

      set({
        client,
        health,
        loading: false,
        activeServer: { ...activeServer, status: 'online' },
      });

      // Fetch initial data
      await get().refreshStats();
      await get().refreshModels();
    } catch (error: any) {
      set({
        loading: false,
        error: error.message,
        activeServer: { ...activeServer, status: 'offline' },
      });
    }
  },

  disconnect: () => {
    const { activeServer } = get();
    set({
      client: null,
      stats: null,
      models: [],
      systemInfo: null,
      health: null,
      activeServer: activeServer ? { ...activeServer, status: 'unknown' } : null,
    });
  },

  refreshStats: async () => {
    const { client } = get();
    if (!client) return;

    try {
      const stats = await client.getStats();
      set({ stats });
    } catch {
      // Silently fail
    }
  },

  refreshModels: async () => {
    const { client } = get();
    if (!client) return;

    try {
      const models = await client.getModels();
      set({ models });
    } catch {
      // Silently fail
    }
  },

  loadModel: async (path: string) => {
    const { client } = get();
    if (!client) return;

    await client.loadModel(path);
    await get().refreshModels();
  },

  unloadModel: async () => {
    const { client } = get();
    if (!client) return;

    await client.unloadModel();
    await get().refreshModels();
  },

  updateSettings: (settings) => {
    set(settings);
  },
}));
