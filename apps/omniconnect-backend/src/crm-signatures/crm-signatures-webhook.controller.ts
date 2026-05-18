import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CrmSignaturesService } from './crm-signatures.service';

/**
 * Webhook público da Clicksign (e futuros providers). NÃO usa JwtAuthGuard
 * — autenticação é via HMAC-SHA256 do body com o secret do tenant guardado
 * em IntegrationConnection.webhookSecretEncrypted.
 *
 * Cabeçalhos esperados:
 *  - `Content-Digest` / `Content-Hmac` / `X-Signature` (varia por provider).
 *    Aceitamos qualquer um (primeiro definido). O service strip do prefixo
 *    `secret=` / `sha256=` antes da comparação timing-safe.
 *  - `X-Integration-Id` (opcional): força match com uma
 *    IntegrationConnection específica. Útil quando o tenant tem múltiplas
 *    connections de Clicksign (improvável, mas suportado).
 *
 * O endpoint sempre responde 200 com `{accepted:true}` ou 200
 * `{accepted:false}` no dev. Em produção, falhas viram 4xx para o
 * provider reentregar.
 */
@Controller('webhooks/crm/signatures')
export class CrmSignaturesWebhookController {
  constructor(private readonly service: CrmSignaturesService) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('content-hmac') contentHmac?: string,
    @Headers('x-signature') xSignature?: string,
    @Headers('content-digest') contentDigest?: string,
    @Headers('x-integration-id') integrationId?: string,
  ) {
    const signature = contentHmac ?? xSignature ?? contentDigest;
    if (!signature) {
      throw new BadRequestException('Missing signature header');
    }
    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Missing raw body');
    }
    return this.service.handleWebhook({
      rawBody,
      signature,
      integrationId,
    });
  }
}
