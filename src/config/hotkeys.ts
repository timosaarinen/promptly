// src/config/hotkeys.ts
import { RightPanelMode } from '@/store/atoms';
import { promptModes } from './prompts';

export type Platform = 'mac' | 'other';

let currentPlatform: Platform | null = null;

export function isMac(): Platform {
  if (currentPlatform === null) {
    const platformString = typeof navigator !== 'undefined' ? navigator.platform : process.platform;
    currentPlatform = platformString.toUpperCase().indexOf('MAC') >= 0 ? 'mac' : 'other';
  }
  return currentPlatform;
}

export interface HotkeyDefinition {
  id: string; // Unique identifier for the hotkey action, e.g., 'TOGGLE_LEFT_PANEL'
  key: string; // KeyboardEvent.key value (e.g., 'B', '1', 'KeyV', 'Enter', 'Space')
  ctrl?: boolean; // True if Ctrl (or Cmd on Mac) is required
  alt?: boolean;
  shift?: boolean;
  // meta?: boolean; // Not using separate meta, ctrl implies meta on Mac
  panel?: RightPanelMode | 'FileExplorer' | 'PromptTextbox' | 'Global'; // Context for the hotkey
  description: string; // User-facing description
  // Optional field to indicate if the hotkey should be processed by a specific panel/component
  // rather than the global hook. This is for documentation/intent.
  handledBy?: 'component' | 'globalHook';
}

export const hotkeyRegistry: HotkeyDefinition[] = [
  // Global Hotkeys
  {
    id: 'TOGGLE_LEFT_PANEL',
    key: 'b',
    ctrl: true,
    description: 'Hide/show left panel',
    panel: 'Global',
    handledBy: 'globalHook',
  },
  {
    id: 'FOCUS_FILE_EXPLORER',
    key: '1',
    ctrl: true,
    description: 'Focus File Explorer',
    panel: 'Global',
    handledBy: 'globalHook',
  },
  {
    id: 'FOCUS_COMPOSE_PROMPT',
    key: '2',
    ctrl: true,
    description: 'Jump to Compose panel & focus prompt',
    panel: 'Global',
    handledBy: 'globalHook',
  },
  {
    id: 'JUMP_TO_APPLY_PANEL',
    key: '3',
    ctrl: true,
    description: 'Jump to Apply panel',
    panel: 'Global',
    handledBy: 'globalHook',
  },
  {
    id: 'JUMP_TO_TEST_PANEL_AND_RUN',
    key: '4',
    ctrl: true,
    description: 'Jump to Test panel & run command',
    panel: 'Global',
    handledBy: 'globalHook',
  },
  {
    id: 'JUMP_TO_POST_PROCESS_PANEL',
    key: '5',
    ctrl: true,
    description: 'Jump to Post-Process panel',
    panel: 'Global',
    handledBy: 'globalHook',
  },
  {
    id: 'JUMP_TO_COMMIT_PANEL',
    key: '6',
    ctrl: true,
    description: 'Jump to Commit panel',
    panel: 'Global',
    handledBy: 'globalHook',
  },
  ...promptModes.map((mode, index) => ({
    id: `SET_PROMPT_MODE_${mode.toUpperCase()}` as const,
    key: (index + 1).toString(),
    ctrl: true,
    alt: true,
    description: `Change to ${mode} mode`,
    panel: 'Global' as const, // Explicitly cast to the union type
    handledBy: 'globalHook' as const, // Explicitly cast
  })),
  {
    id: 'PASTE_AND_PROCESS_RESPONSE',
    key: 'V', // Note: KeyboardEvent.key is 'V' for Shift+v
    ctrl: true,
    shift: true,
    description: 'Paste & process response from clipboard',
    panel: 'Global',
    handledBy: 'globalHook',
  },
  {
    id: 'APPLY_ALL_VALID_CHANGES',
    key: 'A',
    ctrl: true,
    shift: true,
    description: "Apply All Valid Changes in 'Apply' panel",
    panel: 'apply', // This is a RightPanelMode, so it's valid
    handledBy: 'globalHook',
  },
  {
    id: 'COPY_FULL_PROMPT',
    key: 'C',
    ctrl: true,
    shift: true,
    description: "Copy full prompt from 'Compose' panel",
    panel: 'Global',
    handledBy: 'globalHook',
  },
  {
    id: 'COPY_XML_OUTPUT_INSTRUCTIONS',
    key: 'O',
    ctrl: true,
    shift: true,
    description: "Copy LLM XML output instructions from 'Compose' panel",
    panel: 'Global',
    handledBy: 'globalHook',
  },

  // Prompt Textbox Hotkeys
  {
    id: 'SEND_PROMPT_ENTER',
    key: 'Enter',
    description: 'Send prompt (via Enter in Prompt Textbox)',
    panel: 'PromptTextbox',
    handledBy: 'component',
  },
  {
    id: 'SEND_PROMPT_CTRL_ENTER',
    key: 'Enter',
    ctrl: true,
    description: 'Send prompt (via Ctrl+Enter in Prompt Textbox)',
    panel: 'PromptTextbox',
    handledBy: 'component',
  },

  // File Explorer Hotkeys (most are handled by FileExplorer.tsx's keydown listener)
  {
    id: 'FE_NAVIGATE_TREE',
    key: 'ArrowUp', // Example, others include ArrowDown, ArrowLeft, ArrowRight
    description: 'Navigate file tree',
    panel: 'FileExplorer',
    handledBy: 'component',
  },
  {
    id: 'FE_TOGGLE_SELECTION',
    key: ' ', // Space key
    description: 'Toggle file selection',
    panel: 'FileExplorer',
    handledBy: 'component',
  },
  {
    id: 'FE_DESELECT',
    key: '1',
    description: 'Deselect file',
    panel: 'FileExplorer',
    handledBy: 'component',
  },
  {
    id: 'FE_SELECT_0_STARS',
    key: '2',
    description: 'Select file (0-stars)',
    panel: 'FileExplorer',
    handledBy: 'component',
  },
  {
    id: 'FE_SELECT_1_STAR',
    key: '3',
    description: 'Select file (1-star)',
    panel: 'FileExplorer',
    handledBy: 'component',
  },
  {
    id: 'FE_SELECT_2_STARS',
    key: '4',
    description: 'Select file (2-stars)',
    panel: 'FileExplorer',
    handledBy: 'component',
  },
  {
    id: 'FE_SELECT_3_STARS',
    key: '5',
    description: 'Select file (3-stars)',
    panel: 'FileExplorer',
    handledBy: 'component',
  },
  {
    id: 'FE_INCREASE_STARS',
    key: '+',
    description: 'Increase stars',
    panel: 'FileExplorer',
    handledBy: 'component',
  },
  {
    id: 'FE_DECREASE_STARS',
    key: '-',
    description: 'Decrease stars',
    panel: 'FileExplorer',
    handledBy: 'component',
  },
  {
    id: 'FE_VIEW_FILE',
    key: 'Enter',
    description: 'View active file',
    panel: 'FileExplorer',
    handledBy: 'component',
  },
  {
    id: 'FE_JUMP_TO_PROMPT',
    key: 'Tab',
    description: 'Jump from File Explorer to prompt input',
    panel: 'FileExplorer',
    handledBy: 'component',
  },
];

