// electron/config.ts
import path from 'node:path';
import { app } from 'electron';

export const VITE_DEV_SERVER_URL: string | undefined = process.env['VITE_DEV_SERVER_URL'];
export const APP_TITLE = 'Promptly';

// --- Global Constants ---
export const MAX_FILE_SIZE_BYTES = 100 * 1024; // TODO: make this configurable

// --- Path Configurations ---

const isDev = !!VITE_DEV_SERVER_URL;

export const distRendererPath = isDev ? undefined : path.join(__dirname, '..', 'renderer');

if (distRendererPath) {
  process.env.DIST = distRendererPath;
  console.log('[Config] distRendererPath:', distRendererPath);
}

// If app is packaged, we have public/ files bundled to dist/renderer/ already
// If unpackaged, use the original root public/
export const publicPath: string = app.isPackaged
  ? (distRendererPath as string)
  : path.join(__dirname, '..', '..', 'public');

process.env.PUBLIC = publicPath;
console.log('[Config] publicPath:', publicPath);
