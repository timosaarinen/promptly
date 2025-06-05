// src/utils/diffUtils.ts

export interface ApplySearchReplaceResult {
  success: boolean;
  content: string;
  errorType?: 'search_not_found' | 'identical_content';
}

/**
 * Normalizes code for comparison by stripping comments and standardizing whitespace.
 * @param code The code string to normalize.
 * @returns Normalized code string.
 */
export function normalizeCodeForComparison(code: string): string {
  let normalized = code;
  // 1. Normalize line endings (though inputs to this function are expected to be LF already)
  normalized = normalized.replace(/\r\n|\r/g, '\n');
  // 2. Strip block comments (non-greedy)
  normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, '');
  // 3. Strip line comments
  normalized = normalized.replace(/\/\/[^\n]*\n/g, '\n'); // remove comment and the newline it occupied
  normalized = normalized.replace(/\/\/[^\n]*$/g, ''); // remove comment if it's the last line
  // 4. Trim whitespace from each line
  normalized = normalized
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
  // 5. Collapse multiple blank lines into a single blank line
  normalized = normalized.replace(/\n{2,}/g, '\n');
  // 6. Trim overall
  return normalized.trim();
}

/**
 * Validates if the searchText can be found in originalContent using tolerant matching
 * (ignoring comments and normalizing whitespace).
 * @param originalContent The original content of the file (expected to be LF normalized).
 * @param searchText The search text (expected to be LF normalized).
 * @returns An object { isMatch: boolean; reason?: string }.
 */
export function validateSearchTextTolerantly(
  originalContent: string,
  searchText: string
): { isMatch: boolean; reason?: string } {
  const normalizedOriginal = normalizeCodeForComparison(originalContent);
  const normalizedSearch = normalizeCodeForComparison(searchText);

  if (normalizedSearch === '') {
    // Searching for an empty string after normalization is problematic / likely not intended.
    return { isMatch: false, reason: 'Normalized search text is empty.' };
  }

  if (normalizedOriginal.includes(normalizedSearch)) {
    return { isMatch: true, reason: 'Match found after normalizing whitespace and comments.' };
  }
  return { isMatch: false };
}

/**
 * Parse a search/replace block.
 * Ensures that searchText and replaceText use LF line endings.
 * @param diffContent The raw diff string, including markers.
 * @returns null if not a block; otherwise { searchText, replaceText }.
 */
export function parseSearchReplaceBlock(diffContent: string): { searchText: string; replaceText: string } | null {
  // Normalize the entire diffContent to LF first for consistent regex matching and output.
  const normalizedDiffContent = diffContent.replace(/\r\n|\r/g, '\n');

  const regex = /<<<<<<<\s*SEARCH\n?([\s\S]*?)\n?=======\n?([\s\S]*?)\n?>>>>>>>\s*REPLACE/;
  const match = normalizedDiffContent.match(regex);

  if (!match) {
    // Fallback for simple, potentially single-line blocks if the main regex fails.
    const fallbackRegex = /<<<<<<<\s*SEARCH\s+([\s\S]+?)\s+=======\s+([\s\S]*?)\s+>>>>>>>\s*REPLACE/;
    const fallbackMatch = normalizedDiffContent.match(fallbackRegex); // use normalized here too
    if (!fallbackMatch) return null;
    // For fallback, ensure results are also LF (though normalizedDiffContent should ensure this)
    return {
      searchText: fallbackMatch[1].replace(/\r\n|\r/g, '\n'),
      replaceText: fallbackMatch[2].replace(/\r\n|\r/g, '\n'),
    };
  }

  // match[1] is searchText, match[2] is replaceText from the new regex
  // These will have LF line endings due to initial normalization of diffContent.
  return { searchText: match[1], replaceText: match[2] };
}

/**
 * Apply a single search/replace block to the file content.
 * Assumes originalContent and searchText are LF normalized.
 * @param originalContent Full file text.
 * @param searchText The exact snippet to find.
 * @param replaceText Replacement snippet.
 * @returns An object indicating success, content, and potential error type.
 */
export function applySearchReplaceBlock(
  originalContent: string,
  searchText: string,
  replaceText: string
): ApplySearchReplaceResult {
  if (searchText === replaceText) {
    return { success: false, content: originalContent, errorType: 'identical_content' };
  }
  // Ensure inputs are LF, though callers should already do this.
  const searchNormalized = searchText.replace(/\r\n|\r/g, '\n');
  const originalNormalized = originalContent.replace(/\r\n|\r/g, '\n');

  const index = originalNormalized.indexOf(searchNormalized);
  if (index === -1) {
    return { success: false, content: originalContent, errorType: 'search_not_found' };
  }
  // Perform replacement on the originalContent to preserve its original line endings
  // if searchText matched in its LF-normalized form.
  // This assumes that if LF-normalized versions match, the original searchText
  // (potentially with mixed endings before parseSearchReplaceBlock normalized it)
  // would also match originalContent if originalContent had those mixed endings.
  // A safer direct replacement on originalContent using original (pre-normalized) searchText
  // is tricky because parseSearchReplaceBlock now normalizes.
  // The current strategy: match on LF, replace on LF.
  const replaceNormalized = replaceText.replace(/\r\n|\r/g, '\n');
  return { success: true, content: originalNormalized.replace(searchNormalized, replaceNormalized) };
}
