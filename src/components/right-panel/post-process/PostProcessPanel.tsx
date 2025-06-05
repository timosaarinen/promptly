// src/components/right-panel/PostProcessPanel.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
  rootPathAtom,
  currentPostProcessCommandAtom,
  terminalOutputAtom,
  isTerminalRunningAtom,
  terminalExitCodeAtom,
  terminalErrorAtom,
  TerminalLine,
  rightPanelModeAtom,
} from '@/store/atoms';
import { useToast } from '@/hooks/useToast';
import { Play, Trash2, Copy, ChevronRight, Loader2, AlertTriangle } from 'lucide-react';
import { electronApi } from '@shared/electron-api';
import { runCommandInTerminal } from '@/utils/terminalCommandRunner';

const PostProcessPanel: React.FC = () => {
  const rootPath = useAtomValue(rootPathAtom);
  const setCurrentPersistedCommand = useSetAtom(currentPostProcessCommandAtom);

  const [output, setOutput] = useAtom(terminalOutputAtom);
  const [isRunning, setIsRunning] = useAtom(isTerminalRunningAtom);
  const [exitCode, setExitCode] = useAtom(terminalExitCodeAtom);
  const [executionError, setExecutionError] = useAtom(terminalErrorAtom);

  const setRightPanelMode = useSetAtom(rightPanelModeAtom);
  const { showToast, showToastForError } = useToast();
  const outputRef = useRef<HTMLPreElement>(null);
  const [isLoadingCommand, setIsLoadingCommand] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [currentExecutionMessage, setCurrentExecutionMessage] = useState<string | null>(null);

  const addOutputLine = useCallback(
    (type: TerminalLine['type'], data: string) => {
      setOutput((prev) => [...prev, { id: crypto.randomUUID(), type, data }]);
    },
    [setOutput]
  );

  useEffect(() => {
    let isMounted = true;
    if (!rootPath) {
      setCommandInput('');
      setIsLoadingCommand(false);
      return;
    }

    setIsLoadingCommand(true);
    electronApi
      .settingsGetRootPathConfigValue(rootPath, 'postProcessCommand')
      .then((persistedCmd) => {
        if (isMounted) {
          setCommandInput(persistedCmd ?? '');
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          showToastForError('Error loading post-process command', err);
          setCommandInput('');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingCommand(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [rootPath, showToastForError]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  useEffect(() => {
    const cleanups: (() => void)[] = [];
    cleanups.push(
      electronApi.onTerminalOutput((event) => {
        addOutputLine(event.type, event.data);
      })
    );
    cleanups.push(
      electronApi.onTerminalCommandExit((event) => {
        setIsRunning(false);
        setCurrentExecutionMessage(null);
        setExitCode(event.exitCode);
        if (event.error) {
          addOutputLine('system', `Command execution error: ${event.error}`);
          setExecutionError(event.error);
        }
        showToast(
          `Post-process command finished with exit code: ${event.exitCode ?? 'unknown'}`,
          event.exitCode === 0 ? 'success' : 'warning'
        );
      })
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [addOutputLine, setIsRunning, setExitCode, setExecutionError, showToast]);

  const handleRunCommand = async () => {
    await runCommandInTerminal(
      commandInput,
      rootPath,
      setOutput,
      setIsRunning,
      setExitCode,
      setExecutionError,
      setCurrentExecutionMessage,
      showToast,
      addOutputLine
    );
  };

  const handleCommandInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCommand = e.target.value;
    setCommandInput(newCommand);
  };

  const handleCommandInputBlur = async () => {
    if (rootPath) {
      try {
        await setCurrentPersistedCommand(commandInput);
      } catch (err: unknown) {
        showToastForError('Error persisting post-process command', err);
      }
    }
  };

  const handleClearCommand = async () => {
    setCommandInput('');
    if (rootPath) {
      try {
        await setCurrentPersistedCommand('');
        showToast('Post-process command cleared for this project.', 'info');
      } catch (err: unknown) {
        showToastForError('Error clearing persisted command', err);
      }
    }
  };

  const handleCopyOutput = () => {
    const outputText = output
      .filter((line) => line.type === 'stdout' || line.type === 'stderr')
      .map((line) => line.data)
      .join('');
    electronApi
      .copyToClipboard(outputText)
      .then(() => showToast('Terminal output copied to clipboard.', 'success'))
      .catch((err: unknown) => showToastForError('Error copying output', err));
  };

  const handleProceedToTest = () => {
    setRightPanelMode('test');
  };

  const canProceedToTest = !isRunning && exitCode === 0;

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-lg font-medium text-neutral-100 mb-3 shrink-0">Post-Process Code</h3>

      <div className="mb-2 p-3 bg-neutral-800/50 border border-neutral-700 rounded-md text-xs text-neutral-300 shrink-0">
        <div className="flex items-start">
          <AlertTriangle size={28} className="mr-2 mt-0.5 text-yellow-400 shrink-0" />
          <div>
            <p className="font-semibold text-neutral-100 mb-1">Important: Context Invalidation</p>
            <p className="mb-1">
              Running commands here (e.g., formatters, linters with auto-fix) may modify your files. These modifications
              will <strong>not</strong> be automatically reflected in the context previously sent to the LLM. The same
              also applies to manually modifying files.
            </p>
            <p>
              If you continue the chat with the LLM, you may need to manually update it with the changes. You can use
              the "Copy modified files as prompt" button in the Git Status panel to provide the updated file states.
              Alternatively, you can re-assemble the full context. In a typical workflow, formatting is done before
              testing. However, with an LLM, you might test first to ensure functional correctness, then format.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-2 shrink-0">
        <label htmlFor="postProcessCommandInput" className="block text-sm font-medium text-neutral-300 mb-1">
          Post-Process Command (e.g., Formatter, Linter)
        </label>
        <div className="flex space-x-2">
          <input
            type="text"
            id="postProcessCommandInput"
            value={commandInput}
            onChange={handleCommandInputChange}
            onBlur={handleCommandInputBlur}
            placeholder="e.g., npx prettier --write . or npm run lint -- --fix"
            className="flex-grow p-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 font-mono text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            disabled={isRunning || isLoadingCommand}
          />
          <button
            onClick={handleRunCommand}
            disabled={isRunning || !commandInput.trim() || !rootPath || isLoadingCommand}
            className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-md text-sm font-medium disabled:bg-neutral-700 disabled:cursor-not-allowed flex items-center"
            title="Run Post-Process Command"
          >
            <Play size={16} className="mr-1.5" /> Run
          </button>
          <button
            onClick={handleClearCommand}
            disabled={isRunning || !commandInput.trim() || !rootPath || isLoadingCommand}
            className="px-3 py-2 bg-neutral-600 hover:bg-neutral-500 text-neutral-200 rounded-md text-sm font-medium disabled:bg-neutral-700 disabled:cursor-not-allowed flex items-center"
            title="Clear Post-Process Command"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="mt-3 mb-2 flex justify-between items-center shrink-0">
        <label className="block text-sm font-medium text-neutral-300">Terminal Output</label>
        {isLoadingCommand && <p className="text-xs text-neutral-400 mt-1">Loading command...</p>}
        {isRunning && currentExecutionMessage && (
          <p className="text-xs text-neutral-400 mt-2 flex items-center">
            <Loader2 size={12} className="animate-spin mr-1.5" />
            {currentExecutionMessage}
          </p>
        )}
        <div className="mt-2 text-xs text-center shrink-0">
          {executionError && !isRunning && <p className="text-red-400">Execution error: {executionError}</p>}
          {!isRunning &&
            exitCode !== null &&
            !executionError &&
            (exitCode === 0 ? (
              <span className="text-green-400">Command successful (exit code: 0).</span>
            ) : (
              <span className="text-yellow-400">Command failed (exit code: {exitCode}). Review output.</span>
            ))}
          {!isRunning && exitCode === null && !executionError && !currentExecutionMessage && (
            <span className="text-neutral-500">Ready to run a command.</span>
          )}
        </div>
        <button
          onClick={handleCopyOutput}
          disabled={output.filter((line) => line.type === 'stdout' || line.type === 'stderr').length === 0 || isRunning}
          className="px-2 py-1 bg-neutral-600 hover:bg-neutral-500 text-neutral-200 rounded-md text-xs font-medium disabled:bg-neutral-700 disabled:cursor-not-allowed flex items-center"
          title="Copy Stdout/Stderr Output"
        >
          <Copy size={14} className="mr-1" /> Copy Output
        </button>
      </div>
      <pre
        ref={outputRef}
        className="flex-grow p-3 bg-neutral-950 border border-neutral-700 rounded-md text-neutral-300 font-mono text-xs whitespace-pre-wrap overflow-y-auto min-h-[150px]"
      >
        {output.length === 0 && !isRunning && <span className="text-neutral-500">No output yet. Run a command.</span>}
        {output.map((line) => (
          <span
            key={line.id}
            className={
              line.type === 'stderr' ? 'text-red-400' : line.type === 'system' ? 'text-yellow-400' : 'text-neutral-300'
            }
          >
            {line.data}
          </span>
        ))}
        {isRunning && output.length > 0 && <span className="animate-pulse">_</span>}
      </pre>

      <div className="mt-auto pt-3 shrink-0">
        <button
          onClick={handleProceedToTest}
          disabled={!canProceedToTest}
          className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-base font-medium disabled:bg-neutral-700 disabled:cursor-not-allowed flex items-center justify-center"
        >
          <ChevronRight size={18} className="mr-2" />
          Proceed to Test
        </button>
      </div>
    </div>
  );
};

export default PostProcessPanel;
