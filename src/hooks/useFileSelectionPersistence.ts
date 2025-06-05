// src/hooks/useFileSelectionPersistence.ts
import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { rootPathAtom, fileTreeAtom, initialSelectionAppliedAtom, FileSystemEntry } from '@/store/atoms';
import { getErrorMessage } from '@/utils/errorUtils';
import { electronApi } from '@shared/electron-api';
import { debounce } from 'lodash';
import { getSelectionRulesForPersistence } from '@/utils/fileTreeUtils';

/**
 * Custom hook to persist the current file selection state (including importance)
 * to Electron Store. It debounces saves to avoid excessive writes.
 *
 * Persistence Strategy:
 * - Files: If a file is 'full' selected and not binary, its path (prefixed with
 *   importance markers if not default) is saved.
 * - Directories: A directory's path (prefixed with importance) is saved *only if*
 *   it is 'full' selected AND `isUniformlySelectedRecursive` returns true for it
 *   (meaning the directory itself and all its selectable children are 'full' selected
 *   with the same importance level as the directory).
 *   If a directory is 'full' selected but not uniformly (e.g., children have different
 *   importances or selection states), its path is not saved directly. Instead, its
 *   individually selected children (files or uniformly selected subdirectories) will be
 *   saved if they meet their own criteria.
 * This strategy aims for a compact representation of selections in storage.
 */
export function useFileSelectionPersistence() {
  const rootPath = useAtomValue(rootPathAtom);
  const fileTree = useAtomValue(fileTreeAtom);
  const initialSelectionApplied = useAtomValue(initialSelectionAppliedAtom);

  const debouncedSaveSelectionRef = useRef(
    debounce(async (currentRootPath: string, currentFileTree: FileSystemEntry[]) => {
      if (!currentRootPath || !currentFileTree || currentFileTree.length === 0) return;

      try {
        const selectionRules = getSelectionRulesForPersistence(currentFileTree);
        await electronApi.settingsSetFileSelectionForRoot(currentRootPath, selectionRules);
        console.log(
          `[SelectionPersistence] Persisted ${selectionRules.length} selection rules for ${currentRootPath}.`
        );
      } catch (error) {
        console.error(
          `[SelectionPersistence] Failed to persist file selection for ${currentRootPath}: ${getErrorMessage(error)}`
        );
      }
    }, 1000) // Debounce period of 1 second
  );

  useEffect(() => {
    // Only persist selections after the initial selections have been loaded and applied for the current root path.
    // This prevents saving an empty/default selection state overwriting a valid persisted one during initial load.
    if (rootPath && initialSelectionApplied) {
      debouncedSaveSelectionRef.current(rootPath, fileTree);
    }
  }, [rootPath, fileTree, initialSelectionApplied]);
}
