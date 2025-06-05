// shared/electron-api.ts
import type { FsEntry, GitFileStatus, RootPathConfig } from './types';

// Estimation factor for chars -> tokens
export const FILESIZE_TO_TOKENS_ESTIMATE_FACTOR = 4;

// --- API request/response interfaces ---

export interface ErrorResponse {
  // Standard error response format
  error: string;
}

export interface AssembleContextRequest {
  rootPath: string;
  selectedFilePaths: string[]; // relative to rootPath
  includeGitDiff: boolean;
  includeSummary?: boolean;
  includeDirectoryStructure?: boolean;
  includeGitCommitHash?: boolean;
}
export type AssembleContextResponse = { xml: string; actualTokenCount: number } | ErrorResponse;

// For operations that return simple data or specific objects on success
export type StringResponse = string | ErrorResponse;
export type StringNullableResponse = string | null | ErrorResponse;
export type BooleanResponse = boolean | ErrorResponse;
export type FsEntriesResponse = FsEntry[] | ErrorResponse;
export type StringArrayResponse = string[] | ErrorResponse;
export type GitFileStatusArrayResponse = GitFileStatus[] | ErrorResponse;
export type SaveFileResponse = { filePath: string } | ErrorResponse;
// For operations that return nothing on success (void) or an error object
export type VoidResponse = void | ErrorResponse;
// For operations that return an empty object on success or an error object
export type EmptyObjectResponse = Record<string, never> | ErrorResponse;

// Specific type for getRootPathConfigValue response
export type RootPathConfigValueResponse<K extends keyof RootPathConfig> = RootPathConfig[K] | null | ErrorResponse;

export interface FileSystemChangeEvent {
  eventType: 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir';
  path: string;
}
export interface SettingsUpdateEvent {
  type: 'respectGitignore';
  value: boolean;
}

export interface TerminalOutputEvent {
  type: 'stdout' | 'stderr';
  data: string;
}
export interface TerminalCommandExitEvent {
  exitCode: number | null;
  error?: string; // Command's exit error, not IPC error
}

export interface GlobalRootPathUpdatedEvent {
  newRootPath: string;
}

// --- ElectronAPI contract ---
export interface ElectronAPI {
  isElectron: boolean;

  setRootPath: (newRootPath: string) => Promise<VoidResponse>;
  openDirectoryDialog: () => Promise<StringNullableResponse>;

  getRecursiveDirectoryTree: () => Promise<FsEntriesResponse>;

  fileExists: (filePath: string) => Promise<BooleanResponse>;
  readFile: (filePath: string) => Promise<StringResponse>;
  writeFile: (filePath: string, content: string) => Promise<VoidResponse>;
  deleteFile: (filePath: string) => Promise<VoidResponse>;
  getDirectoryStructure: () => Promise<StringArrayResponse>;
  saveFile: (defaultFilename: string | undefined, content: string) => Promise<SaveFileResponse>;

  copyToClipboard: (text: string) => Promise<VoidResponse>;
  readFromClipboard: () => Promise<StringResponse>;

  updateRespectGitignore: (shouldRespect: boolean) => Promise<VoidResponse>;

  onMainProcessMessage: (callback: (message: string) => void) => () => void;
  onFileSystemChange: (callback: (event: FileSystemChangeEvent) => void) => () => void;
  onSettingsUpdated: (callback: (event: SettingsUpdateEvent) => void) => () => void;
  onAppFocused: (callback: () => void) => () => void;
  onShowHelpContent: (callback: () => void) => () => void;
  onGlobalRootPathUpdated: (callback: (event: GlobalRootPathUpdatedEvent) => void) => () => void;

  getInitialRootPath: () => Promise<StringNullableResponse>;
  settingsGetFileSelectionForRoot: (rootPath: string) => Promise<StringArrayResponse | null | ErrorResponse>;
  settingsSetFileSelectionForRoot: (rootPath: string, selectedPaths: string[]) => Promise<VoidResponse>;
  settingsDeleteFileSelectionForRoot: (rootPath: string) => Promise<VoidResponse>;

  // Generic root path config methods
  settingsGetRootPathConfigValue: <K extends keyof RootPathConfig>(
    rootPath: string,
    key: K
  ) => Promise<RootPathConfigValueResponse<K>>;
  settingsSetRootPathConfigValue: <K extends keyof RootPathConfig>(
    rootPath: string,
    key: K,
    value: RootPathConfig[K] | null
  ) => Promise<VoidResponse>;

