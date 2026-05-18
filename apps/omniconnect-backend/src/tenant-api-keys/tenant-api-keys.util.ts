import { createHash, randomBytes } from 'crypto';

/**
 * Plaintext format: `oc_<32-byte hex>`. Stored as sha256(plaintext).
 * Prefix kept for human identification ("the key starting with oc_a1b2c3...").
 */
export const API_KEY_PLAINTEXT_PREFIX = 'oc_';
export const API_KEY_DISPLAY_PREFIX_LENGTH = 'oc_'.length + 6;

export interface GeneratedApiKey {
  plaintext: string;
  hashedKey: string;
  prefix: string;
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

export function deriveApiKeyPrefix(plaintext: string): string {
  return plaintext.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH);
}

export function generateApiKey(): GeneratedApiKey {
  const random = randomBytes(32).toString('hex');
  const plaintext = `${API_KEY_PLAINTEXT_PREFIX}${random}`;
  return {
    plaintext,
    hashedKey: hashApiKey(plaintext),
    prefix: deriveApiKeyPrefix(plaintext),
  };
}
