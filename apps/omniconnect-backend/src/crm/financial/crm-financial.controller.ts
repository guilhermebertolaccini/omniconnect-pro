import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CrmCommissionStatus, CrmPaymentStatus, Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../../common/utils/tenant-context';
import { crmActor } from '../common/actor';
import { CrmFinancialService } from './crm-financial.service';
import { MarkCommissionDto, MarkPaymentDto } from './dto/financial.dto';

@Controller('crm/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrmPaymentsController {
  constructor(private readonly service: CrmFinancialService) {}

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.broker)
  findAll(
    @CurrentUser() user: RequestUserLike,
    @Query('contractId') contractId?: string,
    @Query('status') status?: CrmPaymentStatus,
  ) {
    return this.service.findPayments(ensureTenant(user), crmActor(user), {
      contractId,
      status,
    });
  }

  @Patch(':id')
  @Roles(Role.admin, Role.supervisor)
  mark(
    @CurrentUser() user: RequestUserLike,
    @Param('id') id: string,
    @Body() dto: MarkPaymentDto,
  ) {
    return this.service.markPayment(
      ensureTenant(user),
      id,
      dto,
      crmActor(user),
    );
  }
}

@Controller('crm/commissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrmCommissionsController {
  constructor(private readonly service: CrmFinancialService) {}

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.broker)
  findAll(
    @CurrentUser() user: RequestUserLike,
    @Query('brokerId') brokerIdRaw?: string,
    @Query('status') status?: CrmCommissionStatus,
  ) {
    const brokerId = brokerIdRaw ? Number(brokerIdRaw) : undefined;
    return this.service.findCommissions(ensureTenant(user), crmActor(user), {
      brokerId,
      status,
    });
  }

  @Patch(':id')
  @Roles(Role.admin)
  mark(
    @CurrentUser() _user: RequestUserLike,
    @Param('id') id: string,
    @Body() dto: MarkCommissionDto,
  ) {
    return this.service.markCommission(ensureTenant(_user), id, dto);
  }
}