export function matchHotkey(event: KeyboardEvent, definition: HotkeyDefinition): boolean {
  const platform = isMac();

  if (event.key.toLowerCase() !== definition.key.toLowerCase()) {
    return false;
  }

  const ctrlPressed = platform === 'mac' ? event.metaKey : event.ctrlKey;
  if (!!definition.ctrl !== ctrlPressed) {
    return false;
  }

  // For alt and shift, check directly
  if (!!definition.alt !== event.altKey) {
    return false;
  }
  if (!!definition.shift !== event.shiftKey) {
    return false;
  }

  return true;
}

export function formatHotkeyForDisplay(definition: HotkeyDefinition): string[] {
  const platform = isMac();
  const parts: string[] = [];

  if (definition.ctrl) {
    parts.push(platform === 'mac' ? '⌘' : 'Ctrl');
  }
  if (definition.alt) {
    parts.push(platform === 'mac' ? '⌥' : 'Alt');
  }
  if (definition.shift) {
    parts.push(platform === 'mac' ? '⇧' : 'Shift');
  }

  let displayKey = definition.key;
  // Standardize common key names for display
  if (displayKey.startsWith('Arrow')) displayKey = displayKey.replace('Arrow', '');
  if (displayKey === ' ') displayKey = 'Space';
  if (displayKey.length === 1 && displayKey >= 'a' && displayKey <= 'z') displayKey = displayKey.toUpperCase();
  if (displayKey.length === 1 && displayKey >= 'A' && displayKey <= 'Z') displayKey = displayKey.toUpperCase();

  parts.push(displayKey);
  return parts;
}
