// electron/utils/contextBuilder.ts
import path from 'node:path';
import { get_encoding, Tiktoken } from 'tiktoken';
import type { AssembleContextRequest, AssembleContextResponse } from '@shared/electron-api';
import { getDirectoryStructure, readFileWithChecks, getErrorMessage } from '../utils';
import { getCombinedDiff, getCurrentCommitHash, isGitRepository } from '../gitUtils';

const CONTEXT_XML_VERSION = '0.2.0';
const DEFAULT_IMPORTANCE = 1; // Corresponds to no stars, just selected.
const MAX_IMPORTANCE = 4; // Maximum importance level.

interface FileEntryForXml {
  path: string;
  content: string;
}

interface FileEntryWithImportance {
  path: string; // Clean relative path
  content: string;
  importance: number;
}

let encoding: Tiktoken | null = null;
try {
  encoding = get_encoding('cl100k_base');
} catch (e) {
  console.error('[ContextBuilder] Failed to get tiktoken encoding:', getErrorMessage(e));
}

/**
 * Parses a path string that may be prefixed with '+' characters for importance.
 * Mirrors the logic from src/utils/fileTreeUtils.ts.
 * @param prefixedPath The path string, e.g., "++path/to/file.txt".
 * @returns An object containing the `cleanPath` and `importance` level.
 */
function parsePathWithImportanceElectron(prefixedPath: string): { cleanPath: string; importance: number } {
  let importance = DEFAULT_IMPORTANCE;
  let plusCount = 0;
  let i = 0;
  while (i < prefixedPath.length && prefixedPath[i] === '+') {
    plusCount++;
    i++;
  }
  const cleanPath = prefixedPath.substring(i);
  if (plusCount > 0) {
    importance = Math.min(plusCount + DEFAULT_IMPORTANCE, MAX_IMPORTANCE);
  }
  return { cleanPath, importance };
}

function buildContextXml(
  selectedFiles: FileEntryForXml[],
  directoryStructure: string[] | null,
  gitCommitHashForSummary: string | null,
  gitDiff: string | null,
  includeSummaryFlag: boolean
): string {
  const timestamp = new Date().toISOString();
  const contextStart = `<context version="${CONTEXT_XML_VERSION}" timestamp="${timestamp}" generated_by="Promptly">`;
  const contextEnd = `</context>`;

  const sections = [contextStart];

  if (includeSummaryFlag) {
    const summaryLines = [
      `<summary>`,
      `  <purpose>Contextual project contents</purpose>`,
      `  <file_format>Flat XML with summary, directory structure, and file contents. Note that file tag does *NOT* use CDATA and its contents are not escaped. You should always assume file starts on next line of the tag and ends on the line before closing file tag.</file_format>`,
      `  <usage_guidelines>May not represent the entire project. Verify outputs.</usage_guidelines>`,
      `  <notes>Excludes files based on .gitignore, standard ignores (node_modules, .git), size limits (over 100KB), and binary detection. File paths are relative to the project root.</notes>`,
    ];
    if (gitCommitHashForSummary) {
      summaryLines.push(`  <git_commit_hash>${gitCommitHashForSummary}</git_commit_hash>`);
    }
    summaryLines.push(`</summary>`);
    sections.push(summaryLines.join('\n'));
  }

  if (directoryStructure) {
    const cleanedDirectoryStructure = directoryStructure.map((line) => line.trimEnd());
    sections.push([`<directory_structure>`, ...cleanedDirectoryStructure, `</directory_structure>`].join('\n'));
  }

  if (selectedFiles.length > 0) {
    sections.push(
      [
        `<files>\n`,
        ...selectedFiles.map(({ path: filePath, content }) => {
          return `<file path="${filePath}">\n${content.trim()}\n</file>\n`;
        }),
        `</files>`,
      ].join('\n')
    );
  }

  if (gitDiff) {
    const diffSection = [`<git_diff>`, gitDiff.trim(), `</git_diff>`].join('\n');
    sections.push(diffSection);
  }

  sections.push(contextEnd);
  return sections.join('\n\n');
}

function calculateTokenCountWithTiktoken(text: string): number {
  if (!encoding) {
    console.warn('[ContextBuilder] Tiktoken encoding not available. Token count will be 0.');
    return 0;
  }
  if (!text) return 0;
  try {
    const tokens = encoding.encode(text);
    return tokens.length;
  } catch (error) {
    console.error('[ContextBuilder] Error calculating token count with tiktoken:', getErrorMessage(error));
    return 0;
  }
}

export async function assembleContext({
  rootPath,
  selectedFilePaths, // These are now potentially prefixed paths, e.g., "++path/to/file.txt"
  includeGitDiff,
  includeSummary = true,
  includeDirectoryStructure = true,
  includeGitCommitHash = true,
}: AssembleContextRequest): Promise<AssembleContextResponse> {
  try {
    const dirStructureResult = includeDirectoryStructure ? await getDirectoryStructure(rootPath) : null;

    // Parallelize reading of selected files
    const filesWithImportancePromises = selectedFilePaths.map(async (prefixedRelativePath) => {
      const { cleanPath: cleanRelativePath, importance } = parsePathWithImportanceElectron(prefixedRelativePath);
      const absolutePath = path.join(rootPath, cleanRelativePath);
      const fileReadResult = await readFileWithChecks(absolutePath, cleanRelativePath);
      if (typeof fileReadResult === 'string') {
        return { path: cleanRelativePath, content: fileReadResult, importance };
      }
      console.warn(
        `[ContextBuilder] Skipping file ${cleanRelativePath} (from ${prefixedRelativePath}) due to read error: ${fileReadResult.error}`
      );
      return null;
    });

    const settledFileResults = await Promise.all(filesWithImportancePromises);
    const filesWithImportance = settledFileResults.filter(Boolean) as FileEntryWithImportance[];

    // Sort files: 1. by importance (ascending), 2. by path (alphabetical for stability)
    const sortedFiles = filesWithImportance.sort((a, b) => {
      if (a.importance !== b.importance) {
        return a.importance - b.importance;
      }
      return a.path.localeCompare(b.path);
    });

    // Map to FileEntryForXml for buildContextXml (which doesn't need importance directly)
    const filesForXml = sortedFiles.map(({ path, content }) => ({ path, content }));

    let fetchedCommitHash: string | null = null;
    let fetchedDiff: string | null = null;
    const isRepo = await isGitRepository(rootPath);

    if (isRepo) {
      if (includeGitCommitHash) {
        try {
          fetchedCommitHash = await getCurrentCommitHash(rootPath);
        } catch (gitErr) {
          console.warn(`[ContextBuilder] Failed to get current commit hash: ${getErrorMessage(gitErr)}`);
        }
      }

      if (includeGitDiff) {
        try {
          fetchedDiff = await getCombinedDiff(rootPath);
        } catch (gitErr) {
          console.warn(`[ContextBuilder] Failed to get combined diff: ${getErrorMessage(gitErr)}`);
        }
      }
    }

    const commitHashForSummary = includeSummary ? fetchedCommitHash : null;

    const xml = buildContextXml(filesForXml, dirStructureResult, commitHashForSummary, fetchedDiff, includeSummary);
    const actualTokenCount = calculateTokenCountWithTiktoken(xml);

    return {
      xml,
      actualTokenCount,
    };
  } catch (error: unknown) {
    const errorMsg = getErrorMessage(error);
    console.error(`[ContextBuilder] Error in assembleContext: ${errorMsg}`);
    return {
      error: `Failed to assemble context: ${errorMsg}`,
    };
  }
}
