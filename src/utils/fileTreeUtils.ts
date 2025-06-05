// src/utils/fileTreeUtils.ts
import { FileSystemEntry, SelectionState } from '@/store/atoms';
import { FsEntry, FILESIZE_TO_TOKENS_ESTIMATE_FACTOR } from '@shared/electron-api';

/** Maximum importance level an item can have. */
export const MAX_IMPORTANCE = 4;
/** Default importance level for a newly selected item. */
export const DEFAULT_IMPORTANCE = 1; // Corresponds to no stars, just selected.

/**
 * Checks if a directory and all its selectable (non-binary, 'full' selected) descendants
 * are uniformly selected with a specific importance level. This is used to determine if a
 * directory can be persisted with a single importance rule.
 *
 * @param dir The directory entry to check.
 * @param expectedImportance The importance level to check against (e.g., `dir.importance`).
 * @returns True if the directory and its relevant children are uniformly selected with the
 *          `expectedImportance`, false otherwise.
 */
export function isUniformlySelectedRecursive(dir: FileSystemEntry, expectedImportance: number): boolean {
  if (dir.isBinary) return false; // Binary directories cannot be uniformly selected.
  if (dir.selectionState !== 'full' || dir.importance !== expectedImportance) {
    return false;
  }

  if (dir.children) {
    for (const child of dir.children) {
      if (child.isBinary) continue; // Skip binary children, they don't break uniformity of selectable items.
      if (child.isDirectory) {
        if (!isUniformlySelectedRecursive(child, expectedImportance)) return false;
      } else {
        // File
        if (child.selectionState !== 'full' || child.importance !== expectedImportance) {
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * Parses a path string that may be prefixed with '+' characters for importance.
 * @param prefixedPath The path string, which may be prefixed with '+' characters
 *                     (e.g., "++path/to/file.txt" for importance 3).
 * @returns An object containing the `cleanPath` (without prefixes) and the
 *          calculated `importance` level (1-based, where 1 is default).
 */
export function parsePathWithImportance(prefixedPath: string): { cleanPath: string; importance: number } {
  let importance = DEFAULT_IMPORTANCE; // Start with default importance
  let plusCount = 0;
  let i = 0;
  while (i < prefixedPath.length && prefixedPath[i] === '+') {
    plusCount++;
    i++;
  }
  const cleanPath = prefixedPath.substring(i);
  if (plusCount > 0) {
    importance = Math.min(plusCount + 1, MAX_IMPORTANCE);
  }
  return { cleanPath, importance };
}

/**
 * Generates a path string prefixed with '+' characters based on its importance level.
 * Importance 1 (DEFAULT_IMPORTANCE) results in no prefix.
 * Importance 2 results in "+path", Importance 3 in "++path", etc., up to MAX_IMPORTANCE.
 *
 * @param cleanPath The base file path (without any importance prefixes).
 * @param importance The importance level (1-based).
 * @returns The prefixed path string suitable for persistence.
 */
export function getPrefixedPath(cleanPath: string, importance: number): string {
  if (importance <= DEFAULT_IMPORTANCE) {
    return cleanPath; // No prefix for default importance
  }
  // Number of '+' is importance - 1, capped by MAX_IMPORTANCE
  const plusCount = Math.min(importance - 1, MAX_IMPORTANCE - DEFAULT_IMPORTANCE);
  return '+'.repeat(plusCount) + cleanPath;
}

/**
 * Generates a list of prefixed path strings representing the current selection rules.
 * This is used for persisting selections and can be used for copying selection state.
 * - Files: If 'full' selected, not binary, and has valid importance, its prefixed path is included.
 * - Directories: If not binary, has meaningful importance, and not 'ignored', its prefixed path is included.
 *   If a directory rule is saved and it's 'full' and uniformly selected, its children are not explicitly saved.
 *
 * @param nodes An array of `FileSystemEntry` nodes representing the tree or a subtree.
 * @returns An array of prefixed path strings.
 */
export function getSelectionRulesForPersistence(nodes: FileSystemEntry[]): string[] {
  const pathsToPersist: string[] = [];

  function collectPathsRecursive(currentNodes: FileSystemEntry[]) {
    for (const node of currentNodes) {
      if (node.isDirectory) {
        if (node.isBinary) {
          // Binary directory, cannot be selected itself. Recurse if children exist.
          if (node.children) {
            collectPathsRecursive(node.children);
          }
        } else {
          // Selectable directory.
          // Check if it's 'full', has meaningful importance, and is uniformly selected.
          if (
            node.selectionState === 'full' &&
            node.importance >= DEFAULT_IMPORTANCE &&
            isUniformlySelectedRecursive(node, node.importance)
          ) {
            // This directory is 'full', has importance, and is uniformly selected.
            // Save its rule. Its children are covered by this rule, so do NOT recurse further for them.
            pathsToPersist.push(getPrefixedPath(node.path, node.importance));
          } else if (node.children) {
            // Directory is either not 'full', not uniformly selected with its own importance, or has no importance.
            // Do NOT save a rule for this directory itself in this case.
            // Recurse to its children to find individual rules they might have.
            collectPathsRecursive(node.children);
          }
        }
      } else {
        // File node.
        if (node.selectionState === 'full' && !node.isBinary && node.importance >= DEFAULT_IMPORTANCE) {
          pathsToPersist.push(getPrefixedPath(node.path, node.importance));
        }
      }
    }
  }

  collectPathsRecursive(nodes);
  return pathsToPersist;
}

/**
 * Traverses the file tree and gathers all file entries that are marked as 'full' selected
 * and are not binary.
 *
 * @param nodes An array of `FileSystemEntry` nodes representing the tree or a subtree.
 * @returns A `Map` where keys are the clean paths of selected files and values are the
 *          corresponding `FileSystemEntry` objects (which include their importance).
 */
export const getSelectedFileEntriesMap = (nodes: FileSystemEntry[]): Map<string, FileSystemEntry> => {
  const selectedMap = new Map<string, FileSystemEntry>();

  function traverse(currentNodes: FileSystemEntry[]) {
    for (const node of currentNodes) {
      if (node.isFile && !node.isBinary && node.selectionState === 'full') {
        selectedMap.set(node.path, node); // node.path is already the clean path
      }
      if (node.isDirectory && node.children) {
        traverse(node.children);
      }
    }
  }
  traverse(nodes);
  return selectedMap;
};

/**
 * Determines the effective selection state of a directory based on the selection states
 * of its children. This is crucial for UI representation (e.g., checkbox state).
 * - 'full': If all selectable children are 'full'.
 * - 'ignored': If all selectable children are 'ignored'.
 * - 'indeterminate': If selectable children have mixed states ('full' and 'ignored'),
 *   or if some are 'indeterminate' themselves.
 *
 * Unselectable children (binary/oversized) are effectively 'ignored' for this calculation.
 * If a directory has no selectable children, it's considered 'ignored'.
 *
 * @param dirNode The directory `FileSystemEntry` to evaluate.
 * @returns The calculated `SelectionState` for the directory.
 */
export const getDirectoryEffectiveSelectionState = (dirNode: FileSystemEntry): SelectionState => {
  if (dirNode.isBinary) {
    // This case should ideally not be hit for a directory, but included for robustness.
    return 'ignored';
  }

  // If a directory has no children array or an empty one, its state is its own explicit state,
  // defaulting to 'ignored' if no explicit state is set (e.g., during initial tree construction).
  if (!dirNode.children || dirNode.children.length === 0) {
    return dirNode.selectionState || 'ignored';
  }

  const selectableChildrenStates = dirNode.children
    .filter((child) => !child.isBinary) // Only consider children that can be selected.
    .map((child) => {
      // Recursively get effective state for child directories.
      // For files, use their direct selectionState (default to 'ignored' if undefined).
      return child.isDirectory ? getDirectoryEffectiveSelectionState(child) : child.selectionState || 'ignored';
    });

  // If there are no selectable children (e.g., all children are binary),
  // the directory is effectively 'ignored'.
  if (selectableChildrenStates.length === 0) {
    return 'ignored';
  }

  const allFull = selectableChildrenStates.every((state) => state === 'full');
  if (allFull) {
    return 'full';
  }

  const allIgnored = selectableChildrenStates.every((state) => state === 'ignored');
  if (allIgnored) {
    return 'ignored';
  }

  // If not all full and not all ignored, it's indeterminate.
  return 'indeterminate';
};

/**
 * Determines the effective selection state for the entire project root based on its
 * top-level entries.
 * - 'full': If all top-level selectable entries are 'full'.
 * - 'ignored': If all top-level selectable entries are 'ignored', or if the tree is empty.
 * - 'indeterminate': Otherwise (mixed states).
 *
 * @param tree An array of `FileSystemEntry` nodes representing the root of the file tree.
 * @returns The calculated `SelectionState` for the project root.
 */
export const getProjectRootEffectiveSelectionState = (tree: FileSystemEntry[]): SelectionState => {
  if (!tree || tree.length === 0) {
    return 'ignored';
  }

  const selectableTopLevelStates = tree
    .filter((entry) => !entry.isBinary)
    .map((entry) =>
      entry.isDirectory ? getDirectoryEffectiveSelectionState(entry) : entry.selectionState || 'ignored'
    );

  if (selectableTopLevelStates.length === 0) {
    // All top-level items are binary/unselectable
    return 'ignored';
  }

  const allFull = selectableTopLevelStates.every((state) => state === 'full');
  if (allFull) return 'full';

  const allIgnored = selectableTopLevelStates.every((state) => state === 'ignored');
  if (allIgnored) return 'ignored';

  return 'indeterminate';
};

// Helper function to map FsEntry from IPC to frontend FileSystemEntry
// This ensures all necessary frontend-specific fields are initialized.
export function mapFsEntryToFrontend(
  entry: FsEntry,
  initialSelectionState: SelectionState = 'ignored'
): FileSystemEntry {
  const isSelectable = !entry.isBinary;
  // Initial state. This will be refined by persisted selection logic.
  const baseSelectionState = isSelectable ? initialSelectionState : 'ignored';
  const baseImportance = isSelectable && baseSelectionState === 'full' ? DEFAULT_IMPORTANCE : 0;

  const frontendEntry: FileSystemEntry = {
    ...entry,
    selectionState: baseSelectionState,
    importance: baseImportance,
    isOpen: false, // Initialize isOpen as false, now a required field.
    displaySize: isSelectable && entry.isFile && baseSelectionState === 'full' ? entry.size : undefined,
    displayEstimatedTokens:
      isSelectable && entry.isFile && baseSelectionState === 'full'
        ? Math.round(entry.size / FILESIZE_TO_TOKENS_ESTIMATE_FACTOR)
        : undefined,
    children: entry.children
      ? entry.children.map((child) => mapFsEntryToFrontend(child, initialSelectionState))
      : undefined,
    // Aggregate fields are calculated later by updateTreeWithAggregates
  };
  return frontendEntry;
}

/**
 * Recursively builds a list of paths for all currently visible (expanded) tree items.
 * @param nodes The current level of FileSystemEntry nodes to process.
 * @returns An array of string paths.
 */
export function getVisibleTreeItemPaths(nodes: FileSystemEntry[]): string[] {
  const paths: string[] = [];
  function collectPathsRecursive(currentNodes: FileSystemEntry[]) {
    for (const node of currentNodes) {
      paths.push(node.path); // Add current node
      if (node.isDirectory && node.children && node.isOpen) {
        collectPathsRecursive(node.children); // Recurse if directory is open
      }
    }
  }
  collectPathsRecursive(nodes);
  return paths;
}

/**
 * Recursively finds a node by path and toggles its `isOpen` state.
 * Returns a new tree array if the node was found and its state changed.
 * @param tree The current file tree.
 * @param path The path of the node to toggle.
 * @returns A new tree array with the updated node, or the original tree if no change.
 */
export function toggleOpenStateRecursive(tree: FileSystemEntry[], path: string): FileSystemEntry[] {
  let nodeFoundAndToggled = false;
  const newTree = tree.map(function processNode(node): FileSystemEntry {
    if (node.path === path && node.isDirectory) {
      nodeFoundAndToggled = true;
      return { ...node, isOpen: !node.isOpen };
    }
    if (node.isDirectory && node.children && path.startsWith(node.path + '/')) {
      const newChildren = node.children.map(processNode);
      // Check if any child object instance changed
      if (newChildren.some((child, i) => child !== node.children![i])) {
        return { ...node, children: newChildren };
      }
    }
    return node;
  });
  return nodeFoundAndToggled ? newTree : tree;
}

/**
 * Recursively calculates and assigns aggregate size and estimated token counts for directories.
 * For a file, it clears its aggregate counts.
 * For a directory, it sums counts from its selectable child files and aggregate counts from child directories.
 * Returns a new node object if changes were made, otherwise the original node.
 */
function calculateAndAssignAggregatesForNode(node: FileSystemEntry): FileSystemEntry {
  if (node.isFile) {
    // Files do not have aggregate counts of their own; they *contribute* to parent aggregates.
    // Clear any previous aggregate calculation for safety, returning a new object if necessary.
    if (node.aggregateSize !== undefined || node.aggregateEstimatedTokens !== undefined) {
      return {
        ...node,
        aggregateSize: undefined,
        aggregateEstimatedTokens: undefined,
      };
    }
    return node; // Return as is if no change.
  }

  // node.isDirectory is true
  let currentAggregateSize = 0;
  let currentAggregateEstimatedTokens = 0;
  let childrenChanged = false;

  const newChildren = node.children?.map((child) => {
    const updatedChild = calculateAndAssignAggregatesForNode(child); // Recursive call
    if (updatedChild !== child) {
      childrenChanged = true;
    }

    if (updatedChild.isDirectory) {
      // For child directories, sum their calculated aggregate counts.
      currentAggregateSize += updatedChild.aggregateSize || 0;
      currentAggregateEstimatedTokens += updatedChild.aggregateEstimatedTokens || 0;
    } else if (updatedChild.isFile && !updatedChild.isBinary && updatedChild.selectionState === 'full') {
      // For 'full' selected files, sum their displaySize and displayEstimatedTokens.
      currentAggregateSize += updatedChild.displaySize || 0;
      currentAggregateEstimatedTokens += updatedChild.displayEstimatedTokens || 0;
    }
    return updatedChild;
  });

  // If children or aggregate counts changed, return a new node object.
  if (
    childrenChanged ||
    node.aggregateSize !== currentAggregateSize ||
    node.aggregateEstimatedTokens !== currentAggregateEstimatedTokens
  ) {
    return {
      ...node,
      children: newChildren || node.children, // Use newChildren if processed, else original
      aggregateSize: currentAggregateSize,
      aggregateEstimatedTokens: currentAggregateEstimatedTokens,
    };
  }

  return node; // No changes to this node or its children's relevant properties.
}

/**
 * Updates the entire file tree with aggregate counts for directories.
 * Returns a new tree array if any node was changed, otherwise the original tree array.
 */
export function updateTreeWithAggregates(tree: FileSystemEntry[]): FileSystemEntry[] {
  let overallChanged = false;
  const newTree = tree.map((rootNode) => {
    const updatedRootNode = calculateAndAssignAggregatesForNode(rootNode);
    if (updatedRootNode !== rootNode) {
      overallChanged = true;
    }
    return updatedRootNode;
  });
  return overallChanged ? newTree : tree;
}

/**
 * Builds the initial file tree structure for the UI, applying persisted selections and importance.
 * @param rawEntries Raw file entries fetched from the backend.
 * @param persistedPrefixedPaths Array of path strings with importance prefixes, from storage.
 * @returns A fully processed array of `FileSystemEntry` for the UI.
 */
export function buildProcessedTreeWithPersistedSelections(
  rawEntries: FsEntry[],
  persistedPrefixedPaths: string[] | null
): FileSystemEntry[] {
  // 1. Initial map to frontend structure (all 'ignored', importance 0, isOpen false)
  let tree = rawEntries.map((entry) => mapFsEntryToFrontend(entry, 'ignored'));

  // 2. Parse persisted paths
  const persistedDataMap = new Map<string, { importance: number }>();
  if (persistedPrefixedPaths) {
    persistedPrefixedPaths.forEach((pPath) => {
      const { cleanPath, importance } = parsePathWithImportance(pPath);
      persistedDataMap.set(cleanPath, { importance });
    });
  }

  // 3. Recursive function to apply persisted state and determine final states
  function processNodeRecursive(
    node: FileSystemEntry,
    parentIsExplicitlySelectedWithImportance?: number // Importance from an ancestor that was in persistedDataMap
  ): FileSystemEntry {
    let finalSelectionState: SelectionState;
    let finalImportance: number;
    let currentInheritedImportance = parentIsExplicitlySelectedWithImportance;

    const persistedNodeData = persistedDataMap.get(node.path);

    // Determine initial selection and importance based on explicit persistence or inheritance
    if (persistedNodeData && !node.isBinary) {
      finalSelectionState = 'full';
      finalImportance = persistedNodeData.importance;
      currentInheritedImportance = persistedNodeData.importance; // This node's explicit selection overrides parent's
    } else if (parentIsExplicitlySelectedWithImportance && !node.isBinary) {
      finalSelectionState = 'full';
      finalImportance = parentIsExplicitlySelectedWithImportance;
      // currentInheritedImportance remains parentIsExplicitlySelectedWithImportance
    } else {
      // Not explicitly selected by self or ancestor. Default to ignored.
      finalSelectionState = 'ignored';
      finalImportance = 0;
    }

    // Recursively process children, passing down the currentInheritedImportance
    let processedChildren = node.children;
    if (node.isDirectory && node.children) {
      processedChildren = node.children.map((child) => processNodeRecursive(child, currentInheritedImportance));
    }

    // Create a working copy of the node with its processed children and derived/persisted state so far
    let resultNode: FileSystemEntry = {
      ...node,
      children: processedChildren,
      selectionState: finalSelectionState,
      importance: finalImportance,
    };

    // If it's a directory and was NOT explicitly selected (by self or ancestor),
    // its state is now determined by its children's effective states.
    if (
      resultNode.isDirectory &&
      !persistedNodeData &&
      !parentIsExplicitlySelectedWithImportance &&
      !resultNode.isBinary
    ) {
      const childBasedState = getDirectoryEffectiveSelectionState(resultNode);
      resultNode.selectionState = childBasedState;
      if (childBasedState === 'full') {
        // If it becomes 'full' purely due to children, ensure it has at least default importance.
        // Its current `resultNode.importance` would be 0 from the initial `else` block.
        resultNode.importance = DEFAULT_IMPORTANCE;
      } else {
        resultNode.importance = 0; // Not full (ignored or indeterminate), so no importance.
      }
    }

    // Update displaySize/Tokens for files based on their finalSelectionState
    if (resultNode.isFile && !resultNode.isBinary) {
      if (resultNode.selectionState === 'full') {
        resultNode.displaySize = resultNode.size;
        resultNode.displayEstimatedTokens = Math.round(resultNode.size / FILESIZE_TO_TOKENS_ESTIMATE_FACTOR);
      } else {
        resultNode.displaySize = undefined;
        resultNode.displayEstimatedTokens = undefined;
        resultNode.importance = 0; // Ignored files must have 0 importance
      }
    } else if (resultNode.isDirectory && resultNode.selectionState !== 'full') {
      // If a directory isn't 'full', its importance should generally be 0,
      // unless it was explicitly set by persistedDataMap (handled at the start).
      if (!persistedDataMap.has(resultNode.path)) {
        resultNode.importance = 0;
      }
    }
    return resultNode;
  }

  tree = tree.map((node) => processNodeRecursive(node));

  // 4. Final pass for aggregates
  tree = updateTreeWithAggregates(tree);

  return tree;
}
