import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TenantWallet,
  WalletChannelCost,
  WalletGuardMode,
  WalletTransaction,
  WalletTransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  EventModule,
  EventSeverity,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';
import { CreditWalletDto } from './dto/credit-wallet.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { UpsertChannelCostDto } from './dto/upsert-channel-cost.dto';

export interface WalletView {
  id: string;
  tenantId: string;
  totalBudgetCents: number;
  usedBudgetCents: number;
  remainingCents: number;
  resetCycle: TenantWallet['resetCycle'];
  resetAt: Date | null;
  guardMode: WalletGuardMode;
  realtimeDebit: boolean;
  channelCosts: Array<{ channel: string; costCents: number }>;
  createdAt: Date;
  updatedAt: Date;
}

export type DebitResult =
  | { ok: true; transactionId: string; usedAfter: number }
  | { ok: false; reason: 'insufficient' | 'no_wallet' | 'no_cost_for_channel' };

@Injectable()
export class TenantWalletsService {
  private readonly logger = new Logger(TenantWalletsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemEvents: SystemEventsService,
  ) {}

  /**
   * Garante que a wallet do tenant existe. Idempotente — chamado tanto
   * por `getMyWallet` quanto por callers internos. Cria com defaults
   * (`soft_block`, `monthly`, 0/0).
   */
  async ensureWallet(tenantId: string, actorId?: number | null): Promise<TenantWallet> {
    const existing = await this.prisma.tenantWallet.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;

    const wallet = await this.prisma.tenantWallet.create({
      data: { tenantId },
    });
    void this.systemEvents.logEvent(
      EventType.WALLET_CREATED,
      EventModule.TENANT_WALLETS,
      { walletId: wallet.id },
      actorId ?? null,
      EventSeverity.INFO,
      tenantId,
    );
    return wallet;
  }

  async getMyWallet(tenantId: string, actorId?: number | null): Promise<WalletView> {
    const wallet = await this.ensureWallet(tenantId, actorId);
    const costs = await this.prisma.walletChannelCost.findMany({
      where: { walletId: wallet.id },
      orderBy: { channel: 'asc' },
    });
    return this.toView(wallet, costs);
  }

  async updateWallet(
    tenantId: string,
    dto: UpdateWalletDto,
    actorId?: number | null,
  ): Promise<WalletView> {
    const wallet = await this.ensureWallet(tenantId, actorId);

    const data: Prisma.TenantWalletUpdateInput = {};
    if (dto.totalBudgetCents !== undefined) data.totalBudgetCents = dto.totalBudgetCents;
    if (dto.resetCycle !== undefined) data.resetCycle = dto.resetCycle;
    if (dto.resetAt !== undefined) {
      data.resetAt = dto.resetAt ? new Date(dto.resetAt) : null;
    }
    if (dto.guardMode !== undefined) data.guardMode = dto.guardMode;
    if (dto.realtimeDebit !== undefined) data.realtimeDebit = dto.realtimeDebit;

    const updated = await this.prisma.tenantWallet.update({
      where: { id: wallet.id },
      data,
    });

    void this.systemEvents.logEvent(
      EventType.WALLET_CONFIG_CHANGED,
      EventModule.TENANT_WALLETS,
      {
        walletId: wallet.id,
        changes: Object.keys(data),
      },
      actorId ?? null,
      EventSeverity.INFO,
      tenantId,
    );

    const costs = await this.prisma.walletChannelCost.findMany({
      where: { walletId: wallet.id },
      orderBy: { channel: 'asc' },
    });
    return this.toView(updated, costs);
  }

  async upsertChannelCost(
    tenantId: string,
    channel: string,
    dto: UpsertChannelCostDto,
    actorId?: number | null,
  ): Promise<{ channel: string; costCents: number }> {
    const wallet = await this.ensureWallet(tenantId, actorId);
    const normalizedChannel = channel.trim().toLowerCase();
    if (!normalizedChannel) {
      throw new BadRequestException('channel inválido');
    }
    const row = await this.prisma.walletChannelCost.upsert({
      where: {
        walletId_channel: { walletId: wallet.id, channel: normalizedChannel },
      },
      create: {
        walletId: wallet.id,
        channel: normalizedChannel,
        costCents: dto.costCents,
      },
      update: { costCents: dto.costCents },
    });
    void this.systemEvents.logEvent(
      EventType.WALLET_CHANNEL_COST_UPDATED,
      EventModule.TENANT_WALLETS,
      { walletId: wallet.id, channel: row.channel, costCents: row.costCents },
      actorId ?? null,
      EventSeverity.INFO,
      tenantId,
    );
    return { channel: row.channel, costCents: row.costCents };
  }

