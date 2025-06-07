// electron/sync.ts: Global synchronization
import { BrowserWindow } from 'electron';
import { closeWatcher, initializeWatcher } from './fileSystemWatcher';
import { clearGitignoreRules, loadGitignore } from './gitignoreManager';
import { addRecentRootPath, setLastOpenedRootPath } from './settingsManager';
import { setupAppMenu } from './appMenu';

let isMainProcessReady = false;
let readyResolvers: Array<() => void> = [];
let currentRootPath: string | null = null;
let cachedShellEnv: NodeJS.ProcessEnv = {};

export function getShellEnv(): NodeJS.ProcessEnv {
  return cachedShellEnv;
}

export function setShellEnv(env: NodeJS.ProcessEnv): void {
  console.log('[Sync] Caching resolved shell environment.');
  cachedShellEnv = env;
}

export function signalMainProcessReady(): void {
  if (isMainProcessReady) return;
  console.log('Signal main process ready.');
  isMainProcessReady = true;
  // wake up all current waiters
  readyResolvers.forEach((resolve) => resolve());
  readyResolvers = [];
}

export function waitForMainProcessReady(): Promise<void> {
  if (isMainProcessReady) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    readyResolvers.push(resolve);
  });
}

// Startup critical services on new root directory
export async function onNewRootPath(win: BrowserWindow, newRootPath: string) {
  console.log(`[Sync] onNewRootPath(${newRootPath})`);
  currentRootPath = newRootPath;
  await loadGitignore(newRootPath);
  await initializeWatcher(win, newRootPath);
  setLastOpenedRootPath(newRootPath);
  addRecentRootPath(newRootPath);
  setupAppMenu(win);

  if (win && !win.isDestroyed()) {
    win.webContents.send('global-root-path-updated', { newRootPath });
    console.log(`[Sync] Sent global-root-path-updated event for ${newRootPath} to renderer.`);
  }
}

export async function onClose() {
  clearGitignoreRules();
  await closeWatcher();
}

export function getCurrentRootPath(): string | null {
  return currentRootPath;
}
