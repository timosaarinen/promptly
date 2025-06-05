// src/utils/env.ts

/**
 * Checks if the application is running in an Electron environment.
 * This relies on the `isElectron` flag exposed by the preload script.
 * @returns {boolean} True if in Electron, false otherwise.
 */
export function isElectron(): boolean {
  return !!window.electronAPI?.isElectron;
}
