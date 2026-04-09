/**
 * Haven LLM Studio - Electron System Tray & KDE Integration
 * Adds system tray icon, D-Bus service, and desktop integration
 */

import { app, Tray, Menu, BrowserWindow, Notification, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export class DesktopIntegration {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow;
  private isQuitting = false;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.setupTray();
    this.setupDBus();
    this.setupAppLifecycle();
  }

  // ── System Tray ──────────────────────────────────────────────

  private setupTray(): void {
    // Try to find tray icon
    const iconPaths = [
      path.join(__dirname, '../../icons/icon-16.png'),
      path.join(__dirname, '../../icons/icon-32.png'),
      path.join(__dirname, '../../icons/icon.svg'),
    ];

    let trayIcon: nativeImage | null = null;
    for (const iconPath of iconPaths) {
      if (fs.existsSync(iconPath)) {
        trayIcon = nativeImage.createFromPath(iconPath);
        break;
      }
    }

    // Fallback: create a simple icon from buffer
    if (!trayIcon) {
      trayIcon = nativeImage.createEmpty();
    }

    this.tray = new Tray(trayIcon);
    this.tray.setToolTip('Haven LLM Studio');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Haven LLM Studio',
        click: () => this.showWindow(),
      },
      {
        label: 'Start Server',
        click: () => this.sendToRenderer('server:start'),
      },
      {
        label: 'Stop Server',
        click: () => this.sendToRenderer('server:stop'),
      },
      { type: 'separator' },
      {
        label: 'Load Model...',
        click: () => this.sendToRenderer('menu:load-model'),
      },
      {
        label: 'Settings',
        click: () => this.sendToRenderer('menu:settings'),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          this.isQuitting = true;
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);

    // Click to show window
    this.tray.on('click', () => {
      this.showWindow();
    });

    // Double-click to focus
    this.tray.on('double-click', () => {
      this.showWindow();
    });

    console.log('[Desktop] System tray initialized');
  }

  // ── D-Bus Service (Linux/KDE) ────────────────────────────────

  private setupDBus(): void {
    if (process.platform !== 'linux') return;

    try {
      // Check if dbus-next is available
      // In production, add 'dbus-next' to package.json dependencies
      const dbusPath = path.join(__dirname, '../../node_modules/dbus-next');

      if (!fs.existsSync(dbusPath)) {
        console.log('[Desktop] dbus-next not installed — D-Bus service disabled');
        console.log('[Desktop] Install with: npm install dbus-next');
        return;
      }

      // Dynamic import to avoid crash when dbus-next isn't installed
      import('dbus-next').then((dbus) => {
        this.initializeDBus(dbus);
      }).catch((err) => {
        console.warn('[Desktop] D-Bus initialization failed:', err.message);
      });
    } catch {
      console.log('[Desktop] D-Bus not available on this platform');
    }
  }

  private async initializeDBus(dbus: any): Promise<void> {
    const bus = dbus.sessionBus();
    const serviceName = 'com.havenllm.Studio';

    try {
      await bus.requestName(serviceName);

      const iface = new dbus.interface.Interface('com.havenllm.Studio');

      // Server control methods
      iface.addMethod('StartServer', {
        inSignature: 'q',
        outSignature: 'b',
      }, (port: number, callback: (err: any, result: boolean) => void) => {
        this.sendToRenderer('server:start', port);
        callback(null, true);
      });

      iface.addMethod('StopServer', {
        inSignature: '',
        outSignature: 'b',
      }, (callback: (err: any, result: boolean) => void) => {
        this.sendToRenderer('server:stop');
        callback(null, true);
      });

      iface.addMethod('IsRunning', {
        inSignature: '',
        outSignature: 'b',
      }, (callback: (err: any, result: boolean) => void) => {
        callback(null, true);
      });

      // Inference method
      iface.addMethod('Infer', {
        inSignature: 'ss',
        outSignature: 's',
      }, (prompt: string, config: string, callback: (err: any, result: string) => void) => {
        // This would need to be handled via IPC to the renderer
        callback(null, '{"text":"D-Bus inference not yet implemented"}');
      });

      // Properties
      iface.addProperty('Version', '0.1.0');
      iface.addProperty('ServerUrl', 'http://127.0.0.1:1234');
      iface.addProperty('ModelLoaded', false);

      bus.export('/com/havenllm/Studio', iface);

      console.log('[Desktop] D-Bus service registered: com.havenllm.Studio');
    } catch (err: any) {
      console.error('[Desktop] D-Bus registration failed:', err.message);
    }
  }

  // ── App Lifecycle ────────────────────────────────────────────

  private setupAppLifecycle(): void {
    // Prevent default quit behavior
    app.on('before-quit', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.hideWindow();
      }
    });

    // Handle second instance (Linux desktop file)
    app.on('second-instance', () => {
      this.showWindow();
    });

    // Activate on dock click (macOS)
    app.on('activate', () => {
      this.showWindow();
    });
  }

  // ── Window Management ────────────────────────────────────────

  private showWindow(): void {
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  private hideWindow(): void {
    this.mainWindow.hide();
  }

  private sendToRenderer(channel: string, ...args: any[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }

  // ── Public API ───────────────────────────────────────────────

  updateTrayTooltip(tooltip: string): void {
    if (this.tray) {
      this.tray.setToolTip(tooltip);
    }
  }

  showNotification(title: string, body: string): void {
    const notification = new Notification({
      title,
      body,
      icon: this.tray?.getImage(),
    });
    notification.show();
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
