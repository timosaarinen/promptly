// src/components/NotificationListeners.tsx
import { useEffect, useRef } from 'react';
import { useSetAtom } from 'jotai';
import {
  rootPathAtom,
  selectedFileEntriesAtom,
  fileSystemChangeIndicatorAtom,
  appFocusRefreshTriggerAtom,
  logMessagesAtom,
} from '@/store/atoms';
import { electronApi, SettingsUpdateEvent, GlobalRootPathUpdatedEvent } from '@shared/electron-api';
import { debounce } from 'lodash';
import { useHelpViewer } from '@/hooks/useHelpViewer';

export default function NotificationListeners() {
  const setRootPath = useSetAtom(rootPathAtom);
  const setSelectedFileEntries = useSetAtom(selectedFileEntriesAtom);
  const setFsChangeIndicator = useSetAtom(fileSystemChangeIndicatorAtom);
  const setAppFocusRefreshTrigger = useSetAtom(appFocusRefreshTriggerAtom);
  const setLogMessages = useSetAtom(logMessagesAtom);
  const { showHelp } = useHelpViewer();

  const debouncedFsRefresh = useRef(
    debounce((eventPath: string, eventType: string) => {
      const message = `FS: ${eventType} at ${eventPath}`;
      setLogMessages(message);
      setFsChangeIndicator((prev) => prev + 1);
    }, 300)
  );

  useEffect(() => {
    const cleanupMainMsg = electronApi.onMainProcessMessage((msg: string) => console.log(msg));
    const cleanupFs = electronApi.onFileSystemChange((event) => {
      debouncedFsRefresh.current(event.path, event.eventType);
    });
    const cleanupSettings = electronApi.onSettingsUpdated((event: SettingsUpdateEvent) => {
      if (event.type === 'respectGitignore') {
        setLogMessages(`Setting: Respect .gitignore ${event.value ? 'enabled' : 'disabled'}. Refreshing...`);
        setFsChangeIndicator((prev) => prev + 1);
      }
    });
    const cleanupAppFocused = electronApi.onAppFocused(() => {
      setAppFocusRefreshTrigger((prev) => prev + 1);
      // NOTE: don't increment fsChangeIndicator here (to prevent FileExplorer from reloading the entire tree on focus)
      // Also, no log message for app focus as it's frequent and not a direct system change.
    });
    const cleanupShowHelpContent = electronApi.onShowHelpContent(() => {
      showHelp();
    });
    const cleanupGlobalRootPathUpdated = electronApi.onGlobalRootPathUpdated((event: GlobalRootPathUpdatedEvent) => {
      setLogMessages(`Root path changed by main process to: ${event.newRootPath}`);
      setRootPath(event.newRootPath);
      setSelectedFileEntries(new Map());
    });

    return () => {
      cleanupMainMsg();
      cleanupFs();
      cleanupSettings();
      cleanupAppFocused();
      cleanupShowHelpContent();
      cleanupGlobalRootPathUpdated();
    };
  }, [setLogMessages, setFsChangeIndicator, setAppFocusRefreshTrigger, showHelp, setRootPath, setSelectedFileEntries]);

  return null;
}
