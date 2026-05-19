import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      // Verificar conexão com o banco
      await this.prisma.$queryRaw`SELECT 1`;
      
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: 'connected',
        /** Phase 1: internal microservice→Nest flow sync (`/botify/internal/...`). No secret values exposed. */
        botifyInternalSync: {
          configured: Boolean(process.env.BOTIFY_INTERNAL_SYNC_SECRET?.trim()),
        },
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: 'disconnected',
        error: error.message,
        botifyInternalSync: {
          configured: Boolean(process.env.BOTIFY_INTERNAL_SYNC_SECRET?.trim()),
        },
      };
    }
  }
}

