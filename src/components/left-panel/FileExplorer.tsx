// src/components/left-panel/FileExplorer.tsx
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
  rootPathAtom,
  fileTreeAtom,
  isLoadingAtom,
  selectedFileEntriesAtom,
  fileSystemChangeIndicatorAtom,
  initialSelectionAppliedAtom,
  FileSystemEntry,
  focusedFileExplorerItemPathAtom,
  lastClickedPathForShiftSelectAtom,
  uiSelectedFilePathsAtom,
  SelectionState,
  selectedFileEntriesAtom as contextSelectedFileEntriesAtom,
  focusFileExplorerAtom,
  focusPromptTextareaAtom,
} from '@/store/atoms';
import { useFileTreeActions } from '@/hooks/useFileTreeActions';
import { useToast } from '@/hooks/useToast';
import { copyFilesAsPromptToClipboard, ShowToastFn } from '@/utils/promptGenerationUtils';
import TreeItem from './TreeItem';
import FileExplorerRootItem from './FileExplorerRootItem';
import {
  getSelectedFileEntriesMap,
  getProjectRootEffectiveSelectionState,
  toggleOpenStateRecursive,
  buildProcessedTreeWithPersistedSelections,
  getVisibleTreeItemPaths,
  MAX_IMPORTANCE,
  DEFAULT_IMPORTANCE,
  getPrefixedPath,
} from '@/utils/fileTreeUtils';
import { RefreshCw } from 'lucide-react';
import { electronApi } from '@shared/electron-api';
import { useContentViewer } from '@/hooks/useContentViewer';

