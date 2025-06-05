// src/services/tokenService.ts
import { encode } from 'gpt-tokenizer';

/**
 * Calculates the number of tokens for a given text.
 * Uses gpt-tokenizer, which is compatible with GPT-2, GPT-3, GPT-3.5, GPT-4.
 * @param text The text to tokenize.
 * @returns The number of tokens.
 */
export function calculateTokenCount(text: string): number {
  if (!text) return 0;
  try {
    const tokens = encode(text);
    return tokens.length;
  } catch (error) {
    console.error('Error calculating token count:', error);
    return 0;
  }
}

/**
 * Calculates the number of characters for a given text.
 * @param text The text to count characters from.
 * @returns The number of characters.
 */
export function calculateCharCount(text: string): number {
  return text ? text.length : 0;
}
