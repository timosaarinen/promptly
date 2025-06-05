// src/components/left-panel/LeftPanelContainer.tsx
import React from 'react';
import FileExplorer from './FileExplorer';
import GitStatusPanel from './GitStatusPanel';
import RootSelector from './RootSelector';

const LeftPanelContainer: React.FC = () => {
  return (
    <div className="w-1/2 flex flex-col space-y-0 min-w-[400px] max-w-[800px]">
      <div className="flex-grow flex flex-col bg-neutral-900 min-h-0">
        <div className="p-3 border-b border-neutral-700 shrink-0">
          <RootSelector />
        </div>
        <div className="flex-grow overflow-y-auto p-3 pt-2 min-h-0">
          <FileExplorer />
        </div>
        <div className="shrink-0">
          <GitStatusPanel />
        </div>
      </div>
    </div>
  );
};

export default LeftPanelContainer;
