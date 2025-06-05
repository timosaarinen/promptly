// src/components/ContentViewer.tsx
import React, { useEffect, useMemo, useRef } from 'react';
import { useAtom } from 'jotai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X } from 'lucide-react';
import {
  isContentViewerVisibleAtom,
  contentViewerContentAtom,
  contentViewerContentTypeAtom,
  contentViewerTitleAtom,
} from '@/store/atoms';
import { useContentViewer } from '@/hooks/useContentViewer';

const markdownPlugins = [remarkGfm];
const SMOOTH_SCROLL_AMOUNT = 50; // Pixels to scroll on arrow key press

const ContentViewer: React.FC = () => {
  const [isVisible] = useAtom(isContentViewerVisibleAtom);
  const [content] = useAtom(contentViewerContentAtom);
  const [contentType] = useAtom(contentViewerContentTypeAtom);
  const [title] = useAtom(contentViewerTitleAtom);
  const { hideContent } = useContentViewer();
  const scrollableContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        hideContent();
        return;
      }

      if (scrollableContentRef.current) {
        // Check if the event target is the scrollable div itself or one of its children
        const isScrollableAreaFocused =
          scrollableContentRef.current === event.target || scrollableContentRef.current.contains(event.target as Node);

        if (isScrollableAreaFocused) {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            scrollableContentRef.current.scrollBy({
              top: SMOOTH_SCROLL_AMOUNT,
              behavior: 'smooth',
            });
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            scrollableContentRef.current.scrollBy({
              top: -SMOOTH_SCROLL_AMOUNT,
              behavior: 'smooth',
            });
          }
        }
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
      // Focus the scrollable content area when the viewer becomes visible
      // to enable keyboard scrolling.
      scrollableContentRef.current?.focus();
    } else {
      document.removeEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVisible, hideContent]);

  const renderedMarkdown = useMemo(() => {
    // Call useMemo unconditionally, but its content can be conditional.
    if (contentType === 'markdown' && content) {
      return (
        <ReactMarkdown remarkPlugins={markdownPlugins} className="prose prose-sm sm:prose-base prose-invert max-w-none">
          {content}
        </ReactMarkdown>
      );
    }
    return null;
  }, [content, contentType]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900 border border-neutral-700 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-neutral-700 shrink-0">
        <h2 className="text-lg font-semibold text-neutral-100 truncate pr-2">
          {title || (contentType === 'markdown' ? 'Markdown Viewer' : 'Text Viewer')}
        </h2>
        <button
          onClick={hideContent}
          className="p-1.5 text-neutral-400 hover:text-neutral-100 rounded-full hover:bg-neutral-700/50"
          aria-label="Close content viewer"
        >
          <X size={20} />
        </button>
      </div>
      <div
        ref={scrollableContentRef}
        tabIndex={-1} // Make it focusable
        className="flex-grow overflow-y-auto p-4 sm:p-6 focus:outline-none"
        style={{ willChange: 'transform' }} // Hint for scroll optimization
      >
        {contentType === 'markdown' ? (
          renderedMarkdown
        ) : (
          <pre className="whitespace-pre-wrap text-sm text-neutral-200 font-mono">{content}</pre>
        )}
      </div>
    </div>
  );
};

export default ContentViewer;
