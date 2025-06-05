// src/components/FileExplorerRootItem.tsx
import React from 'react';
import { FolderOpen, Square, CheckSquare, MinusSquare, RefreshCw, LucideProps } from 'lucide-react';
import { SelectionState } from '@/store/atoms';

interface FileExplorerRootItemProps {
  rootPath: string;
  effectiveSelection: SelectionState;
  isLoading: boolean;
  onToggleSelectAll: () => void;
  onSetFocusedPathToNull: () => void;
  onSetLastClickedPathToNull: () => void;
}

const FileExplorerRootItem: React.FC<FileExplorerRootItemProps> = ({
  rootPath,
  effectiveSelection,
  isLoading,
  onToggleSelectAll,
  onSetFocusedPathToNull,
  onSetLastClickedPathToNull,
}) => {
  let RootCheckboxIconComponent: React.ElementType<LucideProps>;
  switch (effectiveSelection) {
    case 'full':
      RootCheckboxIconComponent = CheckSquare;
      break;
    case 'indeterminate':
      RootCheckboxIconComponent = MinusSquare;
      break;
    default:
      RootCheckboxIconComponent = Square;
  }

  const rootCheckboxIconColor =
    effectiveSelection === 'full'
      ? 'text-indigo-400'
      : effectiveSelection === 'indeterminate'
        ? 'text-yellow-400'
        : 'text-neutral-500';

  const handleRootClick = () => {
    onToggleSelectAll();
    onSetFocusedPathToNull();
    onSetLastClickedPathToNull();
  };

  return (
    <div
      className="flex items-center p-1 rounded group w-full cursor-pointer hover:bg-neutral-800/60 -ml-2"
      onClick={handleRootClick}
      title={`Project Root: ${rootPath} (Click to select/deselect all)`}
    >
      <div className="p-0.5 flex items-center justify-center">
        <RootCheckboxIconComponent size={16} className={`mr-2 shrink-0 ${rootCheckboxIconColor}`} />
      </div>
      <span className="w-4 mr-1 shrink-0"></span>
      {isLoading ? (
        <RefreshCw size={14} className="animate-spin mr-1.5 text-yellow-400" />
      ) : (
        <FolderOpen size={16} className="mr-1.5 shrink-0 text-indigo-400" />
      )}
      <span className="font-mono truncate group-hover:text-neutral-100 text-neutral-100 font-semibold">
        <span className="font-normal text-neutral-300">{rootPath}</span>
      </span>
    </div>
  );
};

export default FileExplorerRootItem;
