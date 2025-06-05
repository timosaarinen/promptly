// src/utils/promptGenerationUtils.ts
import { electronApi } from '@shared/electron-api';
import { getErrorMessage } from './errorUtils';

export interface CopyFilesAsPromptOptions {
  includeGitDiff?: boolean;
  includeSummary?: boolean;
  includeDirectoryStructure?: boolean;
  includeGitCommitHash?: boolean;
}

export type ShowToastFn = (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;

export async function copyFilesAsPromptToClipboard(
  rootPath: string,
  prefixedFilePaths: string[],
  promptPrefix: string,
  showToast: ShowToastFn,
  options?: CopyFilesAsPromptOptions
): Promise<void> {
  if (!rootPath) {
    showToast('Root path is not set. Cannot assemble context.', 'error');
    return;
  }
  if (prefixedFilePaths.length === 0) {
    showToast('No files provided to assemble context.', 'info');
    return;
  }

  try {
    const contextResponse = await electronApi.assembleContext({
      rootPath,
      selectedFilePaths: prefixedFilePaths,
      includeGitDiff: options?.includeGitDiff ?? false,
      includeSummary: options?.includeSummary ?? false,
      includeDirectoryStructure: options?.includeDirectoryStructure ?? false,
      includeGitCommitHash: options?.includeGitCommitHash ?? false,
    });

    const fullPromptContent = promptPrefix + contextResponse.xml;

    await electronApi.copyToClipboard(fullPromptContent);
    showToast('Selected files context copied to clipboard!', 'success');
  } catch (err) {
    const errorMsg = getErrorMessage(err);
    showToast(`Error copying files context: ${errorMsg}`, 'error');
    console.error('[copyFilesAsPromptToClipboard] Error:', err);
  }
}
