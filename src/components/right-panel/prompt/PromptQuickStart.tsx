// src/components/PromptQuickStart.tsx
import React from 'react';
import { ExternalLink } from 'lucide-react';
import { useHelpViewer } from '@/hooks/useHelpViewer';

const PromptQuickStart: React.FC = () => {
  const { showHelp } = useHelpViewer();

  return (
    <div className="text-center text-neutral-400 text-sm space-y-6 p-4 mx-auto">
      <p className="text-base text-neutral-300">Select files for context, choose a mode, then describe your task.</p>

      <div>
        <h4 className="font-semibold text-neutral-200 mb-2">Quick Tips:</h4>
        <ul className="list-none space-y-1 text-neutral-400">
          <li>
            Use <code className="bg-neutral-700/50 px-1 py-0.5 rounded text-xs text-neutral-300">Ask Mode</code> for
            questions or code explanations.
          </li>
          <li>
            Use <code className="bg-neutral-700/50 px-1 py-0.5 rounded text-xs text-neutral-300">Architect Mode</code>{' '}
            for complex tasks requiring file modifications.
          </li>
          <li>
            Paste LLM's XML response into the{' '}
            <code className="bg-neutral-700/50 px-1 py-0.5 rounded text-xs text-neutral-300">'Apply'</code> tab.
          </li>
        </ul>
      </div>

      <div>
        <h4 className="font-semibold text-neutral-200 mb-2">Examples:</h4>
        <pre className="bg-neutral-800/60 p-3 rounded-md text-left text-xs text-neutral-300 whitespace-pre-wrap overflow-x-auto">
          {`Implement a new settings toggle for feature X.
Refactor the UserProfile component for better readability.
[Ask] Explain how the authentication flow works in this project.`}
        </pre>
      </div>

      <button
        onClick={showHelp}
        className="inline-flex items-center justify-center px-4 py-2 border border-neutral-600 text-sm font-medium rounded-md shadow-sm text-neutral-300 bg-neutral-700/40 hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-900 focus:ring-indigo-500"
      >
        <ExternalLink size={16} className="mr-2" />
        View Full Guide
      </button>
    </div>
  );
};

export default PromptQuickStart;
