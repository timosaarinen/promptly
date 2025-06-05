// shared/types.ts

/**
 * A file or directory entry in the file system.
 */
export interface FsEntry {
  name: string;
  path: string; // Relative path from root, using forward slashes
  isDirectory: boolean;
  isFile: boolean;
  size: number; // Size in bytes. For directories, this might be 0 or sum of contents based on implementation.
  isBinary: boolean; // True if the file is considered binary or too large to include content.
  children?: FsEntry[]; // For directories, nested children. Undefined for files.
}

/**
 * The status of a file in a Git repository.
 */
export interface GitFileStatus {
  path: string; // File path relative to the repository root (or current rootPath if different)
  statusCode: string; // Two-character status code from `git status --porcelain=v1` (e.g., " M", "A ", "??")
  originalPath?: string; // For renamed/copied files, the original path.
}

/**
 * Configuration settings specific to a root path.
 */
export interface RootPathConfig {
  testCommand?: string;
  postProcessCommand?: string;
  // Future per-root settings can be added here
}
