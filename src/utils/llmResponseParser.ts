// src/utils/llmResponseParser.ts
import { ParsedChange } from '@/store/parseAtoms';
import { toPosixPath } from '@/utils/pathUtils';
import { parseSearchReplaceBlock } from '@/utils/diffUtils';

const LOG_PARSING_DETAILS = true;

function DEBUG(msg: string, ...args: unknown[]) {
  if (LOG_PARSING_DETAILS) {
    console.log('[LLMParser DEBUG]', msg, ...args);
  }
}

/**
 * Extracts the content between the first opening <response ...> tag and the
 * last closing </response> tag. This is more robust against "</response>"
 * appearing as a literal string within the content itself.
 * @param responseText The full text from the LLM.
 * @returns The string between the outermost <response> tags, or the original text if tags are not found or malformed.
 */
export function extractResponseXml(responseText: string): string {
  const openTagRegex = /<response(?:\s+[^>]*)?>/i;
  const openTagMatch = responseText.match(openTagRegex);

  if (!openTagMatch || typeof openTagMatch.index === 'undefined') {
    DEBUG('No opening <response...> tag found. Parsing full input as is.');
    return responseText;
  }

  const openTagStartOffset = openTagMatch.index;
  const openTagEndOffset = openTagStartOffset + openTagMatch[0].length;

  // Find the last occurrence of </response>
  const closeTagString = '</response>';
  const closeTagStartOffset = responseText.lastIndexOf(closeTagString);

  if (closeTagStartOffset === -1 || closeTagStartOffset < openTagEndOffset) {
    DEBUG(
      `No closing </response> tag found after the first opening <response...> tag at offset ${openTagStartOffset}, or tags are improperly ordered. Content might be truncated or parsing full input from after opening tag.`
    );
    // If a valid opening tag was found but no valid closing tag,
    // it's ambiguous. Returning the original text or text after open tag are options.
    // For safety, if we can't define a clear block, parse the original.
    // However, if we are sure an open tag exists, parsing from after it might be intended.
    // Given this function's goal, if structure is broken, it's safer to return original.
    // Or, if only the close tag is missing, then it means the response from LLM is incomplete.
    return responseText; // Or: responseText.substring(openTagEndOffset); if we want to try parsing a potentially unclosed block
  }

  const extractedContent = responseText.substring(openTagEndOffset, closeTagStartOffset);

  DEBUG(
    `Extracted content between first <response...> (ends at ${openTagEndOffset}) and last </response> (starts at ${closeTagStartOffset}). Extracted length: ${extractedContent.length}`
  );
  return extractedContent;
}

interface TagInfo {
  name: string;
  attributes: Record<string, string>;
  isSelfClosing: boolean;
  content?: string;
  parseError?: string;
}

interface ParseState {
  input: string;
  position: number;
}

function parseTagName(state: ParseState): string {
  const start = state.position;
  while (state.position < state.input.length && !/[\s/>=]/.test(state.input[state.position])) {
    state.position++;
  }
  return state.input.substring(start, state.position);
}

function parseAttributes(state: ParseState): Record<string, string> {
  const attributes: Record<string, string> = {};
  while (
    state.position < state.input.length &&
    state.input[state.position] !== '>' &&
    state.input[state.position] !== '/'
  ) {
    const char = state.input[state.position];
    if (/\s/.test(char)) {
      state.position++;
      continue;
    }

    const nameStart = state.position;
    while (state.position < state.input.length && !/[\s=/>]/.test(state.input[state.position])) {
      state.position++;
    }
    const attrName = state.input.substring(nameStart, state.position);
    if (!attrName) {
      break;
    }

    while (state.position < state.input.length && /\s/.test(state.input[state.position])) {
      state.position++;
    }
    if (state.input[state.position] !== '=') {
      DEBUG(
        `Malformed attribute (missing '=' after name '${attrName}') at pos ${state.position}. Tag parsing might be affected.`
      );
      while (
        state.position < state.input.length &&
        state.input[state.position] !== '>' &&
        state.input[state.position] !== '/' &&
        !/\s/.test(state.input[state.position])
      )
        state.position++;
      continue;
    }
    state.position++;

    while (state.position < state.input.length && /\s/.test(state.input[state.position])) {
      state.position++;
    }

    const quoteChar = state.input[state.position];
    if (quoteChar !== '"' && quoteChar !== "'") {
      DEBUG(`Malformed attribute value (missing quotes for '${attrName}') at pos ${state.position}.`);
      while (
        state.position < state.input.length &&
        state.input[state.position] !== '>' &&
        state.input[state.position] !== '/' &&
        !/\s/.test(state.input[state.position])
      )
        state.position++;
      continue;
    }
    state.position++;
    const valueStart = state.position;
    while (state.position < state.input.length && state.input[state.position] !== quoteChar) {
      state.position++;
    }
    const attrValue = state.input.substring(valueStart, state.position);
    if (state.input[state.position] === quoteChar) {
      state.position++;
    } else {
      DEBUG(`Malformed attribute value (unclosed quote for '${attrName}') at pos ${state.position}.`);
    }
    attributes[attrName] = attrValue;
  }
  return attributes;
}

