// src/hooks/useToast.ts
import { useCallback } from 'react';
import { useSetAtom } from 'jotai';
import { toastMessageAtom, isToastVisibleAtom, ToastMessage } from '@/store/atoms';
import { getErrorMessage } from '@/utils/errorUtils';

export const useToast = () => {
  const setToastMessage = useSetAtom(toastMessageAtom);
  const setIsToastVisible = useSetAtom(isToastVisibleAtom);

  const showToast = useCallback(
    (text: string, type: ToastMessage['type'] = 'info') => {
      setToastMessage({ text, type });
      setIsToastVisible(true);
    },
    [setToastMessage, setIsToastVisible]
  );

  // Use case: catch(err) { showToastForError('Context', err); }
  // Can also pass 'setError' callback to set local error state, for example, with the same message.
  const showToastForError = useCallback(
    (message: string, err?: unknown, setError?: (text: string) => void) => {
      const msg = err ? `${message}: ${getErrorMessage(err)}` : message;
      if (setError) {
        setError(msg);
      }
      console.error(msg);
      showToast(msg, 'error');
    },
    [showToast]
  );

  return { showToast, showToastForError };
};
