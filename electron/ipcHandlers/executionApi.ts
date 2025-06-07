// electron/ipcHandlers/executionApi.ts
import { ipcMain } from 'electron';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { getErrorMessage } from '../utils';
import { getCurrentRootPath, getShellEnv } from '../sync';
import { TerminalOutputEvent, TerminalCommandExitEvent } from '@shared/electron-api';
import { getWindowFromEvent } from './ipcUtils';

export function registerExecutionApiHandlers(): void {
  ipcMain.handle('execution:runTerminalCommand', async (event, commandToRun: string) => {
    const rootPath = getCurrentRootPath();
    const [win, ipcError] = getWindowFromEvent(event);
    if (!win) return { error: ipcError };

    if (!rootPath) {
      return {
        error: 'Root path not set. Cannot run command.',
      };
    }

    if (!commandToRun || commandToRun.trim() === '') {
      return { error: 'Command cannot be empty.' };
    }

    try {
      const shellEnv = getShellEnv();
      const child: ChildProcessWithoutNullStreams = spawn(commandToRun, [], {
        cwd: rootPath,
        shell: true,
        detached: false,
        env: shellEnv,
      });

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (!win.isDestroyed()) {
          win.webContents.send('terminal-output', {
            type: 'stdout',
            data: chunk,
          } as TerminalOutputEvent);
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (!win.isDestroyed()) {
          win.webContents.send('terminal-output', {
            type: 'stderr',
            data: chunk,
          } as TerminalOutputEvent);
        }
      });

      child.on('error', (err) => {
        console.error(
          `[ExecutionAPI] Error spawning/managing subprocess for command: "${commandToRun}". Error: ${err.message}`
        );
        if (!win.isDestroyed()) {
          win.webContents.send('terminal-command-exit', {
            exitCode: null,
            error: `Command execution failed: ${getErrorMessage(err)}`,
          } as TerminalCommandExitEvent);
        }
      });

      child.on('close', (code, signal) => {
        let exitError: string | undefined;
        if (signal) {
          exitError = `Command terminated by signal: ${signal}.`;
        }
        if (!win.isDestroyed()) {
          win.webContents.send('terminal-command-exit', {
            exitCode: code,
            error: exitError,
          } as TerminalCommandExitEvent);
        }
      });
    } catch (spawnError) {
      const errorMessage = getErrorMessage(spawnError);
      console.error(
        `[ExecutionAPI] Synchronous error during spawn for command: "${commandToRun}". Error: ${errorMessage}`
      );
      if (!win.isDestroyed()) {
        win.webContents.send('terminal-command-exit', {
          exitCode: null,
          error: `Failed to spawn command: ${errorMessage}`,
        } as TerminalCommandExitEvent);
      }
      return {
        error: `Failed to spawn command: ${errorMessage}`,
      };
    }
  });
}
