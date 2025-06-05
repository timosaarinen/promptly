// src/components/right-panel/commit/GitCommitPanel.tsx
import React, { useState, useEffect } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import {
  commitMessageAtom,
  gitActionIndicatorAtom,
  isGitRepoAtom,
  gitStatusFilesAtom,
  GitStatusFile,
} from '@/store/atoms';
import { useToast } from '@/hooks/useToast';
import { cleanCommitMessage } from '@/utils/cleanCommitMessage';
import { Loader2, AlertTriangle, GitCommit, GitMerge, Send, XCircle, Info, Wand2 } from 'lucide-react';
import { electronApi } from '@shared/electron-api';

interface GitCommitPanelProps {
  onDone: () => void; // Called after successful commit/push or if no action needed
  onCancel: () => void; // Called if user cancels the commit view
}

const GitCommitPanel: React.FC<GitCommitPanelProps> = ({ onDone, onCancel }) => {
  const [commitMessage, setCommitMessage] = useAtom(commitMessageAtom);
  const setGitActionIndicator = useSetAtom(gitActionIndicatorAtom);
  const [isGitRepo] = useAtom(isGitRepoAtom);
  const [statusFiles] = useAtom(gitStatusFilesAtom);

  const { showToast, showToastForError } = useToast();

  const [commitMessageDraft, setCommitMessageDraft] = useState('');
  const [isProcessingGitAction, setIsProcessingGitAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initialize draft from global atom. If global is empty, draft remains empty.
    setCommitMessageDraft(commitMessage);
  }, [commitMessage]);

  const handleSanitizeMessage = () => {
    const sanitized = cleanCommitMessage(commitMessageDraft);
    setCommitMessageDraft(sanitized);
    showToast('Commit message sanitized.', 'info');
  };

  const handleStageChanges = async () => {
    if (!isGitRepo || statusFiles.length === 0) {
      showToast('No changes to stage or not a Git repository.', 'info');
      return;
    }
    setIsProcessingGitAction(true);
    setError(null);
    try {
      await electronApi.gitStageAll();
      showToast('Changes staged successfully!', 'success');
      setGitActionIndicator((prev) => prev + 1); // Trigger GitStatusPanel refresh
    } catch (e) {
      showToastForError('Error staging changes', e, setError);
    }
    setIsProcessingGitAction(false);
  };

  const handleCommit = async () => {
    if (!commitMessageDraft.trim()) {
      showToast('Commit message cannot be empty.', 'warning');
      return;
    }
    if (!isGitRepo || statusFiles.length === 0) {
      showToast('Nothing to commit or not a Git repository.', 'info');
      return;
    }
    setIsProcessingGitAction(true);
    setError(null);
    try {
      // Use commitMessageDraft directly as it is (raw or user-sanitized)
      await electronApi.gitStageAll();
      await electronApi.gitCommit(commitMessageDraft);
      showToast('Changes committed successfully!', 'success');
      setGitActionIndicator((prev) => prev + 1);
      setCommitMessage('');
      onDone();
    } catch (e) {
      showToastForError('Error committing changes', e, setError);
    }
    setIsProcessingGitAction(false);
  };

  const handleCommitAndPush = async () => {
    if (!commitMessageDraft.trim()) {
      showToast('Commit message cannot be empty.', 'warning');
      return;
    }
    if (!isGitRepo || statusFiles.length === 0) {
      showToast('Nothing to commit/push or not a Git repository.', 'info');
      return;
    }
    setIsProcessingGitAction(true);
    setError(null);
    try {
      // Use commitMessageDraft directly
      await electronApi.gitStageAll();
      await electronApi.gitCommit(commitMessageDraft);
      await electronApi.gitPush();
      showToast('Changes committed and pushed successfully!', 'success');
      setGitActionIndicator((prev) => prev + 1);
      setCommitMessage('');
      onDone();
    } catch (e) {
      showToastForError('Error in commit & push', e, setError);
    }
    setIsProcessingGitAction(false);
  };

  const canPerformGitActions = isGitRepo && statusFiles.length > 0;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium text-neutral-100">Commit Changes</h3>
        <button
          onClick={onCancel}
          disabled={isProcessingGitAction}
          className="p-1 text-neutral-400 hover:text-neutral-100 rounded-full hover:bg-neutral-700 disabled:opacity-50"
          title="Close Commit Panel"
        >
          <XCircle size={20} />
        </button>
      </div>

      <div className="mb-3">
        <h4 className="text-sm font-medium text-neutral-300 mb-1">Affected Files:</h4>
        {!isGitRepo ? (
          <div className="flex items-center text-neutral-500 text-xs p-2 bg-neutral-800 rounded-md border border-neutral-700">
            <Info size={14} className="mr-1.5 shrink-0" />
            Not a Git repository.
          </div>
        ) : statusFiles.length > 0 ? (
          <ul className="list-disc list-inside text-xs text-neutral-400 max-h-24 overflow-y-auto bg-neutral-800 p-2 rounded-md border border-neutral-700">
            {statusFiles.map((file: GitStatusFile) => (
              <li key={file.path} className="font-mono whitespace-pre">
                <span className="text-yellow-500 min-w-[2.5ch] inline-block pr-1">{file.statusCode}</span>
                {file.path}
                {file.originalPath && ` <- ${file.originalPath}`}
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center text-green-400 text-xs p-2 bg-neutral-800 rounded-md border border-neutral-700">
            <Info size={14} className="mr-1.5 shrink-0" />
            Working tree clean. Nothing to commit.
          </div>
        )}
      </div>

      <div className="mb-1 flex flex-col flex-grow">
        <div className="flex justify-between items-center mb-1">
          <label htmlFor="gitCommitMessage" className="block text-sm font-medium text-neutral-300 shrink-0">
            Commit Message:
          </label>
          <button
            onClick={handleSanitizeMessage}
            disabled={isProcessingGitAction || !isGitRepo}
            className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-md text-xs font-medium disabled:bg-neutral-700 disabled:cursor-not-allowed flex items-center"
            title="Sanitize commit message (remove tags, extra lines)"
          >
            <Wand2 size={14} className="mr-1.5" />
            Sanitize
          </button>
        </div>
        <textarea
          id="gitCommitMessage"
          value={commitMessageDraft}
          onChange={(e) => setCommitMessageDraft(e.target.value)}
          placeholder="Enter commit message (e.g., feat: Describe your changes)"
          rows={4}
          className="w-full p-2 bg-neutral-800 border border-neutral-700 rounded-md text-neutral-200 font-mono text-sm resize-y flex-grow focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
          disabled={isProcessingGitAction || !isGitRepo}
        />
      </div>

      {error && (
        <div className="mt-2 p-2 bg-red-900/50 text-red-300 rounded-md text-xs flex items-center shrink-0">
          <AlertTriangle size={16} className="mr-2 shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-auto flex flex-col space-y-3 pt-3 shrink-0">
        <button
          onClick={handleCommit}
          disabled={isProcessingGitAction || !commitMessageDraft.trim() || !canPerformGitActions}
          className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-md text-base font-medium disabled:bg-neutral-700 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isProcessingGitAction ? (
            <Loader2 size={20} className="animate-spin mr-2" />
          ) : (
            <GitCommit size={18} className="mr-2" />
          )}
          Commit
        </button>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleStageChanges}
            disabled={isProcessingGitAction || !canPerformGitActions}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-medium disabled:bg-neutral-700 disabled:cursor-not-allowed flex items-center justify-center flex-1"
          >
            {isProcessingGitAction ? (
              <Loader2 size={16} className="animate-spin mr-1.5" />
            ) : (
              <GitMerge size={14} className="mr-1.5" />
            )}
            Stage All Changes
          </button>
          <button
            onClick={handleCommitAndPush}
            disabled={isProcessingGitAction || !commitMessageDraft.trim() || !canPerformGitActions}
            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-md text-xs font-medium disabled:bg-neutral-700 disabled:cursor-not-allowed flex items-center justify-center flex-1"
          >
            {isProcessingGitAction ? (
              <Loader2 size={16} className="animate-spin mr-1.5" />
            ) : (
              <Send size={14} className="mr-1.5" />
            )}
            Commit & Push
          </button>
        </div>
      </div>
    </div>
  );
};

export default GitCommitPanel;
