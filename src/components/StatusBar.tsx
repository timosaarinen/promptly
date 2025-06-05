// src/components/StatusBar.tsx
import { useAtom, useAtomValue } from 'jotai';
import {
  totalCombinedTokenCountAtom,
  totalCombinedCharCountAtom,
  isLoadingAtom,
  rootPathAtom,
  latestLogMessageAtom,
  logMessagesAtom,
  LogEntry,
} from '@/store/atoms';
import { useContentViewer } from '@/hooks/useContentViewer';
import { Zap, CheckCircle, Folder, MessageSquare } from 'lucide-react';

const StatusBar = () => {
  const [totalTokens] = useAtom(totalCombinedTokenCountAtom);
  const [totalChars] = useAtom(totalCombinedCharCountAtom);
  const [isLoading] = useAtom(isLoadingAtom);
  const [rootPath] = useAtom(rootPathAtom);
  const latestLog = useAtomValue(latestLogMessageAtom);
  const allLogs = useAtomValue(logMessagesAtom);
  const { showContent } = useContentViewer();

  const handleLogClick = () => {
    if (allLogs.length > 0) {
      const formattedLogs = allLogs
        .map((log: LogEntry) => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.message}`)
        .join('\n');
      showContent(formattedLogs, 'text', 'Application Log');
    }
  };

  return (
    <div className="h-8 px-4 py-1 bg-neutral-900 border-t border-neutral-800 text-xs text-neutral-400 flex items-center justify-between shrink-0">
      <div className="flex items-center space-x-3">
        {isLoading ? (
          <div className="flex items-center text-yellow-400">
            <Zap size={14} className="mr-1 animate-pulse" />
            <span>Loading...</span>
          </div>
        ) : rootPath ? (
          <div className="flex items-center text-green-400">
            <CheckCircle size={14} className="mr-1" />
            <span>Ready</span>
          </div>
        ) : (
          <div className="flex items-center text-neutral-500">
            <Folder size={14} className="mr-1" />
            <span>No folder selected</span>
          </div>
        )}
      </div>
      <div className="flex items-center space-x-3">
        {latestLog && (
          <div
            className="flex items-center cursor-pointer hover:text-neutral-100 transition-colors"
            onClick={handleLogClick}
            title="Click to view full application log"
          >
            <MessageSquare size={13} className="mr-1 text-sky-400" />
            <span className="truncate max-w-[300px]">{latestLog.message}</span>
          </div>
        )}
        <span>Tokens: {totalTokens}</span>
        <span>Chars: {totalChars}</span>
      </div>
    </div>
  );
};

export default StatusBar;
