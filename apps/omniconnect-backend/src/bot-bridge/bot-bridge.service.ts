import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  IntegrationEventsService,
  RecordedEvent,
} from '../integration-events/integration-events.service';
import {
  assertActiveConnection,
  deriveIdempotencyKey,
  safeParseJson,
  verifyHmac,
} from '../integration-events/bridge-helpers';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';

export interface HandleBotWebhookInput {
  rawBody: Buffer;
  signature: string;
  integrationId: string;
  idempotencyKey?: string;
}

export interface HandleBotWebhookResult extends RecordedEvent {
  tenantId: string;
}

@Injectable()
export class BotBridgeService {
  private readonly logger = new Logger(BotBridgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: IntegrationEventsService,
    private readonly cipher: BridgeSecretCipher,
  ) {}

  async handleWebhook(input: HandleBotWebhookInput): Promise<HandleBotWebhookResult> {
    const { rawBody, signature, integrationId, idempotencyKey } = input;

    if (!rawBody || rawBody.length === 0) {
      throw new UnauthorizedException('Missing raw body');
    }
    if (!signature || signature.trim() === '') {
      throw new UnauthorizedException('Invalid or missing signature');
    }

    const connection = await this.prisma.integrationConnection.findUnique({
      where: { id: integrationId },
      include: { tenant: true },
    });

    const verified = assertActiveConnection({ connection, provider: 'bot', integrationId });

    let tenantId: string;
    let connectionId: string;

    if (verified) {
      if (process.env.NODE_ENV === 'production') {
        const secret = this.cipher.decryptWithLegacyFallback(verified.webhookSecretEncrypted);
        verifyHmac(rawBody, signature, secret);
      }
      tenantId = verified.tenantId;
      connectionId = verified.id;
    } else {
      this.logger.warn(`[dev] bot integration not found (id=${integrationId}); falling back to default-tenant`);
      tenantId = 'default-tenant';
      connectionId = integrationId;
    }

    const recorded = await this.events.recordEvent({
      tenantId,
      connectionId,
      provider: 'bot',
      idempotencyKey: deriveIdempotencyKey(rawBody, idempotencyKey),
      signature,
      payload: safeParseJson(rawBody),
    });

    return { ...recorded, tenantId };
  }
}
