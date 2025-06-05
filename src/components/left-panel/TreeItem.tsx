// src/components/TreeItem.tsx
import React, { useMemo, useCallback, ReactElement } from 'react';
import { getDirectoryEffectiveSelectionState, MAX_IMPORTANCE } from '@/utils/fileTreeUtils';
import { FileSystemEntry } from '@/store/atoms';
import {
  Folder,
  File as FileIcon,
  ChevronRight,
  ChevronDown,
  Square,
  CheckSquare,
  MinusSquare,
  XSquare,
  Package,
  FolderOpen,
  LucideProps,
  Star,
  Plus,
  Minus,
  FileText,
} from 'lucide-react';
import clsx from 'clsx';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Copy } from 'lucide-react';

const MAX_IMPORTANCE_DISPLAY = MAX_IMPORTANCE - 1;

export interface TreeItemProps {
  id: string;
  entry: FileSystemEntry;
  isFocused: boolean;
  isUiSelected: boolean;
  isAnyFileUiSelected: boolean;
  uiSelectedFilePaths: Set<string>;
  focusedPath: string | null;
  onToggleSelection: (entry: FileSystemEntry) => void;
  onItemRowClick: (entry: FileSystemEntry, event: React.MouseEvent) => void;
  onToggleOpen: (entryPath: string) => void;
  onIncreaseImportance: (entry: FileSystemEntry) => void;
  onDecreaseImportance: (entry: FileSystemEntry) => void;
  onContextMenuAction: (action: 'copyAsPrompt', entryPath: string) => void;
  onViewFileRequest: (entry: FileSystemEntry) => void;
}

const IconWithTooltip: React.FC<{ title: string; children: ReactElement<LucideProps> }> = ({ title, children }) => {
  return <span title={title}>{children}</span>;
};

