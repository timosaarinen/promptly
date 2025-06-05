// electron/ipcHandlers/fileSystemApi.ts
import { ipcMain, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getCurrentRootPath, onNewRootPath } from '../sync';
import {
  getDirectoryStructure,
  getErrorMessage,
  sanitizeFilePath,
  getFsEntryTreeRecursive,
  readFileWithChecks,
  toPosixPath,
} from '../utils';
import { assembleContext as assembleContextImpl } from '../utils/contextBuilder';
import type { FsEntriesResponse, AssembleContextRequest, AssembleContextResponse } from '@shared/electron-api';
import { getWindowFromEvent } from './ipcUtils';

export function registerFileSystemApiHandlers(): void {
  ipcMain.handle('fs:setRootPath', async (event, newRootPath: string) => {
    try {
      const [win, ipcError] = getWindowFromEvent(event);
      if (!win) return { error: ipcError };
      await onNewRootPath(win, newRootPath);
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      console.error('[IPC] fs:setRootPath failed:', errorMsg);
      return { error: errorMsg };
    }
  });

  ipcMain.handle('dialog:openDirectory', async (event) => {
    const [win, ipcError] = getWindowFromEvent(event);
    if (!win) return { error: ipcError };
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    if (canceled || filePaths.length === 0) {
      return null;
    }
    const newRootPath = filePaths[0];
    onNewRootPath(win, newRootPath); // re-sync
    return newRootPath;
  });

  ipcMain.handle('fs:getRecursiveDirectoryTree', async (): Promise<FsEntriesResponse> => {
    const rootPath = getCurrentRootPath();
    console.log(`[IPC fs:getRecursiveDirectoryTree] rootPath = ${rootPath}`);
    if (!rootPath) {
      console.warn('[IPC fs:getRecursiveDirectoryTree] Root path not set.');
      return { error: 'Root path not set.' };
    }
    try {
      const tree = await getFsEntryTreeRecursive(rootPath, rootPath);
      console.log(
        `[IPC fs:getRecursiveDirectoryTree] Tree generation successful for ${rootPath}, ${tree.length} top-level entries.`
      );
      return tree;
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      console.error(
        `[IPC fs:getRecursiveDirectoryTree] Error getting recursive directory tree for ${rootPath}: ${errorMsg}`
      );
      return { error: `Failed to get directory tree: ${errorMsg}` };
    }
  });

  ipcMain.handle('fs:fileExists', async (_event, filePathRelative: string) => {
    const rootPath = getCurrentRootPath();
    if (!rootPath) return { error: 'Root path not set.' };
    const normalizedRelativePath = toPosixPath(filePathRelative);
    try {
      const safeFilePathAbsolute = sanitizeFilePath(rootPath, normalizedRelativePath);
      await fs.stat(safeFilePathAbsolute);
      return true;
    } catch (err) {
      return false; // TODO: handle if e.code !== 'ENOENT'?
    }
  });

  ipcMain.handle('fs:readFile', async (_event, filePathRelative: string) => {
    const rootPath = getCurrentRootPath();
    if (!rootPath) return { error: 'Root path not set.' };
    const normalizedRelativePath = toPosixPath(filePathRelative);
    try {
      const safeFilePathAbsolute = sanitizeFilePath(rootPath, normalizedRelativePath);
      return await readFileWithChecks(safeFilePathAbsolute, normalizedRelativePath);
    } catch (error: unknown) {
      console.error(`[IPC fs:readFile] Error processing path for ${normalizedRelativePath}: ${getErrorMessage(error)}`);
      return { error: getErrorMessage(error) };
    }
  });

  ipcMain.handle('fs:writeFile', async (_event, filePathRelative: string, content: string) => {
    const rootPath = getCurrentRootPath();
    if (!rootPath) return { error: 'Root path not set.' };
    try {
      const safePath = sanitizeFilePath(rootPath, toPosixPath(filePathRelative));
      const parentDir = path.dirname(safePath);
      await fs.mkdir(parentDir, { recursive: true });
      await fs.writeFile(safePath, content, 'utf-8');
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      console.error(`[IPC fs:writeFile] Error writing file ${filePathRelative} (or creating parent dir): ${errorMsg}`);
      return { error: errorMsg };
    }
  });

  ipcMain.handle('fs:deleteFile', async (_event, filePathRelative: string) => {
    const rootPath = getCurrentRootPath();
    if (!rootPath) return { error: 'Root path not set.' };
    try {
      const safePath = sanitizeFilePath(rootPath, toPosixPath(filePathRelative));
      await fs.unlink(safePath);
      console.log(`[IPC fs:deleteFile] Successfully deleted file: ${safePath}`);
    } catch (error: unknown) {
      const errorMsg = getErrorMessage(error);
      console.error(`[IPC fs:deleteFile] Error deleting file ${filePathRelative}: ${errorMsg}`);
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { error: `File not found: ${filePathRelative}` };
      }
      return { error: errorMsg };
    }
  });

  ipcMain.handle('fs:getDirectoryStructure', async () => {
    const rootPath = getCurrentRootPath();
    if (!rootPath) return { error: 'Root path not set.' };
    try {
      const structure = await getDirectoryStructure(rootPath);
      return structure;
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      console.error(`[IPC fs:getDirectoryStructure] Error: ${errorMsg}`);
      return {
        error: `Failed to get directory structure: ${errorMsg}`,
      };
    }
  });

  ipcMain.handle('dialog:saveFile', async (event, defaultFilename: string | undefined, fileContent: string) => {
    const [win, ipcError] = getWindowFromEvent(event);
    if (!win) return { error: ipcError };

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: defaultFilename || 'promptly-export.xml',
      filters: [
        { name: 'XML Files', extensions: ['xml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (canceled || !filePath) {
      return { error: 'Save cancelled by user.' };
    }
    try {
      await fs.writeFile(filePath, fileContent, 'utf-8');
      return { filePath: filePath };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      console.error(`[IPC dialog:saveFile] Error saving to ${filePath}: ${errorMsg}`);
      return { error: errorMsg };
    }
  });

  ipcMain.handle(
    'fs:assembleContext',
    async (_event, request: AssembleContextRequest): Promise<AssembleContextResponse> => {
      return assembleContextImpl(request);
    }
  );
}
