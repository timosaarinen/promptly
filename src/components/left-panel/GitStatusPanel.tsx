// src/components/left-panel/GitStatusPanel.tsx
import React, { useEffect } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import {
  rootPathAtom,
  isGitRepoAtom,
  gitBranchAtom,
  gitCommitHashAtom,
  gitStatusFilesAtom,
  addGitDiffToContextAtom,
  gitCombinedDiffAtom,
  fileSystemChangeIndicatorAtom,
  gitActionIndicatorAtom,
  appFocusRefreshTriggerAtom,
  isLoadingAtom,
  rightPanelModeAtom,
} from '@/store/atoms';
import { useToast } from '@/hooks/useToast';
import {
  GitCommit,
  GitBranch,
  GitPullRequestArrow,
  CheckCircle,
  Info,
  Loader2,
  Square,
  CheckSquare,
  Send as SendIcon,
  ClipboardCopy,
} from 'lucide-react';
import { electronApi } from '@shared/electron-api';
import { getPrefixedPath, DEFAULT_IMPORTANCE } from '@/utils/fileTreeUtils';
import { copyFilesAsPromptToClipboard } from '@/utils/promptGenerationUtils';
import { getErrorMessage } from '@/utils/errorUtils';

const GitStatusPanel: React.FC = () => {
  const [rootPath] = useAtom(rootPathAtom);
  const [isGitRepo, setIsGitRepo] = useAtom(isGitRepoAtom);
  const [branch, setBranch] = useAtom(gitBranchAtom);
  const [commitHash, setCommitHash] = useAtom(gitCommitHashAtom);
  const [statusFiles, setStatusFiles] = useAtom(gitStatusFilesAtom);
  const [addDiff, setAddDiff] = useAtom(addGitDiffToContextAtom);
  const setCombinedDiff = useSetAtom(gitCombinedDiffAtom);
  const [fsChangeIndicator] = useAtom(fileSystemChangeIndicatorAtom);
  const [gitActionIndicator] = useAtom(gitActionIndicatorAtom);
  const [appFocusRefreshTrigger] = useAtom(appFocusRefreshTriggerAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const setRightPanelMode = useSetAtom(rightPanelModeAtom);
  const { showToast, showToastForError } = useToast();
  const [isCopyingModified, setIsCopyingModified] = React.useState(false);

  const handleOpenCommitPanel = () => {
    if (!isGitRepo || statusFiles.length === 0) {
      showToast('No changes to commit or not a Git repository.', 'info');
      return;
    }
    setRightPanelMode('commit');
  };

  useEffect(() => {
    if (!rootPath) {
      setIsGitRepo(false);
      setBranch(null);
      setCommitHash(null);
      setStatusFiles([]);
      setCombinedDiff(null);
      return;
    }

    let isMounted = true;
    const fetchGitData = async () => {
      setIsLoading(true);
      try {
        const isGitRepoResult = await electronApi.isGitRepository();
        if (!isMounted) return;

        setIsGitRepo(isGitRepoResult);

        if (isGitRepoResult) {
          const [branchRes, commitRes, statusRes, diffRes] = await Promise.all([
            electronApi.getCurrentBranch(),
            electronApi.getCurrentCommitHash(),
            electronApi.getGitStatus(),
            addDiff ? electronApi.getCombinedDiff() : Promise.resolve(null),
          ]);

          if (!isMounted) return;
          setBranch(branchRes);
          setCommitHash(commitRes);
          setStatusFiles(statusRes);
          setCombinedDiff(diffRes);
        } else {
          // Not a git repo, clear all git specific state
          setBranch(null);
          setCommitHash(null);
          setStatusFiles([]);
          setCombinedDiff(null);
        }
      } catch (err) {
        if (isMounted) {
          showToastForError('Error fetching Git data', err);
          setIsGitRepo(false);
          setBranch(null);
          setCommitHash(null);
          setStatusFiles([]);
          setCombinedDiff(null);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchGitData();
    return () => {
      isMounted = false;
    };
  }, [
    rootPath,
    fsChangeIndicator,
    addDiff,
    gitActionIndicator,
    appFocusRefreshTrigger,
    setIsGitRepo,
    setBranch,
    setCommitHash,
    setStatusFiles,
    setCombinedDiff,
    setIsLoading,
    showToastForError,
  ]);

  const handleAddDiffToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAddDiff(e.target.checked);
    if (!e.target.checked) {
      setCombinedDiff(null);
    }
  };

  const handleCopyModifiedFiles = async () => {
    if (!rootPath || !isGitRepo || statusFiles.length === 0) {
      showToast('No modified files to copy or not a Git repository.', 'info');
      return;
    }

    setIsCopyingModified(true);
    try {
      const modifiedFilePaths = statusFiles
        .filter((file) => file.statusCode.trim() !== 'D') // Exclude deleted files
        .map((file) => file.path);

      if (modifiedFilePaths.length === 0) {
        showToast('No modified (non-deleted) files found.', 'info');
        setIsCopyingModified(false);
        return;
      }

      const prefixedModifiedFilePaths = modifiedFilePaths.map((filePath) =>
        getPrefixedPath(filePath, DEFAULT_IMPORTANCE)
      );

      const promptPrefix =
        'The following files has been modified. Please consider this their current state for any further actions or analysis:\n\n';

      await copyFilesAsPromptToClipboard(rootPath, prefixedModifiedFilePaths, promptPrefix, showToast, {
        includeGitDiff: false,
        includeSummary: false,
        includeDirectoryStructure: false,
        includeGitCommitHash: false,
      });
    } catch (err) {
      console.error('Error in handleCopyModifiedFiles, potentially caught by utility:', err);
      if (!String(getErrorMessage(err)).startsWith('Error copying files context:')) {
        showToastForError('Error preparing to copy modified files context', err);
      }
    } finally {
      setIsCopyingModified(false);
    }
  };

  const shortCommitHash = commitHash ? commitHash.substring(0, 7) : 'N/A'; // Shorten commit hash for display

  if (!rootPath) return null;

  return (
    <div className="p-3 border-t border-neutral-700 text-xs text-neutral-400 flex-grow flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-1.5 shrink-0">
        <h4 className="font-semibold text-neutral-300">Git Status</h4>
        <div className="flex items-center space-x-2">
          {isGitRepo && !isLoading && statusFiles.length > 0 && !isCopyingModified && (
            <button
              onClick={handleCopyModifiedFiles}
              title="Copy modified files as prompt"
              className="p-1 text-neutral-400 hover:text-indigo-400 rounded hover:bg-neutral-700/50"
            >
              <ClipboardCopy size={14} />
            </button>
          )}
          {isGitRepo && !isLoading && statusFiles.length > 0 && !isCopyingModified && (
            <button
              onClick={handleOpenCommitPanel}
              title="Commit changes"
              className="p-1 text-neutral-400 hover:text-indigo-400 rounded hover:bg-neutral-700/50"
            >
              <SendIcon size={14} />
            </button>
          )}
          {(isLoading || isCopyingModified) && isGitRepo && (
            <Loader2 size={14} className="animate-spin text-neutral-400" />
          )}
        </div>
      </div>

      {!isGitRepo && !isLoading && (
        <div className="flex items-center text-neutral-500">
          <Info size={14} className="mr-1.5 shrink-0" />
          Not a Git repository.
        </div>
      )}

      {isGitRepo && !isLoading && (
        <>
          <div className="mb-2 text-neutral-300 shrink-0">
            <div className="flex items-center" title={`Branch: ${branch || 'N/A'}`}>
              <GitBranch size={12} className="mr-1.5 shrink-0" />
              <span>{branch || 'Detached HEAD'}</span>
            </div>
            <div className="flex items-center" title={`Commit: ${commitHash || 'N/A'}`}>
              <GitCommit size={12} className="mr-1.5 shrink-0" />
              <span>{shortCommitHash}</span>
            </div>
          </div>

          <div className="mb-2 shrink-0">
            <label className="flex items-center cursor-pointer text-neutral-400 hover:text-neutral-300">
              <input
                type="checkbox"
                checked={addDiff}
                onChange={handleAddDiffToggle}
                className="mr-1.5 h-3.5 w-3.5 rounded border-neutral-600 text-indigo-500 focus:ring-1 focus:ring-offset-0 focus:ring-offset-neutral-800 focus:ring-indigo-400 bg-neutral-700"
              />
              {addDiff ? (
                <CheckSquare size={14} className="mr-1 text-indigo-400" />
              ) : (
                <Square size={14} className="mr-1 text-neutral-500" />
              )}
              Add diff to context
            </label>
          </div>

          <div className="flex-grow overflow-y-auto border border-neutral-700 rounded-md p-1.5 bg-neutral-950/30 min-h-[50px]">
            {statusFiles.length === 0 ? (
              <div className="flex items-center text-green-400">
                <CheckCircle size={14} className="mr-1.5 shrink-0" />
                Working tree clean.
              </div>
            ) : (
              <ul className="space-y-0.5">
                {statusFiles.slice(0, 15).map(
                  (
                    file // Limit displayed files for now
                  ) => (
                    <li key={file.path} className="flex items-center" title={`${file.statusCode} ${file.path}`}>
                      <GitPullRequestArrow size={12} className="mr-1.5 shrink-0 text-yellow-400" />
                      <span className="font-mono truncate text-neutral-300">
                        <span className="text-yellow-500 min-w-[2.5ch] inline-block pr-1">{file.statusCode}</span>
                        {file.path}
                        {file.originalPath && ` <- ${file.originalPath}`}
                      </span>
                    </li>
                  )
                )}
                {statusFiles.length > 15 && (
                  <li className="text-neutral-500 italic">...and {statusFiles.length - 15} more.</li>
                )}
              </ul>
            )}
          </div>
        </>
      )}
      {isGitRepo && isLoading && (
        <div className="flex items-center text-neutral-500">
          <Loader2 size={14} className="animate-spin mr-1.5 shrink-0" />
          Loading Git information...
        </div>
      )}
    </div>
  );
};

export default GitStatusPanel;
