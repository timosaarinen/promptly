// electron/utils.ts
import path from 'node:path';
import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { exec } from 'node:child_process';
import { isPathIgnoredByGit, shouldRespectGitignoreRules } from './gitignoreManager';
import { MAX_FILE_SIZE_BYTES } from './config';
import type { FsEntry } from '@shared/electron-api';

/** Wait for N milliseconds. */
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Safely extracts a readable message from an unknown error value. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === 'string') {
    return error;
  } else {
    return 'An unknown error occurred.';
  }
}

/** Convert backslashes to POSIX-style (forward) slashes */
export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function sanitizeFilePath(basePath: string | null, relativePath: string | undefined | null): string {
  if (!basePath) {
    console.error('sanitizePath error: Root path (basePath) is not set.');
    throw new Error('Root path not set.');
  }
  const resolvedBasePath = path.resolve(basePath);
  const normalizedRelativePath = toPosixPath(relativePath || '.');
  const fullPath = path.resolve(resolvedBasePath, normalizedRelativePath);

  if (fullPath !== resolvedBasePath && !fullPath.startsWith(resolvedBasePath + path.sep)) {
    console.error(`sanitizePath Access Denied: Attempt to access ${fullPath} which is outside of ${resolvedBasePath}`);
    throw new Error('Access denied: Path is outside the root directory.');
  }
  return fullPath;
}

export function isBinaryFile(filePath: string): boolean {
  // Standard binary file extension check
  if (
    /\.(png|jpe?g|gif|bmp|tiff|webp|ico|svg|pdf|zip|tar|gz|rar|7z|mp3|mp4|avi|mov|mkv|wmv|flv|exe|dll|so|dylib|o|a|obj|lib|jar|class|pyc|wasm|woff2?|ttf|otf|eot)$/i.test(
      filePath
    )
  ) {
    return true;
  }
  return false;
}

export function shouldIgnoreFilePathAlways(filePath: string): boolean {
  // NOTE: replaces regex: export const STANDARD_FS_IGNORE_PATTERN = /(^|[/\\])\.(git|hg|svn|vscode|idea|DS_Store)|node_modules([/\\]|$)|dist([/\\]|$)|release([/\\]|$)|out([/\\]|$)|build([/\\]|$)|target([/\\]|$)|__pycache__([/\\]|$)/i;
  const segments = toPosixPath(filePath).split('/');
  return segments.some(
    (segment) =>
      segment === '.git' || segment === 'node_modules' || segment === '.DS_Store' || segment === '__pycache__'
    // TODO: might add more here, like .hg, .svn, etc. Should be configurable.
  );
}

export function shouldIgnoreFilePath(relativePath: string, fullPath: string): boolean {
  if (shouldIgnoreFilePathAlways(relativePath)) return true;
  if (shouldRespectGitignoreRules() && isPathIgnoredByGit(fullPath)) return true;
  return false;
}

/**
 * Gets file size and detects if the file should be treated as binary.
 * Handles stat errors and large file limits.
 */
export async function getFileStatsForContext(
  filePath: string,
  relativePath: string
): Promise<{ size: number; isBinary: boolean }> {
  let size = 0;
  let isBinary = isBinaryFile(relativePath); // TODO: more robust binary detection based on content

  try {
    const stats = await fs.stat(filePath);
    size = stats.size;
    if (size > MAX_FILE_SIZE_BYTES) {
      isBinary = true;
    }
  } catch (statError) {
    console.warn(`[getFileStatsForContext] Stat error for ${filePath}: ${getErrorMessage(statError)}`);
    isBinary = true; // Treat as binary if stat fails (e.g. inaccessible)
    size = 0;
  }

  return { size, isBinary };
}

export async function getFsEntryTreeRecursive(
  currentPathAbsolute: string,
  rootPathAbsolute: string
): Promise<FsEntry[]> {
  let dirents: Dirent[];
  try {
    dirents = await fs.readdir(currentPathAbsolute, { withFileTypes: true });
  } catch (readdirError) {
    console.warn(
      `[getFsEntryTreeRecursive] Error reading directory ${currentPathAbsolute}: ${getErrorMessage(readdirError)}`
    );
    return [];
  }

  const processingPromises: Promise<FsEntry | null>[] = [];

  for (const dirent of dirents) {
    const entryPathAbsolute = path.join(currentPathAbsolute, dirent.name);
    const entryPathRelative = toPosixPath(path.relative(rootPathAbsolute, entryPathAbsolute));

    if (shouldIgnoreFilePath(entryPathRelative, entryPathAbsolute)) {
      continue;
    }

    processingPromises.push(
      (async () => {
        let size = 0;
        let isBinary = false;
        let children: FsEntry[] | undefined = undefined;

        if (dirent.isFile()) {
          ({ size, isBinary } = await getFileStatsForContext(entryPathAbsolute, entryPathRelative));
        } else if (dirent.isDirectory()) {
          children = await getFsEntryTreeRecursive(entryPathAbsolute, rootPathAbsolute); // Recursive call
        } else {
          return null; // Skip symlinks or other types
        }

        return {
          name: dirent.name,
          path: entryPathRelative,
          isDirectory: dirent.isDirectory(),
          isFile: dirent.isFile(),
          size,
          isBinary,
          children,
        };
      })()
    );
  }

  const processedEntriesNullable = await Promise.all(processingPromises);
  const processedEntries = processedEntriesNullable.filter((entry) => entry !== null) as FsEntry[];

  processedEntries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return processedEntries;
}

