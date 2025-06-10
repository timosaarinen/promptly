// electron/settingsManager.ts
import Store from 'electron-store';
import { getErrorMessage } from './utils';
import { getCurrentRootPath } from './sync';
import type { RootPathConfig } from '@shared/types';

interface FileSelections {
  [rootPath: string]: string[]; // rootPath -> array of relative file paths
}

interface RootPathConfigs {
  [rootPath: string]: Partial<RootPathConfig>;
}

interface AppSettings {
  lastOpenedRootPath: string | null;
  fileSelections: FileSelections;
  rootPathConfigs: RootPathConfigs;
  recentRootPaths: string[];
}

const store = new Store<AppSettings>({
  defaults: {
    lastOpenedRootPath: null,
    fileSelections: {},
    rootPathConfigs: {},
    recentRootPaths: [],
  },
});

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  try {
    return store.get(key);
  } catch (error) {
    console.error(`[SettingsManager] Error getting setting '${key}': ${getErrorMessage(error)}`);
    return undefined as unknown as AppSettings[K];
  }
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  try {
    store.set(key, value);
  } catch (error) {
    console.error(`[SettingsManager] Error setting '${key}': ${getErrorMessage(error)}`);
  }
}

export function deleteSetting<K extends keyof AppSettings>(key: K): void {
  try {
    store.delete(key);
  } catch (error) {
    console.error(`[SettingsManager] Error deleting setting '${key}': ${getErrorMessage(error)}`);
  }
}

// --- lastOpenedRootPath helpers ---
export function getLastOpenedRootPath(): string | null {
  return getSetting('lastOpenedRootPath');
}

export function setLastOpenedRootPath(path: string | null): void {
  if (path) {
    setSetting('lastOpenedRootPath', path);
  } else {
    deleteSetting('lastOpenedRootPath');
  }
}

export function deleteLastOpenedRootPath(): void {
  deleteSetting('lastOpenedRootPath');
}

// --- Recent folders ---
const MAX_RECENT = 6; // 5+1 as one is the current directory

export function addRecentRootPath(path: string) {
  const current = store.get('recentRootPaths', []) as string[];
  const next = [path, ...current.filter((p) => p !== path)].slice(0, MAX_RECENT);
  setSetting('recentRootPaths', next);
}

export function getRecentRootPaths(): string[] {
  const all = getSetting('recentRootPaths') || [];
  const current = getCurrentRootPath();
  return all.filter((p) => p !== current);
}

// --- File selection helpers ---
export function getFileSelectionForRoot(rootPath: string): string[] | null {
  return getSetting('fileSelections')[rootPath] ?? null;
}

export function setFileSelectionForRoot(rootPath: string, selectedPaths: string[]): void {
  const selections = {
    ...getSetting('fileSelections'),
    [rootPath]: selectedPaths,
  };
  setSetting('fileSelections', selections);
}

export function deleteFileSelectionForRoot(rootPath: string): void {
  const selections = { ...getSetting('fileSelections') };
  delete selections[rootPath];
  setSetting('fileSelections', selections);
}

// --- Unified Root Path Configuration Helpers ---
export function getRootPathConfig(rootPath: string): Partial<RootPathConfig> | null {
  return getSetting('rootPathConfigs')[rootPath] ?? null;
}

export function getRootPathConfigValue<K extends keyof RootPathConfig>(
  rootPath: string,
  key: K
): RootPathConfig[K] | undefined {
  const config = getSetting('rootPathConfigs')[rootPath];
  return config ? config[key] : undefined;
}

export function setRootPathConfigValue<K extends keyof RootPathConfig>(
  rootPath: string,
  key: K,
  value: RootPathConfig[K] | null | undefined // Allow null/undefined to delete the key
): void {
  const allConfigs = { ...getSetting('rootPathConfigs') };
  let rootConfig = allConfigs[rootPath] || {};

  if (value === null || value === undefined) {
    delete rootConfig[key];
  } else {
    rootConfig = { ...rootConfig, [key]: value };
  }

  if (Object.keys(rootConfig).length === 0) {
    delete allConfigs[rootPath]; // Remove root entry if its config is empty
  } else {
    allConfigs[rootPath] = rootConfig;
  }
  setSetting('rootPathConfigs', allConfigs);
}
