// src/components/right-panel/ApplyPanel.tsx
//
// IMPORTANT NOTE:
//   A single LLM response item can contain multiple distinct change operations
//   targeting the SAME file. For example, there could be several <file-replace-block>
//   entries for "src/utils/api.ts".
//
import { useAtom } from 'jotai';
import {
  activeLlmResponseInputAtom,
  isAddingNewResponseAtom,
  processedResponsesStackAtom,
  ProcessedResponseItem,
  commitMessageAtom,
  processPastedResponseTriggerAtom,
  triggerApplyAllValidChangesTriggerAtom,
} from '@/store/atoms';
import {
  ParsedChange,
  FileDiffChange,
  FileWriteChange,
  MessageChange,
  ChangeWithApplyStatus,
  ApplyItemStatus,
} from '@/store/parseAtoms';
import { PlusCircle, Trash2 } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { extractResponseXml, parseResponseXmlContent } from '@/utils/llmResponseParser';
import { useToast } from '@/hooks/useToast';
import { getErrorMessage } from '@/utils/errorUtils';
import { applySearchReplaceBlock, validateSearchTextTolerantly } from '@/utils/diffUtils';
import { parsePatch, applyPatch, StructuredPatch } from 'diff';
import ResponseInputArea from './ResponseInputArea';
import ResponseBlock from './ResponseBlock';
import { electronApi } from '@shared/electron-api';
import { normalizeLineFeeds } from '@/utils/pathUtils';

