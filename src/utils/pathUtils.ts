// src/utils/pathUtils.ts
import path from 'path';

/* CRLF -> LF */
export function normalizeLineFeeds(text: string) {
  return text.replace(/\r\n/g, '\n');
}

/** Convert backslashes to POSIX-style (forward) slashes */
export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Resolve and sanitize an input path against the sandbox root.
 * Prevents path traversal by ensuring resolved path stays within root.
 * @param input - The user-provided or external path.
 * @param root - The sandbox root directory.
 * @returns The resolved, sanitized absolute path.
 * @throws Error if the resolved path is outside of root.
 */
export function sanitizePath(input: string, root: string): string {
  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, input);

  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error(`Sandbox violation: attempted access to ${resolved}`);
  }

  return resolved;
}
