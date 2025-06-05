// src/components/right-panel/RightPanelContainer.tsx
import { useEffect } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import clsx from 'clsx';
import {
  rightPanelModeAtom,
  rootPathAtom,
  RightPanelMode,
  terminalOutputAtom,
  terminalExitCodeAtom,
  terminalErrorAtom,
  isTerminalRunningAtom,
} from '@/store/atoms';
import PromptPanel from './prompt/PromptPanel';
import ApplyPanel from './apply/ApplyPanel';
import PostProcessPanel from './post-process/PostProcessPanel';
import TestPanel from './test-panel/TestPanel';
import GitCommitPanel from '@/components/right-panel/commit/GitCommitPanel';
import { ChevronRight, Info as InfoIcon } from 'lucide-react';
import { useHelpViewer } from '@/hooks/useHelpViewer';

export default function RightPanelContainer() {
  const { showHelp } = useHelpViewer();

  const [mode, setMode] = useAtom(rightPanelModeAtom);
  const [rootPath] = useAtom(rootPathAtom);

  const setTerminalOutput = useSetAtom(terminalOutputAtom);
  const setTerminalExitCode = useSetAtom(terminalExitCodeAtom);
  const setTerminalError = useSetAtom(terminalErrorAtom);
  const setIsTerminalRunning = useSetAtom(isTerminalRunningAtom);

  useEffect(() => {
    if (mode === 'post-process' || mode === 'test') {
      setTerminalOutput([]);
      setTerminalExitCode(null);
      setTerminalError(null);
      setIsTerminalRunning(false);
    }
  }, [mode, setTerminalOutput, setTerminalExitCode, setTerminalError, setIsTerminalRunning]);

  const buttonBaseClasses =
    'px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-900 focus:ring-indigo-500 transition-colors';
  const activeClasses = 'bg-indigo-600 text-white';
  const inactiveClasses = 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300';

  const WorkflowArrow = () => <ChevronRight size={20} className="text-neutral-500 shrink-0" />;

  const renderPanelContent = (currentMode: RightPanelMode) => {
    switch (currentMode) {
      case 'compose':
        return <PromptPanel />;
      case 'apply':
        return <ApplyPanel />;
      case 'post-process':
        return <PostProcessPanel />;
      case 'test':
        return <TestPanel />;
      case 'commit':
        return <GitCommitPanel onDone={() => setMode('compose')} onCancel={() => setMode('test')} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 mb-3 flex justify-between items-center">
        <div className="flex space-x-1 items-center">
          <button
            onClick={() => setMode('compose')}
            className={clsx(buttonBaseClasses, mode === 'compose' ? activeClasses : inactiveClasses)}
          >
            Compose
          </button>
          <WorkflowArrow />
          <button
            onClick={() => setMode('apply')}
            className={clsx(buttonBaseClasses, mode === 'apply' ? activeClasses : inactiveClasses)}
          >
            Apply
          </button>
          <WorkflowArrow />
          <button
            onClick={() => setMode('test')}
            className={clsx(buttonBaseClasses, mode === 'test' ? activeClasses : inactiveClasses)}
            disabled={!rootPath}
          >
            Test
          </button>
          <WorkflowArrow />
          <button
            onClick={() => setMode('post-process')}
            className={clsx(buttonBaseClasses, mode === 'post-process' ? activeClasses : inactiveClasses)}
            disabled={!rootPath}
          >
            Post-Process
          </button>
          <WorkflowArrow />

          <button
            onClick={() => setMode('commit')}
            className={clsx(buttonBaseClasses, mode === 'commit' ? activeClasses : inactiveClasses)}
            disabled={!rootPath}
          >
            Commit
          </button>
        </div>

        <button
          onClick={showHelp}
          title="View Full Help Guide"
          className="ml-auto p-1.5 text-neutral-400 hover:text-indigo-400 rounded-md hover:bg-neutral-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <InfoIcon size={16} />
        </button>
      </div>
      <div className="flex-grow flex flex-col min-h-0 bg-neutral-900 p-4 rounded-xl shadow-md border border-neutral-800">
        {renderPanelContent(mode)}
      </div>
    </div>
  );
}
