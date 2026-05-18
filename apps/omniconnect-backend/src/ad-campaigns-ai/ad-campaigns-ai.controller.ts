import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdPlatform, Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../common/utils/tenant-context';
import { AdCampaignsAiService } from './ad-campaigns-ai.service';
import { AnalyzeAdCampaignDto } from './dto/analyze-ad-campaign.dto';

@Controller('ad-campaigns-ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdCampaignsAiController {
  constructor(private readonly service: AdCampaignsAiService) {}

  @Post('analyze')
  @Roles(Role.admin, Role.supervisor)
  analyze(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Body() dto: AnalyzeAdCampaignDto,
  ) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.service.analyze(tenantId, dto, actorId);
  }

  @Post('analyze/async')
  @Roles(Role.admin, Role.supervisor)
  analyzeAsync(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Body() dto: AnalyzeAdCampaignDto,
  ) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.service.enqueueAnalyze(tenantId, dto, actorId);
  }

  @Get('jobs/:jobId')
  @Roles(Role.admin, Role.supervisor)
  getJob(@CurrentUser() user: RequestUserLike, @Param('jobId') jobId: string) {
    const tenantId = ensureTenant(user);
    return this.service.getJobStatus(tenantId, jobId);
  }

  @Get('analyses')
  @Roles(Role.admin, Role.supervisor, Role.operator)
  findAnalyses(
    @CurrentUser() user: RequestUserLike,
    @Query('advertiserCompanyId') advertiserCompanyId?: string,
    @Query('platform') platform?: AdPlatform,
    @Query('campaignId') campaignId?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    const tenantId = ensureTenant(user);
    return this.service.findAnalyses(tenantId, {
      advertiserCompanyId,
      platform,
      campaignId,
      limit,
    });
  }

  @Get('analyses/:id')
  @Roles(Role.admin, Role.supervisor, Role.operator)
  findAnalysis(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    const tenantId = ensureTenant(user);
    return this.service.findAnalysis(tenantId, id);
  }
}
