// src/hooks/useFileTreeActions.ts
import { useCallback } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { fileTreeAtom, isLoadingAtom, selectedFileEntriesAtom, FileSystemEntry, SelectionState } from '@/store/atoms';
import {
  getSelectedFileEntriesMap,
  getDirectoryEffectiveSelectionState,
  getProjectRootEffectiveSelectionState,
  updateTreeWithAggregates,
  MAX_IMPORTANCE,
  DEFAULT_IMPORTANCE,
  getVisibleTreeItemPaths,
} from '@/utils/fileTreeUtils';
import { useToast } from '@/hooks/useToast';
import { FILESIZE_TO_TOKENS_ESTIMATE_FACTOR } from '@shared/electron-api';

/**
 * Provides actions for manipulating the file tree, such as toggling selection
 * and adjusting item importance. These actions update the global Jotai state.
 */
export function useFileTreeActions() {
  const [currentFileTree, setFileTree] = useAtom(fileTreeAtom);
  const setIsLoading = useSetAtom(isLoadingAtom);
  const setSelectedFileEntries = useSetAtom(selectedFileEntriesAtom);
  const { showToast } = useToast();

  /**
   * Updates a single node in the tree. Returns a new tree if the node was found and updated.
   */
  const updateNodeInTree = useCallback(
    (tree: FileSystemEntry[], path: string, updater: (node: FileSystemEntry) => FileSystemEntry): FileSystemEntry[] => {
      let nodeFoundAndUpdated = false;
      const newTree = tree.map(function processNode(node): FileSystemEntry {
        if (node.path === path) {
          nodeFoundAndUpdated = true;
          return updater(node);
        }
        if (node.isDirectory && node.children && path.startsWith(node.path + '/')) {
          const newChildren = node.children.map(processNode);
          if (newChildren.some((child, i) => child !== node.children![i])) {
            return { ...node, children: newChildren };
          }
        }
        return node;
      });
      return nodeFoundAndUpdated ? newTree : tree;
    },
    []
  );

  /**
   * Generic function to apply changes to a node (and potentially its children via the updater),
   * then update aggregates and parent directory selection states.
   */
  const applyNodeUpdate = useCallback(
    (updater: (tree: FileSystemEntry[], targetPath: string) => FileSystemEntry[], targetPath: string) => {
      setIsLoading(true);
      let treeWithUpdatedNode = updater(currentFileTree, targetPath);

      const correctDirStatesRecursive = (node: FileSystemEntry): FileSystemEntry => {
        if (node.isDirectory && !node.isBinary) {
          const newChildren = node.children ? node.children.map(correctDirStatesRecursive) : undefined;
          const effectiveSelectionState = getDirectoryEffectiveSelectionState({ ...node, children: newChildren });
          let newImportance = node.importance;

          if (effectiveSelectionState === 'full' && newImportance === 0) {
            newImportance = DEFAULT_IMPORTANCE;
          } else if (effectiveSelectionState !== 'full') {
            newImportance = 0;
          }

          if (
            effectiveSelectionState !== node.selectionState ||
            newImportance !== node.importance ||
            (newChildren !== undefined && newChildren !== node.children)
          ) {
            return {
              ...node,
              children: newChildren,
              selectionState: effectiveSelectionState,
              importance: newImportance,
            };
          }
        }
        return node;
      };
      treeWithUpdatedNode = treeWithUpdatedNode.map(correctDirStatesRecursive);
      treeWithUpdatedNode = updateTreeWithAggregates(treeWithUpdatedNode);

      setFileTree(treeWithUpdatedNode);
      setSelectedFileEntries(getSelectedFileEntriesMap(treeWithUpdatedNode));
      setIsLoading(false);
    },
    [currentFileTree, setFileTree, setIsLoading, setSelectedFileEntries]
  );

  /**
   * Recursively sets the selection state and importance for a node and all its descendants.
   */
  const setNodeAndDescendantsState = useCallback(
    (node: FileSystemEntry, newSelectionState: SelectionState, newImportanceIfFull: number): FileSystemEntry => {
      let currentSelectionState = node.selectionState;
      let currentImportance = node.importance;
      let currentDisplaySize = node.displaySize;
      let currentDisplayEstimatedTokens = node.displayEstimatedTokens;

      if (!node.isBinary) {
        currentSelectionState = newSelectionState;
        currentImportance = newSelectionState === 'full' ? newImportanceIfFull : 0;
      } else {
        currentSelectionState = 'ignored';
        currentImportance = 0;
      }

      if (node.isFile && !node.isBinary) {
        if (currentSelectionState === 'full') {
          currentDisplaySize = node.size;
          currentDisplayEstimatedTokens = Math.round(node.size / FILESIZE_TO_TOKENS_ESTIMATE_FACTOR);
        } else {
          currentDisplaySize = undefined;
          currentDisplayEstimatedTokens = undefined;
        }
      }

      let updatedChildren = node.children;
      let childrenActuallyChanged = false;
      if (node.isDirectory && node.children) {
        updatedChildren = node.children.map((child) => {
          const processedChild = setNodeAndDescendantsState(child, newSelectionState, newImportanceIfFull);
          if (processedChild !== child) childrenActuallyChanged = true;
          return processedChild;
        });
      }

      if (
        node.selectionState !== currentSelectionState ||
        node.importance !== currentImportance ||
        node.displaySize !== currentDisplaySize ||
        node.displayEstimatedTokens !== currentDisplayEstimatedTokens ||
        childrenActuallyChanged
      ) {
        return {
          ...node,
          selectionState: currentSelectionState,
          importance: currentImportance,
          displaySize: currentDisplaySize,
          displayEstimatedTokens: currentDisplayEstimatedTokens,
          children: updatedChildren,
        };
      }
      return node;
    },
    []
  );

  /**
   * Toggles the selection state of a given file or directory entry and its descendants (branch selection).
   */
  const handleToggleSelection = useCallback(
    (targetEntry: FileSystemEntry) => {
      if (targetEntry.isBinary) {
        showToast(`Binary or oversized item: ${targetEntry.name} cannot be selected.`, 'info');
        return;
      }
      setIsLoading(true);
      const currentEffectiveState = targetEntry.isDirectory
        ? getDirectoryEffectiveSelectionState(targetEntry)
        : targetEntry.selectionState;
      const nextOverallState: SelectionState =
        (targetEntry.isDirectory && (currentEffectiveState === 'full' || currentEffectiveState === 'indeterminate')) ||
        (!targetEntry.isDirectory && currentEffectiveState === 'full')
          ? 'ignored'
          : 'full';

      let calculatedImportanceForFullBranch = DEFAULT_IMPORTANCE;
      if (nextOverallState === 'full') {
        if (targetEntry.importance > DEFAULT_IMPORTANCE) {
          calculatedImportanceForFullBranch = targetEntry.importance;
        }
        const findNodeByPathRecursive = (
          nodesToSearch: FileSystemEntry[],
          path: string
        ): FileSystemEntry | undefined => {
          for (const n of nodesToSearch) {
            if (n.path === path) return n;
            if (n.isDirectory && path.startsWith(n.path + '/') && n.children) {
              const found = findNodeByPathRecursive(n.children, path);
              if (found) return found;
            }
          }
          return undefined;
        };
        let currentAncestorPath = targetEntry.path;
        if (currentAncestorPath.includes('/')) {
          currentAncestorPath = currentAncestorPath.substring(0, currentAncestorPath.lastIndexOf('/'));
        } else {
          currentAncestorPath = '';
        }
        while (currentAncestorPath) {
          const ancestorNode = findNodeByPathRecursive(currentFileTree, currentAncestorPath);
          if (
            ancestorNode &&
            ancestorNode.isDirectory &&
            ancestorNode.selectionState === 'full' &&
            ancestorNode.importance > calculatedImportanceForFullBranch
          ) {
            calculatedImportanceForFullBranch = ancestorNode.importance;
          }
          if (currentAncestorPath.includes('/')) {
            currentAncestorPath = currentAncestorPath.substring(0, currentAncestorPath.lastIndexOf('/'));
          } else {
            break;
          }
        }
      }

      const branchUpdater = (nodeToUpdate: FileSystemEntry): FileSystemEntry => {
        return setNodeAndDescendantsState(nodeToUpdate, nextOverallState, calculatedImportanceForFullBranch);
      };

      let treeWithUpdatedSelections = updateNodeInTree(currentFileTree, targetEntry.path, branchUpdater);
      treeWithUpdatedSelections = updateTreeWithAggregates(treeWithUpdatedSelections);
      setFileTree(treeWithUpdatedSelections);
      setSelectedFileEntries(getSelectedFileEntriesMap(treeWithUpdatedSelections));
      setIsLoading(false);
    },
    [
      currentFileTree,
      setFileTree,
      setIsLoading,
      showToast,
      setSelectedFileEntries,
      updateNodeInTree,
      setNodeAndDescendantsState,
    ]
  );

  /**
   * Toggles the selection state for all items in the project root.
   */
  const handleToggleSelectAllRoot = useCallback(async () => {
    setIsLoading(true);
    const currentRootState = getProjectRootEffectiveSelectionState(currentFileTree);
    const newStateForAll: SelectionState =
      currentRootState === 'full' || currentRootState === 'indeterminate' ? 'ignored' : 'full';
    let treeWithUpdatedSelections = currentFileTree.map((entry) =>
      setNodeAndDescendantsState(entry, newStateForAll, DEFAULT_IMPORTANCE)
    );
    treeWithUpdatedSelections = updateTreeWithAggregates(treeWithUpdatedSelections);
    setFileTree(treeWithUpdatedSelections);
    setSelectedFileEntries(getSelectedFileEntriesMap(treeWithUpdatedSelections));
    setIsLoading(false);
  }, [currentFileTree, setFileTree, setIsLoading, setSelectedFileEntries, setNodeAndDescendantsState]);

  /**
   * Updates the importance of a target entry. If it's a directory,
   * this new importance is also propagated to its 'full' selected, non-binary children.
   */
  const updateImportance = useCallback(
    (targetEntryPath: string, change: 1 | -1) => {
      const updater = (tree: FileSystemEntry[], path: string) =>
        updateNodeInTree(tree, path, (node: FileSystemEntry): FileSystemEntry => {
          if (node.isBinary || node.selectionState !== 'full') return node;
          const updatedImportanceVal = Math.max(DEFAULT_IMPORTANCE, Math.min(node.importance + change, MAX_IMPORTANCE));
          if (node.importance === updatedImportanceVal && !node.isDirectory) return node;
          let newChildren = node.children;
          if (node.isDirectory && node.children) {
            let childrenChanged = false;
            newChildren = node.children.map((child) => {
              if (!child.isBinary && child.selectionState === 'full' && child.importance !== updatedImportanceVal) {
                childrenChanged = true;
                return { ...child, importance: updatedImportanceVal };
              }
              return child;
            });
            if (!childrenChanged && node.importance === updatedImportanceVal) return node;
            return { ...node, importance: updatedImportanceVal, children: newChildren };
          }
          return { ...node, importance: updatedImportanceVal };
        });
      applyNodeUpdate(updater, targetEntryPath);
    },
    [applyNodeUpdate, updateNodeInTree]
  );

  const handleIncreaseImportance = useCallback(
    (entry: FileSystemEntry) => {
      if (!entry.isBinary && entry.selectionState === 'full') {
        updateImportance(entry.path, 1);
      }
    },
    [updateImportance]
  );

  const handleDecreaseImportance = useCallback(
    (entry: FileSystemEntry) => {
      if (!entry.isBinary && entry.selectionState === 'full') {
        updateImportance(entry.path, -1);
      }
    },
    [updateImportance]
  );

  /**
   * Sets a specific selection state and importance for a target item.
   * If the item is a directory, the state and importance are propagated to all descendants.
   * If the item is a file, only the file itself is directly modified.
   */
  const handleSetSelectionAndImportance = useCallback(
    (targetEntry: FileSystemEntry, newSelectionState: SelectionState, newImportance: number) => {
      if (targetEntry.isBinary && newSelectionState !== 'ignored') {
        showToast(`Binary item ${targetEntry.name} cannot be set to 'full' selection.`, 'info');
        return;
      }

      const updater = (tree: FileSystemEntry[], path: string) =>
        updateNodeInTree(tree, path, (node: FileSystemEntry): FileSystemEntry => {
          // If target is a directory, apply to the whole branch
          if (node.isDirectory) {
            const importanceToApply = newSelectionState === 'full' ? newImportance : 0;
            return setNodeAndDescendantsState(node, newSelectionState, importanceToApply);
          }

          // Otherwise (target is a file), update only this node.
          const updatedNodeBase = { ...node, selectionState: newSelectionState, importance: newImportance };

          if (!updatedNodeBase.isBinary) {
            // Files are already confirmed not binary by outer check for 'full'
            if (newSelectionState === 'full') {
              updatedNodeBase.displaySize = updatedNodeBase.size;
              updatedNodeBase.displayEstimatedTokens = Math.round(
                updatedNodeBase.size / FILESIZE_TO_TOKENS_ESTIMATE_FACTOR
              );
            } else {
              updatedNodeBase.displaySize = undefined;
              updatedNodeBase.displayEstimatedTokens = undefined;
              // Importance for ignored files is already handled (newImportance would be 0)
            }
          }
          return updatedNodeBase;
        });

      applyNodeUpdate(updater, targetEntry.path);
    },
    [applyNodeUpdate, updateNodeInTree, showToast, setNodeAndDescendantsState]
  );

  /**
   * Toggles the selection state of an individual item without affecting its children directly.
   */
  const handleToggleIndividualItemSelection = useCallback(
    (targetEntry: FileSystemEntry) => {
      if (targetEntry.isBinary) {
        showToast(`Binary or oversized item: ${targetEntry.name} cannot be individually toggled.`, 'info');
        return;
      }
      const updater = (tree: FileSystemEntry[], path: string) =>
        updateNodeInTree(tree, path, (node: FileSystemEntry): FileSystemEntry => {
          const newSelectionState: SelectionState = node.selectionState === 'full' ? 'ignored' : 'full';
          const newImportance =
            newSelectionState === 'full' ? (node.importance > 0 ? node.importance : DEFAULT_IMPORTANCE) : 0;
          const updatedNode = { ...node, selectionState: newSelectionState, importance: newImportance };
          if (updatedNode.isFile && !updatedNode.isBinary) {
            if (newSelectionState === 'full') {
              updatedNode.displaySize = updatedNode.size;
              updatedNode.displayEstimatedTokens = Math.round(updatedNode.size / FILESIZE_TO_TOKENS_ESTIMATE_FACTOR);
            } else {
              updatedNode.displaySize = undefined;
              updatedNode.displayEstimatedTokens = undefined;
            }
          }
          return updatedNode;
        });
      applyNodeUpdate(updater, targetEntry.path);
    },
    [applyNodeUpdate, updateNodeInTree, showToast]
  );

  /**
   * Selects a range of items between an anchor and a target path.
   */
  const handleRangeSelect = useCallback(
    (anchorPath: string, targetPath: string) => {
      setIsLoading(true);
      const visiblePaths = getVisibleTreeItemPaths(currentFileTree);
      const anchorIndex = visiblePaths.indexOf(anchorPath);
      const targetIndex = visiblePaths.indexOf(targetPath);

      if (anchorIndex === -1 || targetIndex === -1) {
        setIsLoading(false);
        showToast('Error in range selection: anchor or target not found.', 'error');
        return;
      }

      const startIndex = Math.min(anchorIndex, targetIndex);
      const endIndex = Math.max(anchorIndex, targetIndex);
      const pathsToSelectSet = new Set(visiblePaths.slice(startIndex, endIndex + 1));

      const applyRangeSelectionRecursive = (nodes: FileSystemEntry[]): FileSystemEntry[] => {
        return nodes.map((node) => {
          let modifiedNode = { ...node };
          let childrenModified = false;

          if (pathsToSelectSet.has(node.path) && !node.isBinary) {
            const newSelState: SelectionState = 'full';
            const newImportance = node.importance > DEFAULT_IMPORTANCE ? node.importance : DEFAULT_IMPORTANCE;
            let newDisplaySize = node.displaySize;
            let newDisplayEstimatedTokens = node.displayEstimatedTokens;
            if (node.isFile) {
              newDisplaySize = node.size;
              newDisplayEstimatedTokens = Math.round(node.size / FILESIZE_TO_TOKENS_ESTIMATE_FACTOR);
            } else {
              newDisplaySize = undefined;
              newDisplayEstimatedTokens = undefined;
            }
            modifiedNode = {
              ...node,
              selectionState: newSelState,
              importance: newImportance,
              displaySize: newDisplaySize,
              displayEstimatedTokens: newDisplayEstimatedTokens,
            };
          }

          if (node.isDirectory && node.children) {
            const newChildren = applyRangeSelectionRecursive(node.children);
            if (newChildren !== node.children) {
              modifiedNode.children = newChildren;
              childrenModified = true;
            }
          }
          if (pathsToSelectSet.has(node.path) || childrenModified || modifiedNode !== node) {
            return modifiedNode;
          }
          return node;
        });
      };

      let newTree = applyRangeSelectionRecursive(currentFileTree);
      const correctDirStatesRecursive = (node: FileSystemEntry): FileSystemEntry => {
        if (node.isDirectory && !node.isBinary) {
          const newChildren = node.children ? node.children.map(correctDirStatesRecursive) : undefined;
          const effectiveSelectionState = getDirectoryEffectiveSelectionState({ ...node, children: newChildren });
          let newImportance = node.importance;
          if (effectiveSelectionState === 'full' && newImportance === 0) newImportance = DEFAULT_IMPORTANCE;
          else if (effectiveSelectionState !== 'full') newImportance = 0;

          if (
            effectiveSelectionState !== node.selectionState ||
            newImportance !== node.importance ||
            (newChildren !== undefined && newChildren !== node.children)
          ) {
            return {
              ...node,
              children: newChildren,
              selectionState: effectiveSelectionState,
              importance: newImportance,
            };
          }
        }
        return node;
      };
      newTree = newTree.map(correctDirStatesRecursive);
      newTree = updateTreeWithAggregates(newTree);
      setFileTree(newTree);
      setSelectedFileEntries(getSelectedFileEntriesMap(newTree));
      setIsLoading(false);
    },
    [currentFileTree, setIsLoading, setFileTree, setSelectedFileEntries, showToast]
  );

  return {
    handleToggleSelection,
    handleToggleSelectAllRoot,
    handleIncreaseImportance,
    handleDecreaseImportance,
    handleSetSelectionAndImportance,
    handleToggleIndividualItemSelection,
    handleRangeSelect,
  };
}
