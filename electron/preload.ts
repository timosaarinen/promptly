// electron/preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  ElectronAPI,
  FileSystemChangeEvent,
  SettingsUpdateEvent,
  TerminalOutputEvent,
  TerminalCommandExitEvent,
  GlobalRootPathUpdatedEvent,
  AssembleContextRequest,
  RootPathConfig,
} from '@shared/electron-api';

// --- Implement the ElectronAPI interface exactly as in shared/electron-api.ts ---
const electronAPI: ElectronAPI = {
  isElectron: true,

  setRootPath: (newRootPath: string) => ipcRenderer.invoke('fs:setRootPath', newRootPath),
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),

  getRecursiveDirectoryTree: () => ipcRenderer.invoke('fs:getRecursiveDirectoryTree'),

  fileExists: (filePath: string) => ipcRenderer.invoke('fs:fileExists', filePath),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  deleteFile: (filePath: string) => ipcRenderer.invoke('fs:deleteFile', filePath),
  getDirectoryStructure: () => ipcRenderer.invoke('fs:getDirectoryStructure'),
  saveFile: (defaultFilename: string | undefined, content: string) =>
    ipcRenderer.invoke('dialog:saveFile', defaultFilename, content),

  copyToClipboard: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  readFromClipboard: () => ipcRenderer.invoke('clipboard:readText'),

  updateRespectGitignore: (shouldRespect: boolean) =>
    ipcRenderer.invoke('settings:updateRespectGitignore', shouldRespect),

  onMainProcessMessage: (callback: (message: string) => void) => {
    const handler = (_event: IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on('main-process-message', handler);
    return () => ipcRenderer.removeListener('main-process-message', handler);
  },
  onFileSystemChange: (callback: (event: FileSystemChangeEvent) => void) => {
    const handler = (_event: IpcRendererEvent, eventData: FileSystemChangeEvent) => callback(eventData);
    ipcRenderer.on('filesystem-changed', handler);
    return () => ipcRenderer.removeListener('filesystem-changed', handler);
  },
  onSettingsUpdated: (callback: (event: SettingsUpdateEvent) => void) => {
    const handler = (_event: IpcRendererEvent, eventData: SettingsUpdateEvent) => callback(eventData);
    ipcRenderer.on('settings-updated', handler);
    return () => ipcRenderer.removeListener('settings-updated', handler);
  },
  onAppFocused: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('app-focused', handler);
    return () => ipcRenderer.removeListener('app-focused', handler);
  },
  onShowHelpContent: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('show-help-content', handler);
    return () => ipcRenderer.removeListener('show-help-content', handler);
  },
  onGlobalRootPathUpdated: (callback: (event: GlobalRootPathUpdatedEvent) => void) => {
    const handler = (_event: IpcRendererEvent, eventData: GlobalRootPathUpdatedEvent) => callback(eventData);
    ipcRenderer.on('global-root-path-updated', handler);
    return () => ipcRenderer.removeListener('global-root-path-updated', handler);
  },

  getInitialRootPath: () => ipcRenderer.invoke('app:getInitialRootPath'),
  settingsGetFileSelectionForRoot: (rootPath: string) =>
    ipcRenderer.invoke('settings:getFileSelectionForRoot', rootPath),
  settingsSetFileSelectionForRoot: (rootPath: string, selectedPaths: string[]) =>
    ipcRenderer.invoke('settings:setFileSelectionForRoot', rootPath, selectedPaths),
  settingsDeleteFileSelectionForRoot: (rootPath: string) =>
    ipcRenderer.invoke('settings:deleteFileSelectionForRoot', rootPath),

  settingsGetRootPathConfigValue: <K extends keyof RootPathConfig>(rootPath: string, key: K) =>
    ipcRenderer.invoke('settings:getRootPathConfigValue', rootPath, key),
  settingsSetRootPathConfigValue: <K extends keyof RootPathConfig>(
    rootPath: string,
    key: K,
    value: RootPathConfig[K] | null
  ) => ipcRenderer.invoke('settings:setRootPathConfigValue', rootPath, key, value),

  isGitRepository: () => ipcRenderer.invoke('git:isGitRepository'),
  getCurrentBranch: () => ipcRenderer.invoke('git:getCurrentBranch'),
  getCurrentCommitHash: () => ipcRenderer.invoke('git:getCurrentCommitHash'),
  getGitStatus: () => ipcRenderer.invoke('git:getGitStatus'),
  getCombinedDiff: () => ipcRenderer.invoke('git:getCombinedDiff'),
  gitStageAll: () => ipcRenderer.invoke('git:stageAll'),
  gitCommit: (message: string) => ipcRenderer.invoke('git:commit', message),
  gitPush: () => ipcRenderer.invoke('git:push'),

  assembleContext: (request: AssembleContextRequest) => ipcRenderer.invoke('fs:assembleContext', request),

  readPublicFile: (path: string) => ipcRenderer.invoke('app:readPublicFile', path),

  runTerminalCommand: (command: string) => ipcRenderer.invoke('execution:runTerminalCommand', command),
  onTerminalOutput: (callback: (event: TerminalOutputEvent) => void) => {
    const handler = (_event: IpcRendererEvent, eventData: TerminalOutputEvent) => callback(eventData);
    ipcRenderer.on('terminal-output', handler);
    return () => ipcRenderer.removeListener('terminal-output', handler);
  },
  onTerminalCommandExit: (callback: (event: TerminalCommandExitEvent) => void) => {
    const handler = (_event: IpcRendererEvent, eventData: TerminalCommandExitEvent) => callback(eventData);
    ipcRenderer.on('terminal-command-exit', handler);
    return () => ipcRenderer.removeListener('terminal-command-exit', handler);
  },

  addRecentRootPath: (path: string) => ipcRenderer.invoke('settings:addRecentRootPath', path),
  getRecentRootPaths: () => ipcRenderer.invoke('settings:getRecentRootPaths'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

console.log('[Preload] electronAPI exposed to window (fully type-safe, contract-driven).');
