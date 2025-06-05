// src/components/right-panel/DiffDisplay.tsx
import React, { useEffect, useState } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { parsePatch, applyPatch, StructuredPatch } from 'diff';
import { getErrorMessage } from '@/utils/errorUtils';
import { useToast } from '@/hooks/useToast';
import { parseSearchReplaceBlock, applySearchReplaceBlock } from '@/utils/diffUtils';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { electronApi } from '@shared/electron-api';
import { normalizeLineFeeds } from '@/utils/pathUtils';

interface DiffDisplayProps {
  filePath: string;
  diffContent?: string; // For 'edit' type changes (actual diff content)
  newFileContent?: string; // For 'create' type changes (full new file content)
}

const DiffDisplay: React.FC<DiffDisplayProps> = ({ filePath, diffContent, newFileContent }) => {
  const [oldCode, setOldCode] = useState<string | null>(null);
  const [newCodeState, setNewCodeState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (diffContent === undefined && newFileContent === undefined) {
      setError('DiffDisplay requires either diffContent or newFileContent.');
      setIsLoading(false);
      return;
    }
    if (diffContent !== undefined && newFileContent !== undefined) {
      setError('DiffDisplay received both diffContent and newFileContent. Specify only one.');
      setIsLoading(false);
      return;
    }

    let mounted = true;

    async function fetchAndProcess() {
      if (!mounted) return;
      setIsLoading(true);
      setError(null);
      setOldCode(null);
      setNewCodeState(null);

      let originalContent = '';
      let calculatedNewCode = '';

      try {
        if (await electronApi.fileExists(filePath)) {
          const origResult = await electronApi.readFile(filePath);
          originalContent = normalizeLineFeeds(origResult);
        } else {
          // File doesn't exist or error reading.
          // If newFileContent is provided (create/overwrite mode), treat original as empty.
          // If diffContent is provided (edit mode), this is an error because we can't patch a non-existent/unreadable file.
          if (newFileContent !== undefined) {
            originalContent = '';
          } else {
            throw new Error(`Failed to read file ${filePath} for diffing`);
          }
        }

        if (!mounted) return;
        setOldCode(originalContent);

        if (newFileContent !== undefined) {
          calculatedNewCode = newFileContent;
        } else if (diffContent !== undefined) {
          // Try search-replace block first
          const replaceBlock = parseSearchReplaceBlock(diffContent);
          if (replaceBlock) {
            const applyResult = applySearchReplaceBlock(
              originalContent,
              replaceBlock.searchText,
              replaceBlock.replaceText
            );
            if (applyResult.success) {
              calculatedNewCode = applyResult.content;
            } else {
              // Handle preview failure for search-replace block without throwing a generic error or toasting.
              let previewErrorMsg = `Preview Error: Search text for replace block not found in ${filePath}. File may have changed.`;
              if (applyResult.errorType === 'identical_content') {
                previewErrorMsg = `Preview Error: Search and replace text are identical for ${filePath}. No change to preview.`;
              }

              if (mounted) {
                setError(previewErrorMsg);
                setOldCode(originalContent);
                setNewCodeState(originalContent);
                setIsLoading(false);
              }
              return;
            }
          } else {
            // Fallback to unified diff
            const normalizedDiff = normalizeLineFeeds(diffContent);
            if (normalizedDiff.trim() === '') {
              // Empty diff string means no change
              calculatedNewCode = originalContent;
            } else {
              const patches: StructuredPatch[] = parsePatch(normalizedDiff);
              if (patches.length > 0 && patches[0] && patches[0].hunks && patches[0].hunks.length > 0) {
                const patchResult = applyPatch(originalContent, patches[0]);
                if (patchResult === false) {
                  throw new Error(`Patch failed to apply to ${filePath}. Check diff format and file content.`);
                }
                calculatedNewCode = patchResult;
              } else {
                // No valid hunks found or empty patch, means no change or invalid diff
                // If normalizedDiff was not empty, it suggests an invalid format.
                if (normalizedDiff.trim() !== '') {
                  throw new Error(
                    `Invalid diff format or empty patch for ${filePath}. Diff: ${diffContent.substring(0, 100)}...`
                  );
                }
                calculatedNewCode = originalContent; // No changes from this diff
              }
            }
          }
        }
        if (mounted) setNewCodeState(calculatedNewCode);
      } catch (e) {
        if (mounted) {
          const msg = getErrorMessage(e);
          setError(msg);
          showToast(`Error preparing diff for ${filePath}: ${msg}`, 'error');
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    fetchAndProcess();
    return () => {
      mounted = false;
    };
  }, [filePath, diffContent, newFileContent, showToast]);

  if (isLoading) {
    return (
      <div className="p-2 text-xs text-neutral-400 flex items-center">
        <Loader2 size={14} className="animate-spin mr-1.5" /> Loading diff…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-2 text-xs text-red-400 bg-red-900/30 rounded flex items-center">
        <AlertTriangle size={14} className="mr-1.5" /> Error: {error}
      </div>
    );
  }

  if (oldCode === null || newCodeState === null) {
    return <div className="p-2 text-xs text-neutral-500">No diff data to display.</div>;
  }

  if (oldCode === newCodeState) {
    return (
      <div className="p-2 text-xs text-neutral-300 bg-neutral-800/50 rounded flex items-center border border-neutral-700">
        <CheckCircle size={14} className="mr-1.5 text-green-400" /> No differences detected.
      </div>
    );
  }

  return (
    <div className="text-xs diff-viewer-container border border-neutral-700 rounded-md overflow-hidden">
      <ReactDiffViewer
        oldValue={oldCode}
        newValue={newCodeState}
        splitView={false}
        compareMethod={DiffMethod.LINES}
        useDarkTheme
      />
    </div>
  );
};

export default DiffDisplay;
