// electron/windowManager.ts
import { app, BrowserWindow, BrowserWindowConstructorOptions, dialog } from 'electron';
import path from 'node:path';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { APP_TITLE, VITE_DEV_SERVER_URL, publicPath, distRendererPath } from './config';
import { onClose, onNewRootPath, clearCurrentRootPath } from './sync';
import { setupAppMenu } from './appMenu';
import * as settingsManager from './settingsManager';
import { getErrorMessage } from './utils';

export function createWindow(): BrowserWindow {
  console.log('createWindow() called.');
  const browserWindowOptions: BrowserWindowConstructorOptions = {
    title: APP_TITLE,
    icon: path.join(publicPath, 'promptly.svg'),
    width: 1920,
    height: 1080,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  };

  const mainWindow = new BrowserWindow(browserWindowOptions);
  console.log('BrowserWindow created.');

  mainWindow.on('closed', async () => {
    onClose();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('webContents did-finish-load.');
    mainWindow?.webContents.send('main-process-message', new Date().toLocaleString());

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setZoomFactor(1.0);
      mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
      mainWindow.show();
      if (process.platform === 'darwin') {
        app.dock?.show();
      }
      app.focus({ steal: true });
      mainWindow.focus();
      console.log('Window shown and focused.');
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`webContents did-fail-load: URL=${validatedURL}, Code=${errorCode}, Desc=${errorDescription}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('[WindowManager] Window focused, sending app-focused event.');
      mainWindow.webContents.send('app-focused');
    }
  });

  if (VITE_DEV_SERVER_URL) {
    console.log(`Attempting to load URL: ${VITE_DEV_SERVER_URL}`);
    mainWindow
      .loadURL(VITE_DEV_SERVER_URL)
      .then(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.openDevTools();
        }
      })
      .catch((err) => console.error('Failed to load VITE_DEV_SERVER_URL:', err));
  } else {
    if (!distRendererPath) throw new Error('No distRendererPath (running in dev?)');
    const indexPath = path.join(distRendererPath, 'index.html');
    if (!existsSync(indexPath)) {
      const errMsg = `Missing renderer build at ${indexPath}`;
      console.error(errMsg);
      dialog.showErrorBox('Application Error', `Failed to load application content: ${errMsg}`);
      app.quit();
      throw new Error(errMsg);
    }
    mainWindow.loadFile(indexPath).catch((err) => console.error('Failed to loadFile:', err));
  }
  return mainWindow;
}

export function setupAppEventHandlers(): void {
  app.on('window-all-closed', () => {
    console.log('All windows closed.');
    if (process.platform === 'darwin') {
      clearCurrentRootPath();
      setupAppMenu();
    } else {
      app.quit();
    }
  });

  app.on('activate', async () => {
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length === 0) {
      const win = createWindow();
      // On macOS, re-opening the app with no windows should restore the last session.
      const lastPath = settingsManager.getLastOpenedRootPath();
      if (lastPath) {
        try {
          const stats = await fs.stat(lastPath);
          if (!stats.isDirectory()) throw new Error('Not a directory.');
          await onNewRootPath(win, lastPath);
        } catch (error) {
          console.warn(
            `[WindowManager] Could not reopen last path on activate: ${lastPath}. Error: ${getErrorMessage(error)}`
          );
          settingsManager.deleteLastOpenedRootPath();
        }
      }
    } else {
      const win = allWindows[0];
      if (win && !win.isDestroyed()) {
        if (!win.isVisible()) win.show();
        win.focus();
      }
    }
  });
}
