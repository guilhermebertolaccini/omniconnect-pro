import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * Logs Phase 1 env hints at startup without failing boot (secrets optional until omniconnect/dual).
 */
@Injectable()
export class BotifyOperationalHintsService implements OnModuleInit {
  private readonly logger = new Logger(BotifyOperationalHintsService.name);

  onModuleInit(): void {
    const configured = Boolean(process.env.BOTIFY_INTERNAL_SYNC_SECRET?.trim());
    if (!configured) {
      this.logger.warn(
        'BOTIFY_INTERNAL_SYNC_SECRET is unset — /botify/internal/flows/*/runtime-config cannot authenticate until backend and Botify microservice share the same secret. See docs/migration/botify-phase1-operational-setup.md',
      );
    }
  }
}
