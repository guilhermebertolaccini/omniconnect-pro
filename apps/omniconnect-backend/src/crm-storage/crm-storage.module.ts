import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaService } from '../prisma.service';
import { CrmStorageController } from './crm-storage.controller';
import { CrmStorageService } from './crm-storage.service';

/**
 * CrmStorageModule (Sprint 3 — Bloco D). Storage filesystem para PDFs do
 * CRM. Multer com memory storage — o service controla onde gravar
 * (path tenant-scoped). NÃO usa diskStorage porque diskStorage roda
 * antes do controller e não tem acesso a `req.user.tenantId`.
 */
@Module({
  imports: [
    ConfigModule,
    MulterModule.register({
      // memory storage; service grava manualmente após validação.
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  ],
  controllers: [CrmStorageController],
  providers: [PrismaService, CrmStorageService],
  exports: [CrmStorageService],
})
export class CrmStorageModule {}
