// src/components/right-panel/prompt/ContextSummaryBox.tsx
import React, { useMemo, useState } from 'react';
import { FileSystemEntry } from '@/store/atoms';
import {
  Files as FilesIcon,
  Loader2 as IconLoader,
  CheckCircle,
  XCircle,
  Save as SaveIcon,
  Copy as CopyIcon,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';
import { useToast } from '@/hooks/useToast';
import { electronApi } from '@shared/electron-api';

interface ContextSummaryBoxProps {
  rootPath: string | null;
  selectedFilesMap: Map<string, FileSystemEntry>;
  isBuildingXml: boolean;
  contextAssemblyError: string | null;
  assembledContext: string;
  contextTokensForDisplay: number;
  onRemoveFile: (entry: FileSystemEntry) => void;
}

const MAX_FILES_VISIBLE_INITIAL = 5;

const ContextSummaryBox: React.FC<ContextSummaryBoxProps> = ({
  rootPath,
  selectedFilesMap,
  isBuildingXml,
  contextAssemblyError,
  assembledContext,
  contextTokensForDisplay,
  onRemoveFile,
}) => {
  const [showAllFiles, setShowAllFiles] = useState(false);
  const { showToast, showToastForError } = useToast();

  const filesForContext = useMemo(() => {
    return Array.from(selectedFilesMap.values())
      .filter((entry) => entry.isFile && !entry.isBinary && entry.selectionState === 'full')
      .sort((a, b) => (b.displayEstimatedTokens || 0) - (a.displayEstimatedTokens || 0));
  }, [selectedFilesMap]);

  const numFilesForContext = filesForContext.length;

  const handleSaveContextInternal = async () => {
    if (isBuildingXml) {
      showToast('Context processing, please wait.', 'info');
      return;
    }
    if (!assembledContext) {
      showToast('No context available to save.', 'info');
      return;
    }
    try {
      const currentRootPath = rootPath;
      const rootName = currentRootPath ? currentRootPath.split(/[/\\]/).pop() : 'context';
      const defaultFilename = `${rootName}-context-${new Date().toISOString().split('T')[0]}.xml`;
      const savedToPath = await electronApi.saveFile(defaultFilename, assembledContext);
      if (savedToPath) {
        showToast(`Context saved to ${savedToPath.filePath}`, 'success');
      }
    } catch (err) {
      showToastForError('Error saving context', err);
    }
  };

  const handleCopyContextOnlyInternal = async () => {
    if (isBuildingXml) {
      showToast('Context processing, please wait.', 'info');
      return;
    }
    if (!assembledContext) {
      showToast('No context available to copy.', 'info');
      return;
    }
    try {
      await electronApi.copyToClipboard(assembledContext);
      showToast('Context XML copied to clipboard!', 'success');
    } catch (err) {
      showToastForError('Error copying context XML', err);
    }
  };

  const renderOverviewStatus = () => {
    if (isBuildingXml) {
      return (
        <span className="flex items-center text-neutral-400">
          <IconLoader size={14} className="animate-spin mr-1.5 shrink-0" />
          Assembling context... ({numFilesForContext} file
          {numFilesForContext !== 1 ? 's' : ''} selected)
        </span>
      );
    }
    if (contextAssemblyError) {
      return (
        <span className="flex items-center text-yellow-400">
          <AlertTriangle size={14} className="mr-1.5 shrink-0" />
          {contextAssemblyError}
        </span>
      );
    }
    if (assembledContext || numFilesForContext > 0) {
      return (
        <span className="flex items-center text-green-400">
          <CheckCircle size={14} className="mr-1.5 shrink-0" />
          Context: {numFilesForContext} file
          {numFilesForContext !== 1 ? 's' : ''} ({contextTokensForDisplay} tokens)
        </span>
      );
    }
    return <span className="text-neutral-500">No context files selected.</span>;
  };

  const handleToggleShowAllFiles = () => {
    setShowAllFiles(!showAllFiles);
  };

  const displayedFiles = showAllFiles ? filesForContext : filesForContext.slice(0, MAX_FILES_VISIBLE_INITIAL);
  const canPerformXmlActions = numFilesForContext > 0 && !isBuildingXml && !!assembledContext;

  return (
    <div className={clsx('mb-2 bg-neutral-800 rounded-lg border border-neutral-700 shadow-sm relative text-sm')}>
      <div className="p-2.5 flex items-center justify-between">
        <div className="flex items-center flex-grow min-w-0">
          <FilesIcon size={16} className="mr-2 text-indigo-400 shrink-0" />
          <div className="text-neutral-300 truncate" title={contextAssemblyError ?? undefined}>
            {renderOverviewStatus()}
          </div>
        </div>
        <div className="flex items-center space-x-1 shrink-0 ml-2">
          <button
            onClick={handleCopyContextOnlyInternal}
            disabled={!canPerformXmlActions}
            title="Copy Context XML Only"
            className="p-1.5 text-neutral-400 hover:text-indigo-400 rounded hover:bg-neutral-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CopyIcon size={16} />
          </button>
          <button
            onClick={handleSaveContextInternal}
            disabled={!canPerformXmlActions}
            title="Save Context XML..."
            className="p-1.5 text-neutral-400 hover:text-indigo-400 rounded hover:bg-neutral-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SaveIcon size={16} />
          </button>
        </div>
      </div>

      {numFilesForContext > 0 && (
        <div className="border-t border-neutral-700 max-h-48 overflow-y-auto fancy-scrollbar">
          {displayedFiles.map((file) => (
            <div
              key={file.path}
              className="flex items-center justify-between px-2.5 py-1.5 hover:bg-neutral-700/50 group"
            >
              <div className="truncate text-neutral-300 flex-grow min-w-0" title={file.path}>
                <span className="font-mono text-xs">{file.path}</span>
              </div>
              <div className="flex items-center shrink-0 ml-2">
                <span className="text-xs text-neutral-400 mr-3 tabular-nums">
                  {(file.displaySize ? file.displaySize / 1024 : 0).toFixed(1)}KB / {file.displayEstimatedTokens || 0}t
                </span>
                <button
                  onClick={() => onRemoveFile(file)}
                  title={`Remove ${file.path} from context`}
                  className="p-0.5 text-neutral-500 hover:text-red-400 rounded-full hover:bg-neutral-600/50 opacity-50 group-hover:opacity-100 transition-opacity"
                >
                  <XCircle size={14} />
                </button>
              </div>
            </div>
          ))}
          {filesForContext.length > MAX_FILES_VISIBLE_INITIAL && (
            <div className="px-2.5 py-1 border-t border-neutral-700/50 text-center bg-neutral-800 sticky bottom-0">
              <button
                onClick={handleToggleShowAllFiles}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center justify-center w-full py-0.5"
              >
                {showAllFiles ? (
                  <>
                    Show Top {MAX_FILES_VISIBLE_INITIAL} <ChevronUp size={14} className="ml-1" />
                  </>
                ) : (
                  <>
                    Show All {filesForContext.length} Files <ChevronDown size={14} className="ml-1" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ContextSummaryBox;
