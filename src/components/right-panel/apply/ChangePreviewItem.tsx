// src/components/right-panel/ChangePreviewItem.tsx
import React from 'react';
import { FileWriteChange, FileDiffChange, MessageChange } from '@/store/parseAtoms';
import { ChangeWithApplyStatus, ApplyItemStatus } from '@/store/parseAtoms';
import {
  FilePlus,
  FileText,
  FileMinus,
  HelpCircle,
  MessageSquare,
  Copy,
  ShieldAlert,
  AlertTriangle,
  SkipForward,
  CheckCircle,
  UserCheck,
  ClipboardCopy,
} from 'lucide-react';
import DiffDisplay from './DiffDisplay';

interface ChangePreviewItemProps {
  change: ChangeWithApplyStatus;
  isProcessing?: boolean;
  onForceApply?: () => void;
  onSkip?: () => void;
  onMarkAsResolved?: () => void;
  onCopySingle?: (change: FileWriteChange | FileDiffChange) => Promise<void>;
  onRequestFullFilePrompt?: () => void;
}

const ChangePreviewItem: React.FC<ChangePreviewItemProps> = ({
  change,
  isProcessing,
  onForceApply,
  onSkip,
  onMarkAsResolved,
  onCopySingle,
  onRequestFullFilePrompt,
}) => {
  const getVisuals = () => {
    let icon: React.ReactElement | null = null;
    let label = 'Unknown';
    let titleText = change.path || '';

    switch (change.type) {
      case 'create':
        icon = <FilePlus size={16} className="text-green-400 mr-2 shrink-0" />;
        label = 'Write';
        titleText += ' [Full File Write]';
        break;
      case 'edit':
        icon = <FileText size={16} className="text-yellow-400 mr-2 shrink-0" />;
        label = 'Edit';
        break;
      case 'delete':
        icon = <FileMinus size={16} className="text-red-400 mr-2 shrink-0" />;
        label = 'Delete';
        break;
      case 'request':
        icon = <HelpCircle size={16} className="text-blue-400 mr-2 shrink-0" />;
        label = 'Request';
        break;
      case 'message':
        icon = <MessageSquare size={16} className="text-indigo-400 mr-2 shrink-0" />;
        label = 'Message';
        titleText = (change as MessageChange).content.substring(0, 50) + '...';
        break;
    }

    if (change.applyStatus === ApplyItemStatus.APPLIED_SUCCESS) {
      icon = <CheckCircle size={16} className="text-green-400 mr-2 shrink-0" />;
      label = 'Applied';
    } else if (change.applyStatus === ApplyItemStatus.APPLIED_FAILED) {
      icon = <AlertTriangle size={16} className="text-red-500 mr-2 shrink-0" />;
      label = 'Failed';
    } else if (change.applyStatus === ApplyItemStatus.SKIPPED_BY_USER) {
      icon = <SkipForward size={16} className="text-neutral-500 mr-2 shrink-0" />;
      label = 'Skipped';
    } else if (change.applyStatus === ApplyItemStatus.USER_RESOLVED) {
      icon = <UserCheck size={16} className="text-teal-400 mr-2 shrink-0" />;
      label = 'User Resolved';
    } else if (
      change.applyStatus === ApplyItemStatus.VALIDATION_FAILED_NO_FILE ||
      change.applyStatus === ApplyItemStatus.VALIDATION_FAILED_SEARCH_NOT_FOUND ||
      change.applyStatus === ApplyItemStatus.VALIDATION_FAILED_IDENTICAL_CONTENT ||
      change.applyStatus === ApplyItemStatus.VALIDATION_TOLERANT_MATCH_PENDING_STRICT_APPLY
    ) {
      icon = <ShieldAlert size={16} className="text-orange-400 mr-2 shrink-0" />;
      label =
        change.applyStatus === ApplyItemStatus.VALIDATION_TOLERANT_MATCH_PENDING_STRICT_APPLY
          ? 'Tolerant Match'
          : 'Review Req.';
    }

    return { icon, label, titleText };
  };

  const { icon, label, titleText } = getVisuals();
  const canCopy = change.type === 'create' || change.type === 'edit';
  const showDiff = (change.type === 'create' && change.path) || (change.type === 'edit' && change.path);

  const isReviewableState =
    change.applyStatus === ApplyItemStatus.VALIDATION_FAILED_NO_FILE ||
    change.applyStatus === ApplyItemStatus.VALIDATION_FAILED_SEARCH_NOT_FOUND ||
    change.applyStatus === ApplyItemStatus.VALIDATION_FAILED_IDENTICAL_CONTENT ||
    change.applyStatus === ApplyItemStatus.VALIDATION_TOLERANT_MATCH_PENDING_STRICT_APPLY;

  const isFailedSearchReplace =
    change.type === 'edit' &&
    (change as FileDiffChange).diffType === 'search-replace' &&
    (change.applyStatus === ApplyItemStatus.VALIDATION_FAILED_SEARCH_NOT_FOUND ||
      change.applyStatus === ApplyItemStatus.VALIDATION_FAILED_IDENTICAL_CONTENT ||
      change.applyStatus === ApplyItemStatus.VALIDATION_TOLERANT_MATCH_PENDING_STRICT_APPLY);

  const borderColorClass = isReviewableState
    ? 'border-orange-500/60'
    : change.applyStatus === ApplyItemStatus.APPLIED_FAILED
      ? 'border-red-500/60'
      : 'border-neutral-700/50';

  return (
    <div className={`p-2.5 my-1.5 bg-neutral-800/70 rounded-lg shadow border ${borderColorClass}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center min-w-0">
          {icon}
          <span className="text-sm font-medium text-neutral-200">{label}</span>
          {change.path && (
            <span className="ml-2 text-xs text-neutral-400 font-mono truncate" title={titleText}>
              : {change.path}
              {change.type === 'create' && (
                <span className="ml-1 text-sky-400 font-sans normal-case"> [Full File Write]</span>
              )}
            </span>
          )}
          {!change.path && change.type === 'message' && (
            <span className="ml-2 text-xs text-neutral-400 italic truncate" title={titleText}>
              : "{titleText}"
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1.5 shrink-0">
          {canCopy &&
            onCopySingle &&
            (change.applyStatus === ApplyItemStatus.PENDING_VALIDATION ||
              change.applyStatus === ApplyItemStatus.VALIDATION_SUCCESS ||
              isReviewableState ||
              change.applyStatus === ApplyItemStatus.VALIDATION_TOLERANT_MATCH_PENDING_STRICT_APPLY) && (
              <button
                onClick={() => onCopySingle(change as FileWriteChange | FileDiffChange)}
                disabled={isProcessing}
                title={`Copy ${change.type === 'create' ? 'file content' : 'diff content'}`}
                className="p-1 text-neutral-400 hover:text-indigo-400 disabled:text-neutral-600 disabled:cursor-not-allowed rounded hover:bg-neutral-700"
              >
                <Copy size={14} />
              </button>
            )}
        </div>
      </div>

      {/* Display Reason if available for relevant change types */}
      {change.reason && (change.type === 'create' || change.type === 'edit' || change.type === 'delete') && (
        <div className="pl-[calc(16px+0.5rem)] pt-0.5 pb-1">
          {' '}
          <p className="text-xs text-neutral-500 italic">"{change.reason}"</p>
        </div>
      )}

      {/* VALIDATION_FAILED_NO_FILE specific block */}
      {change.applyStatus === ApplyItemStatus.VALIDATION_FAILED_NO_FILE && (
        <div className="my-2 p-2 bg-orange-800/40 border border-orange-600/50 rounded-md text-orange-200 text-xs">
          <div className="flex items-start">
            <ShieldAlert size={16} className="mr-2 mt-0.5 shrink-0 text-orange-400" />
            <p className="flex-grow">
              Validation Failed: File does not exist for '{change.type}' operation on {change.path}.
              {change.applyError && ` Details: ${change.applyError}`}
            </p>
          </div>
          {(onForceApply || onSkip) && (
            <div className="mt-2.5 flex justify-end space-x-2">
              {onSkip && (
                <button
                  onClick={onSkip}
                  disabled={isProcessing}
                  className="px-2.5 py-1 text-xs bg-neutral-600 hover:bg-neutral-500 text-neutral-200 rounded-md disabled:opacity-50"
                >
                  Skip
                </button>
              )}
              {onForceApply && (
                <button
                  onClick={onForceApply}
                  disabled={isProcessing}
                  className="px-2.5 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded-md disabled:opacity-50"
                >
                  Force Apply
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* VALIDATION_TOLERANT_MATCH_PENDING_STRICT_APPLY specific block */}
      {change.applyStatus === ApplyItemStatus.VALIDATION_TOLERANT_MATCH_PENDING_STRICT_APPLY && (
        <div className="my-2 p-2 bg-sky-800/40 border border-sky-600/50 rounded-md text-sky-200 text-xs">
          <div className="flex items-start">
            <ShieldAlert size={16} className="mr-2 mt-0.5 shrink-0 text-sky-400" />
            <p className="flex-grow">
              Tolerant Match Found: Search text matched after normalization (e.g., ignoring comments/whitespace). A
              strict match will be attempted for application.
              {change.applyError && ` Details: ${change.applyError}`}
            </p>
          </div>
          <div className="mt-1.5">
            <p className="font-semibold mb-0.5 text-sky-300">Original Search Text:</p>
            <pre className="p-1.5 bg-neutral-900/70 rounded text-xs whitespace-pre-wrap break-all">
              {change.failedSearchText || 'N/A'}
            </pre>
          </div>
          {(onSkip || onMarkAsResolved || (isFailedSearchReplace && onRequestFullFilePrompt)) && (
            <div className="mt-2.5 flex justify-end space-x-2">
              {onSkip && (
                <button
                  onClick={onSkip}
                  disabled={isProcessing}
                  className="px-2.5 py-1 text-xs bg-neutral-600 hover:bg-neutral-500 text-neutral-200 rounded-md disabled:opacity-50"
                >
                  Skip
                </button>
              )}
              {onMarkAsResolved && (
                <button
                  onClick={onMarkAsResolved}
                  disabled={isProcessing}
                  className="px-2.5 py-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-md disabled:opacity-50"
                >
                  Mark Resolved
                </button>
              )}
              {isFailedSearchReplace && onRequestFullFilePrompt && (
                <button
                  onClick={onRequestFullFilePrompt}
                  disabled={isProcessing}
                  className="px-2.5 py-1 text-xs bg-sky-700 hover:bg-sky-600 text-white rounded-md disabled:opacity-50 flex items-center"
                  title="Generate prompt to request full file content for this and other failed search/replace blocks in this response"
                >
                  <ClipboardCopy size={12} className="mr-1" /> Request Full File
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* VALIDATION_FAILED_SEARCH_NOT_FOUND specific block */}
      {change.applyStatus === ApplyItemStatus.VALIDATION_FAILED_SEARCH_NOT_FOUND && (
        <div className="my-2 p-2 bg-orange-800/40 border border-orange-600/50 rounded-md text-orange-200 text-xs">
          <div className="flex items-start">
            <ShieldAlert size={16} className="mr-2 mt-0.5 shrink-0 text-orange-400" />
            <p className="flex-grow">
              Review: Search text not found in file (strict and tolerant checks failed).
              {change.applyError && ` Details: ${change.applyError}`}
            </p>
          </div>
          <div className="mt-1.5">
            <p className="font-semibold mb-0.5 text-orange-300">Search Text (Not Found):</p>
            <pre className="p-1.5 bg-neutral-900/70 rounded text-xs whitespace-pre-wrap break-all">
              {change.failedSearchText || 'N/A'}
            </pre>
          </div>
          <div className="mt-1.5">
            <p className="font-semibold mb-0.5 text-orange-300">Intended Replacement Text:</p>
            <pre className="p-1.5 bg-neutral-900/70 rounded text-xs whitespace-pre-wrap break-all">
              {change.failedReplaceText || 'N/A'}
            </pre>
          </div>
          {(onMarkAsResolved || onSkip || (isFailedSearchReplace && onRequestFullFilePrompt)) && (
            <div className="mt-2.5 flex justify-end space-x-2">
              {onSkip && (
                <button
                  onClick={onSkip}
                  disabled={isProcessing}
                  className="px-2.5 py-1 text-xs bg-neutral-600 hover:bg-neutral-500 text-neutral-200 rounded-md disabled:opacity-50"
                >
                  Skip
                </button>
              )}
              {onMarkAsResolved && (
                <button
                  onClick={onMarkAsResolved}
                  disabled={isProcessing}
                  className="px-2.5 py-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-md disabled:opacity-50"
                >
                  Mark Resolved
                </button>
              )}
              {isFailedSearchReplace && onRequestFullFilePrompt && (
                <button
                  onClick={onRequestFullFilePrompt}
                  disabled={isProcessing}
                  className="px-2.5 py-1 text-xs bg-sky-600 hover:bg-sky-500 text-white rounded-md disabled:opacity-50 flex items-center"
                  title="Generate prompt to request full file content for this and other failed search/replace blocks in this response"
                >
                  <ClipboardCopy size={12} className="mr-1" /> Request Full File
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* VALIDATION_FAILED_IDENTICAL_CONTENT specific block */}
      {change.applyStatus === ApplyItemStatus.VALIDATION_FAILED_IDENTICAL_CONTENT && (
        <div className="my-2 p-2 bg-orange-800/40 border border-orange-600/50 rounded-md text-orange-200 text-xs">
          <div className="flex items-start">
            <ShieldAlert size={16} className="mr-2 mt-0.5 shrink-0 text-orange-400" />
            <p className="flex-grow">
              Review: Search text and replacement text are identical. No change applied. Consider if a{' '}
              <code className="bg-neutral-900/70 px-1 rounded">&lt;file-write&gt;</code> is more appropriate.
              {change.applyError && ` Details: ${change.applyError}`}
            </p>
          </div>
          {(onMarkAsResolved || onSkip || (isFailedSearchReplace && onRequestFullFilePrompt)) && (
            <div className="mt-2.5 flex justify-end space-x-2">
              {onSkip && (
                <button
                  onClick={onSkip}
                  disabled={isProcessing}
                  className="px-2.5 py-1 text-xs bg-neutral-600 hover:bg-neutral-500 text-neutral-200 rounded-md disabled:opacity-50"
                >
                  Skip
                </button>
              )}
              {onMarkAsResolved && (
                <button
                  onClick={onMarkAsResolved}
                  disabled={isProcessing}
                  className="px-2.5 py-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-md disabled:opacity-50"
                >
                  Mark Resolved
                </button>
              )}
              {isFailedSearchReplace && onRequestFullFilePrompt && (
                <button
                  onClick={onRequestFullFilePrompt}
                  disabled={isProcessing}
                  className="px-2.5 py-1 text-xs bg-sky-600 hover:bg-sky-500 text-white rounded-md disabled:opacity-50 flex items-center"
                  title="Generate prompt to request full file content for this and other failed search/replace blocks in this response"
                >
                  <ClipboardCopy size={12} className="mr-1" /> Request Full File
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* APPLIED_FAILED specific block (hard error during application) */}
      {change.applyStatus === ApplyItemStatus.APPLIED_FAILED && change.applyError && (
        <div className="my-2 p-2 bg-red-800/40 border border-red-600/50 rounded-md text-red-200 text-xs">
          <div className="flex items-start">
            <AlertTriangle size={16} className="mr-2 mt-0.5 shrink-0 text-red-400" />
            <p className="flex-grow">Apply Error: {change.applyError}</p>
          </div>
        </div>
      )}

      {showDiff &&
        !isReviewableState && // Don't show standard diff if it's a reviewable search/replace failure (custom UI above handles it)
        change.applyStatus !== ApplyItemStatus.SKIPPED_BY_USER &&
        change.applyStatus !== ApplyItemStatus.APPLIED_FAILED &&
        change.applyStatus !== ApplyItemStatus.USER_RESOLVED && // If user resolved, original diff might not be relevant
        (change.type === 'create' && change.path ? (
          <DiffDisplay filePath={change.path} newFileContent={(change as FileWriteChange).content} />
        ) : change.type === 'edit' && change.path ? (
          <DiffDisplay filePath={change.path} diffContent={(change as FileDiffChange).diffContent} />
        ) : null)}

      {change.type === 'message' && (
        <div className="mt-1 p-2 bg-neutral-700/50 rounded text-xs text-neutral-200 whitespace-pre-wrap border border-neutral-600">
          {(change as MessageChange).content}
        </div>
      )}
      {change.type === 'delete' &&
        change.applyStatus !== ApplyItemStatus.SKIPPED_BY_USER &&
        change.applyStatus !== ApplyItemStatus.APPLIED_FAILED &&
        change.applyStatus !== ApplyItemStatus.USER_RESOLVED && (
          <p className="mt-1 text-xs text-red-300">This file will be permanently deleted.</p>
        )}
      {change.type === 'request' &&
        change.applyStatus !== ApplyItemStatus.SKIPPED_BY_USER &&
        change.applyStatus !== ApplyItemStatus.APPLIED_FAILED &&
        change.applyStatus !== ApplyItemStatus.USER_RESOLVED && (
          <p className="mt-1 text-xs text-blue-300">The LLM requests the content of this file to proceed.</p>
        )}
    </div>
  );
};

export default ChangePreviewItem;
