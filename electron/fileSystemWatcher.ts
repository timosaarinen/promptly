// electron/fileSystemWatcher.ts
import chokidar, { FSWatcher } from 'chokidar';
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { getErrorMessage, shouldIgnoreFilePathAlways, shouldIgnoreFilePath, toPosixPath } from './utils';
import { loadGitignore } from './gitignoreManager';

let currentRootPath: string | null = null;
let fsWatcher: FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
const DEBOUNCE_DELAY = 500; // ms

function sendFileSystemChange(win: BrowserWindow, eventType: string, relativeFilePath: string) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('filesystem-changed', {
      eventType,
      path: relativeFilePath,
    });
  }
}

async function handleFsEvent(win: BrowserWindow, eventType: string, filePath: string) {
  if (!currentRootPath) return;
  const absoluteFilePath = path.isAbsolute(filePath) ? filePath : path.join(currentRootPath, filePath);
  const relativePath = toPosixPath(path.relative(currentRootPath, absoluteFilePath));

  if (path.basename(absoluteFilePath) === '.gitignore') {
    console.log(`[FSWatcher] .gitignore file changed: ${absoluteFilePath}. Reloading rules.`);
    await loadGitignore(currentRootPath);
  }

  if (shouldIgnoreFilePath(relativePath, absoluteFilePath)) {
    return;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    sendFileSystemChange(win, eventType, relativePath);
    debounceTimer = null;
  }, DEBOUNCE_DELAY);
}

export async function initializeWatcher(win: BrowserWindow, newRootPath: string): Promise<void> {
  if (fsWatcher) {
    await fsWatcher.close();
    console.log('[FSWatcher] Previous file watcher closed.');
    fsWatcher = null;
  }

  currentRootPath = newRootPath;
  if (!currentRootPath) return;

  console.log(`[FSWatcher] Initializing chokidar to watch: ${currentRootPath}`);
  fsWatcher = chokidar.watch(currentRootPath, {
    ignored: (filePathToCheck: string, _stats?: fs.Stats): boolean => {
      // This chokidar `ignored` function must be synchronous.
      // It uses `shouldIgnoreFilePathAlways` for non-Git specific ignores.
      // Git-based ignores are handled asynchronously inside handleFsEvent.
      const relativePathForAlwaysCheck = path.isAbsolute(filePathToCheck)
        ? path.relative(currentRootPath!, filePathToCheck)
        : filePathToCheck;
      if (shouldIgnoreFilePathAlways(relativePathForAlwaysCheck)) return true;
      return false;
    },
    persistent: true,
    ignoreInitial: true,
    depth: 99,
  });

  const fsEvents = ['add', 'addDir', 'change', 'unlink', 'unlinkDir'] as const;
  for (const event of fsEvents) {
    fsWatcher.on(event, (fsPath: string) =>
      handleFsEvent(win, event, fsPath).catch((err) =>
        console.error(`[FSWatcher] Error in '${event}' handler: ${getErrorMessage(err)}`)
      )
    );
  }

  fsWatcher
    .on('error', (error) => console.error(`[FSWatcher] Watcher error: ${getErrorMessage(error)}`))
    .on('ready', () => console.log('[FSWatcher] Initial scan complete. Ready for changes.'));
}

export async function closeWatcher(): Promise<void> {
  if (fsWatcher) {
    await fsWatcher.close();
    fsWatcher = null;
    console.log('[FSWatcher] File watcher closed.');
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}
