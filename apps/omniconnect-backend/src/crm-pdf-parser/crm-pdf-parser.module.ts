import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { ModelPricingModule } from '../model-pricing/model-pricing.module';
import { CrmPdfParserController } from './crm-pdf-parser.controller';
import { CrmPdfParserService } from './crm-pdf-parser.service';

/**
 * CrmPdfParserModule (Sprint 3 — Bloco D). Recebe texto extraído de PDFs
 * (propostas/contratos) e devolve JSON estruturado via OpenAI.
 * AIUsageLog opera com operationType='crm_pdf_parse' para custo/audit.
 */
@Module({
  imports: [ConfigModule, ModelPricingModule],
  controllers: [CrmPdfParserController],
  providers: [PrismaService, CrmPdfParserService],
  exports: [CrmPdfParserService],
})
export class CrmPdfParserModule {}
