// electron/ipcHandlers/appStateApi.ts
import { ipcMain } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getErrorMessage } from '../utils';
import { publicPath } from '../config';
import { getCurrentRootPath, waitForMainProcessReady } from '../sync';

export function registerAppStateApiHandlers(): void {
  ipcMain.handle('app:getInitialRootPath', async () => {
    console.log('** app:getInitialRootPath called, syncing for main process.. **');
    await waitForMainProcessReady(); // NOTE: important initial sync from renderer
    console.log('** app:getInitialRootPath done **');
    return getCurrentRootPath();
  });

  ipcMain.handle('app:readPublicFile', async (_event, relativePath: string) => {
    const fullPath = path.join(publicPath, relativePath);
    try {
      console.log(`[IPC app:readPublicFile] Reading file from: ${fullPath}`);
      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      console.error(`[IPC app:readPublicFile] Error reading ${fullPath}: ${errorMsg}`);
      return { error: `Error reading ${fullPath}: ${errorMsg}` };
    }
  });
}
