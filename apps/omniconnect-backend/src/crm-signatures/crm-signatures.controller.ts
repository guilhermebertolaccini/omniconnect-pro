import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../common/utils/tenant-context';
import { crmActor } from '../crm/common/actor';
import { CrmSignaturesService } from './crm-signatures.service';
import { CreateSignatureEnvelopeDto } from './dto/signatures.dto';

@Controller('crm/signatures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrmSignaturesController {
  constructor(private readonly service: CrmSignaturesService) {}

  /**
   * Cria envelope de assinatura no provider configurado (Clicksign).
   * Persiste 1 CrmSignature por signer e transiciona o contrato para
   * `pending_signature`. Idempotente apenas na ausência de envelope
   * prévio — para reenviar, é preciso cancelar o atual primeiro
   * (não exposto via API ainda; mantemos uma trilha cara para evitar
   * confusão entre envelopes obsoletos).
   */
  @Post('contracts/:contractId/envelope')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  createEnvelope(
    @CurrentUser() user: RequestUserLike,
    @Param('contractId') contractId: string,
    @Body() dto: CreateSignatureEnvelopeDto,
  ) {
    return this.service.createEnvelope(
      ensureTenant(user),
      contractId,
      dto,
      crmActor(user),
    );
  }

  /** Lista signers de um contrato, com status/sinais — sem token. */
  @Get('contracts/:contractId')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  list(
    @CurrentUser() user: RequestUserLike,
    @Param('contractId') contractId: string,
  ) {
    return this.service.listForContract(
      ensureTenant(user),
      contractId,
      crmActor(user),
    );
  }
}
