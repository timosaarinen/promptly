// src/hooks/useGlobalHotkeys.ts
import { useEffect } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import {
  isLeftPanelVisibleAtom,
  rightPanelModeAtom,
  promptModeAtom,
  PromptMode,
  focusFileExplorerAtom,
  focusPromptTextareaAtom,
  runTestCommandAtom,
  processPastedResponseAtom,
  activeLlmResponseInputAtom,
  copyFullPromptAtom,
  copyXmlOutputInstructionsAtom,
  triggerApplyAllValidChangesAtom,
  processedResponsesStackAtom,
} from '@/store/atoms';
import { hotkeyRegistry, matchHotkey } from '@/config/hotkeys';
import { promptModes } from '@/config/prompts';
import { electronApi } from '@shared/electron-api';
import { useToast } from './useToast';
import { ApplyItemStatus } from '@/store/parseAtoms';

export function useGlobalHotkeys() {
  const setIsLeftPanelVisible = useSetAtom(isLeftPanelVisibleAtom);
  const setRightPanelMode = useSetAtom(rightPanelModeAtom);
  const setPromptMode = useSetAtom(promptModeAtom);
  const triggerFocusFileExplorer = useSetAtom(focusFileExplorerAtom);
  const triggerFocusPromptTextarea = useSetAtom(focusPromptTextareaAtom);
  const triggerRunTestCommand = useSetAtom(runTestCommandAtom);
  const triggerProcessPastedResponse = useSetAtom(processPastedResponseAtom);
  const setActiveLlmResponseInput = useSetAtom(activeLlmResponseInputAtom);
  const triggerCopyFullPrompt = useSetAtom(copyFullPromptAtom);
  const triggerCopyXmlOutputInstructions = useSetAtom(copyXmlOutputInstructionsAtom);
  const triggerApplyAllChanges = useSetAtom(triggerApplyAllValidChangesAtom);

  const currentRightPanelMode = useAtomValue(rightPanelModeAtom);
  const processedResponses = useAtomValue(processedResponsesStackAtom);
  const { showToast } = useToast();

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      // Do not process hotkeys if user is typing in an input, textarea, or select
      const targetElement = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(targetElement.tagName)) {
        // Exception: Allow Ctrl/Cmd+Enter in TEXTAREA for prompt submission
        if (targetElement.tagName === 'TEXTAREA' && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          // This case is handled by PromptPanel directly, so global hook can ignore
        } else {
          return;
        }
      }

      for (const definition of hotkeyRegistry) {
        if (definition.handledBy === 'component') continue; // Skip component-handled hotkeys

        if (matchHotkey(event, definition)) {
          // Panel-specific hotkeys check
          if (definition.panel && definition.panel !== 'Global' && definition.panel !== currentRightPanelMode) {
            continue; // Not in the correct panel for this hotkey
          }

          event.preventDefault();
          event.stopPropagation();

          console.log(`Matched global hotkey: ${definition.id}`);

          switch (definition.id) {
            case 'TOGGLE_LEFT_PANEL':
              setIsLeftPanelVisible((prev) => !prev);
              break;
            case 'FOCUS_FILE_EXPLORER':
              setIsLeftPanelVisible(true); // Ensure panel is visible
              triggerFocusFileExplorer();
              break;
            case 'FOCUS_COMPOSE_PROMPT':
              setRightPanelMode('compose');
              triggerFocusPromptTextarea({ cursorPos: 'end' });
              break;
            case 'JUMP_TO_APPLY_PANEL':
              setRightPanelMode('apply');
              break;
            case 'JUMP_TO_TEST_PANEL_AND_RUN':
              setRightPanelMode('test');
              triggerRunTestCommand();
              break;
            case 'JUMP_TO_POST_PROCESS_PANEL':
              setRightPanelMode('post-process');
              break;
            case 'JUMP_TO_COMMIT_PANEL':
              setRightPanelMode('commit');
              break;
            case 'PASTE_AND_PROCESS_RESPONSE':
              setRightPanelMode('apply');
              try {
                const text = await electronApi.readFromClipboard();
                setActiveLlmResponseInput(text);
                triggerProcessPastedResponse();
              } catch (e) {
                showToast('Failed to read from clipboard.', 'error');
              }
              break;
            case 'APPLY_ALL_VALID_CHANGES':
              if (currentRightPanelMode === 'apply') {
                const hasErrors = processedResponses.some((item) =>
                  item.parsedChanges.some(
                    (change) =>
                      change.applyStatus === ApplyItemStatus.APPLIED_FAILED ||
                      change.applyStatus === ApplyItemStatus.VALIDATION_FAILED_NO_FILE ||
                      change.applyStatus === ApplyItemStatus.VALIDATION_FAILED_SEARCH_NOT_FOUND
                  )
                );
                if (hasErrors) {
                  showToast('Cannot apply all: Errors exist in one or more responses.', 'warning');
                } else {
                  triggerApplyAllChanges();
                }
              }
              break;
            case 'COPY_FULL_PROMPT':
              setRightPanelMode('compose');
              triggerCopyFullPrompt();
              break;
            case 'COPY_XML_OUTPUT_INSTRUCTIONS':
              // No need to switch panel, can be copied from anywhere.
              // Compose panel itself has this button.
              triggerCopyXmlOutputInstructions();
              break;
            default:
              // Handle dynamic prompt mode changes
              if (definition.id.startsWith('SET_PROMPT_MODE_')) {
                const modeString = definition.id.substring('SET_PROMPT_MODE_'.length);
                const targetMode = promptModes.find((pm) => pm.toUpperCase() === modeString);
                if (targetMode) {
                  setPromptMode(targetMode as PromptMode);
                  setRightPanelMode('compose'); // Switch to compose panel when mode changes
                  triggerFocusPromptTextarea({ cursorPos: 'end' });
                }
              }
              break;
          }
          return; // Hotkey processed, exit loop
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    setIsLeftPanelVisible,
    setRightPanelMode,
    setPromptMode,
    triggerFocusFileExplorer,
    triggerFocusPromptTextarea,
    triggerRunTestCommand,
    triggerProcessPastedResponse,
    setActiveLlmResponseInput,
    triggerCopyFullPrompt,
    triggerCopyXmlOutputInstructions,
    triggerApplyAllChanges,
    currentRightPanelMode,
    processedResponses,
    showToast,
  ]);
}
