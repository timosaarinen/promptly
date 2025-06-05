// src/utils/cryptoUtils.ts

/**
 * Calculates the SHA-256 hash of a given string.
 * @param content The string content to hash.
 * @returns A Promise that resolves to the hexadecimal string representation of the SHA-256 hash.
 */
export async function calculateHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
