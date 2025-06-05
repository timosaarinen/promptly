// src/store/atoms.ts
import { atom, Getter, Setter } from 'jotai';
import { calculateTokenCount, calculateCharCount } from '@/services/tokenService';
import type { FsEntry as FsEntryShared, GitFileStatus as GitFileStatusShared, RootPathConfig } from '@shared/types';
import type { ChangeWithApplyStatus } from './parseAtoms';
import { electronApi } from '@shared/electron-api';

export type SelectionState = 'full' | 'ignored' | 'indeterminate';

export interface FileSystemEntry extends FsEntryShared {
  selectionState: SelectionState;
  importance: number; // From 1 (default selected) to 4. 0 if unselected.
  children?: FileSystemEntry[];
  displaySize?: number;
  displayEstimatedTokens?: number;
  isOpen: boolean; // Changed from optional to required, managed globally
  aggregateSize?: number;
  aggregateEstimatedTokens?: number;
}

// --- Core File System State ---
export const rootPathAtom = atom<string | null>(null);
export const fileTreeAtom = atom<FileSystemEntry[]>([]);
export const isLoadingAtom = atom<boolean>(true);
export const fileSystemChangeIndicatorAtom = atom(0);

// --- UI Settings ---
export const respectGitignoreAtom = atom<boolean>(true);

// --- File Explorer Interaction State ---
export const focusedFileExplorerItemPathAtom = atom<string | null>(null);
export const lastClickedPathForShiftSelectAtom = atom<string | null>(null);
export const uiSelectedFilePathsAtom = atom(new Set<string>());

// --- Selection and Context State ---
export const selectedFileEntriesAtom = atom<Map<string, FileSystemEntry>>(new Map());
export const assembledContextAtom = atom<string>('');
export const _actualContextTokenCountAtom = atom<number>(0);
export const contextTokenCountAtom = atom((get: Getter) => get(_actualContextTokenCountAtom));
export const contextCharCountAtom = atom((get: Getter) => calculateCharCount(get(assembledContextAtom)));

// --- Prompt Panel State ---
export type PromptMode = 'Ask' | 'Architect' | 'ArchitectMax' | 'Edit' | 'ContextBuilder' | 'Summarizer';
export const promptModeAtom = atom<PromptMode>('Architect');
export const customPromptAtom = atom<string>('');
export const promptInputTokenCountAtom = atom((get: Getter) => calculateTokenCount(get(customPromptAtom)));
export const promptInputCharCountAtom = atom((get: Getter) => calculateCharCount(get(customPromptAtom)));

// --- Combined Counts for Status Bar ---
export const totalCombinedTokenCountAtom = atom(
  (get: Getter) => get(contextTokenCountAtom) + get(promptInputTokenCountAtom)
);
export const totalCombinedCharCountAtom = atom(
  (get: Getter) => get(contextCharCountAtom) + get(promptInputCharCountAtom)
);

// --- Toast Notification State ---
export interface ToastMessage {
  text: string | null;
  type: 'success' | 'error' | 'info' | 'warning';
}
export const toastMessageAtom = atom<ToastMessage>({
  text: null,
  type: 'info',
});
export const isToastVisibleAtom = atom<boolean>(false);

// --- Right Panel Mode ---
export type RightPanelMode = 'compose' | 'apply' | 'post-process' | 'test' | 'commit';
export const rightPanelModeAtom = atom<RightPanelMode>('compose');

// --- Left Panel State ---
export const isLeftPanelVisibleAtom = atom<boolean>(true);
export const initialSelectionAppliedAtom = atom(false);

// --- Git State ---
export const isGitRepoAtom = atom<boolean>(false);
export const gitBranchAtom = atom<string | null>(null);
export const gitCommitHashAtom = atom<string | null>(null);
export type GitStatusFile = GitFileStatusShared;
export const gitStatusFilesAtom = atom<GitStatusFile[]>([]);
export const addGitDiffToContextAtom = atom<boolean>(false);
export const gitCombinedDiffAtom = atom<string | null>(null);
export const gitActionIndicatorAtom = atom(0);
export const commitMessageAtom = atom<string>('');