const TreeItem: React.FC<TreeItemProps> = React.memo((props) => {
  const {
    id,
    entry,
    isFocused,
    isUiSelected,
    onToggleSelection,
    onItemRowClick,
    onToggleOpen,
    onIncreaseImportance,
    onDecreaseImportance,
    onContextMenuAction,
    onViewFileRequest,
  } = props;

  const isUnselectable = !!entry.isBinary;
  const isOpen = entry.isOpen;

  const [contextMenuVisible, setContextMenuVisible] = React.useState(false);
  const [contextMenuPos, setContextMenuPos] = React.useState({ x: 0, y: 0 });
  const contextMenuRef = React.useRef<HTMLDivElement>(null);
  useClickOutside(contextMenuRef, () => setContextMenuVisible(false));

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onItemRowClick(entry, event);
    setContextMenuPos({ x: event.clientX, y: event.clientY });
    setContextMenuVisible(true);
  };

  const handleContextMenuOptionClick = (action: 'copyAsPrompt' | 'viewFile') => {
    setContextMenuVisible(false);
    if (action === 'copyAsPrompt') {
      onContextMenuAction(action, entry.path);
    } else if (action === 'viewFile') {
      onViewFileRequest(entry);
    }
  };

  const effectiveSelectionState = useMemo(() => {
    return entry.isDirectory ? getDirectoryEffectiveSelectionState(entry) : entry.selectionState;
  }, [entry]);

  const handleToggleOpenClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (entry.isDirectory && !isUnselectable) {
        onToggleOpen(entry.path);
      }
    },
    [entry.isDirectory, entry.path, isUnselectable, onToggleOpen]
  );

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isUnselectable) {
        onToggleSelection(entry);
      }
    },
    [entry, onToggleSelection, isUnselectable]
  );

  const handleRowClickInternal = useCallback(
    (event: React.MouseEvent) => {
      onItemRowClick(entry, event);
    },
    [entry, onItemRowClick]
  );

  const handleIncreaseImportanceClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isUnselectable && effectiveSelectionState === 'full') {
        onIncreaseImportance(entry);
      }
    },
    [entry, onIncreaseImportance, isUnselectable, effectiveSelectionState]
  );

  const handleDecreaseImportanceClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isUnselectable && effectiveSelectionState === 'full') {
        onDecreaseImportance(entry);
      }
    },
    [entry, onDecreaseImportance, isUnselectable, effectiveSelectionState]
  );

  const CheckboxIcon = useMemo(() => {
    const baseClasses = 'mr-2 shrink-0';
    let iconElement: React.ReactElement<LucideProps>;
    let tooltipText = '';

    if (isUnselectable) {
      iconElement = <XSquare size={16} className={`${baseClasses} text-neutral-600`} />;
      tooltipText = 'Cannot select (binary or >100KB)';
    } else {
      switch (effectiveSelectionState) {
        case 'full':
          iconElement = <CheckSquare size={16} className={`${baseClasses} text-indigo-400`} />;
          tooltipText = `Selected (Importance: ${entry.importance || 1})`;
          break;
        case 'ignored':
          iconElement = <Square size={16} className={`${baseClasses} text-neutral-500`} />;
          tooltipText = 'Not selected';
          break;
        case 'indeterminate':
          iconElement = <MinusSquare size={16} className={`${baseClasses} text-yellow-400`} />;
          tooltipText = 'Partially selected';
          break;
        default:
          iconElement = <Square size={16} className={`${baseClasses} text-neutral-600`} />;
          tooltipText = 'Unknown selection state';
      }
    }
    return <IconWithTooltip title={tooltipText}>{iconElement}</IconWithTooltip>;
  }, [effectiveSelectionState, isUnselectable, entry.importance]);

  const FileOrFolderIcon = useMemo(() => {
    const baseClasses = 'mr-1.5 shrink-0';
    let iconElement: React.ReactElement<LucideProps>;

    if (entry.isDirectory) {
      iconElement =
        isOpen && !isUnselectable ? (
          <FolderOpen size={16} className={`${baseClasses} text-indigo-400`} />
        ) : (
          <Folder size={16} className={`${baseClasses} ${isUnselectable ? 'text-neutral-600' : 'text-indigo-400'}`} />
        );
    } else {
      if (isUnselectable) {
        iconElement = <Package size={16} className={`${baseClasses} text-neutral-600`} />;
      } else {
        iconElement = <FileIcon size={16} className={`${baseClasses} text-neutral-400`} />;
      }
    }
    return iconElement;
  }, [entry.isDirectory, isOpen, isUnselectable]);

  const itemClasses = clsx(
    'flex items-center p-1 rounded group w-full select-none',
    isUnselectable ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-neutral-800/60',
    isUiSelected && !isUnselectable
      ? 'bg-sky-700/60 hover:bg-sky-700/70 ring-1 ring-sky-500/50'
      : isFocused
        ? 'bg-neutral-700/70 ring-1 ring-indigo-500/50'
        : ''
  );
  const nameClasses = clsx(
    'font-mono truncate group-hover:text-neutral-100 flex-grow',
    isUiSelected && !isUnselectable
      ? 'text-sky-100'
      : isFocused && !isUnselectable
        ? 'text-neutral-100'
        : isUnselectable
          ? 'text-neutral-600 italic'
          : 'text-neutral-300'
  );

  const renderStars = () => {
    if (!isUnselectable && effectiveSelectionState === 'full' && entry.importance > 1) {
      const starCount = Math.min(entry.importance - 1, MAX_IMPORTANCE_DISPLAY);
      return (
        <div className="flex items-center ml-1 shrink-0" title={`Importance: ${entry.importance}`}>
          {Array.from({ length: starCount }).map((_, i) => (
            <Star key={i} size={10} className="text-yellow-400 fill-yellow-400" />
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="text-sm" id={id}>
      <div
        className={itemClasses}
        onClick={handleRowClickInternal}
        onContextMenu={isUnselectable ? undefined : handleContextMenu}
        title={
          entry.name +
          (isUnselectable
            ? ' (Cannot be selected)'
            : effectiveSelectionState === 'full'
              ? ` (Importance: ${entry.importance || 1})`
              : '')
        }
      >
        <div
          onClick={handleCheckboxClick}
          onContextMenu={(e) => e.stopPropagation()}
          className={`cursor-${isUnselectable ? 'not-allowed' : 'pointer'} p-0.5 flex items-center justify-center`}
        >
          {CheckboxIcon}
        </div>

        {entry.isDirectory ? (
          <div
            onClick={handleToggleOpenClick}
            className={`cursor-${isUnselectable ? 'not-allowed' : 'pointer'} w-4 mr-1 shrink-0 flex items-center justify-center text-neutral-500 group-hover:text-neutral-400`}
          >
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        ) : (
          <span className="w-4 mr-1 shrink-0"></span>
        )}
        {FileOrFolderIcon}
        <span className={nameClasses}>{entry.name}</span>
        {renderStars()}

        {((entry.isFile && !isUnselectable && effectiveSelectionState === 'full') ||
          (entry.isDirectory && !isUnselectable && effectiveSelectionState === 'full')) && (
          <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
            <button
              onClick={handleDecreaseImportanceClick}
              disabled={entry.importance <= 1}
              className="p-0.5 text-neutral-400 hover:text-sky-400 rounded disabled:opacity-30 disabled:cursor-not-allowed"
              title="Decrease importance"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={handleIncreaseImportanceClick}
              disabled={entry.importance >= 4}
              className="p-0.5 text-neutral-400 hover:text-sky-400 rounded disabled:opacity-30 disabled:cursor-not-allowed"
              title="Increase importance"
            >
              <Plus size={14} />
            </button>
          </div>
        )}

        <span className="ml-2 text-xs text-neutral-500 shrink-0 font-sans whitespace-nowrap min-w-[40px] text-right pr-1">
          {entry.isDirectory &&
          !isOpen &&
          entry.aggregateSize &&
          entry.aggregateEstimatedTokens &&
          (entry.aggregateSize > 0 || entry.aggregateEstimatedTokens > 0)
            ? `~${entry.aggregateEstimatedTokens}t`
            : entry.isFile &&
                !isUnselectable &&
                effectiveSelectionState === 'full' &&
                entry.displaySize &&
                entry.displayEstimatedTokens
              ? `~${entry.displayEstimatedTokens}t`
              : null}
        </span>
      </div>

      {isOpen && entry.isDirectory && !isUnselectable && entry.children && (
        <div className="pl-5 border-l border-neutral-800 ml-[10px]">
          {entry.children.length > 0 ? (
            entry.children.map((child) => {
              const childKey = child.path;
              const childDomId = `tree-item-${child.path.replace(/[^\w-]/g, '_')}`;
              const childIsFocused = props.focusedPath === child.path;
              const childIsUiSelected = props.uiSelectedFilePaths.has(child.path);

              return (
                <TreeItem
                  key={childKey}
                  id={childDomId}
                  entry={child}
                  isFocused={childIsFocused}
                  isUiSelected={childIsUiSelected}
                  isAnyFileUiSelected={props.isAnyFileUiSelected}
                  uiSelectedFilePaths={props.uiSelectedFilePaths}
                  focusedPath={props.focusedPath}
                  onToggleSelection={props.onToggleSelection}
                  onItemRowClick={props.onItemRowClick}
                  onToggleOpen={props.onToggleOpen}
                  onIncreaseImportance={props.onIncreaseImportance}
                  onDecreaseImportance={props.onDecreaseImportance}
                  onContextMenuAction={props.onContextMenuAction}
                  onViewFileRequest={props.onViewFileRequest}
                />
              );
            })
          ) : (
            <div className="text-xs text-neutral-500 italic p-1">Empty directory</div>
          )}
        </div>
      )}
      {contextMenuVisible && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-neutral-700 border border-neutral-600 rounded-md shadow-lg text-neutral-100 text-xs py-1 min-w-[220px]"
          style={{ top: `${contextMenuPos.y}px`, left: `${contextMenuPos.x}px` }}
        >
          <button
            onClick={() => handleContextMenuOptionClick('copyAsPrompt')}
            className="flex items-center w-full px-3 py-1.5 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <Copy size={14} className="mr-2 shrink-0" /> Copy Selected Files as Prompt
          </button>
          <button
            onClick={() => handleContextMenuOptionClick('viewFile')}
            disabled={entry.isBinary || entry.isDirectory}
            className="flex items-center w-full px-3 py-1.5 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <FileText size={14} className="mr-2 shrink-0" /> View File
          </button>
        </div>
      )}
    </div>
  );
});
export default TreeItem;
