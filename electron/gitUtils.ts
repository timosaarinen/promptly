// electron/gitUtils.ts
import { exec } from 'node:child_process';
import path from 'node:path';
import { getErrorMessage, toPosixPath } from './utils';
import { getShellEnv } from './sync';
import type { GitFileStatus } from '@shared/electron-api';

const VERBOSE_LOGGING = false;
function DEBUG(msg: string) {
  if (VERBOSE_LOGGING) {
    console.log('[GitUtils DEBUG]', msg);
  }
}

interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Helper to run git commands where stdout is primary result
async function runGitCommand(cwd: string, command: string, trim = true): Promise<string> {
  return new Promise((resolve, reject) => {
    // Ensure commands are executed with git prefix
    const fullCommand = command.startsWith('git ') ? command : `git ${command}`;
    const shellEnv = getShellEnv();
    exec(fullCommand, { cwd, env: shellEnv }, (error, stdout, stderr) => {
      if (error) {
        const errorMessage = (trim ? stderr.trim() : stderr) || error.message;
        return reject(new Error(`Git command "${command}" failed: ${errorMessage}`));
      }
      resolve(trim ? stdout.trim() : stdout);
    });
  });
}

// Helper to run git commands where exit code is primary result
async function runGitCommandWithExitCode(cwd: string, command: string, trim = true): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    const fullCommand = command.startsWith('git ') ? command : `git ${command}`;
    const shellEnv = getShellEnv();
    exec(fullCommand, { cwd, env: shellEnv }, (error, stdout, stderr) => {
      resolve({
        stdout: trim ? stdout.trim() : stdout,
        stderr: trim ? stderr.trim() : stderr,
        exitCode: error ? error.code || 1 : 0,
      });
    });
  });
}

/**
 * Finds the root directory of the Git repository containing the given startPath.
 * @param startPath An absolute path within a potential Git repository.
 * @returns The absolute path to the Git repository root, or null if not found.
 */
export async function findGitRepoRoot(startPath: string): Promise<string | null> {
  try {
    const resolvedStartPath = path.resolve(startPath);
    const root = await runGitCommand(resolvedStartPath, 'rev-parse --show-toplevel');
    return root ? path.resolve(root) : null;
  } catch (error) {
    return null; // This error typically means startPath is not in a Git repository.
  }
}

/**
 * Checks if a given absolute path is ignored by Git.
 * @param repoRoot The absolute path to the root of the Git repository.
 * @param absoluteFilePath The absolute path to the file/directory to check.
 * @returns True if the path is ignored by Git, false otherwise or on error.
 */
export async function checkIsFileIgnoredByGit(repoRoot: string, absoluteFilePath: string): Promise<boolean> {
  const relativeToRepoRoot = path.relative(repoRoot, absoluteFilePath);

  if (relativeToRepoRoot.startsWith('..') || relativeToRepoRoot === '') {
    return false;
  }

  const gitRelativePath = toPosixPath(relativeToRepoRoot);
  const command = `check-ignore --quiet -- "${gitRelativePath}"`; // Quotes handle spaces in paths
  const { exitCode, stderr } = await runGitCommandWithExitCode(repoRoot, command);

  if (exitCode === 0) return true; // Exit code 0 means the path IS ignored.
  if (exitCode === 1) return false; // Exit code 1 means the path IS NOT ignored.

  console.warn(
    `[GitUtils] 'git check-ignore' for path '${gitRelativePath}' in repo '${repoRoot}' exited with code ${exitCode}. Stderr: ${stderr}`
  );
  return false; // Default to not ignored on error.
}

export async function isGitRepository(directoryPath: string): Promise<boolean> {
  try {
    const output = await runGitCommand(directoryPath, 'rev-parse --is-inside-work-tree');
    return output === 'true';
  } catch (error) {
    // If rev-parse fails (e.g. not a git repo, or git not found), it's not a repo.
    return false;
  }
}

export async function getCurrentBranch(directoryPath: string): Promise<string> {
  try {
    return await runGitCommand(directoryPath, `rev-parse --abbrev-ref HEAD`);
  } catch (error) {
    console.error(`[GitUtils] Error getting current branch for ${directoryPath}: ${getErrorMessage(error)}`);
    throw error;
  }
}

export async function getCurrentCommitHash(directoryPath: string): Promise<string> {
  try {
    return await runGitCommand(directoryPath, `rev-parse HEAD`);
  } catch (error) {
    console.error(`[GitUtils] Error getting current commit hash for ${directoryPath}: ${getErrorMessage(error)}`);
    throw error;
  }
}

