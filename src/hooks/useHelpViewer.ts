// src/hooks/useHelpViewer.ts
import { useCallback } from 'react';
import { useContentViewer } from '@/hooks/useContentViewer';
import { electronApi } from '@shared/electron-api';
import { getErrorMessage } from '@/utils/errorUtils';

export function useHelpViewer() {
  const { showContent } = useContentViewer();

  const showHelp = useCallback(async () => {
    try {
      const response: string = await electronApi.readPublicFile('help.md');
      showContent(response, 'markdown', 'Promptly Help');
    } catch (err) {
      console.error(`[useHelpViewer] Unexpected error during help guide load: ${getErrorMessage(err)}`);
    }
  }, [showContent]);

  return { showHelp };
}
