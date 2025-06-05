// electron/ipcHandlers/settingsApi.ts
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { setRespectGitignoreRules } from '../gitignoreManager';
import * as settingsManager from '../settingsManager';
import { getWindowFromEvent } from './ipcUtils';
import type { RootPathConfig } from '@shared/types';

const LOG_SETTINGS_VERBOSE = false;

function DEBUG(msg: string, ...args: unknown[]) {
  if (LOG_SETTINGS_VERBOSE) {
    console.log('[SettingsAPI DEBUG]', msg, ...args);
  }
}

export function registerSettingsApiHandlers(): void {
  ipcMain.handle('settings:updateRespectGitignore', async (event: IpcMainInvokeEvent, shouldRespect: boolean) => {
    setRespectGitignoreRules(shouldRespect);
    const [win, _error] = getWindowFromEvent(event);
    win?.webContents.send('settings-updated', {
      type: 'respectGitignore',
      value: shouldRespect,
    });
  });

  ipcMain.handle('settings:addRecentRootPath', (_event: IpcMainInvokeEvent, path: string) => {
    return settingsManager.addRecentRootPath(path);
  });

  ipcMain.handle('settings:getRecentRootPaths', (): string[] => {
    return settingsManager.getRecentRootPaths();
  });

  ipcMain.handle('settings:getFileSelectionForRoot', async (_event: IpcMainInvokeEvent, rootPath: string) => {
    DEBUG(`getFileSelectionForRoot: Requested for rootPath: "${rootPath}"`);
    const selection = settingsManager.getFileSelectionForRoot(rootPath);
    DEBUG('getFileSelectionForRoot: Value from settingsManager:', selection);
    return selection;
  });

  ipcMain.handle(
    'settings:setFileSelectionForRoot',
    async (_event: IpcMainInvokeEvent, rootPath: string, selectedPaths: string[]) => {
      settingsManager.setFileSelectionForRoot(rootPath, selectedPaths);
    }
  );

  ipcMain.handle('settings:deleteFileSelectionForRoot', async (_event: IpcMainInvokeEvent, rootPath: string) => {
    settingsManager.deleteFileSelectionForRoot(rootPath);
  });

  // Generic handler for getting a specific config value for a root path
  ipcMain.handle(
    'settings:getRootPathConfigValue',
    async <K extends keyof RootPathConfig>(
      _event: IpcMainInvokeEvent,
      rootPath: string,
      key: K
    ): Promise<RootPathConfig[K] | null> => {
      DEBUG(`getRootPathConfigValue: Requested for rootPath: "${rootPath}", key: "${String(key)}"`);
      const value = settingsManager.getRootPathConfigValue(rootPath, key);
      return value ?? null; // Return null if undefined for consistency
    }
  );

  // Generic handler for setting a specific config value for a root path
  ipcMain.handle(
    'settings:setRootPathConfigValue',
    async <K extends keyof RootPathConfig>(
      _event: IpcMainInvokeEvent,
      rootPath: string,
      key: K,
      value: RootPathConfig[K] | null
    ) => {
      DEBUG(`setRootPathConfigValue: Setting for rootPath: "${rootPath}", key: "${String(key)}", value:`, value);
      settingsManager.setRootPathConfigValue(rootPath, key, value);
    }
  );
}
