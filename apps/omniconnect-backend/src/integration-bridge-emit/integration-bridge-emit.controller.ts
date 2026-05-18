import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../common/utils/tenant-context';
import { EmitBridgeEventDto } from './dto/emit-bridge-event.dto';
import { IntegrationBridgeEmitService } from './integration-bridge-emit.service';

/**
 * Authenticated bridge emitter for browser apps (CRM, SAA).
 * Avoids shipping the webhook HMAC secret to the frontend: the backend
 * validates tenant + IntegrationConnection and enqueues IntegrationEvent.
 */
@ApiTags('Integrations — Bridge')
@ApiBearerAuth()
@Controller('integrations/bridge')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntegrationBridgeEmitController {
  constructor(private readonly bridgeEmit: IntegrationBridgeEmitService) {}

  @Post('events')
  @HttpCode(200)
  @Roles(
    Role.admin,
    Role.supervisor,
    Role.broker,
    Role.digital,
    Role.operator,
    Role.ativador,
  )
  @ApiOperation({
    summary:
      'Enqueue a bridge IntegrationEvent (validates connection belongs to tenant)',
  })
  async enqueueEvent(
    @CurrentUser() user: RequestUserLike,
    @Body() dto: EmitBridgeEventDto,
  ) {
    const tenantId = ensureTenant(user);
    return this.bridgeEmit.emitForTenant(tenantId, dto);
  }
}