export async function getGitStatus(directoryPath: string): Promise<GitFileStatus[]> {
  try {
    const output = await runGitCommand(directoryPath, `status --porcelain=v1`, false); // NOTE: don't trim!
    if (!output) return [];
    DEBUG(`git status --porcelain=v1 output:\n${output}`);

    const files: GitFileStatus[] = [];
    // Split output by newline and filter out any empty strings.
    // This prevents processing a blank line which can occur if the git command's
    // output has a trailing newline.
    const lines = output.split('\n').filter(Boolean);

    for (const line of lines) {
      DEBUG(`Raw line: "${line}"`);

      // Porcelain format is always 2-char status + space + path, e.g. " M file.txt"
      const statusCode = line.substring(0, 2);
      let filePathPart = line.substring(3);
      let originalPath: string | undefined;
      DEBUG(`Parsed statusCode: "${statusCode}", initial filePathPart: "${filePathPart}"`);

      if (statusCode.startsWith('R') || statusCode.startsWith('C')) {
        const parts = filePathPart.split(' -> ');
        if (parts.length === 2) {
          originalPath = parts[0];
          filePathPart = parts[1];
        }
      }
      if (filePathPart.startsWith('"') && filePathPart.endsWith('"')) {
        filePathPart = filePathPart.substring(1, filePathPart.length - 1);
        DEBUG(`Unquoted filePathPart: "${filePathPart}"`);
      }

      const finalFileStatus: GitFileStatus = {
        path: toPosixPath(filePathPart),
        statusCode,
        originalPath: originalPath ? toPosixPath(originalPath) : undefined,
      };

      DEBUG(`Pushing to files: ${JSON.stringify(finalFileStatus)}`);
      files.push(finalFileStatus);
    }
    return files;
  } catch (error) {
    console.error(`[GitUtils] Error getting git status for ${directoryPath}: ${getErrorMessage(error)}`);
    throw error;
  }
}

export async function getCombinedDiff(directoryPath: string): Promise<string> {
  try {
    // Attempt to get diff against HEAD first.
    // If that fails (e.g. no commits yet), try to get diff for staged files.
    // If both fail, throw the error from HEAD diff.
    return await runGitCommand(directoryPath, `diff HEAD -- .`);
  } catch (error) {
    if (getErrorMessage(error).includes('unknown revision or path not in the working tree')) {
      try {
        return await runGitCommand(directoryPath, `diff --staged -- .`);
      } catch (stagedError) {
        console.error(`[GitUtils] Error getting staged diff for ${directoryPath}: ${getErrorMessage(stagedError)}`);
        throw stagedError;
      }
    }
    console.error(`[GitUtils] Error getting combined diff for ${directoryPath}: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * Stages all changes in the working directory. Equivalent to `git add .`.
 * @param directoryPath The absolute path to the Git repository.
 * @returns Promise resolving to string output (usually empty for `git add .`) or rejecting on error.
 */
export async function gitStageAll(directoryPath: string): Promise<string> {
  try {
    return await runGitCommand(directoryPath, 'add .');
  } catch (error) {
    console.error(`[GitUtils] Error staging all files in ${directoryPath}: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * Commits staged changes with the given message.
 * @param directoryPath The absolute path to the Git repository.
 * @param message The commit message.
 * @returns Promise resolving to string output from `git commit` or rejecting on error.
 */
export async function gitCommit(directoryPath: string, message: string): Promise<string> {
  try {
    // The message is escaped to handle quotes and special characters within the message string.
    // For Windows, `cmd.exe` might handle quotes differently, but this generally works.
    // Using an array for `execFile` or `spawn` would be more robust for complex messages,
    // but `exec` with careful quoting usually suffices for commit messages.
    const escapedMessage = message.replace(/"/g, '\\"');
    return await runGitCommand(directoryPath, `commit -m "${escapedMessage}"`);
  } catch (error) {
    console.error(`[GitUtils] Error committing in ${directoryPath}: ${getErrorMessage(error)}`);
    throw error;
  }
}

/**
 * Pushes committed changes to the remote repository.
 * @param directoryPath The absolute path to the Git repository.
 * @returns Promise resolving to string output from `git push` or rejecting on error.
 */
export async function gitPush(directoryPath: string): Promise<string> {
  try {
    return await runGitCommand(directoryPath, 'push');
  } catch (error) {
    console.error(`[GitUtils] Error pushing from ${directoryPath}: ${getErrorMessage(error)}`);
    throw error;
  }
}
