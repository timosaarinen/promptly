// src/App.tsx
import { useAtom } from 'jotai';
import { isLeftPanelVisibleAtom } from './store/atoms';
import NotificationListeners from './components/NotificationListeners';
import LeftPanelContainer from './components/left-panel/LeftPanelContainer';
import Toast from './components/Toast';
import StatusBar from './components/StatusBar';
import RightPanelContainer from './components/right-panel/RightPanelContainer';
import ContentViewer from './components/ContentViewer';
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys';
import { useFileSelectionPersistence } from './hooks/useFileSelectionPersistence';

function App() {
  useGlobalHotkeys();
  useFileSelectionPersistence();
  const [isLeftPanelVisible] = useAtom(isLeftPanelVisibleAtom);

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-200 font-sans">
      <NotificationListeners />
      <Toast />
      <ContentViewer />
      <div className="flex flex-1 min-h-0">
        {/* Left Panel */}
        {isLeftPanelVisible && <LeftPanelContainer />}

        {/* Right Panel */}
        <div className={`p-4 w-full flex flex-col min-w-[600px]`}>
          <RightPanelContainer />
        </div>
      </div>
      <StatusBar />
    </div>
  );
}

export default App;