function parseSingleTag(state: ParseState): TagInfo | null {
  const tagStartOriginalPos = state.position;
  if (state.input[state.position] !== '<') return null;
  state.position++;

  const tagName = parseTagName(state);
  if (!tagName) {
    DEBUG(`Could not parse tag name at pos ${tagStartOriginalPos + 1}.`);
    const recoveryPos = state.input.indexOf('>', state.position);
    state.position = recoveryPos !== -1 ? recoveryPos + 1 : state.input.length;
    return {
      name: 'unknown_error_tag',
      attributes: {},
      isSelfClosing: true,
      parseError: 'Failed to parse tag name',
    };
  }

  const attributes = parseAttributes(state);

  let isSelfClosing = false;
  if (state.input[state.position] === '/') {
    isSelfClosing = true;
    state.position++;
  }

  if (state.position >= state.input.length || state.input[state.position] !== '>') {
    DEBUG(
      `Malformed tag (missing '>') for tag <${tagName} at pos ${state.position}. Original start: ${tagStartOriginalPos}`
    );
    const recoveryPos = state.input.indexOf('>', tagStartOriginalPos);
    state.position = recoveryPos !== -1 ? recoveryPos + 1 : state.input.length;
    return {
      name: tagName,
      attributes,
      isSelfClosing: true,
      parseError: "Malformed tag structure (missing '>')",
    };
  }
  state.position++;

  return { name: tagName, attributes, isSelfClosing };
}

function mapTagToParsedChange(tagInfo: TagInfo): ParsedChange | null {
  if (tagInfo.parseError) {
    DEBUG(`Skipping mapping for tag <${tagInfo.name}> due to parse error: ${tagInfo.parseError}`);
    return null;
  }
  const { name, attributes, content } = tagInfo;
  const path = attributes.path ? toPosixPath(attributes.path) : undefined;
  const reason = attributes.reason;

  switch (name) {
    case 'context-timestamp':
      return { type: 'timestamp', content: (content || '').trim() };
    case 'plan':
      return { type: 'plan', content: (content || '').trim() };
    case 'file-write':
      if (!path) {
        DEBUG(`<file-write> tag missing 'path' attribute.`);
        return null;
      }
      // Remove a single leading newline (CRLF or LF) if present.
      // This handles the LLM's tendency to start content on the line *after* the tag.
      return {
        type: 'create',
        path,
        reason,
        content: (content || '').replace(/^\r?\n/, ''),
      };
    case 'file-replace-block': {
      if (!path) {
        DEBUG(`<file-replace-block> tag missing 'path' attribute.`);
        return null; // TODO: need to return error type, 'Missing path attribute'
      }
      const diffBlockContent = (content || '').replace(/^\r?\n/, ''); // Remove a single leading newline
      const parsedReplaceBlock = parseSearchReplaceBlock(diffBlockContent);
      if (!parsedReplaceBlock) return null; // TODO: need to return error type, 'Invalid search/replace block'
      return {
        type: 'edit',
        path,
        reason,
        diffContent: diffBlockContent,
        diffType: 'search-replace',
        searchText: parsedReplaceBlock.searchText,
        replaceText: parsedReplaceBlock.replaceText,
      };
    }
    case 'file-diff': {
      // TODO: placeholder for a unified diff
      if (!path) {
        return null;
      }
      const diffBlockContent = (content || '').replace(/^\r?\n/, '');
      return {
        type: 'edit',
        path,
        reason,
        diffType: 'unified-diff',
        diffContent: diffBlockContent,
      };
    }
    case 'file-delete':
      if (!path) {
        DEBUG(`<file-delete> tag missing 'path' attribute.`);
        return null;
      }
      if (!tagInfo.isSelfClosing) {
        DEBUG(`<file-delete> tag was not self-closing. Content ignored.`);
      }
      return { type: 'delete', path, reason };
    case 'file-request':
      if (!path) {
        DEBUG(`<file-request> tag missing 'path' attribute.`);
        return null;
      }
      if (!tagInfo.isSelfClosing) {
        DEBUG(`<file-request> tag was not self-closing. Content ignored.`);
      }
      return { type: 'request', path };
    case 'message':
      return {
        type: 'message',
        content: (content || '').trim(),
        purpose: attributes.purpose, // Extract purpose attribute
      };
    default:
      if (name !== 'unknown_error_tag') DEBUG(`Unknown tag type encountered: <${name}>`);
      return null;
  }
}

