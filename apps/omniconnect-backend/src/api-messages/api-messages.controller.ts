import { Controller, Post, Body, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ApiMessagesService } from './api-messages.service';
import { MassiveCpcDto, SendTemplateExternalDto } from './dto/massive-cpc.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

function resolveTenantFromRequest(req: any): string {
  const tenantId = req?.tenantId;
  if (!tenantId) {
    throw new UnauthorizedException('Tenant context missing for this API key');
  }
  return tenantId as string;
}

@ApiTags('api-messages')
@ApiBearerAuth('JWT-auth')
@Controller('api/messages')
export class ApiMessagesController {
  constructor(private readonly apiMessagesService: ApiMessagesService) {}

  /**
   * Disparo massivo CPC (suporta texto e templates)
   */
  @Post('massivocpc')
  @UseGuards(ApiKeyGuard)
  async sendMassiveCpc(@Body() dto: MassiveCpcDto, @Req() req: any) {
    const tenantId = resolveTenantFromRequest(req);
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.apiMessagesService.sendMassiveCpc(tenantId, dto, ipAddress, userAgent);
  }

  /**
   * Envio de template 1x1 via API externa
   */
  @Post('template')
  @UseGuards(ApiKeyGuard)
  async sendTemplate(@Body() dto: SendTemplateExternalDto, @Req() req: any) {
    const tenantId = resolveTenantFromRequest(req);
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.apiMessagesService.sendTemplateExternal(tenantId, dto, ipAddress, userAgent);
  }
}

