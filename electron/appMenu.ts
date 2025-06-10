// electron/appMenu.ts
import { app, BrowserWindow, Menu, shell, MenuItemConstructorOptions, dialog, OpenDialogOptions } from 'electron';
import { getErrorMessage } from './utils';
import * as settingsManager from './settingsManager';
import { onNewRootPath } from './sync';
import { createWindow } from './windowManager';

function getAnyAliveWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
}

async function openPath(newPath: string) {
  try {
    const win = getAnyAliveWindow() ?? createWindow();
    await onNewRootPath(win, newPath);
    if (win.isMinimized()) win.restore();
    win.focus();
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    console.error(`[Menu] Error opening path ${newPath}: ${errorMsg}`);
    dialog.showErrorBox('Error Opening Path', `Could not open ${newPath}:\n${errorMsg}`);
  }
}

async function openFolder() {
  try {
    const options: OpenDialogOptions = { properties: ['openDirectory'] };
    const parentWindow = getAnyAliveWindow();

    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options);

    if (!result.canceled && result.filePaths.length > 0) {
      await openPath(result.filePaths[0]);
    }
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    console.error(`[Menu] Error in Open Folder dialog: ${errorMsg}`);
    dialog.showErrorBox('Error Opening Folder', `An error occurred: ${errorMsg}`);
  }
}

export function setupAppMenu(mainWindow?: BrowserWindow) {
  if (mainWindow && mainWindow.isDestroyed()) {
    console.warn('[Menu] Cannot setup application menu: mainWindow is destroyed.');
    return;
  }

  const isMac = process.platform === 'darwin';

  const recentPaths = settingsManager.getRecentRootPaths();
  const recentPathsSubmenu: MenuItemConstructorOptions[] =
    recentPaths.length > 0
      ? recentPaths.map(
          (recentPath): MenuItemConstructorOptions => ({
            label: recentPath,
            click: () => openPath(recentPath),
          })
        )
      : [{ label: 'No Recent Items', enabled: false }];

  const template = [
    // { role: 'appMenu' }
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    // { role: 'fileMenu' }
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: () => openFolder(),
        },
        {
          label: 'Open Recent',
          submenu: recentPathsSubmenu,
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    // { role: 'editMenu' }
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
              { type: 'separator' },
              {
                label: 'Speech',
                submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }],
              },
            ]
          : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }]),
      ],
    },
    // { role: 'viewMenu' }
    {
      label: 'View',
      submenu: [
        // TODO: we could later remove developer tools from prod, but useful for debugging
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    // { role: 'windowMenu' }
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
          : [{ role: 'close' }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'View Help Documentation',
          accelerator: 'F1',
          click: async () => {
            try {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('show-help-content');
              }
            } catch (error) {
              console.error(`[Menu] Failed to show help contents: ${getErrorMessage(error)}`);
            }
          },
        },
        {
          label: 'Visit GitHub Repository',
          click: async () => {
            await shell.openExternal('https://github.com/timosaarinen/promptly');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template as MenuItemConstructorOptions[]);
  Menu.setApplicationMenu(menu);
}