  async creditWallet(
    tenantId: string,
    dto: CreditWalletDto,
    actorId?: number | null,
  ): Promise<{ transactionId: string; remainingCents: number }> {
    const wallet = await this.ensureWallet(tenantId, actorId);

    // Top-up reduz `usedBudgetCents`; mínimo é 0 (não pode ficar negativo).
    const txAndWallet = await this.prisma.$transaction(async (tx) => {
      const decAmount = Math.min(dto.amountCents, wallet.usedBudgetCents);
      const newUsed = Math.max(0, wallet.usedBudgetCents - decAmount);
      const updatedWallet = await tx.tenantWallet.update({
        where: { id: wallet.id },
        data: { usedBudgetCents: newUsed },
      });
      const transaction = await tx.walletTransaction.create({
        data: {
          tenantId,
          walletId: wallet.id,
          type: WalletTransactionType.credit,
          channel: dto.channel ?? null,
          amountCents: dto.amountCents,
          refType: 'ManualTopup',
          metadata: this.buildMetadata(dto, actorId),
        },
      });
      return { transaction, wallet: updatedWallet };
    });

    void this.systemEvents.logEvent(
      EventType.WALLET_TOPUP,
      EventModule.TENANT_WALLETS,
      {
        transactionId: txAndWallet.transaction.id,
        amountCents: dto.amountCents,
        actor: actorId,
        reason: dto.reason,
      },
      actorId ?? null,
      EventSeverity.SUCCESS,
      tenantId,
    );

    return {
      transactionId: txAndWallet.transaction.id,
      remainingCents:
        txAndWallet.wallet.totalBudgetCents - txAndWallet.wallet.usedBudgetCents,
    };
  }

  async listTransactions(
    tenantId: string,
    query: ListTransactionsQueryDto,
  ): Promise<{
    items: WalletTransaction[];
    meta: { total: number; limit: number; offset: number };
  }> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    if ((query.from && !query.to) || (query.to && !query.from)) {
      throw new BadRequestException('from e to devem vir juntos');
    }

    const where: Prisma.WalletTransactionWhereInput = {
      tenantId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.channel ? { channel: query.channel.toLowerCase() } : {}),
      ...(query.from && query.to
        ? { createdAt: { gte: new Date(query.from), lte: new Date(query.to) } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);

    return { items, meta: { total, limit, offset } };
  }

