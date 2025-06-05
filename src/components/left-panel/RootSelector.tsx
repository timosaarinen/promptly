// src/components/RootSelector.tsx
import { useEffect, useRef, useState } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
  rootPathAtom,
  isLoadingAtom,
  respectGitignoreAtom,
  selectedFileEntriesAtom,
  fileTreeAtom,
  fileSystemChangeIndicatorAtom,
} from '@/store/atoms';
import { useToast } from '@/hooks/useToast';
import { FolderOpen, RefreshCw, Eye, EyeOff, FolderClock, ClipboardList, ClipboardPaste, Filter } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { electronApi, FsEntry } from '@shared/electron-api';
import { getSelectionRulesForPersistence } from '@/utils/fileTreeUtils';
import { parseFilesForContextXml } from '@/utils/xmlParsingUtils';
import { applyRulesToPathList } from '@/utils/globRuleProcessor';

export default function RootSelector() {
  const [rootPath, setRootPath] = useAtom(rootPathAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const [error, setError] = useState<string | null>(null);
  const { showToast, showToastForError } = useToast();
  const [respectGitignore, setRespectGitignore] = useAtom(respectGitignoreAtom);
  const [isProcessingRecent, setIsProcessingRecent] = useState(false);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const setSelectedFileEntries = useSetAtom(selectedFileEntriesAtom);
  const currentFileTree = useAtomValue(fileTreeAtom);
  const setFsChangeIndicator = useSetAtom(fileSystemChangeIndicatorAtom);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filterRulesText, setFilterRulesText] = useState('');

  function setRootPathSafe(path: string | null) {
    setRootPath(path);
    setSelectedFileEntries(new Map());
  }

  const openRecentDropdown = async () => {
    try {
      const recent = await electronApi.getRecentRootPaths();
      if (recent.length > 0) {
        setIsProcessingRecent(true);
        setRecentPaths(recent);
      } else {
        showToast('No recent folders available', 'info');
        setIsProcessingRecent(false);
      }
    } catch (err) {
      console.error('Failed to fetch recent paths:', err);
    }
  };
  const openRecentFolder = async (path: string) => {
    try {
      await electronApi.setRootPath(path);
      setRootPathSafe(path);
    } catch (err) {
      showToastForError('Error selecting root', err);
    }
    setIsProcessingRecent(false);
  };

  const dropdownRef = useRef<HTMLDivElement>(null);
  useClickOutside(dropdownRef, () => setIsProcessingRecent(false));
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsProcessingRecent(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchInitialPath = async () => {
      if (!rootPath) {
        setIsLoading(true);
        try {
          const initialPath = await electronApi.getInitialRootPath();
          if (isMounted && initialPath) {
            setRootPath(initialPath);
          }
        } catch (err) {
          if (isMounted) {
            showToastForError('Error fetching initial root path', err);
          }
        } finally {
          if (isMounted) setIsLoading(false);
        }
      }
    };
    fetchInitialPath();
    return () => {
      isMounted = false;
    };
  }, [rootPath, setRootPath, setIsLoading, showToastForError]);

  const selectRoot = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const path = await electronApi.openDirectoryDialog();
      if (path) {
        setRootPathSafe(path);
      }
    } catch (err) {
      showToastForError('Error selecting root', err);
      setRootPathSafe(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRespectGitignoreChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setRespectGitignore(newValue);
    try {
      await electronApi.updateRespectGitignore(newValue);
      showToast(`.gitignore rules ${newValue ? 'enabled' : 'disabled'}. Refreshing...`, 'info');
    } catch (err) {
      showToastForError('Error updating .gitignore setting', err);
    }
  };

  const handleCopySelectionRules = async () => {
    if (!rootPath) {
      showToast('No root path selected.', 'info');
      return;
    }
    try {
      const selectionRules = getSelectionRulesForPersistence(currentFileTree);
      await electronApi.copyToClipboard(selectionRules.join('\n'));
      showToast('Selection rules copied to clipboard!', 'success');
    } catch (err) {
      showToastForError('Error copying selection rules', err);
    }
  };

  const applyRulesAndRefresh = async (rules: string[], sourceDescription: string) => {
    if (!rootPath) {
      showToast('No root path selected.', 'info');
      return;
    }
    if (rules.length === 0) {
      showToast(`No new filter rules from ${sourceDescription} to apply.`, 'info');
      return;
    }

    try {
      setIsLoading(true);

      // Fetch current selection rules to apply new rules on top of them
      const currentSelectionRules = getSelectionRulesForPersistence(currentFileTree);
      const combinedRules = [...currentSelectionRules, ...rules];

      // Fetch all files. This is crucial for globbing to work correctly against the entire project.
      const rawFileEntries = await electronApi.getRecursiveDirectoryTree(); // This fetches the full tree
      const allFilePaths: string[] = [];
      const collectFilePaths = function (entries: FsEntry[]) {
        for (const entry of entries) {
          if (entry.isFile) {
            allFilePaths.push(entry.path);
          }
          if (entry.isDirectory && entry.children) {
            collectFilePaths(entry.children);
          }
        }
      };
      collectFilePaths(rawFileEntries);

      if (allFilePaths.length === 0 && combinedRules.some((rule) => !rule.startsWith('-'))) {
        showToast('Project appears to have no files. Cannot apply additive selection rules.', 'warning');
        setIsLoading(false);
        return;
      }

      const explicitPathsToSelect = applyRulesToPathList(allFilePaths, combinedRules);

      await electronApi.settingsSetFileSelectionForRoot(rootPath, explicitPathsToSelect);
      setFsChangeIndicator((prev) => prev + 1);
      showToast(`Filter rules from ${sourceDescription} applied to current selection. Refreshing tree...`, 'success');
    } catch (err) {
      showToastForError(`Failed to apply filter rules from ${sourceDescription}`, err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetSelectionFromClipboard = async () => {
    const clipboardText = await electronApi.readFromClipboard();
    if (clipboardText.trim() === '') {
      showToast('Clipboard is empty. No selection rules to apply.', 'info');
      return;
    }

    let rulesToApply: string[] | null = parseFilesForContextXml(clipboardText);
    let sourceType = 'XML <files-for-context> block';

    if (!rulesToApply) {
      rulesToApply = clipboardText
        .split('\n')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      sourceType = 'plain text list';
    }
    await applyRulesAndRefresh(rulesToApply, `clipboard (${sourceType})`);
  };

  const handleApplyFilterRules = async () => {
    const rules = filterRulesText
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    await applyRulesAndRefresh(rules, 'filter input');
    setIsFilterModalOpen(false);
  };

  return (
    <div className="shrink-0">
      {isLoading && !rootPath && (
        <div className="flex items-center justify-center p-4 text-neutral-400">
          <RefreshCw size={18} className="animate-spin mr-2" />
          <span>Loading...</span>
        </div>
      )}
      {!isLoading && !rootPath && (
        <button
          onClick={selectRoot}
          className="w-full flex items-center justify-center px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:bg-neutral-700 text-base shadow-sm"
        >
          <FolderOpen size={20} className="mr-2" />
          Select Root Folder
        </button>
      )}
      {rootPath && (
        <div className="flex items-center justify-between space-x-3">
          <div className="flex items-center space-x-2">
            <label className="flex items-center text-xs text-neutral-400 cursor-pointer hover:text-neutral-300 transition-colors">
              <input
                type="checkbox"
                checked={respectGitignore}
                onChange={handleRespectGitignoreChange}
                disabled={isLoading}
                className="mr-1.5 h-3.5 w-3.5 rounded border-neutral-600 text-indigo-500 focus:ring-1 focus:ring-offset-0 focus:ring-offset-neutral-800 focus:ring-indigo-400 bg-neutral-700 disabled:opacity-50"
              />
              {respectGitignore ? (
                <Eye size={14} className="mr-1 text-indigo-400" />
              ) : (
                <EyeOff size={14} className="mr-1 text-neutral-500" />
              )}
              Respect .gitignore
            </label>
          </div>

          <div className="relative flex items-center gap-2">
            <button
              onClick={() => setIsFilterModalOpen(true)}
              title="Filter selection with rules (globs, add/remove)"
              disabled={!rootPath || isLoading || isProcessingRecent}
              className="p-1.5 text-neutral-400 hover:text-indigo-400 rounded hover:bg-neutral-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Filter size={16} />
            </button>
            <button
              onClick={handleCopySelectionRules}
              title="Copy current selection rules to clipboard"
              disabled={!rootPath || currentFileTree.length === 0 || isLoading || isProcessingRecent}
              className="p-1.5 text-neutral-400 hover:text-indigo-400 rounded hover:bg-neutral-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ClipboardList size={16} />
            </button>
            <button
              onClick={handleSetSelectionFromClipboard}
              title="Set selection from clipboard rules"
              disabled={!rootPath || isLoading || isProcessingRecent}
              className="p-1.5 text-neutral-400 hover:text-indigo-400 rounded hover:bg-neutral-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ClipboardPaste size={16} />
            </button>
            <button
              onClick={openRecentDropdown}
              title="Open Recent Folder"
              disabled={isProcessingRecent || isLoading}
              className="p-1.5 text-neutral-400 hover:text-indigo-400 rounded hover:bg-neutral-700/50 disabled:opacity-50"
            >
              {isProcessingRecent ? <RefreshCw size={16} className="animate-spin" /> : <FolderClock size={16} />}
            </button>
            <button
              onClick={selectRoot}
              title="Change Root Folder"
              disabled={isLoading || isProcessingRecent}
              className="p-1.5 text-neutral-400 hover:text-indigo-400 rounded hover:bg-neutral-700/50 disabled:opacity-50"
            >
              {isLoading && !isProcessingRecent ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
            </button>

            {isProcessingRecent && (
              <div
                ref={dropdownRef}
                className="absolute right-0 top-full mt-1 w-96 bg-neutral-800 border border-neutral-700 rounded shadow-lg text-sm text-left z-10"
              >
                {recentPaths.map((path) => (
                  <button
                    key={path}
                    onClick={() => openRecentFolder(path)}
                    className="w-full text-left px-3 py-1.5 hover:bg-neutral-700 text-neutral-200 hover:text-white"
                  >
                    {path}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isFilterModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div
            ref={dropdownRef}
            className="bg-neutral-800 p-6 rounded-lg shadow-xl w-full max-w-2xl border border-neutral-700"
          >
            <h3 className="text-xl font-semibold mb-4 text-neutral-100">Apply Selection Filter Rules</h3>
            <p className="text-sm text-neutral-400 mb-1">Enter rules one per line. Examples:</p>
            <ul className="text-xs text-neutral-400 list-disc list-inside mb-4 space-y-0.5">
              <li>
                <code>src/**/*.ts</code> (select all .ts files in src)
              </li>
              <li>
                <code>+src/important/**</code> (select with higher importance)
              </li>
              <li>
                <code>docs/README.md</code> (select specific file)
              </li>
              <li>
                <code>-**/*.test.ts</code> (remove all test files)
              </li>
              <li>
                <code>-node_modules/**</code> (ensure node_modules are not selected)
              </li>
            </ul>
            <p className="text-sm text-neutral-400 mb-2">
              Rules are applied in order. `+` for importance, `-` for removal. Standard glob patterns are supported.
            </p>
            <textarea
              value={filterRulesText}
              onChange={(e) => setFilterRulesText(e.target.value)}
              placeholder="Enter rules here, one per line..."
              className="w-full h-48 p-3 bg-neutral-900 border border-neutral-700 rounded-md text-sm text-neutral-200 focus:ring-indigo-500 focus:border-indigo-500 font-mono resize-y"
              spellCheck="false"
            />
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setIsFilterModalOpen(false)}
                className="px-4 py-2 text-sm rounded-md text-neutral-300 bg-neutral-700 hover:bg-neutral-600"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyFilterRules}
                disabled={isLoading}
                className="px-4 py-2 text-sm rounded-md text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-500 flex items-center"
              >
                {isLoading && <RefreshCw size={16} className="animate-spin mr-2" />}
                Apply Rules
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-red-400 mt-2 p-2 bg-red-900/50 rounded text-xs">Error: {error}</p>}
    </div>
  );
}