// --- App Focus Specific Refresh ---
export const appFocusRefreshTriggerAtom = atom(0);

// --- Directory Structure Cache ---
export const directoryStructureAtom = atom<string[] | null>(null);
export const isFetchingDirectoryStructureAtom = atom<boolean>(false);

// --- Apply Panel State ---
export interface ProcessedResponseItem {
  id: string;
  rawPastedXml: string;
  parsedChanges: ChangeWithApplyStatus[];
  parseError: string | null;
  displayState: 'collapsed' | 'expanded';
  applicationStatusSummary: string;
  timestamp: number;
  responseNumber: number;
}
export const activeLlmResponseInputAtom = atom<string>('');
export const isAddingNewResponseAtom = atom<boolean>(false);
export const processedResponsesStackAtom = atom<ProcessedResponseItem[]>([]);

// --- Content Viewer State (New) ---
export const isContentViewerVisibleAtom = atom<boolean>(false);
export const contentViewerContentAtom = atom<string>('');
export const contentViewerContentTypeAtom = atom<'markdown' | 'text'>('text');
export const contentViewerTitleAtom = atom<string | null>(null);

// --- Terminal output (shared) ---
export interface TerminalLine {
  id: string;
  type: 'stdout' | 'stderr' | 'system';
  data: string;
}
export const terminalOutputAtom = atom<TerminalLine[]>([]);
export const isTerminalRunningAtom = atom<boolean>(false);
export const terminalExitCodeAtom = atom<number | null>(null);
export const terminalErrorAtom = atom<string | null>(null);

// --- Unified Root Path Configuration ---
const rootPathConfigCacheAtom = atom<Record<string, Partial<RootPathConfig>>>({});

// This atom is intended to be ASYNCHRONOUS for its read operation.
// Components using `useAtomValue` or `useAtom` will get a promise or suspend.
export const currentRootPathConfigAtom = atom(
  async (get: Getter): Promise<Partial<RootPathConfig>> => {
    const rootPath = get(rootPathAtom);
    if (!rootPath) return {};

    const cached = get(rootPathConfigCacheAtom)[rootPath];
    if (cached) return cached;

    try {
      const testCommand = await electronApi.settingsGetRootPathConfigValue(rootPath, 'testCommand');
      const postProcessCommand = await electronApi.settingsGetRootPathConfigValue(rootPath, 'postProcessCommand');
      const config: Partial<RootPathConfig> = {};
      if (testCommand) config.testCommand = testCommand;
      if (postProcessCommand) config.postProcessCommand = postProcessCommand;
      // The cache (rootPathConfigCacheAtom) is updated in the atom's write function.
      // Do not attempt to set it from the read function.
      return config;
    } catch (error) {
      console.error(`Error fetching root path config for ${rootPath}:`, error);
      return {};
    }
  },
  async <K extends keyof RootPathConfig>(
    get: Getter,
    set: Setter,
    args: { key: K; value: RootPathConfig[K] | null | undefined }
  ) => {
    const rootPath = get(rootPathAtom);
    if (!rootPath) return;

    await electronApi.settingsSetRootPathConfigValue(rootPath, args.key, args.value ?? null);

    set(rootPathConfigCacheAtom, (prev: Record<string, Partial<RootPathConfig>>) => {
      const currentConfig = prev[rootPath] || {};
      const newConfig = { ...currentConfig };
      if (args.value === null || args.value === undefined) {
        delete newConfig[args.key];
      } else {
        newConfig[args.key] = args.value;
      }
      if (Object.keys(newConfig).length === 0) {
        const updatedPrev = { ...prev };
        delete updatedPrev[rootPath];
        return updatedPrev;
      }
      return { ...prev, [rootPath]: newConfig };
    });
  }
);

// --- Test Panel State ---
export const currentTestCommandAtom = atom(
  async (get: Getter) => (await get(currentRootPathConfigAtom))?.testCommand ?? '',
  (_get: Getter, set: Setter, newCommand: string) => {
    set(currentRootPathConfigAtom, { key: 'testCommand', value: newCommand || null });
  }
);

