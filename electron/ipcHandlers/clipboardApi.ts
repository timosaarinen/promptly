// electron/ipcHandlers/clipboardApi.ts
import { ipcMain, clipboard } from 'electron';

export function registerClipboardApiHandlers(): void {
  ipcMain.handle('clipboard:writeText', async (_event, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle('clipboard:readText', async () => {
    return clipboard.readText();
  });
}