  /**
   * Helper interno para a Régua chamar antes de cada send. Aceita uma
   * tentativa de débito atômico. Em `hard_block`, recusa se saldo for
   * insuficiente. Em `soft_block`, debita mesmo assim, mas emite alerta.
   *
   * Race-safety: usa um `update` condicional via Prisma transaction +
   * `where: { usedBudgetCents: <leitura inicial> }` (optimistic) +
   * fallback de retry. Para hard_block, o `update` só altera o registro
   * se `usedBudgetCents` ainda for o lido — senão refaz com novo read.
   *
   * Idempotência: NÃO é resolvida aqui. Caller (Régua) tem que garantir
   * que `(refType, refId)` único — geralmente via `jobId` BullMQ
   * determinístico. Chamar 2× gera 2 transações + 2 débitos.
   */
  async debitForSend(
    tenantId: string,
    channel: string,
    refType: string,
    refId: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<DebitResult> {
    const wallet = await this.prisma.tenantWallet.findUnique({
      where: { tenantId },
    });
    if (!wallet) return { ok: false, reason: 'no_wallet' };

    const cost = await this.prisma.walletChannelCost.findUnique({
      where: {
        walletId_channel: { walletId: wallet.id, channel: channel.toLowerCase() },
      },
    });
    if (!cost) {
      return { ok: false, reason: 'no_cost_for_channel' };
    }

    return this.runDebit(tenantId, wallet, cost, refType, refId, metadata);
  }

  private async runDebit(
    tenantId: string,
    wallet: TenantWallet,
    cost: WalletChannelCost,
    refType: string,
    refId: string,
    metadata?: Prisma.InputJsonValue,
    attempt = 0,
  ): Promise<DebitResult> {
    if (attempt >= 3) {
      // Race extrema; aborta sem débito.
      this.logger.warn(
        `wallet ${wallet.id} debit failed after 3 attempts (refType=${refType}, refId=${refId})`,
      );
      return { ok: false, reason: 'insufficient' };
    }

    const nextUsed = wallet.usedBudgetCents + cost.costCents;
    const wouldExceed = nextUsed > wallet.totalBudgetCents;

    if (wouldExceed && wallet.guardMode === WalletGuardMode.hard_block) {
      void this.systemEvents.logEvent(
        EventType.WALLET_INSUFFICIENT,
        EventModule.TENANT_WALLETS,
        {
          walletId: wallet.id,
          channel: cost.channel,
          costCents: cost.costCents,
          refType,
          refId,
          guardMode: wallet.guardMode,
        },
        null,
        EventSeverity.WARNING,
        tenantId,
      );
      return { ok: false, reason: 'insufficient' };
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Optimistic lock: só atualiza se o `usedBudgetCents` ainda for o lido
        const updated = await tx.tenantWallet.updateMany({
          where: { id: wallet.id, usedBudgetCents: wallet.usedBudgetCents },
          data: { usedBudgetCents: nextUsed },
        });
        if (updated.count !== 1) {
          // race: outro débito chegou antes — sinaliza retry
          return { conflict: true as const };
        }
        const transaction = await tx.walletTransaction.create({
          data: {
            tenantId,
            walletId: wallet.id,
            type: WalletTransactionType.debit,
            channel: cost.channel,
            amountCents: cost.costCents,
            refType,
            refId,
            metadata: metadata ?? Prisma.JsonNull,
          },
        });
        return { transaction, usedAfter: nextUsed };
      });

      if ('conflict' in result) {
        // Re-read e retry
        const fresh = await this.prisma.tenantWallet.findUnique({
          where: { id: wallet.id },
        });
        if (!fresh) return { ok: false, reason: 'no_wallet' };
        return this.runDebit(tenantId, fresh, cost, refType, refId, metadata, attempt + 1);
      }

      void this.systemEvents.logEvent(
        EventType.WALLET_DEBITED,
        EventModule.TENANT_WALLETS,
        {
          walletId: wallet.id,
          channel: cost.channel,
          costCents: cost.costCents,
          refType,
          refId,
          usedAfter: result.usedAfter,
        },
        null,
        EventSeverity.INFO,
        tenantId,
      );

      // Soft-block: mesmo que tenha excedido, debitamos; emite alerta
      // separado para visibilidade.
      if (wouldExceed) {
        void this.systemEvents.logEvent(
          EventType.WALLET_INSUFFICIENT,
          EventModule.TENANT_WALLETS,
          {
            walletId: wallet.id,
            channel: cost.channel,
            refType,
            refId,
            usedAfter: result.usedAfter,
            guardMode: wallet.guardMode,
            note: 'soft_block: debitado apesar de exceder budget',
          },
          null,
          EventSeverity.WARNING,
          tenantId,
        );
      }

      return {
        ok: true,
        transactionId: result.transaction.id,
        usedAfter: result.usedAfter,
      };
    } catch (err) {
      this.logger.error(
        `debit failed for wallet=${wallet.id} channel=${cost.channel}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  private buildMetadata(
    dto: CreditWalletDto,
    actorId?: number | null,
  ): Prisma.InputJsonValue {
    return {
      reason: dto.reason ?? null,
      actor: actorId ?? null,
      ...(dto.metadata ?? {}),
    } as Prisma.InputJsonValue;
  }

  private toView(
    wallet: TenantWallet,
    costs: Array<{ channel: string; costCents: number }>,
  ): WalletView {
    return {
      id: wallet.id,
      tenantId: wallet.tenantId,
      totalBudgetCents: wallet.totalBudgetCents,
      usedBudgetCents: wallet.usedBudgetCents,
      remainingCents: wallet.totalBudgetCents - wallet.usedBudgetCents,
      resetCycle: wallet.resetCycle,
      resetAt: wallet.resetAt,
      guardMode: wallet.guardMode,
      realtimeDebit: wallet.realtimeDebit,
      channelCosts: costs.map((c) => ({ channel: c.channel, costCents: c.costCents })),
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }

  /** Falha duro se o tenant tentar consultar wallet de outro. */
  async assertWalletBelongsToTenant(
    tenantId: string,
    walletId: string,
  ): Promise<void> {
    const found = await this.prisma.tenantWallet.findFirst({
      where: { id: walletId, tenantId },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException('Wallet não pertence a este tenant');
    }
  }
}
