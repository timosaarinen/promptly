// src/components/shared/MarkdownViewer.tsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X } from 'lucide-react';

interface MarkdownViewerProps {
  markdownContent: string;
  onClose: () => void;
}

const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ markdownContent, onClose }) => {
  return (
    <div className="flex flex-col h-full bg-neutral-800 p-4 rounded-lg border border-neutral-700 relative">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 p-1.5 text-neutral-400 hover:text-neutral-100 rounded-full hover:bg-neutral-700/50 z-10"
        aria-label="Close help"
      >
        <X size={20} />
      </button>
      <div className="flex-grow overflow-y-auto pr-2 prose prose-sm prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownContent}</ReactMarkdown>
      </div>
    </div>
  );
};

export default MarkdownViewer;
