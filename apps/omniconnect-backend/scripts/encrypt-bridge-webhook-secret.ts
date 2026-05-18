/**
 * One-off: encrypt a plaintext webhook shared secret using the same
 * `BridgeSecretCipher` + `BRIDGE_SECRET_KEY` as the running backend.
 *
 * Usage (from apps/omniconnect-backend):
 *   BRIDGE_SECRET_KEY=... npx tsx scripts/encrypt-bridge-webhook-secret.ts 'my-random-secret'
 *
 * Paste the printed `v1....` value into `IntegrationConnection.webhookSecretEncrypted`.
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { BridgeSecretCipher } from '../src/integration-events/bridge-secret-cipher';

const plaintext = process.argv[2];
if (!plaintext?.trim()) {
  console.error(
    'Usage: BRIDGE_SECRET_KEY=<same as backend> npx tsx scripts/encrypt-bridge-webhook-secret.ts <plaintext-secret>',
  );
  process.exit(1);
}

const cipher = new BridgeSecretCipher({
  get: (key: string) => (key === 'BRIDGE_SECRET_KEY' ? process.env.BRIDGE_SECRET_KEY : undefined),
} as ConfigService);

console.log(cipher.encrypt(plaintext.trim()));