export default function ApplyPanel() {
  const [activeInput, setActiveInput] = useAtom(activeLlmResponseInputAtom);
  const [isAddingNew, setIsAddingNew] = useAtom(isAddingNewResponseAtom);
  const [responsesStack, setResponsesStack] = useAtom(processedResponsesStackAtom);
  const [isProcessingGlobal, setIsProcessingGlobal] = useState(false);
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);
  const [_commitMessageFromAtom, setCommitMessage] = useAtom(commitMessageAtom);
  const { showToast } = useToast();
  const processPastedTrigger = useAtomValue(processPastedResponseTriggerAtom);
  const applyAllTrigger = useAtomValue(triggerApplyAllValidChangesTriggerAtom);

  useEffect(() => {
    if (processPastedTrigger > 0 && activeInput) {
      if (responsesStack.length === 0 || isAddingNew) {
        handleProcessInitialResponse();
      } else {
        handleProcessFollowUpResponse();
      }
    }
  }, [processPastedTrigger]);

  useEffect(() => {
    if (applyAllTrigger > 0) {
      handleApplyAllValidChangesInStack();
    }
  }, [applyAllTrigger]);

  const calculateApplicationStatusSummary = useCallback((changes: ChangeWithApplyStatus[]): string => {
    if (!changes || changes.length === 0) return 'No Changes';

    const fileOps = changes.filter((c) => c.type === 'create' || c.type === 'edit' || c.type === 'delete');
    if (fileOps.length === 0) {
      if (changes.some((c) => c.type === 'plan' || c.type === 'message' || c.type === 'timestamp')) return 'Meta Only';
      return 'No File Changes';
    }

    const totalApplied = fileOps.filter(
      (c) => c.applyStatus === ApplyItemStatus.APPLIED_SUCCESS || c.applyStatus === ApplyItemStatus.USER_RESOLVED
    ).length;
    const totalSkipped = fileOps.filter((c) => c.applyStatus === ApplyItemStatus.SKIPPED_BY_USER).length;
    const totalFailed = fileOps.filter((c) => c.applyStatus === ApplyItemStatus.APPLIED_FAILED).length;

    const isPendingReview = fileOps.some(
      (c) =>
        c.applyStatus === ApplyItemStatus.VALIDATION_FAILED_NO_FILE ||
        c.applyStatus === ApplyItemStatus.VALIDATION_FAILED_SEARCH_NOT_FOUND ||
        c.applyStatus === ApplyItemStatus.VALIDATION_FAILED_IDENTICAL_CONTENT ||
        c.applyStatus === ApplyItemStatus.VALIDATION_TOLERANT_MATCH_PENDING_STRICT_APPLY
    );

    const totalValidatablePreResolution = fileOps.filter(
      (c) =>
        c.applyStatus === ApplyItemStatus.VALIDATION_SUCCESS ||
        c.applyStatus === ApplyItemStatus.VALIDATION_FAILED_NO_FILE ||
        c.applyStatus === ApplyItemStatus.VALIDATION_FAILED_SEARCH_NOT_FOUND ||
        c.applyStatus === ApplyItemStatus.VALIDATION_FAILED_IDENTICAL_CONTENT ||
        c.applyStatus === ApplyItemStatus.VALIDATION_TOLERANT_MATCH_PENDING_STRICT_APPLY
    ).length;

    if (isPendingReview) return 'Review Needed';

    if (fileOps.length > 0) {
      if (
        totalValidatablePreResolution === fileOps.length &&
        totalApplied === 0 &&
        totalSkipped === 0 &&
        totalFailed === 0
      )
        return 'Pending';
      if (totalApplied === fileOps.length) return 'All Applied';
      if (totalApplied > 0 && totalApplied + totalSkipped === fileOps.length) return 'Applied & Skipped';
      if (totalFailed > 0) return `Applied ${totalApplied}/${fileOps.length} (Errors: ${totalFailed})`;
      if (totalApplied > 0) return `Applied ${totalApplied}/${fileOps.length}`;
      if (totalSkipped === fileOps.length) return 'All Skipped';
    }
    return 'Review Needed';
  }, []);

  const validateChangeItem = useCallback(async (item: ParsedChange): Promise<ChangeWithApplyStatus> => {
    if (item.type === 'create' || item.type === 'edit' || item.type === 'delete') {
      if (!item.path) {
        console.error('Validation Error: File operation missing path', item);
        return {
          ...item,
          applyStatus: ApplyItemStatus.APPLIED_FAILED,
          applyError: 'Path is missing.',
        };
      }

      const fileExistsOnDisk = await electronApi.fileExists(item.path);

      if (item.type === 'edit') {
        if (!fileExistsOnDisk) {
          return { ...item, applyStatus: ApplyItemStatus.VALIDATION_FAILED_NO_FILE };
        }
        // Proactive validation for search/replace blocks
        const editOp = item as FileDiffChange;
        if (
          editOp.diffType == 'search-replace' &&
          editOp.searchText !== undefined &&
          editOp.replaceText !== undefined
        ) {
          try {
            const currentContent = normalizeLineFeeds(await electronApi.readFile(editOp.path!));
            const dryRunResult = applySearchReplaceBlock(currentContent, editOp.searchText, editOp.replaceText);

            if (!dryRunResult.success) {
              if (dryRunResult.errorType === 'search_not_found') {
                // Strict match failed, try tolerant match
                const tolerantMatch = validateSearchTextTolerantly(currentContent, editOp.searchText);
                if (tolerantMatch.isMatch) {
                  return {
                    ...item,
                    applyStatus: ApplyItemStatus.VALIDATION_TOLERANT_MATCH_PENDING_STRICT_APPLY,
                    applyError: tolerantMatch.reason || 'Tolerant match found, strict apply will be attempted.',
                    failedSearchText: editOp.searchText, // Keep these for UI display
                    failedReplaceText: editOp.replaceText,
                  };
                } else {
                  // Both strict and tolerant match failed
                  return {
                    ...item,
                    applyStatus: ApplyItemStatus.VALIDATION_FAILED_SEARCH_NOT_FOUND,
                    applyError: 'The specified search block was not found in the file (strict and tolerant checks).',
                    failedSearchText: editOp.searchText,
                    failedReplaceText: editOp.replaceText,
                  };
                }
              } else if (dryRunResult.errorType === 'identical_content') {
                return {
                  ...item,
                  applyStatus: ApplyItemStatus.VALIDATION_FAILED_IDENTICAL_CONTENT,
                  applyError: 'The search text and replace text are identical. No change needed.',
                  failedSearchText: editOp.searchText,
                  failedReplaceText: editOp.replaceText,
                };
              }
            }
            // If dry run is successful, it's VALIDATION_SUCCESS
            return { ...item, applyStatus: ApplyItemStatus.VALIDATION_SUCCESS };
          } catch (e) {
            console.error(`Error during proactive validation of ${editOp.path}:`, e);
            return {
              ...item,
              applyStatus: ApplyItemStatus.APPLIED_FAILED,
              applyError: `Error reading file for validation: ${getErrorMessage(e)}`,
            };
          }
        }
        // If not isSearchReplace or doesn't have searchText/replaceText, it's a standard diff or malformed
        // For standard diffs, VALIDATION_SUCCESS is appropriate if file exists.
        return { ...item, applyStatus: ApplyItemStatus.VALIDATION_SUCCESS };
      } else if (item.type === 'delete') {
        if (!fileExistsOnDisk) {
          return { ...item, applyStatus: ApplyItemStatus.VALIDATION_FAILED_NO_FILE };
        }
        return { ...item, applyStatus: ApplyItemStatus.VALIDATION_SUCCESS };
      } else if (item.type === 'create') {
        // For 'create', fileExistsOnDisk might be true (overwrite) or false (new).
        // VALIDATION_SUCCESS is generally appropriate here, actual overwrite handled during apply.
        return { ...item, applyStatus: ApplyItemStatus.VALIDATION_SUCCESS };
      }
    }
    // For non-file-op types like 'message', 'plan', 'timestamp'
    return { ...item, applyStatus: ApplyItemStatus.VALIDATION_SUCCESS };
  }, []);

  const processAndAddResponse = useCallback(
    async (inputXml: string, isFollowUp: boolean) => {
      setIsProcessingGlobal(true);
      const xmlToParse = extractResponseXml(inputXml);
      let newParsedChanges: ChangeWithApplyStatus[] = [];
      let currentParseError: string | null = null;

      if (xmlToParse.trim() === '' && inputXml.trim() !== '') {
        currentParseError = 'The <response> block is empty. No changes to process.';
      } else {
        try {
          const parsedBaseItems = parseResponseXmlContent(xmlToParse);
          if (parsedBaseItems.length === 0 && xmlToParse.trim() !== '') {
            currentParseError = 'Response processed, but no actionable changes found in the <response> block.';
          } else {
            newParsedChanges = await Promise.all(parsedBaseItems.map((item) => validateChangeItem(item)));
          }
        } catch (e) {
          currentParseError = getErrorMessage(e, 'An unknown error occurred during parsing or validation.');
        }
      }

      const newItem: ProcessedResponseItem = {
        id: crypto.randomUUID(),
        rawPastedXml: inputXml,
        parsedChanges: newParsedChanges,
        parseError: currentParseError,
        displayState: 'expanded',
        applicationStatusSummary: currentParseError
          ? 'Parse Error'
          : calculateApplicationStatusSummary(newParsedChanges),
        timestamp: Date.now(),
        responseNumber: responsesStack.length + 1,
      };

      setResponsesStack((prevStack) => {
        const updatedStack = prevStack.map((item) => ({
          ...item,
          displayState: 'collapsed' as const,
        }));
        return [...updatedStack, newItem];
      });

      setActiveInput('');
      if (isFollowUp) setIsAddingNew(false);
      setIsProcessingGlobal(false);
      if (currentParseError) showToast(currentParseError, 'error');
    },
    [
      responsesStack.length,
      setActiveInput,
      setIsAddingNew,
      setResponsesStack,
      showToast,
      validateChangeItem,
      calculateApplicationStatusSummary,
    ]
  );

  const handleProcessInitialResponse = () => processAndAddResponse(activeInput, false);
  const handleProcessFollowUpResponse = () => {
    if (responsesStack.length > 0) {
      const lastItem = responsesStack[responsesStack.length - 1];
      if (
        lastItem &&
        lastItem.parsedChanges.some(
          (c) =>
            c.applyStatus === ApplyItemStatus.VALIDATION_SUCCESS ||
            c.applyStatus === ApplyItemStatus.VALIDATION_FAILED_NO_FILE ||
            c.applyStatus === ApplyItemStatus.VALIDATION_TOLERANT_MATCH_PENDING_STRICT_APPLY
        )
      ) {
        showToast(`Response #${lastItem.responseNumber} has unapplied changes. Proceeding with new response.`, 'info');
      }
    }
    processAndAddResponse(activeInput, true);
  };

  const handleClearInitialInput = () => setActiveInput('');
  const handleCancelFollowUpInput = () => {
    setActiveInput('');
    setIsAddingNew(false);
  };

  const handleAddAnotherResponseClick = () => setIsAddingNew(true);

  const handleClearAllResponses = () => {
    if (window.confirm('Are you sure you want to clear all processed responses? This action cannot be undone.')) {
      setResponsesStack([]);
      setActiveInput('');
      setIsAddingNew(false);
      setCommitMessage('');
      showToast('All responses cleared.', 'info');
    }
  };

  const handleToggleExpandItem = (itemId: string) => {
    setResponsesStack((prevStack) =>
      prevStack.map((item) =>
        item.id === itemId
          ? {
              ...item,
              displayState: item.displayState === 'expanded' ? 'collapsed' : 'expanded',
            }
          : { ...item, displayState: 'collapsed' as const }
      )
    );
  };

  const applySingleChangeInternal = useCallback(
    async (changeToApply: ChangeWithApplyStatus, _force: boolean): Promise<ChangeWithApplyStatus> => {
      if (
        !changeToApply.path &&
        (changeToApply.type === 'create' || changeToApply.type === 'edit' || changeToApply.type === 'delete')
      ) {
        return {
          ...changeToApply,
          applyStatus: ApplyItemStatus.APPLIED_FAILED,
          applyError: 'Path is missing for file operation.',
        };
      }

      try {
        if (changeToApply.type === 'delete' && changeToApply.path) {
          await electronApi.deleteFile(changeToApply.path);
          showToast(`Deleted: ${changeToApply.path}`, 'success');
          return {
            ...changeToApply,
            applyStatus: ApplyItemStatus.APPLIED_SUCCESS,
          };
        } else if (changeToApply.type === 'create' && changeToApply.path) {
          const currentContent = (changeToApply as FileWriteChange).content;
          await electronApi.writeFile(changeToApply.path!, currentContent);
          showToast(`Write: ${changeToApply.path}`, 'success');
          return {
            ...changeToApply,
            applyStatus: ApplyItemStatus.APPLIED_SUCCESS,
          };
        } else if (changeToApply.type === 'edit' && changeToApply.path) {
          let currentContent = normalizeLineFeeds(await electronApi.readFile(changeToApply.path!));
          const editOp = changeToApply as FileDiffChange;

          if (
            editOp.diffType == 'search-replace' &&
            editOp.searchText !== undefined &&
            editOp.replaceText !== undefined
          ) {
            const applyResult = applySearchReplaceBlock(currentContent, editOp.searchText, editOp.replaceText);
            if (applyResult.success) {
              currentContent = applyResult.content;
            } else if (applyResult.errorType === 'search_not_found') {
              showToast(`Search text not found for ${editOp.path}. Manual review needed.`, 'warning');
              return {
                ...changeToApply,
                applyStatus: ApplyItemStatus.VALIDATION_FAILED_SEARCH_NOT_FOUND, // Status reflects strict failure now
                applyError: `The specified search block was not found in the file.`,
                failedSearchText: editOp.searchText,
                failedReplaceText: editOp.replaceText,
              };
            } else if (applyResult.errorType === 'identical_content') {
              showToast(`Search and replace text are identical for ${editOp.path}. No change applied.`, 'info');
              return {
                ...changeToApply,
                applyStatus: ApplyItemStatus.VALIDATION_FAILED_IDENTICAL_CONTENT,
                applyError: `The search text and replace text are identical. No change made. Consider if <file-write> is more appropriate.`,
                failedSearchText: editOp.searchText,
                failedReplaceText: editOp.replaceText,
              };
            }
          } else {
            // TODO: <file-diff>, Unified diff application
            const normalizedDiff = normalizeLineFeeds(editOp.diffContent);
            if (normalizedDiff.trim() !== '') {
              const patches: StructuredPatch[] = parsePatch(normalizedDiff);
              if (patches.length > 0 && patches[0] && patches[0].hunks && patches[0].hunks.length > 0) {
                const patchResult = applyPatch(currentContent, patches[0]);
                if (patchResult === false) throw new Error(`Patch failed to apply for ${editOp.path}.`);
                currentContent = patchResult;
              } else if (normalizedDiff.trim() !== '') {
                throw new Error(
                  `Invalid diff format or empty patch for ${editOp.path}. Diff: ${normalizedDiff.substring(0, 100)}`
                );
              }
            }
          }
          await electronApi.writeFile(changeToApply.path!, currentContent);
          showToast(`Updated: ${editOp.path}`, 'success');
          return {
            ...changeToApply,
            applyStatus: ApplyItemStatus.APPLIED_SUCCESS,
          };
        } else if (
          changeToApply.type === 'message' ||
          changeToApply.type === 'request' ||
          changeToApply.type === 'timestamp' ||
          changeToApply.type === 'plan'
        ) {
          if (changeToApply.type === 'message')
            showToast(`LLM Message: ${(changeToApply as MessageChange).content.substring(0, 100)}...`, 'info');
          if (changeToApply.type === 'request' && changeToApply.path)
            showToast(`LLM Request: Content for ${changeToApply.path}`, 'info');
          return {
            ...changeToApply,
            applyStatus: ApplyItemStatus.APPLIED_SUCCESS,
          };
        }
        return {
          ...changeToApply,
          applyStatus: ApplyItemStatus.APPLIED_FAILED,
          applyError: 'Unknown operation type for apply.',
        };
      } catch (e) {
        const errorMsg = getErrorMessage(e);
        showToast(`Error applying change to ${changeToApply.path || 'item'}: ${errorMsg}`, 'error');
        return {
          ...changeToApply,
          applyStatus: ApplyItemStatus.APPLIED_FAILED,
          applyError: errorMsg,
        };
      }
    },
    [showToast]
  );

  const handleApplyChangesFromResponseItem = useCallback(
    async (itemId: string) => {
      setProcessingItemId(itemId);
      const itemIndex = responsesStack.findIndex((item) => item.id === itemId);
      if (itemIndex === -1) {
        setProcessingItemId(null);
        return;
      }

      const currentItem = responsesStack[itemIndex];
      const changesToProcess = [...currentItem.parsedChanges]; // Operate on a copy
      const appliedPathsThisRun: string[] = [];

      for (let i = 0; i < changesToProcess.length; i++) {
        const change = changesToProcess[i];
        if (
          change.applyStatus === ApplyItemStatus.VALIDATION_SUCCESS ||
          change.applyStatus === ApplyItemStatus.VALIDATION_TOLERANT_MATCH_PENDING_STRICT_APPLY
        ) {
          const resultChange = await applySingleChangeInternal(change, false);
          changesToProcess[i] = resultChange;
          if (
            resultChange.applyStatus === ApplyItemStatus.APPLIED_SUCCESS &&
            resultChange.path &&
            (resultChange.type === 'create' || resultChange.type === 'edit' || resultChange.type === 'delete')
          ) {
            appliedPathsThisRun.push(resultChange.path);
          }
          if (
            resultChange.type === 'message' &&
            (resultChange as MessageChange).purpose === 'commit' &&
            resultChange.applyStatus === ApplyItemStatus.APPLIED_SUCCESS
          ) {
            // TODO: how do we determine the "best" commit message from multiple responses? Now set the first one, as most likely contains full message.
            if (_commitMessageFromAtom.length == 0) setCommitMessage((resultChange as MessageChange).content);
          }
        }
      }

      setResponsesStack((prevStack) =>
        prevStack.map((item) => {
          if (item.id === itemId) {
            const itemFullyResolvedAndApplied =
              changesToProcess
                .filter((c) => c.type === 'create' || c.type === 'edit' || c.type === 'delete')
                .every(
                  (c) =>
                    c.applyStatus === ApplyItemStatus.APPLIED_SUCCESS ||
                    c.applyStatus === ApplyItemStatus.SKIPPED_BY_USER
                ) && appliedPathsThisRun.length > 0;

            return {
              ...item,
              parsedChanges: changesToProcess,
              applicationStatusSummary: calculateApplicationStatusSummary(changesToProcess),
              displayState: itemFullyResolvedAndApplied ? ('collapsed' as const) : item.displayState,
            };
          }
          return item;
        })
      );

      const allActionableResolved = changesToProcess
        .filter((c) => c.type === 'create' || c.type === 'edit' || c.type === 'delete')
        .every(
          (c) => c.applyStatus === ApplyItemStatus.APPLIED_SUCCESS || c.applyStatus === ApplyItemStatus.SKIPPED_BY_USER
        );
      const anyFileOpsApplied = appliedPathsThisRun.length > 0;
      const itemFullyResolvedAndAppliedToast = allActionableResolved && anyFileOpsApplied;

      if (itemFullyResolvedAndAppliedToast) {
        showToast(`Response #${currentItem.responseNumber}: All changes applied/skipped. Collapsed.`, 'success');
      } else if (anyFileOpsApplied) {
        showToast(
          `Applied ${appliedPathsThisRun.length} changes from Response #${currentItem.responseNumber}. Some items may require attention.`,
          'warning'
        );
      } else if (
        changesToProcess.some(
          (c) =>
            c.applyStatus === ApplyItemStatus.APPLIED_FAILED ||
            c.applyStatus === ApplyItemStatus.VALIDATION_FAILED_SEARCH_NOT_FOUND
        )
      ) {
        showToast(
          `No changes applied from Response #${currentItem.responseNumber}. Review items with errors.`,
          'warning'
        );
      } else {
        showToast(`No changes applied from Response #${currentItem.responseNumber} or all were skipped/meta.`, 'info');
      }

      setProcessingItemId(null);
    },
    [
      responsesStack,
      setResponsesStack,
      applySingleChangeInternal,
      showToast,
      calculateApplicationStatusSummary,
      _commitMessageFromAtom,
      setCommitMessage,
    ]
  );

  const handleApplyAllValidChangesInStack = useCallback(async () => {
    if (responsesStack.length === 0) {
      showToast('No responses to apply changes from.', 'info');
      return;
    }

    let appliedAnyChange = false;
    for (const item of responsesStack) {
      // Check if this item has changes that can be applied
      const canApplyFromThisItem = item.parsedChanges.some(
        (c) =>
          c.applyStatus === ApplyItemStatus.VALIDATION_SUCCESS ||
          c.applyStatus === ApplyItemStatus.VALIDATION_TOLERANT_MATCH_PENDING_STRICT_APPLY
      );
      if (canApplyFromThisItem) {
        await handleApplyChangesFromResponseItem(item.id);
        // Check if any changes were actually successful after the attempt
        const updatedItem = responsesStack.find((i) => i.id === item.id); // Re-fetch from potentially updated stack
        if (updatedItem?.parsedChanges.some((c) => c.applyStatus === ApplyItemStatus.APPLIED_SUCCESS)) {
          appliedAnyChange = true;
        }
      }
    }

    if (appliedAnyChange) {
      showToast('Attempted to apply all valid changes across responses.', 'success');
    } else {
      showToast('No pending valid changes found to apply across responses.', 'info');
    }
  }, [responsesStack, handleApplyChangesFromResponseItem, showToast]);

  const updateItemAfterSingleAction = useCallback(
    (itemId: string, updatedChange: ChangeWithApplyStatus) => {
      setResponsesStack((prevStack) =>
        prevStack.map((item) => {
          if (item.id === itemId) {
            const newChanges = item.parsedChanges.map((pc) => {
              // Default: no match
              let isMatch = false;

              if (pc.type === 'message' && updatedChange.type === 'message') {
                // Match messages by content
                isMatch = (pc as MessageChange).content === (updatedChange as MessageChange).content;
              } else if (
                pc.type === 'edit' &&
                updatedChange.type === 'edit' &&
                (pc as FileDiffChange).diffType === 'search-replace' &&
                (updatedChange as FileDiffChange).diffType === 'search-replace'
              ) {
                // For search-replace blocks, match specifically on path, type, and search/replace content
                const pcEdit = pc as FileDiffChange;
                const updatedChangeEdit = updatedChange as FileDiffChange;
                isMatch =
                  pcEdit.path === updatedChangeEdit.path &&
                  pcEdit.searchText === updatedChangeEdit.searchText &&
                  pcEdit.replaceText === updatedChangeEdit.replaceText;
              } else if (pc.path && updatedChange.path) {
                // General file ops (create, delete, non-search-replace edit) match by path and type
                isMatch = pc.path === updatedChange.path && pc.type === updatedChange.type;
              }
              // Other types like 'plan', 'timestamp', 'request' might need specific identifiers if they can be individually acted upon.
              // For now, assuming they are not individually targetable by these single-item actions or are unique enough.

              return isMatch ? updatedChange : pc;
            });
            return {
              ...item,
              parsedChanges: newChanges,
              applicationStatusSummary: calculateApplicationStatusSummary(newChanges),
            };
          }
          return item;
        })
      );
    },
    [setResponsesStack, calculateApplicationStatusSummary]
  );

  const handleForceApplySingleInItem = useCallback(
    async (itemId: string, change: ChangeWithApplyStatus) => {
      setProcessingItemId(itemId);
      const resultChange = await applySingleChangeInternal(change, true);
      updateItemAfterSingleAction(itemId, resultChange);
      setProcessingItemId(null);
    },
    [applySingleChangeInternal, updateItemAfterSingleAction]
  );

  const handleMarkAsResolvedSingleInItem = useCallback(
    async (itemId: string, change: ChangeWithApplyStatus) => {
      setProcessingItemId(itemId);
      const resolvedChange = {
        ...change,
        applyStatus: ApplyItemStatus.USER_RESOLVED,
        applyError: change.applyError
          ? `${change.applyError} (Manually resolved by user)`
          : 'Manually resolved by user',
      };
      updateItemAfterSingleAction(itemId, resolvedChange);
      showToast(
        `Marked change for ${change.path || 'item'} as resolved in Response #${responsesStack.find((r) => r.id === itemId)?.responseNumber}`,
        'info'
      );
      setProcessingItemId(null);
    },
    [responsesStack, showToast, updateItemAfterSingleAction]
  );

  const handleSkipSingleInItem = useCallback(
    async (itemId: string, change: ChangeWithApplyStatus) => {
      setProcessingItemId(itemId);
      const skippedChange = {
        ...change,
        applyStatus: ApplyItemStatus.SKIPPED_BY_USER,
      };
      updateItemAfterSingleAction(itemId, skippedChange);
      showToast(
        `Skipped change for ${change.path || 'item'} in Response #${responsesStack.find((r) => r.id === itemId)?.responseNumber}`,
        'info'
      );
      setProcessingItemId(null);
    },
    [responsesStack, showToast, updateItemAfterSingleAction]
  );

  const handleCopySingleChangeInItem = useCallback(
    async (itemId: string, change: FileWriteChange | FileDiffChange) => {
      setProcessingItemId(itemId);
      let contentToCopy = '';
      let typeOfContent = '';
      if (change.type === 'create') {
        contentToCopy = change.content;
        typeOfContent = 'full file content';
      } else if (change.type === 'edit') {
        contentToCopy = change.diffContent;
        typeOfContent = 'diff content';
      }

      if (contentToCopy) {
        try {
          await electronApi.copyToClipboard(contentToCopy);
          showToast(
            `Copied ${typeOfContent} for ${change.path} (Rsp #${responsesStack.find((r) => r.id === itemId)?.responseNumber}) to clipboard.`,
            'success'
          );
        } catch (e) {
          showToast(`Error copying: ${getErrorMessage(e)}`, 'error');
        }
      }
      setProcessingItemId(null);
    },
    [responsesStack, showToast]
  );

  const handleRequestFullFilesPrompt = useCallback(
    async (itemId: string) => {
      const item = responsesStack.find((r) => r.id === itemId);
      if (!item) {
        showToast('Could not find the response item.', 'error');
        return;
      }

      const failedReplacePaths = new Set<string>();
      item.parsedChanges.forEach((change) => {
        if (
          change.type === 'edit' &&
          (change as FileDiffChange).diffType === 'search-replace' &&
          (change.applyStatus === ApplyItemStatus.VALIDATION_FAILED_SEARCH_NOT_FOUND ||
            change.applyStatus === ApplyItemStatus.VALIDATION_FAILED_IDENTICAL_CONTENT ||
            change.applyStatus === ApplyItemStatus.VALIDATION_TOLERANT_MATCH_PENDING_STRICT_APPLY) && // Include tolerant matches as they might still fail strict apply
          change.path
        ) {
          failedReplacePaths.add(change.path);
        }
      });

      if (failedReplacePaths.size === 0) {
        showToast('No failed search/replace blocks found in this response item to request full files for.', 'info');
        return;
      }

      const pathsList = Array.from(failedReplacePaths).join('\n');
      const promptText = `Search-replace failed for the following files. Please provide their full content as <file-write> blocks:\n${pathsList}`;

      try {
        await electronApi.copyToClipboard(promptText);
        showToast(
          `Prompt to request full files for ${failedReplacePaths.size} path(s) copied to clipboard.`,
          'success'
        );
      } catch (e) {
        showToast(`Error copying prompt: ${getErrorMessage(e)}`, 'error');
      }
    },
    [responsesStack, showToast]
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-3 shrink-0">
        <h3 className="text-lg font-medium text-neutral-100">Apply LLM Response(s)</h3>
        {responsesStack.length > 0 && (
          <div className="flex space-x-2">
            <button
              onClick={handleAddAnotherResponseClick}
              disabled={isAddingNew || isProcessingGlobal || !!processingItemId}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-md text-xs font-medium disabled:bg-neutral-700 disabled:cursor-not-allowed flex items-center"
            >
              <PlusCircle size={14} className="mr-1.5" /> Add LLM Response
            </button>
            <button
              onClick={handleClearAllResponses}
              disabled={isProcessingGlobal || !!processingItemId}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded-md text-xs font-medium disabled:bg-neutral-700 disabled:cursor-not-allowed flex items-center"
            >
              <Trash2 size={14} className="mr-1.5" /> Clear All
            </button>
          </div>
        )}
      </div>

      {responsesStack.length === 0 && !isAddingNew && (
        <ResponseInputArea
          inputValue={activeInput}
          onInputChange={setActiveInput}
          onProcess={handleProcessInitialResponse}
          onCancel={handleClearInitialInput}
          isProcessing={isProcessingGlobal}
          mode="initial"
        />
      )}

      {responsesStack.length > 0 && (
        <div className="flex-grow overflow-y-auto -mx-1 px-1">
          {responsesStack.map((item) => (
            <ResponseBlock
              key={item.id}
              responseItem={item}
              isProcessingAction={processingItemId === item.id}
              onToggleExpand={handleToggleExpandItem}
              onApplyChanges={handleApplyChangesFromResponseItem}
              onForceApplySingle={handleForceApplySingleInItem}
              onSkipSingle={handleSkipSingleInItem}
              onMarkAsResolvedSingle={handleMarkAsResolvedSingleInItem}
              onCopySingle={handleCopySingleChangeInItem}
              onRequestFullFilesPrompt={handleRequestFullFilesPrompt}
            />
          ))}
        </div>
      )}

      {isAddingNew && (
        <div className="mt-auto pt-2 shrink-0">
          <ResponseInputArea
            inputValue={activeInput}
            onInputChange={setActiveInput}
            onProcess={handleProcessFollowUpResponse}
            onCancel={handleCancelFollowUpInput}
            isProcessing={isProcessingGlobal}
            mode="follow-up"
            title="Add Follow-Up LLM Response"
          />
        </div>
      )}
    </div>
  );
}