// --- Post-Process Panel State ---
export const currentPostProcessCommandAtom = atom(
  async (get: Getter) => (await get(currentRootPathConfigAtom))?.postProcessCommand ?? '',
  (_get: Getter, set: Setter, newCommand: string) => {
    set(currentRootPathConfigAtom, { key: 'postProcessCommand', value: newCommand || null });
  }
);

// --- Application Log State ---
export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
}
export const MAX_LOG_ENTRIES = 200; // Maximum number of log entries to keep

const rawLogMessagesAtom = atom<LogEntry[]>([]);

export const logMessagesAtom = atom<LogEntry[], [message: string], void>(
  (get) => get(rawLogMessagesAtom),
  (get, set, newMessage: string) => {
    const newEntry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      message: newMessage,
    };
    const currentLogs = get(rawLogMessagesAtom);
    const updatedLogs = [...currentLogs, newEntry];
    if (updatedLogs.length > MAX_LOG_ENTRIES) {
      set(rawLogMessagesAtom, updatedLogs.slice(updatedLogs.length - MAX_LOG_ENTRIES));
    } else {
      set(rawLogMessagesAtom, updatedLogs);
    }
  }
);

export const latestLogMessageAtom = atom<LogEntry | null>((get) => {
  const logs = get(logMessagesAtom);
  return logs.length > 0 ? logs[logs.length - 1] : null;
});

// --- Atoms for Hotkey-Triggered Actions ---
// Write-only atoms to trigger component-specific actions from the global hotkey hook.
// Components will use `useEffect` to subscribe to changes in these (often just incrementing a number).

/** Triggers focusing the File Explorer. Consumed by FileExplorer.tsx. */
export const focusFileExplorerAtom = atom(null, (_get, set) => set(fileSystemChangeIndicatorAtom, (c) => c + 1)); // Re-use FSCHI for simplicity or make dedicated

/** Triggers focusing the prompt textarea. Consumed by PromptPanel.tsx. */
export const focusPromptTextareaAtom = atom(null, (_get, set, options?: { cursorPos?: 'start' | 'end' }) => {
  // This atom's "write" function is simple. The logic to focus and set cursor
  // will be in PromptPanel.tsx's useEffect that consumes this atom's value.
  // We pass options through the atom's update.
  // To ensure the effect runs even if options are the same, we can set a new object or timestamp.
  set(focusPromptTextareaTriggerAtom, { options: options || {}, timestamp: Date.now() });
});
// Helper atom that actually changes to trigger the effect in PromptPanel
export const focusPromptTextareaTriggerAtom = atom<{
  options: { cursorPos?: 'start' | 'end' };
  timestamp: number;
} | null>(null);

/** Triggers running the test command. Consumed by TestPanel.tsx. */
export const runTestCommandAtom = atom(null, (_get, set) => set(runTestCommandTriggerAtom, Date.now()));
export const runTestCommandTriggerAtom = atom<number>(0); // Timestamp or counter

/** Triggers processing of pasted LLM response. Consumed by ApplyPanel.tsx. */
export const processPastedResponseAtom = atom(null, (_get, set) => set(processPastedResponseTriggerAtom, Date.now()));
export const processPastedResponseTriggerAtom = atom<number>(0);

/** Triggers copying the full prompt. Consumed by PromptPanel.tsx. */
export const copyFullPromptAtom = atom(null, (_get, set) => set(copyFullPromptTriggerAtom, Date.now()));
export const copyFullPromptTriggerAtom = atom<number>(0);

/** Triggers copying XML output instructions. Consumed by PromptPanel.tsx. */
export const copyXmlOutputInstructionsAtom = atom(null, (_get, set) =>
  set(copyXmlOutputInstructionsTriggerAtom, Date.now())
);
export const copyXmlOutputInstructionsTriggerAtom = atom<number>(0);

/** Triggers "Apply All Valid Changes" action. Consumed by ApplyPanel.tsx. */
export const triggerApplyAllValidChangesAtom = atom(null, (_get, set) =>
  set(triggerApplyAllValidChangesTriggerAtom, Date.now())
);
export const triggerApplyAllValidChangesTriggerAtom = atom<number>(0);
