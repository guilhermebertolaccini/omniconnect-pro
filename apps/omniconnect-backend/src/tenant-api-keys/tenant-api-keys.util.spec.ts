import {
  generateApiKey,
  hashApiKey,
  deriveApiKeyPrefix,
  API_KEY_PLAINTEXT_PREFIX,
  API_KEY_DISPLAY_PREFIX_LENGTH,
} from './tenant-api-keys.util';

describe('tenant-api-keys.util', () => {
  describe('generateApiKey', () => {
    it('produces a plaintext starting with the canonical prefix', () => {
      const key = generateApiKey();
      expect(key.plaintext.startsWith(API_KEY_PLAINTEXT_PREFIX)).toBe(true);
      expect(key.plaintext.length).toBeGreaterThan(API_KEY_PLAINTEXT_PREFIX.length + 32);
    });

    it('derives the prefix from the first display chars of the plaintext', () => {
      const key = generateApiKey();
      expect(key.prefix).toBe(key.plaintext.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH));
    });

    it('stores only the hash, never the plaintext in hashedKey', () => {
      const key = generateApiKey();
      expect(key.hashedKey).not.toContain(key.plaintext);
      expect(key.hashedKey).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces distinct keys on each call (no collisions in 100 samples)', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 100; i++) {
        seen.add(generateApiKey().plaintext);
      }
      expect(seen.size).toBe(100);
    });
  });

  describe('hashApiKey', () => {
    it('is deterministic for the same input', () => {
      const a = hashApiKey('oc_abc');
      const b = hashApiKey('oc_abc');
      expect(a).toBe(b);
    });

    it('changes when the plaintext changes by a single character', () => {
      const a = hashApiKey('oc_abc');
      const b = hashApiKey('oc_abd');
      expect(a).not.toBe(b);
    });

    it('returns a 64-char hex (sha256)', () => {
      expect(hashApiKey('whatever')).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('deriveApiKeyPrefix', () => {
    it('returns the configured display length', () => {
      const prefix = deriveApiKeyPrefix('oc_abcdefghij');
      expect(prefix.length).toBe(API_KEY_DISPLAY_PREFIX_LENGTH);
    });
  });
});
