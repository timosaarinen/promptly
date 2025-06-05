// electron/gitignoreManager.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { findGitRepoRoot } from './gitUtils';
import { getErrorMessage, toPosixPath } from './utils';

let actualGitRepoRoot: string | null = null;
let ignoreInstance: Ignore | null = null;
let respectRulesGlobal = true;

async function loadAndParseGitignoreRecursive(dir: string, repoRootPath: string, ig: Ignore): Promise<void> {
  const gitignoreFilePath = path.join(dir, '.gitignore');
  let patterns: string[] = [];
  try {
    const gitignoreContent = await fs.readFile(gitignoreFilePath, 'utf-8');
    patterns = gitignoreContent.split(/\r?\n/).filter((p) => p.trim() !== '' && !p.startsWith('#'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[GitignoreManager] Error reading .gitignore at ${gitignoreFilePath}: ${getErrorMessage(error)}`);
    }
    // If no .gitignore or error, proceed with empty patterns for this level
  }

  if (patterns.length > 0) {
    const relativeDirFromRepoRoot = path.relative(repoRootPath, dir);
    const posixRelativeDir = toPosixPath(relativeDirFromRepoRoot);

    const prefixedPatterns = patterns.map((rawPattern) => {
      let p = rawPattern;
      let isNegated = false;
      if (p.startsWith('!')) {
        isNegated = true;
        p = p.substring(1);
      }

      let newPattern;
      if (posixRelativeDir) {
        // Pattern is from a .gitignore in a subdirectory
        if (p.startsWith('/')) {
          // e.g., /file.log in subdir/.gitignore
          newPattern = `${posixRelativeDir}${p}`; // Becomes subdir/file.log
        } else if (p.includes('/')) {
          // e.g., build/output.o in subdir/.gitignore
          newPattern = `${posixRelativeDir}/${p}`; // Becomes subdir/build/output.o
        } else {
          // e.g., *.log or temp_file in subdir/.gitignore
          newPattern = `${posixRelativeDir}/**/${p}`; // Becomes subdir/**/*.log to match recursively
        }
      } else {
        // Pattern is from the root .gitignore
        newPattern = p; // Use pattern as-is
      }
      newPattern = toPosixPath(newPattern);
      return isNegated ? `!${newPattern}` : newPattern;
    });

    if (prefixedPatterns.length > 0) {
      ig.add(prefixedPatterns);
    }
  }

  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    console.warn(
      `[GitignoreManager] Error reading directory ${dir} for further .gitignore search: ${getErrorMessage(error)}`
    );
    return;
  }

  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      const subDirPath = path.join(dir, dirent.name);
      const relativeSubDirFromRepoRoot = toPosixPath(path.relative(repoRootPath, subDirPath));
      if (!ig.ignores(relativeSubDirFromRepoRoot)) {
        await loadAndParseGitignoreRecursive(subDirPath, repoRootPath, ig);
      }
    }
  }
}

/**
 * Attempts to find the Git repository root and loads all .gitignore files from there downwards.
 * @param dir The directory selected by the user.
 */
export async function loadGitignore(dir: string): Promise<void> {
  console.log(`[GitignoreManager] loadGitIgnore(${dir})`);
  const newGitRepoRoot = await findGitRepoRoot(dir);

  // If git root changes or was not set, reload.
  // Or if ignoreInstance is null (e.g. after clearGitignoreRules).
  if (newGitRepoRoot !== actualGitRepoRoot || !ignoreInstance) {
    actualGitRepoRoot = newGitRepoRoot;
    ignoreInstance = ignore();
    if (actualGitRepoRoot) {
      console.log(`[GitignoreManager] Actual Git repository root found: ${actualGitRepoRoot}`);
      await loadAndParseGitignoreRecursive(actualGitRepoRoot, actualGitRepoRoot, ignoreInstance);
    } else {
      console.log(`[GitignoreManager] No Git repository found at or above ${dir}.`);
    }
  } else if (actualGitRepoRoot) {
    // Git root is the same, but could be a .gitignore file change triggered this.
    console.log(`[GitignoreManager] Reloading .gitignore files for: ${actualGitRepoRoot}`);
    ignoreInstance = ignore();
    await loadAndParseGitignoreRecursive(actualGitRepoRoot, actualGitRepoRoot, ignoreInstance);
  }
}

export function setRespectGitignoreRules(shouldRespect: boolean): void {
  respectRulesGlobal = shouldRespect;
  console.log(`[GitignoreManager] Respect .gitignore rules globally set to: ${respectRulesGlobal}`);
}

export function shouldRespectGitignoreRules(): boolean {
  return respectRulesGlobal;
}

/**
 * Checks if a given absolute path is ignored by Git rules using the 'ignore' library.
 * This function is synchronous.
 * @param absoluteFilePath The absolute path to check.
 * @returns True if the path should be ignored according to Git, false otherwise.
 */
export function isPathIgnoredByGit(absoluteFilePath: string): boolean {
  if (!respectRulesGlobal || !actualGitRepoRoot || !ignoreInstance) {
    return false;
  }
  const relativePathFromRepoRoot = path.relative(actualGitRepoRoot, absoluteFilePath);
  if (relativePathFromRepoRoot.startsWith('..') || relativePathFromRepoRoot === '') {
    return false;
  }
  const posixRelativePath = toPosixPath(relativePathFromRepoRoot);
  return ignoreInstance.ignores(posixRelativePath);
}

/**
 * Gets the cached actual Git repository root.
 * @returns The absolute path to the Git repository root, or null if not found/cached.
 */
export function getActualGitRepoRoot(): string | null {
  return actualGitRepoRoot;
}

export function clearGitignoreRules(): void {
  actualGitRepoRoot = null;
  ignoreInstance = null;
}
