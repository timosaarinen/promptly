// src/components/right-panel/ResponseInputArea.tsx
import React, { useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface ResponseInputAreaProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  onProcess: () => void;
  onCancel: () => void;
  isProcessing: boolean;
  mode: 'initial' | 'follow-up';
  title?: string;
}

const ResponseInputArea: React.FC<ResponseInputAreaProps> = ({
  inputValue,
  onInputChange,
  onProcess,
  onCancel,
  isProcessing,
  mode,
  title,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 300; // Max height for the textarea
      const targetHeight = Math.min(scrollHeight, maxHeight);
      textareaRef.current.style.height = `${targetHeight}px`;
      textareaRef.current.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [inputValue]);

  return (
    <div className={`p-3 rounded-lg ${mode === 'follow-up' ? 'bg-neutral-800/50 border border-neutral-700 mt-4' : ''}`}>
      {title && <h4 className="text-md font-medium text-neutral-200 mb-2">{title}</h4>}
      <textarea
        ref={textareaRef}
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder="Paste the full LLM response (including XML) here..."
        className="w-full p-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-200 font-mono text-sm resize-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 min-h-[100px]"
        disabled={isProcessing}
        rows={5}
      />
      <div className="mt-3 flex space-x-2">
        <button
          onClick={onProcess}
          disabled={isProcessing || !inputValue.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium disabled:bg-neutral-700 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isProcessing ? <Loader2 size={18} className="animate-spin mr-2" /> : null}
          {mode === 'initial' ? 'Process Response' : 'Process This Response'}
        </button>
        <button
          onClick={onCancel}
          disabled={isProcessing}
          className="px-4 py-2 bg-neutral-600 hover:bg-neutral-500 text-neutral-200 rounded-md text-sm font-medium disabled:opacity-50"
        >
          {mode === 'initial' ? 'Clear Input' : 'Cancel This Input'}
        </button>
      </div>
    </div>
  );
};

export default ResponseInputArea;
