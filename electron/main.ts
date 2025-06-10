// electron/main.ts
import { app, globalShortcut, dialog } from 'electron';
import fs from 'node:fs/promises';
import { VITE_DEV_SERVER_URL, APP_TITLE } from './config';
import { createWindow, setupAppEventHandlers } from './windowManager';
import { registerIpcHandlers } from './ipcHandlers';
import { waitForVite } from './devUtils';
import { getErrorMessage, getShellEnvironment } from './utils';
import * as settingsManager from './settingsManager';
import { onNewRootPath, signalMainProcessReady, setShellEnv } from './sync';
import { setupAppMenu } from './appMenu';

console.log('Electron main.ts starting...');
console.log('VITE_DEV_SERVER_URL from config:', VITE_DEV_SERVER_URL);

if (process.platform === 'darwin') {
  app.setName(APP_TITLE);
}

async function initializeApp() {
  if (process.argv.includes('--wait-vite') && VITE_DEV_SERVER_URL) {
    const viteReady = await waitForVite();
    if (!viteReady) {
      const errMsg = 'Vite server did not become ready. The application might not load correctly or may fail to load.';
      console.error(errMsg);
      if (app.isReady()) {
        dialog.showErrorBox('Startup Error', errMsg);
      }
      app.quit();
      return; // Stop further initialization
    } else {
      console.log('Vite is ready. Proceeding.');
    }
  }

  await app.whenReady();

  try {
    const shellEnv = await getShellEnvironment();
    setShellEnv(shellEnv);
    console.log('[Main] Resolved and cached user shell environment.');
  } catch (e) {
    const errorMsg = getErrorMessage(e);
    console.error(`[Main] Could not resolve shell environment: ${errorMsg}. Falling back to process.env.`);
    setShellEnv(process.env);
  }

  registerIpcHandlers();
  console.log('[Main] registerIpcHandlers() called.');

  try {
    const mainWindow = createWindow();
    setupAppMenu(mainWindow);
    setupAppEventHandlers();
    const initialRootPath = settingsManager.getLastOpenedRootPath();
    console.log(`[Main Init] Attempting to load last opened root path. Found: "${initialRootPath}"`);

    //await delay(5000); // DEBUG: force race condition we had, where renderer calls getInitialRootPath() before we have it ready. Keep this for future.

    if (initialRootPath && typeof initialRootPath === 'string') {
      try {
        const stats = await fs.stat(initialRootPath);
        if (!stats.isDirectory()) throw new Error('Not a directory.');
        await onNewRootPath(mainWindow, initialRootPath);
        console.log(`[Main] Successfully loaded and initialized last opened root path: ${initialRootPath}`);
      } catch (error) {
        console.warn(
          `[Main] Last opened path is invalid or inaccessible: ${initialRootPath}. Error: ${getErrorMessage(error)}. Clearing setting.`
        );
        settingsManager.deleteLastOpenedRootPath();
      }
    }

    signalMainProcessReady();

    // Disable developer shortcuts in production
    if (!VITE_DEV_SERVER_URL) {
      const shortcutsToDisable = ['Control+R', 'F5', 'Control+Shift+I', 'F12'];
      shortcutsToDisable.forEach((accelerator) => {
        const success = globalShortcut.register(accelerator, () => {
          console.log(`${accelerator} is disabled in production.`);
        });
        if (!success) {
          console.warn(`Failed to register shortcut: ${accelerator}`);
        }
      });
    }
  } catch (error) {
    const errMsg = getErrorMessage(error);
    console.error('Error during app initialization or createWindow():', errMsg);
    if (app.isReady()) {
      dialog.showErrorBox('Application Initialization Error', `An error occurred: ${errMsg}`);
    }
    app.quit();
  }
}

initializeApp().catch((err) => {
  // This catch is for errors within initializeApp itself, though most are handled inside.
  const errMsg = getErrorMessage(err);
  console.error('Unhandled error during initializeApp:', errMsg);
  if (app.isReady()) {
    dialog.showErrorBox('Critical Error', `A critical error occurred during startup: ${errMsg}`);
  }
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', getErrorMessage(reason));
});
