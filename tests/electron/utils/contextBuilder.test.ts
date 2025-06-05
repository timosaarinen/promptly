// tests/electron/utils/contextBuilder.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assembleContext } from '@electron/utils/contextBuilder'; // System Under Test (SUT)
import type { AssembleContextRequest } from '@shared/electron-api';

// Mock the modules that contextBuilder.ts imports.
// The paths used here must be relative from THIS test file
// to the actual modules imported by the SUT.
// SUT (`electron/utils/contextBuilder.ts`) imports `../utils` (which is `electron/utils.ts`)
// and `../gitUtils` (which is `electron/gitUtils.ts`).
// Path from `tests/electron/utils/contextBuilder.test.ts` to `electron/utils.ts` is `../../../electron/utils`
// Path from `tests/electron/utils/contextBuilder.test.ts` to `electron/gitUtils.ts` is `../../../electron/gitUtils`

vi.mock('../../../electron/utils', () => ({
  // Use string literal directly
  getDirectoryStructure: vi.fn(),
  readFileWithChecks: vi.fn(),
  getErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}));

vi.mock('../../../electron/gitUtils', () => ({
  // Use string literal directly
  isGitRepository: vi.fn(),
  getCurrentCommitHash: vi.fn(),
  getCombinedDiff: vi.fn(),
}));

// Import the mocked functions into the test file using the same paths
// to ensure these imported variables are the vi.fn() instances from the mock factories.
import { getDirectoryStructure, readFileWithChecks, getErrorMessage } from '../../../electron/utils'; // Path matches the one in vi.mock

import { isGitRepository, getCurrentCommitHash, getCombinedDiff } from '../../../electron/gitUtils'; // Path matches the one in vi.mock

describe('assembleContext', () => {
  const mockRootPath = '/mock/project';
  const baseRequest: AssembleContextRequest = {
    rootPath: mockRootPath,
    selectedFilePaths: [],
    includeGitDiff: false,
  };

  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(getDirectoryStructure).mockResolvedValue(['file1.ts', 'folder/']);
    vi.mocked(readFileWithChecks).mockImplementation(async (_filePathAbs: string, filePathRel: string) => {
      if (filePathRel === 'file1.ts') return 'content of file1';
      if (filePathRel === 'file2.js') return 'content of file2';
      return { error: 'File not found for mock' };
    });
    vi.mocked(getErrorMessage).mockImplementation((e: unknown) => (e instanceof Error ? e.message : String(e)));

    vi.mocked(isGitRepository).mockResolvedValue(true);
    vi.mocked(getCurrentCommitHash).mockResolvedValue('test-commit-hash');
    vi.mocked(getCombinedDiff).mockResolvedValue('diff content');
  });

  it('should return basic XML structure and token count for no selected files', async () => {
    const request = { ...baseRequest };
    const response = await assembleContext(request);

    if ('error' in response) throw new Error(`Expected success, got error: ${response.error}`);

    expect(response.xml).toContain(`<context version="0.2.0"`);
    expect(response.xml).toContain(`<summary>`);
    expect(response.xml).toContain(`<git_commit_hash>test-commit-hash</git_commit_hash>`);
    expect(response.xml).toContain(`<directory_structure>\nfile1.ts\nfolder/\n</directory_structure>`);
    expect(response.xml).not.toContain(`<files>`); // The <files> tag should not be present if no files are selected
    expect(response.xml).not.toContain(`<git_diff>`);
    // This assertion might fail if tiktoken cannot initialize in the test environment (e.g. WASM issues),
    // in which case actualTokenCount would be 0. If it fails, tiktoken mocking might be needed.
    expect(response.actualTokenCount).toBeGreaterThan(0);
  });

  it('should include selected files in the XML', async () => {
    const request = { ...baseRequest, selectedFilePaths: ['file1.ts'] };
    const response = await assembleContext(request);

    if ('error' in response) throw new Error(`Expected success, got error: ${response.error}`);
    expect(response.xml).toContain(`<file path="file1.ts">\ncontent of file1\n</file>`);
    const initialTokenCount = response.actualTokenCount;

    const request2 = {
      ...baseRequest,
      selectedFilePaths: ['file1.ts', 'file2.js'],
    };
    const response2 = await assembleContext(request2);
    if ('error' in response2) throw new Error(`Expected success, got error: ${response2.error}`);
    expect(response2.xml).toContain(`<file path="file1.ts">\ncontent of file1\n</file>`);
    expect(response2.xml).toContain(`<file path="file2.js">\ncontent of file2\n</file>`);
    expect(response2.actualTokenCount).toBeGreaterThan(initialTokenCount);
  });

  it('should include Git diff if requested and available', async () => {
    const request = { ...baseRequest, includeGitDiff: true };
    const response = await assembleContext(request);

    if ('error' in response) throw new Error(`Expected success, got error: ${response.error}`);
    expect(response.xml).toContain(`<git_diff>\ndiff content\n</git_diff>`);
  });

  it('should handle non-Git repository gracefully', async () => {
    vi.mocked(isGitRepository).mockResolvedValue(false);
    const request = { ...baseRequest, includeGitDiff: true };
    const response = await assembleContext(request);

    if ('error' in response) throw new Error(`Expected success, got error: ${response.error}`);
    expect(response.xml).not.toContain(`<git_commit_hash>`);
    expect(response.xml).not.toContain(`<git_diff>`);
  });

  it('should skip files that fail to read', async () => {
    vi.mocked(readFileWithChecks).mockImplementation(async (_filePathAbs: string, filePathRel: string) => {
      if (filePathRel === 'file1.ts') return 'content of file1';
      if (filePathRel === 'problemfile.txt') return { error: 'Test read error' };
      return { error: 'File not found for mock' };
    });
    const request = {
      ...baseRequest,
      selectedFilePaths: ['file1.ts', 'problemfile.txt'],
    };
    const response = await assembleContext(request);

    if ('error' in response) throw new Error(`Expected success, got error: ${response.error}`);
    expect(response.xml).toContain(`<file path="file1.ts">\ncontent of file1\n</file>`);
    expect(response.xml).not.toContain(`<file path="problemfile.txt">`);
  });

  it('should handle error during getDirectoryStructure', async () => {
    vi.mocked(getDirectoryStructure).mockRejectedValue(new Error('Dir structure failed'));
    const response = await assembleContext(baseRequest);

    expect(response).toHaveProperty('error');
    if (!('error' in response)) throw new Error('Expected error, got success');
    expect(response.error).toContain('Failed to assemble context: Dir structure failed');
  });

  it('should handle error during git operations without failing entire context', async () => {
    vi.mocked(getCurrentCommitHash).mockRejectedValue(new Error('Git hash failed'));
    vi.mocked(getCombinedDiff).mockRejectedValue(new Error('Git diff failed'));

    const request = {
      ...baseRequest,
      selectedFilePaths: ['file1.ts'],
      includeGitDiff: true,
    };
    const response = await assembleContext(request);

    if ('error' in response) throw new Error(`Expected success, got error: ${response.error}`);
    expect(response.xml).not.toContain(`<git_commit_hash>`);
    expect(response.xml).not.toContain(`<git_diff>`);
    expect(response.xml).toContain(`<file path="file1.ts">\ncontent of file1\n</file>`);
  });

  it('token count should be greater than 0 for valid XML', async () => {
    const response = await assembleContext(baseRequest);
    if ('error' in response) throw new Error(`Expected success, got error: ${response.error}`);
    expect(response.actualTokenCount).toBeGreaterThan(0);
  });
});