export function parseResponseXmlContent(responseContent: string): ParsedChange[] {
  const state: ParseState = {
    input: responseContent,
    position: 0,
  };
  const changes: ParsedChange[] = [];

  DEBUG('Starting custom parsing. Input length:', state.input.length);
  if (state.input.length < 2000) DEBUG('Input content:', state.input);
  else DEBUG('Input content (first 2000 chars):', state.input.substring(0, 2000));

  while (state.position < state.input.length) {
    const currentReadPosition = state.position;
    const nextTagStart = state.input.indexOf('<', state.position);
    if (nextTagStart === -1) {
      const remainingText = state.input.substring(state.position).trim();
      if (remainingText.length > 0) {
        DEBUG(`Trailing non-tag content: "${remainingText.substring(0, 100)}..."`);
      }
      break;
    }

    const textBeforeTag = state.input.substring(state.position, nextTagStart).trim();
    if (textBeforeTag.length > 0) {
      DEBUG(
        `Text between tags (len ${textBeforeTag.length}): "${textBeforeTag.substring(0, 100).replace(/\n/g, '\\n')}..."`
      );
    }
    state.position = nextTagStart;

    if (state.input.startsWith('</', state.position)) {
      const endOfClosingTag = state.input.indexOf('>', state.position);
      const problemTag = state.input.substring(
        state.position,
        endOfClosingTag !== -1 ? endOfClosingTag + 1 : state.position + 20
      );
      DEBUG(`Encountered unexpected top-level closing tag: ${problemTag} at pos ${state.position}. Advancing.`);
      state.position = endOfClosingTag !== -1 ? endOfClosingTag + 1 : state.input.length;
      continue;
    }

    const parsedTag = parseSingleTag(state);
    if (!parsedTag || parsedTag.parseError) {
      DEBUG(
        `Failed to parse a tag structure starting at pos ${nextTagStart} (name: ${parsedTag?.name ?? 'unknown'}). State position advanced to ${state.position}.`
      );
      if (state.position <= nextTagStart) {
        state.position = nextTagStart + 1; // Ensure progress if parseSingleTag fails without advancing position
      }
      continue;
    }

    DEBUG(`Parsed tag: <${parsedTag.name}>, SelfClosing: ${parsedTag.isSelfClosing}, Attrs:`, parsedTag.attributes);

    if (!parsedTag.isSelfClosing) {
      const endTag = `</${parsedTag.name}>`;
      const contentStartPosition = state.position;
      const contentEndPosition = state.input.indexOf(endTag, contentStartPosition);

      if (contentEndPosition === -1) {
        DEBUG(
          `Tag <${parsedTag.name}> at pos ${nextTagStart} opened but NO closing tag '${endTag}' found. Skipping content for this tag.`
        );
        parsedTag.content = '';
        parsedTag.parseError = `Unclosed tag <${parsedTag.name}>`; // Record error on the tag
        const nextPotentialTag = state.input.indexOf('<', contentStartPosition);
        state.position = nextPotentialTag !== -1 ? nextPotentialTag : state.input.length; // Advance to next tag or EOF
      } else {
        parsedTag.content = state.input.substring(contentStartPosition, contentEndPosition);
        state.position = contentEndPosition + endTag.length;
      }
      if (parsedTag.content && !parsedTag.parseError) {
        DEBUG(
          `  Content for <${parsedTag.name}> (len ${parsedTag.content.length}, first 100 chars): "${parsedTag.content.substring(0, 100).replace(/\n/g, '\\n')}..."`
        );
      }
    }

    const changeObject = mapTagToParsedChange(parsedTag);
    if (changeObject) {
      changes.push(changeObject);
      DEBUG('  Mapped to Change:', changeObject.type, changeObject);
    } else {
      if (!parsedTag.parseError)
        DEBUG(`  Could not map tag <${parsedTag.name}> to a ParsedChange object (e.g. missing path, or unknown tag).`);
    }

    // Safety break for infinite loops if position doesn't advance
    if (state.position === currentReadPosition && state.position < state.input.length) {
      DEBUG(`Parser stuck at position ${state.position}. Forcing advance.`);
      state.position++;
    }
  }

  DEBUG('Custom parsing finished. Total changes parsed:', changes.length);
  return changes;
}
