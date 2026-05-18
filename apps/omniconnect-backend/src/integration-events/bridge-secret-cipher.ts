import * as crypto from 'crypto';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * AES-256-GCM cipher used to protect bridge webhook secrets at rest.
 *
 * Wire format (base64-url-safe-ish but stored as plain base64):
 *
 *   v1.<base64(iv)>.<base64(authTag)>.<base64(ciphertext)>
 *
 * - v1 = version prefix so we can rotate the algorithm later without a
 *   destructive migration.
 * - iv = 12 bytes random per encryption (GCM standard).
 * - authTag = 16 bytes integrity tag.
 * - ciphertext = AES-256-GCM output (no padding needed).
 *
 * Key source: env `BRIDGE_SECRET_KEY`. Accepted formats:
 *   - base64-encoded 32 bytes (preferred); OR
 *   - hex-encoded 64 chars; OR
 *   - raw string that is hashed with sha256 to derive 32 bytes
 *     (only allowed outside production, with a logged warning, so the
 *     dev experience does not require generating a key first).
 *
 * NEVER log the key, the plaintext secret, or the ciphertext. The
 * service throws on misconfiguration in production rather than falling
 * back silently.
 */
@Injectable()
export class BridgeSecretCipher {
  private readonly logger = new Logger(BridgeSecretCipher.name);
  private cachedKey: Buffer | null = null;
  private static readonly VERSION = 'v1';
  private static readonly IV_LENGTH = 12;
  private static readonly TAG_LENGTH = 16;

  constructor(private readonly config: ConfigService) {}

  encrypt(plaintext: string): string {
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
      throw new Error('BridgeSecretCipher.encrypt: plaintext must be a non-empty string');
    }
    const key = this.getKey();
    const iv = crypto.randomBytes(BridgeSecretCipher.IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      BridgeSecretCipher.VERSION,
      iv.toString('base64'),
      tag.toString('base64'),
      enc.toString('base64'),
    ].join('.');
  }

  decrypt(payload: string): string {
    if (typeof payload !== 'string' || payload.length === 0) {
      throw new Error('BridgeSecretCipher.decrypt: payload must be a non-empty string');
    }
    const parts = payload.split('.');
    if (parts.length !== 4 || parts[0] !== BridgeSecretCipher.VERSION) {
      throw new Error(`BridgeSecretCipher.decrypt: unsupported payload format`);
    }
    const [, ivB64, tagB64, ctB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    if (iv.length !== BridgeSecretCipher.IV_LENGTH || tag.length !== BridgeSecretCipher.TAG_LENGTH) {
      throw new Error('BridgeSecretCipher.decrypt: invalid iv/tag length');
    }
    const key = this.getKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString('utf8');
  }

  /**
   * Tolerant decrypt used during the legacy -> encrypted rollout. If
   * the payload is not in v1 format (e.g. legacy plaintext secret left
   * over from before Sprint 1.3) we return it as-is in non-production
   * environments and emit a single warning. In production we always
   * require the v1 format.
   */
  decryptWithLegacyFallback(payload: string): string {
    try {
      return this.decrypt(payload);
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
      this.logger.warn(
        'BridgeSecretCipher: payload not in v1 format. Treating as legacy plaintext (dev only). ' +
          'Re-encrypt the row via BridgeSecretCipher.encrypt() before going to production.',
      );
      return payload;
    }
  }

  private getKey(): Buffer {
    if (this.cachedKey) return this.cachedKey;
    const raw = this.config.get<string>('BRIDGE_SECRET_KEY');
    if (!raw || raw.trim() === '') {
      if (process.env.NODE_ENV === 'production') {
        throw new InternalServerErrorException(
          'BRIDGE_SECRET_KEY is not configured. Refusing to encrypt/decrypt bridge secrets in production.',
        );
      }
      this.logger.warn(
        'BRIDGE_SECRET_KEY not set. Using a deterministic dev fallback. Do NOT use this in production.',
      );
      this.cachedKey = crypto.createHash('sha256').update('omniconnect-dev-bridge-key').digest();
      return this.cachedKey;
    }

    let key: Buffer | null = null;
    // 1) try base64
    try {
      const decoded = Buffer.from(raw, 'base64');
      if (decoded.length === 32) {
        key = decoded;
      }
    } catch {
      /* ignore */
    }
    // 2) try hex
    if (!key && /^[0-9a-fA-F]{64}$/.test(raw)) {
      key = Buffer.from(raw, 'hex');
    }
    // 3) outside production, fall back to sha256(raw) so devs can use a
    //    short passphrase. In production we refuse.
    if (!key) {
      if (process.env.NODE_ENV === 'production') {
        throw new InternalServerErrorException(
          'BRIDGE_SECRET_KEY must be 32 bytes (base64) or 64 hex chars in production.',
        );
      }
      this.logger.warn(
        'BRIDGE_SECRET_KEY is not 32 bytes base64 / 64 hex. Deriving via sha256 (dev only).',
      );
      key = crypto.createHash('sha256').update(raw).digest();
    }

    this.cachedKey = key;
    return key;
  }
}
