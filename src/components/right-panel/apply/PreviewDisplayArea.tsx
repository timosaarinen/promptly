// src/components/right-panel/PreviewDisplayArea.tsx
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileWriteChange,
  FileDiffChange,
  TimestampChange,
  PlanChange,
  MessageChange,
  ChangeWithApplyStatus,
  ApplyItemStatus,
} from '@/store/parseAtoms';
import ChangePreviewItem from './ChangePreviewItem';
import { CalendarClock, ListChecks } from 'lucide-react';

interface PreviewDisplayAreaProps {
  changesWithStatus: ChangeWithApplyStatus[];
  isProcessing: boolean;
  error: string | null; // General processing error
  rawInputTrimmed: string;
  onForceApplySingle?: (change: ChangeWithApplyStatus) => Promise<void>;
  onSkipSingle?: (change: ChangeWithApplyStatus) => Promise<void>;
  onMarkAsResolvedSingle?: (change: ChangeWithApplyStatus) => Promise<void>;
  onCopySingle: (change: FileWriteChange | FileDiffChange) => Promise<void>;
  onRequestFullFilePromptForItem?: () => void;
}

const PreviewDisplayArea: React.FC<PreviewDisplayAreaProps> = ({
  changesWithStatus,
  isProcessing,
  error,
  rawInputTrimmed,
  onForceApplySingle,
  onSkipSingle,
  onMarkAsResolvedSingle,
  onCopySingle,
  onRequestFullFilePromptForItem,
}) => {
  const timestampChanges = useMemo(
    () => changesWithStatus.filter((c) => c.type === 'timestamp') as (TimestampChange & ChangeWithApplyStatus)[],
    [changesWithStatus]
  );
  const planChanges = useMemo(
    () => changesWithStatus.filter((c) => c.type === 'plan') as (PlanChange & ChangeWithApplyStatus)[],
    [changesWithStatus]
  );
  const otherChanges = useMemo(
    () => changesWithStatus.filter((c) => c.type !== 'timestamp' && c.type !== 'plan'),
    [changesWithStatus]
  );

  if (isProcessing && changesWithStatus.length === 0 && !error) {
    // Still processing initial response, area is blank
  }

  if (!isProcessing && !error && changesWithStatus.length === 0) {
    if (rawInputTrimmed === '') {
      return (
        <p className="p-3 text-sm text-neutral-500 text-center">Paste LLM response and click "Process Response".</p>
      );
    }
    return (
      <p className="p-3 text-sm text-neutral-500 text-center">
        No changes to preview. Ensure the response contains valid operation tags.
      </p>
    );
  }

  return (
    <div className="mt-4 flex-grow overflow-y-auto border border-neutral-700 rounded-lg p-1 bg-neutral-950/30 min-h-[100px]">
      {timestampChanges.length > 0 && (
        <div className="p-2 mb-1 border-b border-neutral-800">
          {timestampChanges.map((changeItem, index) => (
            <div key={`ts-${index}`} className="text-xs text-neutral-400 flex items-center">
              <CalendarClock size={14} className="mr-1.5 shrink-0 text-neutral-500" />
              Context Timestamp: {changeItem.content}
            </div>
          ))}
        </div>
      )}

      {planChanges.length > 0 && (
        <div className="p-2 mb-1 ">
          {planChanges.map((changeItem, index) => (
            <div key={`plan-${index}`} className="text-sm text-neutral-300">
              <div className="flex items-center font-medium text-neutral-100 mb-1">
                <ListChecks size={16} className="mr-1.5 shrink-0" />
                Plan:
              </div>
              <div className="bg-neutral-800/50 p-2 rounded-md text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm prose-invert max-w-none">
                  {changeItem.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {otherChanges.length > 0 && <div className="my-2 border-b border-neutral-800"></div>}
        </div>
      )}

      {otherChanges.length > 0 && !error
        ? otherChanges.map((changeItem, index) => {
            const keySuffix = changeItem.path
              ? changeItem.path
              : `message-${(changeItem as MessageChange).content.substring(0, 20)}`;
            const key = `${changeItem.type}-${keySuffix}-${index}`;

            const canApplyOrCopy = changeItem.type === 'create' || changeItem.type === 'edit';

            return (
              <ChangePreviewItem
                key={key}
                change={changeItem}
                onForceApply={
                  changeItem.applyStatus === ApplyItemStatus.VALIDATION_FAILED_NO_FILE && onForceApplySingle
                    ? () => onForceApplySingle(changeItem)
                    : undefined
                }
                onSkip={
                  (changeItem.applyStatus === ApplyItemStatus.VALIDATION_FAILED_NO_FILE ||
                    changeItem.applyStatus === ApplyItemStatus.VALIDATION_FAILED_SEARCH_NOT_FOUND ||
                    changeItem.applyStatus === ApplyItemStatus.VALIDATION_FAILED_IDENTICAL_CONTENT) &&
                  onSkipSingle
                    ? () => onSkipSingle(changeItem)
                    : undefined
                }
                onMarkAsResolved={
                  (changeItem.applyStatus === ApplyItemStatus.VALIDATION_FAILED_SEARCH_NOT_FOUND ||
                    changeItem.applyStatus === ApplyItemStatus.VALIDATION_FAILED_IDENTICAL_CONTENT) &&
                  onMarkAsResolvedSingle
                    ? () => onMarkAsResolvedSingle(changeItem)
                    : undefined
                }
                onCopySingle={canApplyOrCopy ? onCopySingle : undefined}
                onRequestFullFilePrompt={
                  changeItem.type === 'edit' &&
                  (changeItem as FileDiffChange).diffType === 'search-replace' &&
                  (changeItem.applyStatus === ApplyItemStatus.VALIDATION_FAILED_SEARCH_NOT_FOUND ||
                    changeItem.applyStatus === ApplyItemStatus.VALIDATION_FAILED_IDENTICAL_CONTENT) &&
                  onRequestFullFilePromptForItem
                    ? onRequestFullFilePromptForItem
                    : undefined
                }
                isProcessing={isProcessing}
              />
            );
          })
        : null}
    </div>
  );
};

export default PreviewDisplayArea;
