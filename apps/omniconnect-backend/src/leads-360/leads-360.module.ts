import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Leads360Controller } from './leads-360.controller';
import { Leads360Service } from './leads-360.service';

@Module({
  controllers: [Leads360Controller],
  providers: [PrismaService, Leads360Service],
  exports: [Leads360Service],
})
export class Leads360Module {}
