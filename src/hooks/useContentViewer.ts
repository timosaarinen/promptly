// src/hooks/useContentViewer.ts
import { useSetAtom } from 'jotai';
import {
  isContentViewerVisibleAtom,
  contentViewerContentAtom,
  contentViewerContentTypeAtom,
  contentViewerTitleAtom,
} from '@/store/atoms';
import { useCallback } from 'react';

export type ContentViewerContentType = 'markdown' | 'text';

export function useContentViewer() {
  const setIsVisible = useSetAtom(isContentViewerVisibleAtom);
  const setContent = useSetAtom(contentViewerContentAtom);
  const setContentType = useSetAtom(contentViewerContentTypeAtom);
  const setTitle = useSetAtom(contentViewerTitleAtom);

  const showContent = useCallback(
    (content: string, type: ContentViewerContentType, title?: string) => {
      setContent(content);
      setContentType(type);
      setTitle(title ?? null);
      setIsVisible(true);
    },
    [setContent, setContentType, setTitle, setIsVisible]
  );

  const hideContent = useCallback(() => {
    setIsVisible(false);
  }, [setIsVisible]);

  return { showContent, hideContent };
}