export default function FileExplorer() {
  const [rootPath] = useAtom(rootPathAtom);
  const [currentFileTree, setFileTree] = useAtom(fileTreeAtom);
  const setIsLoadingGlobal = useSetAtom(isLoadingAtom);
  const [isExplorerLoading, setIsExplorerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setSelectedFileEntries = useSetAtom(selectedFileEntriesAtom);
  const setInitialSelectionApplied = useSetAtom(initialSelectionAppliedAtom);
  const fsChangeIndicator = useAtomValue(fileSystemChangeIndicatorAtom);
  const { showToast, showToastForError } = useToast();
  const {
    handleToggleSelection,
    handleToggleSelectAllRoot,
    handleIncreaseImportance,
    handleDecreaseImportance,
    handleSetSelectionAndImportance,
  } = useFileTreeActions();
  const contextSelectedEntries = useAtomValue(contextSelectedFileEntriesAtom);
  const [focusedPath, setFocusedPath] = useAtom(focusedFileExplorerItemPathAtom);
  const [lastClickedPathShift, setLastClickedPathShift] = useAtom(lastClickedPathForShiftSelectAtom);
  const [uiSelectedPaths, setUiSelectedPaths] = useAtom(uiSelectedFilePathsAtom);
  const scrollableContainerRef = useRef<HTMLDivElement>(null);
  const { showContent: showContentViewerContent } = useContentViewer();
  const focusedFileExplorerItemSignal = useAtomValue(focusFileExplorerAtom);
  const triggerFocusPromptTextarea = useSetAtom(focusPromptTextareaAtom); // For TAB key

  useEffect(() => {
    // Effect to handle focusing the File Explorer when signalled
    if (focusedFileExplorerItemSignal && scrollableContainerRef.current) {
      // If a specific item was focused, try to maintain it or focus the container
      const focusedItemElement = focusedPath
        ? document.getElementById(`tree-item-${focusedPath.replace(/[^\w-]/g, '_')}`)
        : null;
      if (focusedItemElement) {
        focusedItemElement.focus(); // Attempt to focus item if possible (TreeItem might need tabindex)
        scrollableContainerRef.current.scrollTop =
          focusedItemElement.offsetTop - scrollableContainerRef.current.offsetTop;
      } else {
        scrollableContainerRef.current.focus();
      }
    }
  }, [focusedFileExplorerItemSignal, focusedPath]);

  const handleViewFileRequest = useCallback(
    async (entry: FileSystemEntry) => {
      if (!entry.isFile) {
        showToast(`${entry.name} is a directory, cannot view.`, 'info');
        return;
      }
      if (entry.isBinary) {
        showToast(`Cannot view binary file: ${entry.name}. Open externally.`, 'info');
        return;
      }

      try {
        const content = await electronApi.readFile(entry.path);
        const contentType = entry.name.toLowerCase().endsWith('.md') ? 'markdown' : 'text';
        showContentViewerContent(content, contentType, entry.name);
      } catch (err) {
        showToastForError(`Failed to read file ${entry.name}`, err);
      }
    },
    [showContentViewerContent, showToast, showToastForError]
  );

  const findEntryByPath = useCallback(
    (path: string | null, treeToSearch: FileSystemEntry[]): FileSystemEntry | undefined => {
      if (!path) return undefined;
      for (const entry of treeToSearch) {
        if (entry.path === path) return entry;
        if (entry.isDirectory && entry.children && path.startsWith(entry.path + '/')) {
          const found = findEntryByPath(path, entry.children);
          if (found) return found;
        }
      }
      return undefined;
    },
    []
  );

  const handleToggleOpenEntry = useCallback(
    (entryPath: string) => {
      setFileTree((currentTree) => toggleOpenStateRecursive(currentTree, entryPath));
    },
    [setFileTree]
  );

  useEffect(() => {
    if (!rootPath) {
      setFileTree([]);
      setSelectedFileEntries(new Map());
      setError(null);
      setInitialSelectionApplied(false);
      setIsExplorerLoading(false);
      setFocusedPath(null);
      setLastClickedPathShift(null);
      setUiSelectedPaths(new Set());
      return;
    }

    let isMounted = true;
    setInitialSelectionApplied(false);

    const fetchAndProcessTree = async () => {
      setUiSelectedPaths(new Set());
      setIsExplorerLoading(true);
      setIsLoadingGlobal(true);
      setError(null);

      try {
        const rawFileEntries = await electronApi.getRecursiveDirectoryTree();
        if (!isMounted) return;

        const persistedPrefixedPaths = await electronApi.settingsGetFileSelectionForRoot(rootPath);
        if (!isMounted) return;

        const processedTree = buildProcessedTreeWithPersistedSelections(rawFileEntries, persistedPrefixedPaths);

        if (isMounted) {
          setFileTree(processedTree);
          setSelectedFileEntries(getSelectedFileEntriesMap(processedTree));
          setInitialSelectionApplied(true);

          if (processedTree.length > 0 && !focusedPath) {
            const firstPath = processedTree[0].path;
            setFocusedPath(firstPath);
            const initialEntry = findEntryByPath(firstPath, processedTree);
            if (initialEntry && !initialEntry.isBinary) {
              setUiSelectedPaths(new Set([firstPath]));
            }
            setLastClickedPathShift(firstPath);
          } else if (processedTree.length === 0) {
            setFocusedPath(null);
            setLastClickedPathShift(null);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          showToastForError('Failed to load directory tree', err);
          setError(err instanceof Error ? err.message : String(err));
          setFileTree([]);
          setSelectedFileEntries(new Map());
          setInitialSelectionApplied(true);
        }
      } finally {
        if (isMounted) {
          setIsExplorerLoading(false);
          setIsLoadingGlobal(false);
        }
      }
    };

    fetchAndProcessTree();

    return () => {
      isMounted = false;
    };
  }, [
    rootPath,
    fsChangeIndicator,
    setFileTree,
    setSelectedFileEntries,
    setIsLoadingGlobal,
    showToastForError,
    setInitialSelectionApplied,
    setFocusedPath,
    setUiSelectedPaths,
    setLastClickedPathShift,
    findEntryByPath,
  ]); // TODO: adding focusedPath causes keyboard navigation bugs, fix the root cause before adding it here

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const targetElement = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(targetElement.tagName)) {
        return;
      }

      const currentFocusedEntry = findEntryByPath(focusedPath, currentFileTree);

      if ((event.key === '+' || event.key === '=') && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        if (currentFocusedEntry && !currentFocusedEntry.isBinary && currentFocusedEntry.selectionState === 'full') {
          handleIncreaseImportance(currentFocusedEntry);
        } else if (uiSelectedPaths.size > 0) {
          uiSelectedPaths.forEach((path) => {
            const entry = findEntryByPath(path, currentFileTree);
            if (entry && !entry.isBinary && entry.selectionState === 'full') handleIncreaseImportance(entry);
          });
        }
        return;
      }
      if ((event.key === '-' || event.key === '_') && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        if (currentFocusedEntry && !currentFocusedEntry.isBinary && currentFocusedEntry.selectionState === 'full') {
          handleDecreaseImportance(currentFocusedEntry);
        } else if (uiSelectedPaths.size > 0) {
          uiSelectedPaths.forEach((path) => {
            const entry = findEntryByPath(path, currentFileTree);
            if (entry && !entry.isBinary && entry.selectionState === 'full') handleDecreaseImportance(entry);
          });
        }
        return;
      }
      if (event.key === 'Enter' && currentFocusedEntry && currentFocusedEntry.isFile && !currentFocusedEntry.isBinary) {
        event.preventDefault();
        handleViewFileRequest(currentFocusedEntry);
        return;
      }
      if (['1', '2', '3', '4', '5'].includes(event.key) && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        if (currentFocusedEntry && !currentFocusedEntry.isBinary) {
          const importanceNumber = parseInt(event.key, 10);
          const newSelectionState: SelectionState = importanceNumber === 1 ? 'ignored' : 'full';
          const newImportance =
            importanceNumber === 1
              ? 0
              : importanceNumber === 2
                ? DEFAULT_IMPORTANCE
                : Math.min(importanceNumber - 1, MAX_IMPORTANCE);
          handleSetSelectionAndImportance(currentFocusedEntry, newSelectionState, newImportance);
        }
        return;
      }

      const visiblePaths = getVisibleTreeItemPaths(currentFileTree);
      if (visiblePaths.length === 0) {
        if (focusedPath !== null) setFocusedPath(null);
        if (lastClickedPathShift !== null) setLastClickedPathShift(null);
        return;
      }

      const currentIndex = focusedPath ? visiblePaths.indexOf(focusedPath) : -1;
      let nextPathCandidate: string | null = focusedPath;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (currentIndex === -1 && visiblePaths.length > 0) nextPathCandidate = visiblePaths[0];
        else if (currentIndex < visiblePaths.length - 1) nextPathCandidate = visiblePaths[currentIndex + 1];
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (currentIndex === -1 && visiblePaths.length > 0) nextPathCandidate = visiblePaths[visiblePaths.length - 1];
        else if (currentIndex > 0) nextPathCandidate = visiblePaths[currentIndex - 1];
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (currentFocusedEntry?.isDirectory && !currentFocusedEntry.isOpen && !currentFocusedEntry.isBinary) {
          handleToggleOpenEntry(currentFocusedEntry.path);
          return;
        } else if (
          currentFocusedEntry?.isDirectory &&
          currentFocusedEntry.isOpen &&
          currentFocusedEntry.children?.[0]
        ) {
          nextPathCandidate = currentFocusedEntry.children[0].path;
        }
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (currentFocusedEntry?.isDirectory && currentFocusedEntry.isOpen && !currentFocusedEntry.isBinary) {
          handleToggleOpenEntry(currentFocusedEntry.path);
          return;
        } else if (focusedPath) {
          const parentPath = focusedPath.includes('/') ? focusedPath.substring(0, focusedPath.lastIndexOf('/')) : null;
          if (parentPath) {
            const parentEntry = findEntryByPath(parentPath, currentFileTree);
            if (parentEntry) nextPathCandidate = parentPath;
          }
        }
      } else if (event.key === ' ' && currentFocusedEntry && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        if (!currentFocusedEntry.isBinary) {
          handleToggleSelection(currentFocusedEntry);
        }
        return;
      } else if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        triggerFocusPromptTextarea({ cursorPos: 'end' });
        return;
      } else {
        return;
      }

      if (nextPathCandidate && nextPathCandidate !== focusedPath) {
        setFocusedPath(nextPathCandidate);
        const nextFocusedEntry = findEntryByPath(nextPathCandidate, currentFileTree);

        if (event.shiftKey) {
          let anchor = lastClickedPathShift;
          if (!anchor) {
            anchor = focusedPath || nextPathCandidate;
            setLastClickedPathShift(anchor);
          }

          const newSelectedUiPaths = new Set<string>();
          const indexAnchor = visiblePaths.indexOf(anchor);
          const indexNewFocus = visiblePaths.indexOf(nextPathCandidate);

          if (indexAnchor !== -1 && indexNewFocus !== -1) {
            const start = Math.min(indexAnchor, indexNewFocus);
            const end = Math.max(indexAnchor, indexNewFocus);
            for (let i = start; i <= end; i++) {
              const pathInRange = visiblePaths[i];
              const entryInRange = findEntryByPath(pathInRange, currentFileTree);
              if (entryInRange && !entryInRange.isBinary) {
                newSelectedUiPaths.add(pathInRange);
              }
            }
          }
          setUiSelectedPaths(newSelectedUiPaths);
        } else {
          const newSelectedUiPaths = new Set<string>();
          if (nextFocusedEntry && !nextFocusedEntry.isBinary) {
            newSelectedUiPaths.add(nextPathCandidate);
          }
          setUiSelectedPaths(newSelectedUiPaths);
          setLastClickedPathShift(nextPathCandidate);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    focusedPath,
    currentFileTree,
    uiSelectedPaths,
    lastClickedPathShift,
    contextSelectedEntries,
    handleIncreaseImportance,
    handleDecreaseImportance,
    handleSetSelectionAndImportance,
    handleToggleSelection,
    setFocusedPath,
    setUiSelectedPaths,
    setLastClickedPathShift,
    findEntryByPath,
    handleToggleOpenEntry,
    handleViewFileRequest,
  ]);

  useEffect(() => {
    if (focusedPath && scrollableContainerRef.current) {
      const itemElement = document.getElementById(`tree-item-${focusedPath.replace(/[^\w-]/g, '_')}`);
      itemElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [focusedPath]);

  const handleItemClick = useCallback(
    (entry: FileSystemEntry, event: React.MouseEvent) => {
      if (entry.isBinary && event.type !== 'contextmenu') {
        showToast(`Binary or oversized item: ${entry.name} cannot be UI-selected.`, 'info');
        return;
      }

      const currentPath = entry.path;
      setFocusedPath(currentPath);
      const currentEntry = findEntryByPath(currentPath, currentFileTree);

      if (event.type === 'contextmenu') {
        if (event.shiftKey && lastClickedPathShift) {
          const newSelection = new Set(uiSelectedPaths);
          const visiblePaths = getVisibleTreeItemPaths(currentFileTree);
          const anchorIdx = visiblePaths.indexOf(lastClickedPathShift);
          const targetIdx = visiblePaths.indexOf(currentPath);
          if (anchorIdx !== -1 && targetIdx !== -1) {
            const start = Math.min(anchorIdx, targetIdx);
            const end = Math.max(anchorIdx, targetIdx);
            for (let i = start; i <= end; i++) {
              const pathInRange = visiblePaths[i];
              const entryInRange = findEntryByPath(pathInRange, currentFileTree);
              if (entryInRange && !entryInRange.isBinary) newSelection.add(pathInRange);
            }
          }
          setUiSelectedPaths(newSelection);
        } else if (event.ctrlKey || event.metaKey) {
          const newSelection = new Set(uiSelectedPaths);
          if (newSelection.has(currentPath)) newSelection.delete(currentPath);
          else if (currentEntry && !currentEntry.isBinary) newSelection.add(currentPath);
          setUiSelectedPaths(newSelection);
          setLastClickedPathShift(currentPath);
        } else {
          const newSelection = new Set<string>();
          if (currentEntry && !currentEntry.isBinary) newSelection.add(currentPath);
          setUiSelectedPaths(newSelection);
          setLastClickedPathShift(currentPath);
        }
        return;
      }

      if (event.shiftKey && lastClickedPathShift) {
        const newSelection = new Set(uiSelectedPaths);
        const visiblePaths = getVisibleTreeItemPaths(currentFileTree);
        const anchorIdx = visiblePaths.indexOf(lastClickedPathShift);
        const targetIdx = visiblePaths.indexOf(currentPath);

        if (anchorIdx !== -1 && targetIdx !== -1) {
          const start = Math.min(anchorIdx, targetIdx);
          const end = Math.max(anchorIdx, targetIdx);
          for (let i = start; i <= end; i++) {
            const pathInRange = visiblePaths[i];
            const entryInRange = findEntryByPath(pathInRange, currentFileTree);
            if (entryInRange && !entryInRange.isBinary) newSelection.add(pathInRange);
          }
        }
        setUiSelectedPaths(newSelection);
      } else if (event.ctrlKey || event.metaKey) {
        const newSelection = new Set(uiSelectedPaths);
        if (newSelection.has(currentPath)) newSelection.delete(currentPath);
        else if (currentEntry && !currentEntry.isBinary) newSelection.add(currentPath);
        setUiSelectedPaths(newSelection);
        setLastClickedPathShift(currentPath);
      } else {
        const newSelection = new Set<string>();
        if (currentEntry && !currentEntry.isBinary) newSelection.add(currentPath);
        setUiSelectedPaths(newSelection);
        setLastClickedPathShift(currentPath);
      }
    },
    [
      currentFileTree,
      uiSelectedPaths,
      setUiSelectedPaths,
      focusedPath,
      setFocusedPath,
      lastClickedPathShift,
      setLastClickedPathShift,
      findEntryByPath,
      showToast,
    ]
  );

  const handleContextMenuAction = useCallback(
    async (action: 'copyAsPrompt', _entryPath: string) => {
      if (action === 'copyAsPrompt') {
        if (!rootPath) {
          showToast('Cannot copy as prompt: root path not set.', 'error');
          return;
        }
        if (uiSelectedPaths.size === 0) {
          showToast('No files UI-selected to copy as prompt.', 'info');
          return;
        }

        const pathsToProcess = Array.from(uiSelectedPaths);
        const prefixedFilePaths: string[] = [];

        for (const path of pathsToProcess) {
          const entry = findEntryByPath(path, currentFileTree);
          if (entry && entry.isFile && !entry.isBinary) {
            const isContextSelected = entry.selectionState === 'full';
            const importance = isContextSelected && entry.importance > 0 ? entry.importance : DEFAULT_IMPORTANCE;
            prefixedFilePaths.push(getPrefixedPath(path, importance));
          }
        }

        if (prefixedFilePaths.length === 0) {
          showToast('No suitable files (non-binary, file-type) in UI selection to copy.', 'info');
          return;
        }

        const promptPrefix = ''; // TODO: do we actually need prefix for this?
        const toastFn: ShowToastFn = (message, type) => showToast(message, type);

        await copyFilesAsPromptToClipboard(rootPath, prefixedFilePaths, promptPrefix, toastFn, {});
      }
    },
    [rootPath, uiSelectedPaths, currentFileTree, findEntryByPath, showToast]
  );

  if (!rootPath) {
    return null;
  }

  if (isExplorerLoading && currentFileTree.length === 0) {
    return (
      <p className="text-neutral-400 p-4 flex items-center">
        <RefreshCw size={16} className="animate-spin mr-2" />
        Loading file tree...
      </p>
    );
  }

  if (error && !isExplorerLoading) {
    return <p className="text-red-400 p-4">Error: {error}</p>;
  }

  return (
    /* NOTE: focus-visible removes distracting outline from File Explorer when navigating with keyboard */
    <div
      className="h-full overflow-y-auto text-sm focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
      ref={scrollableContainerRef}
      tabIndex={-1}
    >
      <FileExplorerRootItem
        rootPath={rootPath}
        effectiveSelection={getProjectRootEffectiveSelectionState(currentFileTree)}
        isLoading={isExplorerLoading && currentFileTree.length > 0}
        onToggleSelectAll={handleToggleSelectAllRoot}
        onSetFocusedPathToNull={() => setFocusedPath(null)}
        onSetLastClickedPathToNull={() => setLastClickedPathShift(null)}
      />

      {currentFileTree.length > 0 && <div className="my-1 border-t border-neutral-800/70"></div>}

      {currentFileTree.map((entry: FileSystemEntry) => (
        <TreeItem
          key={entry.path}
          id={`tree-item-${entry.path.replace(/[^\w-]/g, '_')}`}
          entry={entry}
          isFocused={focusedPath === entry.path}
          isUiSelected={uiSelectedPaths.has(entry.path)}
          isAnyFileUiSelected={uiSelectedPaths.size > 0}
          uiSelectedFilePaths={uiSelectedPaths}
          focusedPath={focusedPath}
          onToggleSelection={handleToggleSelection}
          onItemRowClick={handleItemClick}
          onToggleOpen={handleToggleOpenEntry}
          onIncreaseImportance={handleIncreaseImportance}
          onDecreaseImportance={handleDecreaseImportance}
          onContextMenuAction={handleContextMenuAction}
          onViewFileRequest={handleViewFileRequest}
        />
      ))}

      {!isExplorerLoading && currentFileTree.length === 0 && !error && (
        <p className="text-neutral-500 p-4 pt-1 text-center">Directory empty or all items ignored.</p>
      )}
    </div>
  );
}
