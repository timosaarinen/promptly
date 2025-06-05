// tests/src/utils/cleanCommitMessage.test.ts
import { describe, it, expect } from 'vitest';
import { cleanCommitMessage } from '@/utils/cleanCommitMessage';

describe('cleanCommitMessage', () => {
  it('should return an empty string for null or undefined input', () => {
    expect(cleanCommitMessage(null)).toBe('');
    expect(cleanCommitMessage(undefined)).toBe('');
  });

  it('should return an empty string for an empty string input', () => {
    expect(cleanCommitMessage('')).toBe('');
  });

  it('should not change a message that is already clean', () => {
    const message = 'This is a clean message.\n\nWith two blank lines.';
    expect(cleanCommitMessage(message)).toBe(message);
  });

  it('should remove XML/HTML tags and preserve inner content', () => {
    expect(cleanCommitMessage('<p>Hello</p> <b>World</b>')).toBe('Hello World');
    expect(cleanCommitMessage('Text with <br/> self-closing tag.')).toBe('Text with  self-closing tag.');
    expect(cleanCommitMessage('No tags here.')).toBe('No tags here.');
    expect(cleanCommitMessage('<tag attr="value">Content</tag>')).toBe('Content');
    expect(cleanCommitMessage('Tag soup <tag1><tag2>Nested</tag2></tag1> here')).toBe('Tag soup Nested here');
  });

  it('should remove Markdown code fences', () => {
    expect(cleanCommitMessage('```\ncode block\n```')).toBe('code block');
    expect(cleanCommitMessage('```javascript\nconst x = 10;\n```')).toBe('javascript\nconst x = 10;');
    expect(cleanCommitMessage('Text before ```\nfenced code\n``` and after.')).toBe(
      'Text before\nfenced code\nand after.' // Corrected: no leading/trailing spaces on lines due to trim()
    );
    expect(cleanCommitMessage('Just ``` by itself ``` should be removed')).toBe('Just  by itself  should be removed');
  });

  it('should normalize line endings (CRLF, CR to LF)', () => {
    expect(cleanCommitMessage('Line1\r\nLine2\rLine3\nLine4')).toBe('Line1\nLine2\nLine3\nLine4');
  });

  it('should trim leading/trailing whitespace from each line', () => {
    expect(cleanCommitMessage('  Line 1  \n  Line 2  \n\n  Line 3  ')).toBe('Line 1\nLine 2\n\nLine 3');
    expect(cleanCommitMessage('Line A\n   \nLine B')).toBe('Line A\n\nLine B'); // Line of spaces becomes empty
  });

  it('should collapse excessive blank lines (more than 2 to max 2)', () => {
    expect(cleanCommitMessage('Line 1\n\n\nLine 2')).toBe('Line 1\n\nLine 2'); // 3 newlines
    expect(cleanCommitMessage('Line 1\n\n\n\nLine 2')).toBe('Line 1\n\nLine 2'); // 4 newlines
    expect(cleanCommitMessage('Line 1\n\nLine 2')).toBe('Line 1\n\nLine 2'); // 2 newlines (no change)
    expect(cleanCommitMessage('Line 1\nLine 2')).toBe('Line 1\nLine 2'); // 1 newline (no change)
  });

  it('should trim overall leading/trailing whitespace (including blank lines)', () => {
    expect(cleanCommitMessage('  \nMessage\n  ')).toBe('Message');
    expect(cleanCommitMessage('\n\nStart\n\nEnd\n\n')).toBe('Start\n\nEnd');
    expect(cleanCommitMessage('  Leading space')).toBe('Leading space');
    expect(cleanCommitMessage('Trailing space  ')).toBe('Trailing space');
  });

  it('should handle a combination of all rules', () => {
    const complexMessage = `
      <header>Important Announcement</header>
      First line with trailing spaces.   
      Second line with leading spaces.
      
      \`\`\`typescript
      const value = "<xml>data</xml>"; // example
      \`\`\`
      
      
      Another paragraph. <br/>
      And one more line.
      
      
      
      Final thoughts.   
    `;
    // Note: The space after "Another paragraph." is removed by line trimming.
    const expected = `Important Announcement
First line with trailing spaces.
Second line with leading spaces.

typescript
const value = "data"; // example

Another paragraph.
And one more line.

Final thoughts.`;
    expect(cleanCommitMessage(complexMessage)).toBe(expected);
  });

  it('should preserve Unicode characters', () => {
    const message = '你好 <tag>世界</tag> ```κόσμε```';
    expect(cleanCommitMessage(message)).toBe('你好 世界 κόσμε');
  });

  it('should handle lines that become empty after tag/fence removal and trimming', () => {
    expect(cleanCommitMessage('  <tagonly>  \nNext line')).toBe('Next line'); // Line with only tag becomes empty, final trim removes leading \n
    expect(cleanCommitMessage('  ```  \nNext line')).toBe('Next line'); // Line with only fence becomes empty, final trim removes leading \n
    expect(cleanCommitMessage('  <tag>  \n   ```   \nActual content')).toBe('Actual content'); // Two empty lines removed by final trim
  });
});
