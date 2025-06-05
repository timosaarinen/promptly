// electron/ipcHandlers.ts
import { registerFileSystemApiHandlers } from './ipcHandlers/fileSystemApi';
import { registerGitApiHandlers } from './ipcHandlers/gitApi';
import { registerSettingsApiHandlers } from './ipcHandlers/settingsApi';
import { registerClipboardApiHandlers } from './ipcHandlers/clipboardApi';
import { registerAppStateApiHandlers } from './ipcHandlers/appStateApi';
import { registerExecutionApiHandlers } from './ipcHandlers/executionApi';

export function registerIpcHandlers(): void {
  registerFileSystemApiHandlers();
  registerGitApiHandlers();
  registerSettingsApiHandlers();
  registerClipboardApiHandlers();
  registerAppStateApiHandlers();
  registerExecutionApiHandlers();
}
