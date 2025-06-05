// src/components/right-panel/prompt/PromptPanel.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
  promptModeAtom,
  customPromptAtom,
  PromptMode,
  assembledContextAtom,
  selectedFileEntriesAtom,
  _actualContextTokenCountAtom,
  contextTokenCountAtom,
  rootPathAtom,
  addGitDiffToContextAtom,
  focusPromptTextareaTriggerAtom,
  copyFullPromptTriggerAtom,
  copyXmlOutputInstructionsTriggerAtom,
  FileSystemEntry,
} from '@/store/atoms';
import { assembleFullPrompt, getPromptDescription, promptModes, getPromptToOutputXml } from '@/config/prompts';
import { getErrorMessage } from '@/utils/errorUtils';
import { useToast } from '@/hooks/useToast';
import { Send as SendIcon, Loader2 as IconLoader, ClipboardCopy } from 'lucide-react';
import PromptQuickStart from './PromptQuickStart';
import { electronApi } from '@shared/electron-api';
import { getPrefixedPath } from '@/utils/fileTreeUtils';
import { useFileTreeActions } from '@/hooks/useFileTreeActions';
import ContextSummaryBox from './ContextSummaryBox';

const PromptPanel = () => {
  const [mode, setMode] = useAtom(promptModeAtom);
  const [customPrompt, setCustomPrompt] = useAtom(customPromptAtom);
  const [assembledContext, setAssembledContext] = useAtom(assembledContextAtom);
  const setActualContextTokenCount = useSetAtom(_actualContextTokenCountAtom);
  const { showToast, showToastForError } = useToast();
  const [selectedFilesMap] = useAtom(selectedFileEntriesAtom);
  const [contextTokensForDisplay] = useAtom(contextTokenCountAtom);
  const [rootPath] = useAtom(rootPathAtom);

  const [isBuildingXml, setIsBuildingXml] = useState(false);
  const [contextAssemblyError, setContextAssemblyError] = useState<string | null>(null);

  const [shouldAddGitDiff] = useAtom(addGitDiffToContextAtom);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const focusTrigger = useAtomValue(focusPromptTextareaTriggerAtom);
  const copyPromptTrigger = useAtomValue(copyFullPromptTriggerAtom);
  const copyXmlInstructionsTrigger = useAtomValue(copyXmlOutputInstructionsTriggerAtom);

  // For logging context rebuild reasons
  const prevRootPathRef = useRef(rootPath);
  const prevSelectedFilesMapRef = useRef(selectedFilesMap);
  const prevShouldAddGitDiffRef = useRef(shouldAddGitDiff);

  const getFilesIntendedForContextPaths = useCallback((): string[] => {
    return Array.from(selectedFilesMap.values())
      .filter((entry) => entry.isFile && !entry.isBinary && entry.selectionState === 'full')
      .map((entry) => getPrefixedPath(entry.path, entry.importance)); // Return prefixed paths
  }, [selectedFilesMap]);

  const getNumberOfFilesForContext = useCallback((): number => {
    return Array.from(selectedFilesMap.values()).filter(
      (entry) => entry.isFile && !entry.isBinary && entry.selectionState === 'full'
    ).length;
  }, [selectedFilesMap]);

  // --- Effect to Assemble XML Context via Main Process ---
  useEffect(() => {
    let isMounted = true;

    const logReasonForRun = () => {
      const reasons = [];
      if (rootPath !== prevRootPathRef.current) reasons.push('rootPath changed');
      if (selectedFilesMap !== prevSelectedFilesMapRef.current) reasons.push('selectedFilesMap changed');
      if (shouldAddGitDiff !== prevShouldAddGitDiffRef.current) reasons.push('shouldAddGitDiff changed');

      if (reasons.length > 0) {
        console.log('[PromptPanel IPC] Context assembly effect triggered. Reasons:', reasons.join(', '));
      } else if (!rootPath && prevRootPathRef.current !== null) {
        console.log('[PromptPanel IPC] Context assembly effect triggered: rootPath cleared.');
      } else if (rootPath && selectedFilesMap.size === 0 && prevSelectedFilesMapRef.current.size > 0) {
        console.log('[PromptPanel IPC] Context assembly effect triggered: selectedFilesMap became empty.');
      }
      // Update refs for next run
      prevRootPathRef.current = rootPath;
      prevSelectedFilesMapRef.current = selectedFilesMap;
      prevShouldAddGitDiffRef.current = shouldAddGitDiff;
    };
    logReasonForRun();

    if (!rootPath || selectedFilesMap.size == 0) {
      setAssembledContext('');
      setActualContextTokenCount(0);
      setContextAssemblyError(null);
      setIsBuildingXml(false);
      return;
    }

    const assembleContextThroughApi = async () => {
      console.log('[PromptPanel IPC] Starting context assembly via API...');
      setIsBuildingXml(true);
      setContextAssemblyError(null);

      const prefixedFilePathsToInclude = getFilesIntendedForContextPaths();

      if (prefixedFilePathsToInclude.length === 0) {
        if (isMounted) {
          setAssembledContext('');
          setActualContextTokenCount(0);
          setIsBuildingXml(false);
          if (selectedFilesMap.size > 0) {
            setContextAssemblyError('No valid files selected for context (e.g., all directories or binary files).');
          } else {
            setContextAssemblyError(null);
          }
          console.log('[PromptPanel IPC] No valid files for context. Clearing context and not calling API.');
        }
        return;
      }

      console.log('[PromptPanel IPC] Requesting context for paths:', prefixedFilePathsToInclude);

      try {
        const context = await electronApi.assembleContext({
          rootPath,
          selectedFilePaths: prefixedFilePathsToInclude,
          includeGitDiff: shouldAddGitDiff,
        });
        if (!isMounted) return;

        setAssembledContext(context.xml);
        setActualContextTokenCount(context.actualTokenCount);
        setContextAssemblyError(null);
        console.log('[PromptPanel IPC] Context assembly successful. Tokens:', context.actualTokenCount);
      } catch (err) {
        const errorMsg = getErrorMessage(err);
        if (isMounted) {
          setAssembledContext('');
          setActualContextTokenCount(0);
          setContextAssemblyError(`Context Assembly Error: ${errorMsg}`);
          console.error('[PromptPanel IPC] Error during assembleContext API call:', errorMsg);
        }
      } finally {
        if (isMounted) setIsBuildingXml(false);
      }
    };

    assembleContextThroughApi();

    return () => {
      isMounted = false;
    };
  }, [
    rootPath,
    selectedFilesMap,
    shouldAddGitDiff,
    setAssembledContext,
    setActualContextTokenCount,
    setIsBuildingXml,
    showToast,
    getFilesIntendedForContextPaths,
  ]);

  // --- Send Combined Prompt ---
  const handleSendPrompt = async () => {
    if (isBuildingXml) {
      showToast('Context is still processing...', 'info');
      return;
    }
    if (!customPrompt.trim() && !assembledContext) {
      showToast('Please enter a prompt or select context files.', 'info');
      return;
    }
    if (!assembledContext && getNumberOfFilesForContext() > 0) {
      showToast('Context is empty or failed to assemble. Check selection or errors.', 'warning');
      return;
    }

    const fullPrompt = assembleFullPrompt(mode, assembledContext, customPrompt);
    try {
      await electronApi.copyToClipboard(fullPrompt);
      setContextAssemblyError(null);
      showToast('Full prompt copied to clipboard!', 'success');
    } catch (err) {
      showToastForError('Error copying prompt to clipboard', err, setContextAssemblyError);
    }
  };

  // --- Copy XML Output Instructions ---
  const handleCopyXmlOutputInstructions = async () => {
    const instructions = getPromptToOutputXml();
    try {
      await electronApi.copyToClipboard(instructions);
      showToast('LLM instructions for XML output copied to clipboard!', 'success');
    } catch (err) {
      showToastForError('Error copying XML instructions', err);
    }
  };

  // --- Keyboard handler for textarea ---
  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        handleSendPrompt();
      } else if (!event.shiftKey) {
        event.preventDefault();
        handleSendPrompt();
      }
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 200;
      const targetHeight = Math.min(scrollHeight, maxHeight);
      textareaRef.current.style.height = `${targetHeight}px`;
      textareaRef.current.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [customPrompt]);

  useEffect(() => {
    if (focusTrigger && textareaRef.current) {
      textareaRef.current.focus();
      if (focusTrigger.options?.cursorPos === 'end') {
        const length = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(length, length);
      }
    }
  }, [focusTrigger]);

  useEffect(() => {
    if (copyPromptTrigger > 0) {
      handleSendPrompt();
    }
  }, [copyPromptTrigger]);

  useEffect(() => {
    if (copyXmlInstructionsTrigger > 0) {
      handleCopyXmlOutputInstructions();
    }
  }, [copyXmlInstructionsTrigger]);

  const { handleToggleSelection } = useFileTreeActions();

  const handleRemoveFileFromContext = (entry: FileSystemEntry) => {
    handleToggleSelection(entry);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-2 shrink-0">
        <h3 className="text-lg font-medium text-neutral-100">Compose Prompt</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopyXmlOutputInstructions}
            title="Copy LLM instructions for Promptly XML output format"
            className="p-1.5 text-neutral-400 hover:text-indigo-400 rounded-md hover:bg-neutral-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ClipboardCopy size={16} />
          </button>
        </div>
      </div>

      <ContextSummaryBox
        rootPath={rootPath}
        selectedFilesMap={selectedFilesMap}
        isBuildingXml={isBuildingXml}
        contextAssemblyError={contextAssemblyError}
        assembledContext={assembledContext}
        contextTokensForDisplay={contextTokensForDisplay}
        onRemoveFile={handleRemoveFileFromContext}
      />

      {/* Main content area */}
      {customPrompt.trim() === '' ? (
        <div className="flex-grow flex flex-col justify-center items-center p-4 overflow-y-auto">
          <PromptQuickStart />
        </div>
      ) : (
        <div className="flex-grow min-h-0"></div>
      )}

      {/* Input area Group */}
      <div className="mt-auto pt-2 shrink-0">
        {/* Mode Select Row */}
        <div className="flex justify-end mb-2">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as PromptMode)}
            className="p-1.5 border border-neutral-700 rounded-md bg-neutral-800 text-neutral-300 text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
          >
            {promptModes.map((currentMode) => (
              <option key={currentMode} value={currentMode}>
                {getPromptDescription(currentMode)}
              </option>
            ))}
          </select>
        </div>
        {/* Textarea and Send Button Row */}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Enter your prompt here... (Shift+Enter for newline)"
            className="flex-1 resize-none bg-neutral-800 text-neutral-200 font-sans p-3 rounded-xl border border-neutral-700 min-h-[44px] max-h-[200px] shadow-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            rows={1}
            disabled={isBuildingXml}
          />
          <button
            onClick={handleSendPrompt}
            title="Send Prompt (Copy System Prompt + Context XML + User Prompt to Clipboard)"
            disabled={isBuildingXml || (!customPrompt.trim() && !assembledContext)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-xl h-[44px] w-[44px] flex items-center justify-center shrink-0 shadow-sm disabled:bg-neutral-700 disabled:cursor-not-allowed transition-colors"
          >
            {isBuildingXml ? <IconLoader className="w-5 h-5 animate-spin" /> : <SendIcon className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromptPanel;