  isGitRepository: () => Promise<BooleanResponse>;
  getCurrentBranch: () => Promise<StringResponse>;
  getCurrentCommitHash: () => Promise<StringResponse>;
  getGitStatus: () => Promise<GitFileStatusArrayResponse>;
  getCombinedDiff: () => Promise<StringResponse>;
  gitStageAll: () => Promise<VoidResponse>;
  gitCommit: (message: string) => Promise<VoidResponse>;
  gitPush: () => Promise<VoidResponse>;

  assembleContext: (request: AssembleContextRequest) => Promise<AssembleContextResponse>;

  readPublicFile: (path: string) => Promise<StringResponse>;

  runTerminalCommand: (command: string) => Promise<EmptyObjectResponse>;
  onTerminalOutput: (callback: (event: TerminalOutputEvent) => void) => () => void;
  onTerminalCommandExit: (callback: (event: TerminalCommandExitEvent) => void) => () => void;

  addRecentRootPath: (path: string) => Promise<VoidResponse>;
  getRecentRootPaths: () => Promise<StringArrayResponse>;
}

// --- Central error handler. We always throw on errors, no need for status checking for client ---
function handleIpcResult<T>(result: T): Exclude<T, ErrorResponse> {
  // Check if result is an object, not null, and has an 'error' property that is a string.
  if (
    typeof result === 'object' &&
    result !== null &&
    'error' in result &&
    typeof (result as { error?: unknown }).error === 'string'
  ) {
    throw new Error((result as ErrorResponse).error);
  }
  return result as Exclude<T, ErrorResponse>;
}

// --- Centralized API wrappers for Renderer ---

