// src/utils/xmlParsingUtils.ts

/**
 * Extracts file paths from a <files-for-context> XML block.
 * The XML block can be plain or wrapped in markdown code fences.
 *
 * @param text The text potentially containing the XML block.
 * @returns An array of file path strings (with prefixes like '++', '+') if the block is found and parsed,
 *          otherwise null.
 */
export function parseFilesForContextXml(text: string): string[] | null {
  // Regex to find <files-for-context> block, optionally in markdown code fences.
  // It captures the content between the tags.
  // Group 1: Optional ```xml prefix
  // Group 2: Content within <files-for-context>
  // Group 3: Optional ``` suffix
  const xmlBlockRegex = /(?:```xml\s*)?<files-for-context>\s*([\s\S]*?)\s*<\/files-for-context>(?:\s*```)?/;
  const match = text.match(xmlBlockRegex);

  if (match && typeof match[1] === 'string') {
    const content = match[1];
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  return null;
}
