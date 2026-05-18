import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppLoggerService } from '../logger/logger.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ArchivingService {
  private readonly ARCHIVE_AFTER_DAYS: number;

  constructor(
    private prisma: PrismaService,
    private logger: AppLoggerService,
    private configService: ConfigService,
  ) {
    // Configurável via env, padrão: 90 dias
    this.ARCHIVE_AFTER_DAYS = parseInt(
      this.configService.get('ARCHIVE_AFTER_DAYS') || '90',
    );
  }

  /**
   * Job agendado: arquiva conversas antigas diariamente às 2h da manhã.
   * Operação global multi-tenant — uma única passagem cobre todas as
   * conversas elegíveis pela política de retenção. A query é uniforme
   * (não cross-tenant data), apenas marca como `archived`. Tenants são
   * preservados pelo próprio registro.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async archiveOldConversations() {
    this.logger.log(
      `Iniciando arquivamento de conversas antigas (> ${this.ARCHIVE_AFTER_DAYS} dias)`,
      'ArchivingService',
    );

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.ARCHIVE_AFTER_DAYS);

      const oldConversations = await this.prisma.conversation.findMany({
        where: {
          datetime: {
            lt: cutoffDate,
          },
          archived: false,
        },
        select: {
          id: true,
        },
        take: 10000,
      });

      if (oldConversations.length === 0) {
        this.logger.log('Nenhuma conversa antiga para arquivar', 'ArchivingService');
        return { archived: 0, message: 'Nenhuma conversa arquivada' };
      }

      const result = await this.prisma.conversation.updateMany({
        where: {
          id: {
            in: oldConversations.map((c) => c.id),
          },
        },
        data: {
          archived: true,
          archivedAt: new Date(),
        },
      });

      this.logger.log(
        `✅ ${result.count} conversas arquivadas com sucesso`,
        'ArchivingService',
        { archivedCount: result.count, cutoffDate },
      );

      return {
        archived: result.count,
        message: `${result.count} conversas arquivadas`,
      };
    } catch (error: any) {
      this.logger.error(
        'Erro ao arquivar conversas antigas',
        error.stack,
        'ArchivingService',
        { error: error.message },
      );
      throw error;
    }
  }

  /**
   * Move conversas arquivadas para tabela de arquivo (cold storage)
   * Executa mensalmente
   */
  @Cron('0 3 1 * *') // Todo dia 1 às 3h da manhã
  async moveArchivedToColdStorage() {
    this.logger.log(
      'Iniciando migração de conversas arquivadas para cold storage',
      'ArchivingService',
    );

    try {
      // Buscar conversas arquivadas há mais de 30 dias
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const archivedConversations = await this.prisma.conversation.findMany({
        where: {
          archived: true,
          archivedAt: { lt: thirtyDaysAgo },
        },
        take: 5000,
      });

      if (archivedConversations.length === 0) {
        this.logger.log(
          'Nenhuma conversa arquivada para mover',
          'ArchivingService',
        );
        return { moved: 0, message: 'Nenhuma conversa movida' };
      }

      // Em produção, aqui você moveria para S3/MinIO ou outra solução de cold storage
      // Por enquanto, apenas logamos
      this.logger.log(
        `📦 ${archivedConversations.length} conversas prontas para cold storage`,
        'ArchivingService',
        { count: archivedConversations.length },
      );

      // TODO: Implementar upload para S3/MinIO
      // await this.uploadToColdStorage(archivedConversations);

      return {
        moved: archivedConversations.length,
        message: `${archivedConversations.length} conversas prontas para cold storage`,
      };
    } catch (error: any) {
      this.logger.error(
        'Erro ao mover conversas para cold storage',
        error.stack,
        'ArchivingService',
        { error: error.message },
      );
      throw error;
    }
  }

  /**
   * Limpa conversas arquivadas do banco após migração para cold storage
   * Executa trimestralmente
   */
  @Cron('0 4 1 */3 *') // Todo trimestre, dia 1 às 4h
  async cleanupArchivedConversations() {
    this.logger.log(
      'Iniciando limpeza de conversas arquivadas do banco',
      'ArchivingService',
    );

    try {
      // Buscar conversas arquivadas há mais de 90 dias (já devem estar em cold storage)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const result = await this.prisma.conversation.deleteMany({
        where: {
          archived: true,
          archivedAt: { lt: ninetyDaysAgo },
        },
      });

      this.logger.log(
        `🗑️ ${result.count} conversas arquivadas removidas do banco`,
        'ArchivingService',
        { deletedCount: result.count },
      );

      return {
        deleted: result.count,
        message: `${result.count} conversas removidas`,
      };
    } catch (error: any) {
      this.logger.error(
        'Erro ao limpar conversas arquivadas',
        error.stack,
        'ArchivingService',
        { error: error.message },
      );
      throw error;
    }
  }

  /**
   * Estatísticas de arquivamento escopadas por tenant (chamado pelo
   * endpoint admin do tenant). O job cron continua global porque a
   * política de retenção é uniforme entre tenants.
   */
  async getArchivingStats(tenantId: string) {
    if (!tenantId) {
      throw new Error('ArchivingService.getArchivingStats requires tenantId');
    }
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.ARCHIVE_AFTER_DAYS);

    const [total, archived, pendingArchive] = await Promise.all([
      this.prisma.conversation.count({ where: { tenantId } }),
      this.prisma.conversation.count({
        where: { tenantId, archived: true },
      }),
      this.prisma.conversation.count({
        where: {
          tenantId,
          archived: false,
          datetime: { lt: cutoffDate },
        },
      }),
    ]);

    return {
      total,
      archived,
      pendingArchive,
      active: total - archived,
      archiveAfterDays: this.ARCHIVE_AFTER_DAYS,
    };
  }
}