export const electronApi = {
  // Directory/Root
  async setRootPath(path: string): Promise<void> {
    const result = await window.electronAPI.setRootPath(path);
    handleIpcResult(result);
  },
  async openDirectoryDialog(): Promise<string | null> {
    const result = await window.electronAPI.openDirectoryDialog();
    return handleIpcResult(result);
  },
  async getRecursiveDirectoryTree(): Promise<FsEntry[]> {
    const result = await window.electronAPI.getRecursiveDirectoryTree();
    return handleIpcResult(result);
  },

  // File
  async fileExists(filePath: string): Promise<boolean> {
    const result = await window.electronAPI.fileExists(filePath);
    return handleIpcResult(result);
  },
  async readFile(filePath: string): Promise<string> {
    const result = await window.electronAPI.readFile(filePath);
    return handleIpcResult(result);
  },
  async writeFile(filePath: string, content: string): Promise<void> {
    const result = await window.electronAPI.writeFile(filePath, content);
    handleIpcResult(result);
  },
  async deleteFile(filePath: string): Promise<void> {
    const result = await window.electronAPI.deleteFile(filePath);
    handleIpcResult(result);
  },
  async getDirectoryStructure(): Promise<string[]> {
    const result = await window.electronAPI.getDirectoryStructure();
    return handleIpcResult(result);
  },
  async saveFile(defaultFilename: string | undefined, content: string): Promise<{ filePath: string }> {
    const result = await window.electronAPI.saveFile(defaultFilename, content);
    return handleIpcResult(result);
  },

  // Clipboard
  async copyToClipboard(text: string): Promise<void> {
    const result = await window.electronAPI.copyToClipboard(text);
    handleIpcResult(result);
  },
  async readFromClipboard(): Promise<string> {
    const result = await window.electronAPI.readFromClipboard();
    return handleIpcResult(result);
  },

  // Settings
  async updateRespectGitignore(shouldRespect: boolean): Promise<void> {
    const result = await window.electronAPI.updateRespectGitignore(shouldRespect);
    handleIpcResult(result);
  },

  // Settings: File selections
  async settingsGetFileSelectionForRoot(rootPath: string): Promise<string[] | null> {
    const result = await window.electronAPI.settingsGetFileSelectionForRoot(rootPath);
    return handleIpcResult(result);
  },
  async settingsSetFileSelectionForRoot(rootPath: string, selectedPaths: string[]): Promise<void> {
    const result = await window.electronAPI.settingsSetFileSelectionForRoot(rootPath, selectedPaths);
    handleIpcResult(result);
  },
  async settingsDeleteFileSelectionForRoot(rootPath: string): Promise<void> {
    const result = await window.electronAPI.settingsDeleteFileSelectionForRoot(rootPath);
    handleIpcResult(result);
  },

  // Settings: Generic Root Path Config
  async settingsGetRootPathConfigValue<K extends keyof RootPathConfig>(
    rootPath: string,
    key: K
  ): Promise<RootPathConfig[K] | null> {
    const result = await window.electronAPI.settingsGetRootPathConfigValue(rootPath, key);
    return handleIpcResult(result);
  },
  async settingsSetRootPathConfigValue<K extends keyof RootPathConfig>(
    rootPath: string,
    key: K,
    value: RootPathConfig[K] | null
  ): Promise<void> {
    const result = await window.electronAPI.settingsSetRootPathConfigValue(rootPath, key, value);
    handleIpcResult(result);
  },

  // Git
  async isGitRepository(): Promise<boolean> {
    const result = await window.electronAPI.isGitRepository();
    return handleIpcResult(result);
  },
  async getCurrentBranch(): Promise<string> {
    const result = await window.electronAPI.getCurrentBranch();
    return handleIpcResult(result);
  },
  async getCurrentCommitHash(): Promise<string> {
    const result = await window.electronAPI.getCurrentCommitHash();
    return handleIpcResult(result);
  },
  async getGitStatus(): Promise<GitFileStatus[]> {
    const result = await window.electronAPI.getGitStatus();
    return handleIpcResult(result);
  },
  async getCombinedDiff(): Promise<string> {
    const result = await window.electronAPI.getCombinedDiff();
    return handleIpcResult(result);
  },
  async gitStageAll(): Promise<void> {
    const result = await window.electronAPI.gitStageAll();
    handleIpcResult(result);
  },
  async gitCommit(message: string): Promise<void> {
    const result = await window.electronAPI.gitCommit(message);
    handleIpcResult(result);
  },
  async gitPush(): Promise<void> {
    const result = await window.electronAPI.gitPush();
    handleIpcResult(result);
  },

  // Context
  async assembleContext(request: AssembleContextRequest): Promise<{ xml: string; actualTokenCount: number }> {
    const result = await window.electronAPI.assembleContext(request);
    return handleIpcResult(result);
  },

  // Public files
  async readPublicFile(path: string): Promise<string> {
    const result = await window.electronAPI.readPublicFile(path);
    return handleIpcResult(result);
  },

  // Terminal
  async runTerminalCommand(command: string): Promise<Record<string, never>> {
    const result = await window.electronAPI.runTerminalCommand(command);
    return handleIpcResult(result);
  },

  // Listeners
  onMainProcessMessage(callback: (message: string) => void) {
    return window.electronAPI.onMainProcessMessage(callback);
  },
  onFileSystemChange(callback: (event: FileSystemChangeEvent) => void) {
    return window.electronAPI.onFileSystemChange(callback);
  },
  onSettingsUpdated(callback: (event: SettingsUpdateEvent) => void) {
    return window.electronAPI.onSettingsUpdated(callback);
  },
  onAppFocused(callback: () => void) {
    return window.electronAPI.onAppFocused(callback);
  },
  onShowHelpContent(callback: () => void) {
    return window.electronAPI.onShowHelpContent(callback);
  },
  onTerminalOutput(callback: (event: TerminalOutputEvent) => void) {
    return window.electronAPI.onTerminalOutput(callback);
  },
  onTerminalCommandExit(callback: (event: TerminalCommandExitEvent) => void) {
    return window.electronAPI.onTerminalCommandExit(callback);
  },
  onGlobalRootPathUpdated(callback: (event: GlobalRootPathUpdatedEvent) => void) {
    return window.electronAPI.onGlobalRootPathUpdated(callback);
  },

  // Misc
  async getInitialRootPath(): Promise<string | null> {
    const result = await window.electronAPI.getInitialRootPath();
    return handleIpcResult(result);
  },
  async addRecentRootPath(path: string): Promise<void> {
    const result = await window.electronAPI.addRecentRootPath(path);
    handleIpcResult(result); // Returns void if successful
  },
  async getRecentRootPaths(): Promise<string[]> {
    const result = await window.electronAPI.getRecentRootPaths();
    return handleIpcResult(result);
  },
};

// --- Declare window.electronAPI globally (no .d.ts needed) ---
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Forward export shared types
export type { FsEntry, GitFileStatus, RootPathConfig };
export { handleIpcResult };
export default electronApi;
