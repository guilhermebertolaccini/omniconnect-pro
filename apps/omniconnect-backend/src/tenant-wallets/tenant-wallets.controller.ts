import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ensureTenant, RequestUserLike } from '../common/utils/tenant-context';
import { TenantWalletsService } from './tenant-wallets.service';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { UpsertChannelCostDto } from './dto/upsert-channel-cost.dto';
import { CreditWalletDto } from './dto/credit-wallet.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';

@ApiTags('tenant-wallets')
@Controller('tenant-wallets')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class TenantWalletsController {
  constructor(private readonly service: TenantWalletsService) {}

  @Get('me')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({
    summary:
      'Retorna a wallet do tenant autenticado (cria com defaults se não existir).',
  })
  getMyWallet(@CurrentUser() user: RequestUserLike & { id?: number }) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.service.getMyWallet(tenantId, actorId);
  }

  @Patch('me')
  @Roles(Role.admin)
  @ApiOperation({
    summary:
      'Atualiza configurações da wallet do tenant (budget total, ciclo, guardMode, realtimeDebit).',
  })
  updateWallet(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Body() dto: UpdateWalletDto,
  ) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.service.updateWallet(tenantId, dto, actorId);
  }

  @Put('me/channels/:channel')
  @Roles(Role.admin)
  @ApiOperation({
    summary:
      'Upsert do custo unitário por canal (`sms`, `email`, `rcs`, `hsm`, `whatsapp`).',
  })
  upsertChannelCost(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Param('channel') channel: string,
    @Body() dto: UpsertChannelCostDto,
  ) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.service.upsertChannelCost(tenantId, channel, dto, actorId);
  }

  @Post('me/credits')
  @Roles(Role.admin)
  @ApiOperation({
    summary:
      'Top-up manual da wallet. Reduz `usedBudgetCents` em `amountCents` (mínimo 0).',
  })
  creditWallet(
    @CurrentUser() user: RequestUserLike & { id?: number },
    @Body() dto: CreditWalletDto,
  ) {
    const tenantId = ensureTenant(user);
    const actorId = typeof user.id === 'number' ? user.id : undefined;
    return this.service.creditWallet(tenantId, dto, actorId);
  }

  @Get('me/transactions')
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({
    summary: 'Lista paginada de WalletTransaction do tenant (default 50/pg).',
  })
  listTransactions(
    @CurrentUser() user: RequestUserLike,
    @Query() query: ListTransactionsQueryDto,
  ) {
    const tenantId = ensureTenant(user);
    return this.service.listTransactions(tenantId, query);
  }
}
