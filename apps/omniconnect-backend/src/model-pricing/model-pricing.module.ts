import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ModelPricingService } from './model-pricing.service';

@Module({
  providers: [PrismaService, ModelPricingService],
  exports: [ModelPricingService],
})
export class ModelPricingModule {}
