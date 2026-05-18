import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma.service';
import { CrmRealtimeEmitter, CrmRealtimeService } from './crm-realtime.service';

interface CrmSocketUser {
  userId: number;
  tenantId: string;
  role: string;
  effectiveRole: string;
}

/**
 * CrmGateway (Sprint 3 — Bloco E). Namespace `/crm`.
 *
 * Rooms:
 * - `crm:{tenantId}`               — todos os usuários do tenant
 * - `crm:{tenantId}:broker:{uid}`  — apenas o broker (eventos filtrados
 *                                    quando broker scope é necessário)
 *
 * Auth: JWT no handshake (`auth.token` ou `Authorization: Bearer ...`).
 * Resolve tenant + role via prisma; recusa conexões sem tenantId
 * (multi-tenant by default).
 *
 * Eventos emitidos pelos services CRM:
 * - `crm.lead.updated`            { id, stage }
 * - `crm.proposal.transitioned`   { id, fromStatus, toStatus }
 * - `crm.contract.transitioned`   { id, fromStatus, toStatus }
 * - `crm.contract.signed`         { id, signedAt }
 * - `crm.payment.created`         { id, contractId }
 * - `crm.commission.created`      { id, contractId, brokerId }
 * - `crm.signature.updated`       { contractId, role, status }
 *
 * Brokers só recebem eventos quando o payload é destinado a eles
 * (emitToBroker) — é responsabilidade do service decidir.
 */
@WebSocketGateway({
  namespace: '/crm',
  cors: {
    origin: (origin, callback) => {
      const allowed = process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
        : ['http://localhost:5173', 'http://localhost:3001'];
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  },
})
export class CrmGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, CrmRealtimeEmitter
{
  private readonly logger = new Logger(CrmGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly realtime: CrmRealtimeService,
  ) {}

  onModuleInit() {
    this.realtime.setGateway(this);
  }

  afterInit() {
    this.logger.log('CrmGateway initialized on namespace /crm');
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.headers.authorization as string | undefined)?.replace(
          /^Bearer\s+/i,
          '',
        );
      if (!token) {
        this.logger.warn(`[crm-ws] missing token; disconnecting ${client.id}`);
        client.disconnect();
        return;
      }
      const payload = this.jwt.verify(token) as {
        sub: number;
        tenantId?: string;
        role?: string;
      };
      if (!payload?.sub) {
        client.disconnect();
        return;
      }
      const user = (await (this.prisma as any).user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, tenantId: true },
      })) as { id: number; role: string; tenantId: string | null } | null;
      if (!user) {
        client.disconnect();
        return;
      }
      const tenantId = payload.tenantId ?? user.tenantId;
      if (!tenantId) {
        this.logger.warn(`[crm-ws] user ${user.id} has no tenantId; disconnecting`);
        client.disconnect();
        return;
      }
      // Resolve effective role (UserTenant.role overrides User.role for the active tenant).
      const userTenant = (await (this.prisma as any).userTenant.findFirst({
        where: { userId: user.id, tenantId },
        select: { role: true },
      })) as { role: string } | null;
      const effectiveRole = userTenant?.role ?? user.role;

      const sUser: CrmSocketUser = {
        userId: user.id,
        tenantId,
        role: user.role,
        effectiveRole,
      };
      client.data.crmUser = sUser;
      client.join(`crm:${tenantId}`);
      if (effectiveRole === 'broker') {
        client.join(`crm:${tenantId}:broker:${user.id}`);
      }
      this.logger.log(
        `[crm-ws] connected user=${user.id} tenant=${tenantId} role=${effectiveRole}`,
      );
    } catch (err) {
      this.logger.warn(`[crm-ws] auth error: ${(err as Error)?.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const u = client.data?.crmUser as CrmSocketUser | undefined;
    if (u) {
      this.logger.log(`[crm-ws] disconnected user=${u.userId} tenant=${u.tenantId}`);
    }
  }

  // ---------------------------------------------------------------------------
  // CrmRealtimeEmitter
  // ---------------------------------------------------------------------------

  emitToTenant(tenantId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(`crm:${tenantId}`).emit(event, payload);
  }

  emitToBroker(
    tenantId: string,
    userId: number,
    event: string,
    payload: unknown,
  ): void {
    if (!this.server) return;
    this.server.to(`crm:${tenantId}:broker:${userId}`).emit(event, payload);
  }
}