/**
 * Recursively traverses a directory to build a structured list of file/directory paths.
 * @param rootPath The absolute path to the root directory to scan.
 * @returns A promise resolving to an array of strings representing the structure.
 */
export async function getDirectoryStructure(rootPath: string): Promise<string[]> {
  const activeTraversals: Set<string> = new Set(); // To prevent re-traversing in parallel due to symlinks or complex structures

  async function traverse(currentDir: string): Promise<string[]> {
    if (activeTraversals.has(currentDir)) return [];
    activeTraversals.add(currentDir);

    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (readdirError) {
      console.warn(`[getDirectoryStructure] Error reading directory ${currentDir}: ${getErrorMessage(readdirError)}`);
      activeTraversals.delete(currentDir); // Ensure it's removed on error to allow retry if path is reachable later
      return [];
    }

    const localResults: string[] = [];
    const dirPromises: Promise<string[]>[] = [];

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = toPosixPath(path.relative(rootPath, fullPath));

      if (!relativePath) continue;
      if (shouldIgnoreFilePath(relativePath, fullPath)) continue;

      const line = entry.isDirectory() ? `${relativePath}/` : relativePath;
      localResults.push(line);
      if (entry.isDirectory()) {
        dirPromises.push(traverse(fullPath));
      }
    }

    const childrenResultsArrays = await Promise.all(dirPromises);
    const combinedChildrenResults = childrenResultsArrays.flat();

    activeTraversals.delete(currentDir);
    return localResults.concat(combinedChildrenResults);
  }

  const finalStructure = await traverse(rootPath);
  finalStructure.sort();
  return finalStructure;
}

/**
 * Reads file content, respecting ignore rules.
 * @param absoluteFilePath Absolute path to the file.
 * @param relativeFilePath Relative path (for logging/error messages).
 * @returns Promise resolving to file content string or an error object.
 */
export async function readFileWithChecks(
  absoluteFilePath: string,
  relativeFilePath: string
): Promise<string | { error: string }> {
  try {
    if (shouldIgnoreFilePath(relativeFilePath, absoluteFilePath)) {
      console.warn(`[readFileWithChecks] Attempted to read ignored file: ${relativeFilePath}`);
      return { error: 'File is ignored by .gitignore or ignore rules' };
    }
    const stats = await fs.stat(absoluteFilePath);
    if (stats.size > MAX_FILE_SIZE_BYTES) {
      return {
        error: `File is too large to read for context (> ${MAX_FILE_SIZE_BYTES / 1024}KB)`,
      };
    }
    return await fs.readFile(absoluteFilePath, 'utf-8');
  } catch (error: unknown) {
    console.error(`[readFileWithChecks] Error reading file ${relativeFilePath}: ${getErrorMessage(error)}`);
    return { error: getErrorMessage(error) };
  }
}

/**
 * Resolves the user's shell environment by spawning a login shell and capturing its environment variables.
 * This is crucial for finding user-installed tools (like npm, git from homebrew) when the app is
 * launched from a GUI.
 * @returns A promise that resolves to the shell's environment variables.
 */
export async function getShellEnvironment(): Promise<NodeJS.ProcessEnv> {
  if (process.platform === 'win32') {
    // On Windows, the PATH is usually inherited correctly. A more complex solution might be needed
    // for shells like Git Bash, but for now, this is sufficient.
    return process.env;
  }

  return new Promise((resolve) => {
    const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
    // The command must be structured to work with `sh` which is what `exec` may use.
    // The `-ilc` flags ensure an interactive, login shell is simulated to source profiles.
    const command = `'${shell}' -ilc 'echo "___SHELL_ENV_START___" && env && echo "___SHELL_ENV_END___"'`;

    exec(command, { shell: '/bin/sh' }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[getShellEnvironment] Error executing command to get shell env: ${error.message}`);
        console.warn(`[getShellEnvironment] Stderr: ${stderr}`);
        // Fallback to the current, possibly minimal, environment
        return resolve(process.env);
      }

      const startMarker = '___SHELL_ENV_START___';
      const endMarker = '___SHELL_ENV_END___';
      const startIndex = stdout.indexOf(startMarker);
      const endIndex = stdout.lastIndexOf(endMarker);

      if (startIndex === -1 || endIndex === -1) {
        console.error(
          `[getShellEnvironment] Shell environment markers not found in stdout. Output: ${stdout.substring(0, 500)}`
        );
        return resolve(process.env);
      }

      const envBlock = stdout.substring(startIndex + startMarker.length, endIndex);
      const env: NodeJS.ProcessEnv = {};

      for (const line of envBlock.split('\n')) {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          const parts = trimmedLine.split('=', 2); // Split only on the first '='
          if (parts.length === 2 && parts[0]) {
            env[parts[0]] = parts[1];
          }
        }
      }

      // Merge with current process.env, giving the resolved shell env precedence.
      // This preserves any environment variables set specifically for the Electron app
      // while overriding common ones like PATH with the user's full configuration.
      const mergedEnv = { ...process.env, ...env };
      resolve(mergedEnv);
    });
  });
}
