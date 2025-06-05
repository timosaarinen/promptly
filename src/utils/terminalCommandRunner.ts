// src/utils/terminalCommandRunner.ts
import React from 'react';
import { electronApi } from '@shared/electron-api';
import { getErrorMessage } from '@/utils/errorUtils';
import { TerminalLine } from '@/store/atoms';

type ShowToastFn = (text: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
type AddOutputLineFn = (type: TerminalLine['type'], data: string) => void;

export async function runCommandInTerminal(
  commandToRun: string,
  currentRootPath: string | null,
  setOutput: (update: React.SetStateAction<TerminalLine[]>) => void,
  setIsRunning: (update: React.SetStateAction<boolean>) => void,
  setExitCode: (update: React.SetStateAction<number | null>) => void,
  setExecutionError: (update: React.SetStateAction<string | null>) => void,
  setCurrentExecutionMessage: (update: React.SetStateAction<string | null>) => void,
  showToast: ShowToastFn,
  addOutputLine: AddOutputLineFn
): Promise<void> {
  if (!commandToRun.trim() || !currentRootPath) {
    showToast(!currentRootPath ? 'Root path not set. Cannot run command.' : 'No command to run.', 'info');
    return;
  }

  setIsRunning(true);
  setOutput([]);
  setExitCode(null);
  setExecutionError(null);
  setCurrentExecutionMessage(`Executing: ${commandToRun}`);

  try {
    // electronApi.runTerminalCommand will return an empty object on successful IPC,
    // or throw an error if the IPC itself fails (e.g., channel not found, permissions).
    // The actual command execution success/failure is communicated via events.
    await electronApi.runTerminalCommand(commandToRun);
    // At this point, the command has been initiated.
    // Subsequent updates (stdout, stderr, exit) will come via IPC events handled by the panel.
  } catch (err) {
    // This catch block handles errors in *sending* the command, not errors *from* the command.
    const errorMsg = getErrorMessage(err);
    addOutputLine('system', `Exception initiating command: ${errorMsg}`);
    setExecutionError(errorMsg); // Store this as a system-level execution error
    setIsRunning(false); // Command did not even start properly
    setCurrentExecutionMessage(null);
    showToast(`Failed to initiate command: ${errorMsg}`, 'error');
  }
}
