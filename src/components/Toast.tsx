// src/components/Toast.tsx
import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { toastMessageAtom, isToastVisibleAtom } from '@/store/atoms';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  duration?: number; // in ms
}

const Toast: React.FC<ToastProps> = ({ duration = 3500 }) => {
  const [message, setMessage] = useAtom(toastMessageAtom);
  const [isVisible, setIsVisible] = useAtom(isToastVisibleAtom);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isVisible) {
      timer = setTimeout(() => {
        setIsVisible(false);
      }, duration);
    }
    return () => clearTimeout(timer);
  }, [isVisible, duration, setIsVisible]);

  const handleClose = () => {
    setIsVisible(false);
  };

  if (!message || !message.text) {
    return null;
  }

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="text-green-300" size={20} />;
      case 'error':
        return <AlertTriangle className="text-red-300" size={20} />;
      case 'info':
      default:
        return <Info className="text-blue-300" size={20} />;
    }
  };

  const getColors = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'bg-green-700/80 border-green-600 backdrop-blur-sm';
      case 'error':
        return 'bg-red-700/80 border-red-600 backdrop-blur-sm';
      case 'info':
      default:
        return 'bg-neutral-700/80 border-neutral-600 backdrop-blur-sm';
    }
  };

  return (
    <div
      className={`fixed top-5 right-5 mt-2 mr-2 p-4 rounded-xl shadow-xl text-neutral-100 ${getColors(message.type)} border flex items-center space-x-3 z-50 transition-all duration-300 transform ${
        isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full' // Slide in from right
      }`}
      role="alert"
      aria-live="assertive"
      onTransitionEnd={() => {
        if (!isVisible) setMessage({ text: null, type: 'info' });
      }}
    >
      {getIcon(message.type)}
      <span className="flex-grow text-sm">{message.text}</span>
      <button
        onClick={handleClose}
        className="text-neutral-300 hover:text-neutral-100 p-1 -mr-1 -my-1 rounded-full hover:bg-black/20"
      >
        <X size={18} />
      </button>
    </div>
  );
};

export default Toast;
