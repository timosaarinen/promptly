// src/components/right-panel/ResponseBlock.tsx
import React from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import type { ProcessedResponseItem } from '@/store/atoms';
import type { ChangeWithApplyStatus, FileWriteChange, FileDiffChange } from '@/store/parseAtoms';
import { ApplyItemStatus } from '@/store/parseAtoms';
import PreviewDisplayArea from './PreviewDisplayArea';

interface ResponseBlockProps {
  responseItem: ProcessedResponseItem;
  isProcessingAction: boolean;
  onToggleExpand: (id: string) => void;
  onApplyChanges: (id: string) => void;
  onForceApplySingle: (itemId: string, change: ChangeWithApplyStatus) => Promise<void>;
  onSkipSingle: (itemId: string, change: ChangeWithApplyStatus) => Promise<void>;
  onMarkAsResolvedSingle: (itemId: string, change: ChangeWithApplyStatus) => Promise<void>;
  onCopySingle: (itemId: string, change: FileWriteChange | FileDiffChange) => Promise<void>;
  onRequestFullFilesPrompt?: (itemId: string) => void;
}

const ResponseBlock: React.FC<ResponseBlockProps> = ({
  responseItem,
  isProcessingAction,
  onToggleExpand,
  onApplyChanges,
  onForceApplySingle,
  onSkipSingle,
  onMarkAsResolvedSingle,
  onCopySingle,
  onRequestFullFilesPrompt,
}) => {
  const { id, displayState, parsedChanges, parseError, applicationStatusSummary, responseNumber } = responseItem;

  const handleApply = () => {
    onApplyChanges(id);
  };

  const countFileOps = (changes: ChangeWithApplyStatus[]) =>
    changes.filter((c) => c.type === 'create' || c.type === 'edit' || c.type === 'delete').length;

  const countMessages = (changes: ChangeWithApplyStatus[]) => changes.filter((c) => c.type === 'message').length;

  const countPlan = (changes: ChangeWithApplyStatus[]) => changes.filter((c) => c.type === 'plan').length;

  const countTimestamp = (changes: ChangeWithApplyStatus[]) => changes.filter((c) => c.type === 'timestamp').length;

  const canApply = parsedChanges.some((c) => c.applyStatus === ApplyItemStatus.VALIDATION_SUCCESS) && !parseError;

  const getSummaryText = () => {
    if (parseError) return 'Error parsing response';
    const fileOps = countFileOps(parsedChanges);
    const messages = countMessages(parsedChanges);
    const plans = countPlan(parsedChanges);
    const timestamps = countTimestamp(parsedChanges);

    const parts: string[] = [];
    if (timestamps > 0) parts.push('Timestamp');
    if (plans > 0) parts.push(`${plans} Plan${plans > 1 ? 's' : ''}`);
    if (fileOps > 0) parts.push(`${fileOps} File Op${fileOps > 1 ? 's' : ''}`);
    if (messages > 0) parts.push(`${messages} Message${messages > 1 ? 's' : ''}`);

    const summary = parts.length > 0 ? parts.join(' • ') : 'No actionable changes';
    const MAX_SUMMARY_LENGTH = 70;
    return summary.length > MAX_SUMMARY_LENGTH ? summary.substring(0, MAX_SUMMARY_LENGTH - 3) + '...' : summary;
  };

  return (
    <div className="my-2 border border-neutral-700 rounded-lg bg-neutral-800/60 shadow-md">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-neutral-700/50 rounded-t-lg"
        onClick={() => onToggleExpand(id)}
      >
        <div className="flex items-center min-w-0">
          {displayState === 'expanded' ? (
            <ChevronDown size={20} className="mr-2 shrink-0" />
          ) : (
            <ChevronRight size={20} className="mr-2 shrink-0" />
          )}
          <h4 className="text-md font-semibold text-neutral-100 mr-3 shrink-0">Response #{responseNumber}</h4>
          <span className="text-xs text-neutral-400 truncate" title={getSummaryText()}>
            {getSummaryText()}
          </span>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full shrink-0 ml-2 ${
            applicationStatusSummary === 'Pending'
              ? 'bg-yellow-600 text-yellow-100'
              : applicationStatusSummary.includes('Applied') || applicationStatusSummary.includes('applied')
                ? 'bg-green-600 text-green-100'
                : applicationStatusSummary === 'Parse Error'
                  ? 'bg-red-600 text-red-100'
                  : 'bg-neutral-600 text-neutral-200'
          }`}
        >
          {applicationStatusSummary}
        </span>
      </div>

      {displayState === 'expanded' && (
        <div className="p-3 border-t border-neutral-700">
          {parseError && (
            <div className="p-2 bg-red-900/50 text-red-300 rounded-md text-xs flex items-center mb-2">
              <AlertTriangle size={16} className="mr-2 shrink-0" />
              Parse Error: {parseError}
            </div>
          )}
          {!parseError && parsedChanges.length === 0 && (
            <p className="text-sm text-neutral-500 text-center py-2">No actionable changes found in this response.</p>
          )}

          {!parseError && parsedChanges.length > 0 && (
            <PreviewDisplayArea
              changesWithStatus={parsedChanges}
              isProcessing={isProcessingAction}
              error={null}
              rawInputTrimmed={responseItem.rawPastedXml.trim()}
              onForceApplySingle={(change) => onForceApplySingle(id, change)}
              onSkipSingle={(change) => onSkipSingle(id, change)}
              onMarkAsResolvedSingle={(change) => onMarkAsResolvedSingle(id, change)}
              onCopySingle={(change) => onCopySingle(id, change)}
              onRequestFullFilePromptForItem={onRequestFullFilesPrompt ? () => onRequestFullFilesPrompt(id) : undefined}
            />
          )}

          {!parseError && parsedChanges.length > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleApply}
                disabled={isProcessingAction || !canApply}
                className={`px-4 py-2 text-white rounded-md text-sm font-medium disabled:bg-neutral-700 disabled:cursor-not-allowed flex items-center justify-center
                  ${applicationStatusSummary === 'Review Needed' && canApply ? 'bg-orange-600 hover:bg-orange-500' : 'bg-green-600 hover:bg-green-500'}`}
              >
                {isProcessingAction ? (
                  <RefreshCw size={18} className="animate-spin mr-2" />
                ) : (
                  <CheckCircle size={18} className="mr-2" />
                )}
                {applicationStatusSummary === 'Review Needed' && canApply
                  ? 'Apply Pending & Review Others'
                  : 'Apply Valid Changes from This Response'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ResponseBlock;
