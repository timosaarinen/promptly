// src/utils/cleanCommitMessage.ts

/**
 * Sanitizes a commit message by removing XML/HTML tags, Markdown code fences,
 * replacing backticks, normalizing whitespace, and collapsing excessive blank lines.
 *
 * The sanitization steps are, in order:
 * 1. Remove all XML/HTML tags (e.g., <tag>, <tag attr="value">), preserving inner content.
 *    Uses a non-greedy regex `/<[^>]*?>/g` for better attribute handling.
 * 2. Remove all occurrences of Markdown code fence delimiters ("```").
 * 3. Replace all backtick (`) characters with single quote (') characters.
 * 4. Normalize all line endings (CRLF, CR) to LF ('\n').
 * 5. Trim leading and trailing whitespace from each line.
 * 6. Collapse three or more consecutive blank lines into two blank lines.
 *    (e.g., "\n\n\n" becomes "\n\n").
 * 7. Trim leading and trailing whitespace from the entire message.
 *
 * This function is intended to prepare messages (e.g., from an LLM or user input)
 * for display in terminals or for use with `git commit`, preventing issues with
 * unescaped special characters or unwanted formatting.
 *
 * @param message The raw commit message string. Can be null or undefined.
 * @returns A sanitized commit message string. Returns an empty string if the input is null/undefined.
 */
export function cleanCommitMessage(message: string | null | undefined): string {
  if (message === null || message === undefined) {
    return '';
  }

  let cleaned = String(message);

  // 1. Remove all XML/HTML tags, preserve inner content. Use non-greedy match.
  cleaned = cleaned.replace(/<[^>]*?>/g, '');

  // 2. Remove Markdown code fences (```).
  cleaned = cleaned.replace(/```/g, '');

  // 3. Replace backticks (`) with single quotes (').
  cleaned = cleaned.replace(/`/g, "'");

  // 4. Normalize line endings to \n for consistent processing.
  cleaned = cleaned.replace(/\r\n|\r/g, '\n');

  // 5. Remove leading/trailing whitespace per line.
  const lines = cleaned.split('\n');
  const trimmedLines = lines.map((line) => line.trim());
  cleaned = trimmedLines.join('\n');

  // 6. Collapse excessive blank lines (more than 2 in a row to max 2).
  // This means 3 or more newlines (which represent blank lines after trimming)
  // become 2 newlines.
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // 7. Trim overall leading/trailing whitespace from the final message.
  cleaned = cleaned.trim();

  return cleaned;
}
