/**
 * Electron Preload Script
 * Secure bridge between renderer and main process
 */

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('haven', {
  // System info
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  
  // Directory selection
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  
  // App version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Menu events
  onNewEndpoint: (callback: () => void) => {
    ipcRenderer.on('menu:new-endpoint', callback);
  },
  
  onSettings: (callback: () => void) => {
    ipcRenderer.on('menu:settings', callback);
  },
  
  // Cleanup
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('menu:new-endpoint');
    ipcRenderer.removeAllListeners('menu:settings');
  },
});

// Type definitions for the exposed API
export interface HavenAPI {
  getSystemInfo: () => Promise<any>;
  selectDirectory: () => Promise<string | null>;
  getAppVersion: () => Promise<string>;
  onNewEndpoint: (callback: () => void) => void;
  onSettings: (callback: () => void) => void;
  removeAllListeners: () => void;
}
