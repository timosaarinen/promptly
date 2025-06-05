// electron/ipcHandlers/ipcUtils.ts
import { BrowserWindow, IpcMainInvokeEvent } from 'electron';

/**
 * Retrieves the BrowserWindow instance from an IPC event.
 *
 * Returns [win, error]: win is BrowserWindow or null; error is string or null.
 */
export function getWindowFromEvent(event: IpcMainInvokeEvent): [BrowserWindow | null, string | null] {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return [null, 'No BrowserWindow found for this IPC event sender.'];
  if (win.isDestroyed()) return [null, 'BrowserWindow has been destroyed.'];
  return [win, null];
}
