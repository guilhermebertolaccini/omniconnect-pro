import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { BridgeSecretCipher } from './bridge-secret-cipher';

const ORIGINAL_ENV = process.env.NODE_ENV;

function makeConfig(value: string | undefined): ConfigService {
  return {
    get: jest.fn().mockReturnValue(value),
  } as unknown as ConfigService;
}

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
});

describe('BridgeSecretCipher', () => {
  const validBase64Key = crypto.randomBytes(32).toString('base64');

  it('round-trips encrypt/decrypt with a base64 32-byte key', () => {
    const cipher = new BridgeSecretCipher(makeConfig(validBase64Key));
    const enc = cipher.encrypt('super-secret-hmac-key-1234567890');
    expect(enc.startsWith('v1.')).toBe(true);
    const dec = cipher.decrypt(enc);
    expect(dec).toBe('super-secret-hmac-key-1234567890');
  });

  it('produces distinct ciphertexts for the same plaintext (random IV)', () => {
    const cipher = new BridgeSecretCipher(makeConfig(validBase64Key));
    const a = cipher.encrypt('same');
    const b = cipher.encrypt('same');
    expect(a).not.toBe(b);
    expect(cipher.decrypt(a)).toBe('same');
    expect(cipher.decrypt(b)).toBe('same');
  });

  it('rejects tampered ciphertexts via the GCM auth tag', () => {
    const cipher = new BridgeSecretCipher(makeConfig(validBase64Key));
    const enc = cipher.encrypt('secret');
    const parts = enc.split('.');
    const tamperedCt = Buffer.from(parts[3], 'base64');
    tamperedCt[0] ^= 0x01;
    parts[3] = tamperedCt.toString('base64');
    const tampered = parts.join('.');
    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  it('rejects payloads with the wrong version prefix', () => {
    const cipher = new BridgeSecretCipher(makeConfig(validBase64Key));
    const enc = cipher.encrypt('x');
    const parts = enc.split('.');
    parts[0] = 'v0';
    expect(() => cipher.decrypt(parts.join('.'))).toThrow(
      /unsupported payload format/i,
    );
  });

  it('accepts a hex-encoded 64-char key', () => {
    const hexKey = crypto.randomBytes(32).toString('hex');
    const cipher = new BridgeSecretCipher(makeConfig(hexKey));
    const enc = cipher.encrypt('hello');
    expect(cipher.decrypt(enc)).toBe('hello');
  });

  it('in development, derives a key via sha256 from a short passphrase', () => {
    process.env.NODE_ENV = 'development';
    const cipher = new BridgeSecretCipher(makeConfig('weak-dev-passphrase'));
    const enc = cipher.encrypt('hello');
    expect(cipher.decrypt(enc)).toBe('hello');
  });

  it('in production with no key, refuses to encrypt/decrypt', () => {
    process.env.NODE_ENV = 'production';
    const cipher = new BridgeSecretCipher(makeConfig(undefined));
    expect(() => cipher.encrypt('x')).toThrow(InternalServerErrorException);
  });

  describe('decryptWithLegacyFallback', () => {
    it('decrypts v1 payloads normally', () => {
      const cipher = new BridgeSecretCipher(makeConfig(validBase64Key));
      const enc = cipher.encrypt('hello');
      expect(cipher.decryptWithLegacyFallback(enc)).toBe('hello');
    });

    it('returns plaintext as-is in non-production for legacy rows', () => {
      process.env.NODE_ENV = 'development';
      const cipher = new BridgeSecretCipher(makeConfig(validBase64Key));
      expect(cipher.decryptWithLegacyFallback('legacy-plain-secret')).toBe(
        'legacy-plain-secret',
      );
    });

    it('throws in production on legacy rows', () => {
      process.env.NODE_ENV = 'production';
      const cipher = new BridgeSecretCipher(makeConfig(validBase64Key));
      expect(() => cipher.decryptWithLegacyFallback('legacy-plain-secret')).toThrow();
    });
  });
});
