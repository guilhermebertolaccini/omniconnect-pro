import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CrmLeadStage, Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../../common/utils/tenant-context';
import { crmActor } from '../common/actor';
import { CrmLeadsService } from './crm-leads.service';
import {
  CreateCrmFollowUpDto,
  CreateCrmInteractionDto,
  CreateCrmLeadDto,
  UpdateCrmFollowUpDto,
  UpdateCrmLeadDto,
} from './dto/leads.dto';

@Controller('crm/leads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrmLeadsController {
  constructor(private readonly service: CrmLeadsService) {}

  @Post()
  @Roles(Role.admin, Role.supervisor, Role.broker)
  create(@CurrentUser() user: RequestUserLike, @Body() dto: CreateCrmLeadDto) {
    return this.service.createLead(ensureTenant(user), dto, crmActor(user));
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.broker)
  findAll(
    @CurrentUser() user: RequestUserLike,
    @Query('stage') stage?: string,
    @Query('search') search?: string,
  ) {
    if (stage && !(Object.values(CrmLeadStage) as string[]).includes(stage)) {
      throw new BadRequestException(`Unsupported stage "${stage}"`);
    }
    return this.service.findAllLeads(ensureTenant(user), crmActor(user), {
      stage: stage as CrmLeadStage | undefined,
      search,
    });
  }

  @Get(':id')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  findOne(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.service.findOneLead(ensureTenant(user), id, crmActor(user));
  }

  @Patch(':id')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  update(
    @CurrentUser() user: RequestUserLike,
    @Param('id') id: string,
    @Body() dto: UpdateCrmLeadDto,
  ) {
    return this.service.updateLead(
      ensureTenant(user),
      id,
      dto,
      crmActor(user),
    );
  }

  @Delete(':id')
  @Roles(Role.admin, Role.supervisor)
  remove(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.service.removeLead(ensureTenant(user), id, crmActor(user));
  }

  // ----- Interactions --------------------------------------------------------

  @Post(':id/interactions')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  createInteraction(
    @CurrentUser() user: RequestUserLike,
    @Param('id') leadId: string,
    @Body() dto: Omit<CreateCrmInteractionDto, 'leadId'>,
  ) {
    return this.service.createInteraction(
      ensureTenant(user),
      { ...dto, leadId } as CreateCrmInteractionDto,
      crmActor(user),
    );
  }

  @Get(':id/interactions')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  findInteractions(
    @CurrentUser() user: RequestUserLike,
    @Param('id') leadId: string,
  ) {
    return this.service.findInteractions(
      ensureTenant(user),
      leadId,
      crmActor(user),
    );
  }

  // ----- Follow-ups ----------------------------------------------------------

  @Post(':id/follow-ups')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  createFollowUp(
    @CurrentUser() user: RequestUserLike,
    @Param('id') leadId: string,
    @Body() dto: Omit<CreateCrmFollowUpDto, 'leadId'>,
  ) {
    return this.service.createFollowUp(
      ensureTenant(user),
      { ...dto, leadId } as CreateCrmFollowUpDto,
      crmActor(user),
    );
  }
}

@Controller('crm/follow-ups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrmFollowUpsController {
  constructor(private readonly service: CrmLeadsService) {}

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.broker)
  findAll(
    @CurrentUser() user: RequestUserLike,
    @Query('leadId') leadId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findFollowUps(ensureTenant(user), crmActor(user), {
      leadId,
      status,
    });
  }

  @Patch(':id')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  update(
    @CurrentUser() user: RequestUserLike,
    @Param('id') id: string,
    @Body() dto: UpdateCrmFollowUpDto,
  ) {
    return this.service.updateFollowUp(
      ensureTenant(user),
      id,
      dto,
      crmActor(user),
    );
  }

  @Delete(':id')
  @Roles(Role.admin, Role.supervisor, Role.broker)
  remove(@CurrentUser() user: RequestUserLike, @Param('id') id: string) {
    return this.service.removeFollowUp(
      ensureTenant(user),
      id,
      crmActor(user),
    );
  }
}
