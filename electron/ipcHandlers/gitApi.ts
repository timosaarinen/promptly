// electron/ipcHandlers/gitApi.ts
import { ipcMain } from 'electron';
import path from 'node:path';
import { getCurrentRootPath } from '../sync';
import { getErrorMessage, toPosixPath } from '../utils';
import { getActualGitRepoRoot } from '../gitignoreManager';
import * as gitUtils from '../gitUtils';
import type { GitFileStatus } from '@shared/electron-api';

const LOG_GIT_STATUS_HANDLER_DETAILS = false;

function DEBUG(msg: string, ...args: unknown[]) {
  if (LOG_GIT_STATUS_HANDLER_DETAILS) {
    console.log('[GitAPI DEBUG]', msg, ...args);
  }
}

export function registerGitApiHandlers(): void {
  ipcMain.handle('git:isGitRepository', async () => {
    const rootPath = getCurrentRootPath();
    if (!rootPath) return { error: 'Root path not set.' };
    try {
      const isRepo = await gitUtils.isGitRepository(rootPath);
      return isRepo;
    } catch (error) {
      return { error: getErrorMessage(error) };
    }
  });

  ipcMain.handle('git:getCurrentBranch', async () => {
    const rootPath = getCurrentRootPath();
    if (!rootPath) return { error: 'Root path not set.' };
    try {
      const branch = await gitUtils.getCurrentBranch(rootPath);
      return branch;
    } catch (error) {
      return { error: getErrorMessage(error) };
    }
  });

  ipcMain.handle('git:getCurrentCommitHash', async () => {
    const rootPath = getCurrentRootPath();
    if (!rootPath) return { error: 'Root path not set.' };
    try {
      const commitHash = await gitUtils.getCurrentCommitHash(rootPath);
      return commitHash;
    } catch (error) {
      return { error: getErrorMessage(error) };
    }
  });

  ipcMain.handle('git:getGitStatus', async () => {
    const userSelectedRootPath = getCurrentRootPath();
    if (!userSelectedRootPath) {
      DEBUG('Root path not set. Aborting.');
      return { error: 'Root path not set.' };
    }

    const actualRepoRoot = getActualGitRepoRoot();
    const gitQueryPath = actualRepoRoot || userSelectedRootPath;

    DEBUG(`User Selected Root: "${userSelectedRootPath}"`);
    DEBUG(`Actual Git Repo Root: "${actualRepoRoot}"`);
    DEBUG(`Git Query Path: "${gitQueryPath}"`);

    try {
      let statusList = await gitUtils.getGitStatus(gitQueryPath);
      DEBUG('Raw statusList from gitUtils:', JSON.stringify(statusList, null, 2));

      const needsFiltering =
        actualRepoRoot && path.resolve(actualRepoRoot) !== path.resolve(userSelectedRootPath) && statusList.length > 0;

      DEBUG(`Needs filtering: ${needsFiltering}`);

      if (needsFiltering) {
        const filteredStatusList: GitFileStatus[] = [];
        const resolvedUserSelectedRoot = path.resolve(userSelectedRootPath);
        const normalizedUserSelectedRoot = path.normalize(resolvedUserSelectedRoot);

        DEBUG(`resolvedUserSelectedRoot: "${resolvedUserSelectedRoot}"`);
        DEBUG(`normalizedUserSelectedRoot: "${normalizedUserSelectedRoot}"`);

        for (const item of statusList) {
          DEBUG(`Processing item: path="${item.path}", originalPath="${item.originalPath}"`);
          const absoluteItemPath = path.resolve(actualRepoRoot!, item.path); // actualRepoRoot is guaranteed by needsFiltering
          const normalizedAbsoluteItemPath = path.normalize(absoluteItemPath);

          DEBUG(`  absoluteItemPath: "${absoluteItemPath}"`);
          DEBUG(`  normalizedAbsoluteItemPath: "${normalizedAbsoluteItemPath}"`);

          const normalizedUserSelectedRootWithSep = normalizedUserSelectedRoot.endsWith(path.sep)
            ? normalizedUserSelectedRoot
            : normalizedUserSelectedRoot + path.sep;
          DEBUG(`  normalizedUserSelectedRootWithSep: "${normalizedUserSelectedRootWithSep}"`);

          const condition1_startsWith = normalizedAbsoluteItemPath.startsWith(normalizedUserSelectedRootWithSep);
          const condition2_equals = normalizedAbsoluteItemPath === normalizedUserSelectedRoot;

          DEBUG(`  Condition check: startsWith SEP? ${condition1_startsWith}, equals root? ${condition2_equals}`);

          if (condition1_startsWith || condition2_equals) {
            const newRelativeItemPath = toPosixPath(path.relative(resolvedUserSelectedRoot, absoluteItemPath));
            let newOriginalRelativePath: string | undefined = undefined;
            if (item.originalPath) {
              const absoluteOriginalItemPath = path.resolve(actualRepoRoot!, item.originalPath);
              newOriginalRelativePath = toPosixPath(path.relative(resolvedUserSelectedRoot, absoluteOriginalItemPath));
            }

            DEBUG(
              `    Item kept. newRelativePath: "${newRelativeItemPath}", newOriginalRelativePath: "${newOriginalRelativePath}"`
            );
            filteredStatusList.push({
              ...item,
              path: newRelativeItemPath || '.',
              originalPath: newOriginalRelativePath,
            });
          } else {
            DEBUG(`    Item filtered out: "${item.path}"`);
          }
        }
        statusList = filteredStatusList;
      }
      DEBUG('Final statusList to be returned:', JSON.stringify(statusList, null, 2));
      return statusList;
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      DEBUG(`Error caught: ${errorMsg}`);
      return { error: errorMsg };
    }
  });

  ipcMain.handle('git:getCombinedDiff', async () => {
    const rootPath = getCurrentRootPath();
    if (!rootPath) return { error: 'Root path not set.' };
    try {
      const diff = await gitUtils.getCombinedDiff(rootPath);
      return diff;
    } catch (error) {
      return { error: getErrorMessage(error) };
    }
  });

  ipcMain.handle('git:stageAll', async () => {
    const rootPath = getCurrentRootPath();
    if (!rootPath) return { error: 'Root path not set.' };
    try {
      await gitUtils.gitStageAll(rootPath);
    } catch (error) {
      return { error: getErrorMessage(error) };
    }
  });

  ipcMain.handle('git:commit', async (_event, message: string) => {
    const rootPath = getCurrentRootPath();
    if (!rootPath) return { error: 'Root path not set.' };
    if (!message || message.trim() === '') return { error: 'Commit message cannot be empty.' };
    try {
      await gitUtils.gitCommit(rootPath, message);
    } catch (error) {
      return { error: getErrorMessage(error) };
    }
  });

  ipcMain.handle('git:push', async () => {
    const rootPath = getCurrentRootPath();
    if (!rootPath) return { error: 'Root path not set.' };
    try {
      await gitUtils.gitPush(rootPath);
    } catch (error) {
      return { error: getErrorMessage(error) };
    }
  });
}
