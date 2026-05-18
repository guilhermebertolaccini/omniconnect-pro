import { Injectable, Logger } from '@nestjs/common';

/**
 * Wrapper sobre o `CrmGateway` que evita acoplamento direto dos services
 * com `socket.io`. Os services dependem desta classe; a classe
 * delega ao gateway quando ele estiver registrado (lazy injection feita
 * pelo próprio gateway via `setGateway`).
 *
 * Manter o wrapper desacoplado simplifica testes — em specs, basta
 * mockar `CrmRealtimeService`, sem precisar montar o Socket.IO Server.
 */
export interface CrmRealtimeEmitter {
  emitToTenant(tenantId: string, event: string, payload: unknown): void;
  emitToBroker(tenantId: string, userId: number, event: string, payload: unknown): void;
}

@Injectable()
export class CrmRealtimeService implements CrmRealtimeEmitter {
  private readonly logger = new Logger(CrmRealtimeService.name);
  private gateway: CrmRealtimeEmitter | null = null;

  setGateway(gateway: CrmRealtimeEmitter): void {
    this.gateway = gateway;
  }

  emitToTenant(tenantId: string, event: string, payload: unknown): void {
    if (!this.gateway) {
      this.logger.debug(
        `gateway not registered; dropping event ${event} for tenant ${tenantId}`,
      );
      return;
    }
    try {
      this.gateway.emitToTenant(tenantId, event, payload);
    } catch (err) {
      this.logger.warn(
        `failed to emit ${event} to tenant ${tenantId}: ${(err as Error)?.message}`,
      );
    }
  }

  emitToBroker(
    tenantId: string,
    userId: number,
    event: string,
    payload: unknown,
  ): void {
    if (!this.gateway) {
      this.logger.debug(
        `gateway not registered; dropping event ${event} for broker ${userId}@${tenantId}`,
      );
      return;
    }
    try {
      this.gateway.emitToBroker(tenantId, userId, event, payload);
    } catch (err) {
      this.logger.warn(
        `failed to emit ${event} to broker ${userId}@${tenantId}: ${(err as Error)?.message}`,
      );
    }
  }
}
