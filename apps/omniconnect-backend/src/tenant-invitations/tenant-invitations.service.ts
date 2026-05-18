import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { Prisma, Role, TenantInvitation } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  EventModule,
  EventSeverity,
  EventType,
  SystemEventsService,
} from '../system-events/system-events.service';
import { CreateTenantInvitationDto } from './dto/create-tenant-invitation.dto';
import { AcceptTenantInvitationDto } from './dto/accept-tenant-invitation.dto';

/** View pública do convite — nunca devolve `token`. */
export interface TenantInvitationView {
  id: string;
  tenantId: string;
  email: string;
  role: Role;
  invitedById: number | null;
  acceptedById: number | null;
  acceptedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

/** Preview público devolvido pelo endpoint by-token (sem expor token nem ids internos sensíveis). */
export interface TenantInvitationPreview {
  email: string;
  role: Role;
  tenantId: string;
  tenantName: string;
  invitedByName: string | null;
  expiresAt: Date;
  isExpired: boolean;
  isAccepted: boolean;
}

export interface AcceptResult {
  user: { id: number; email: string; name: string; role: Role };
  tenantId: string;
  alreadyMember: boolean;
}

@Injectable()
export class TenantInvitationsService {
  private readonly logger = new Logger(TenantInvitationsService.name);

  private readonly defaultTtlHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() @Inject(SystemEventsService)
    private readonly systemEvents: SystemEventsService | null,
  ) {
    const raw = this.config.get<string>('TENANT_INVITATION_TTL_HOURS');
    const parsed = raw ? Number(raw) : NaN;
    this.defaultTtlHours = Number.isFinite(parsed) && parsed > 0 ? parsed : 168;
  }

  // ---------------------------------------------------------------------------
  // CRUD admin
  // ---------------------------------------------------------------------------

  /**
   * Cria um invite. O `token` retornado SÓ aparece nesta resposta para o caller
   * mandar por e-mail; nenhum listing posterior expõe o token.
   */
  async create(
    tenantId: string,
    invitedById: number | null,
    inviterRole: Role | null,
    dto: CreateTenantInvitationDto,
  ): Promise<TenantInvitationView & { token: string }> {
    this.assertTenant(tenantId);

    const email = dto.email.trim().toLowerCase();
    if (!email) throw new BadRequestException('Invalid email');

    if (!this.inviterCanGrantRole(inviterRole, dto.role)) {
      throw new ForbiddenException(
        'Inviter cannot grant a role equal to or higher than their own',
      );
    }

    const existingMember = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, tenants: { where: { tenantId }, select: { tenantId: true } } },
    });
    if (existingMember?.tenants?.length) {
      throw new ConflictException('User is already a member of this tenant');
    }

    const openInvitation = await this.prisma.tenantInvitation.findFirst({
      where: { tenantId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (openInvitation) {
      throw new ConflictException(
        'There is already an open (non-expired, non-accepted) invitation for this email',
      );
    }

    const ttlHours = dto.ttlHours ?? this.defaultTtlHours;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const token = randomBytes(32).toString('hex');

    const created = await this.prisma.tenantInvitation.create({
      data: {
        tenantId,
        email,
        role: dto.role,
        token,
        invitedById,
        expiresAt,
      },
    });

    void this.audit(
      tenantId,
      invitedById,
      EventType.TENANT_INVITATION_CREATED,
      EventSeverity.INFO,
      { invitationId: created.id, role: dto.role, expiresAt: expiresAt.toISOString() },
    );

    return { ...this.toView(created), token };
  }

  async listForTenant(tenantId: string): Promise<TenantInvitationView[]> {
    this.assertTenant(tenantId);
    const rows = await this.prisma.tenantInvitation.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toView(r));
  }

  async revoke(tenantId: string, id: string, actorId: number): Promise<void> {
    this.assertTenant(tenantId);
    const invitation = await this.prisma.tenantInvitation.findFirst({
      where: { id, tenantId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.acceptedAt) {
      throw new ConflictException('Cannot revoke an accepted invitation');
    }

    await this.prisma.tenantInvitation.delete({ where: { id } });

    void this.audit(
      tenantId,
      actorId,
      EventType.TENANT_INVITATION_REVOKED,
      EventSeverity.WARNING,
      { invitationId: id, email: invitation.email },
    );
  }

  // ---------------------------------------------------------------------------
  // Fluxo público por token
  // ---------------------------------------------------------------------------

  async preview(token: string): Promise<TenantInvitationPreview> {
    if (!token || token.length < 32) throw new NotFoundException('Invitation not found');

    const invitation = await this.prisma.tenantInvitation.findUnique({
      where: { token },
      include: {
        tenant: { select: { name: true } },
        invitedBy: { select: { name: true } },
      },
    });

    if (!invitation) throw new NotFoundException('Invitation not found');

    return {
      email: invitation.email,
      role: invitation.role,
      tenantId: invitation.tenantId,
      tenantName: invitation.tenant?.name ?? invitation.tenantId,
      invitedByName: invitation.invitedBy?.name ?? null,
      expiresAt: invitation.expiresAt,
      isExpired: invitation.expiresAt.getTime() < Date.now(),
      isAccepted: invitation.acceptedAt !== null,
    };
  }

  /**
   * Aceita um convite. Cobre três cenários:
   *  - caller autenticado com email batendo (body ignorado)
   *  - account existente: precisa de `password` válido
   *  - account nova: precisa de `name` + `password`
   *
   * Retorna o user normalizado + flag `alreadyMember` (idempotência: aceitar duas
   * vezes o mesmo convite válido devolve `alreadyMember=true`).
   */
  async accept(
    token: string,
    body: AcceptTenantInvitationDto,
    authenticatedUserId: number | null,
  ): Promise<AcceptResult> {
    if (!token || token.length < 32) throw new NotFoundException('Invitation not found');

    const invitation = await this.prisma.tenantInvitation.findUnique({
      where: { token },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('Invitation expired');
    }

    if (invitation.acceptedAt && invitation.acceptedById) {
      const user = await this.prisma.user.findUnique({
        where: { id: invitation.acceptedById },
      });
      if (user) {
        return {
          user: this.toUserView(user, invitation.role),
          tenantId: invitation.tenantId,
          alreadyMember: true,
        };
      }
    }

    const email = invitation.email.toLowerCase();

    // Resolve o user envolvido — autenticado, existente por email, ou novo.
    let user = authenticatedUserId
      ? await this.prisma.user.findUnique({ where: { id: authenticatedUserId } })
      : await this.prisma.user.findUnique({ where: { email } });

    if (user && user.email.toLowerCase() !== email) {
      // JWT do caller pertence a outro email — não deixamos "ligar" o invite no
      // user errado.
      throw new UnauthorizedException(
        'Authenticated user does not match invitation email',
      );
    }

    if (!user) {
      if (!body.password || !body.name) {
        throw new BadRequestException(
          'New account requires both `name` and `password`',
        );
      }
      const passwordHash = await argon2.hash(body.password);
      user = await this.prisma.user.create({
        data: {
          email,
          name: body.name,
          password: passwordHash,
          role: invitation.role,
        },
      });
    } else if (!authenticatedUserId) {
      if (!body.password) {
        throw new BadRequestException('Existing account requires `password`');
      }
      const valid = await argon2.verify(user.password, body.password).catch(() => false);
      if (!valid) throw new UnauthorizedException('Invalid credentials');
    }

    // Membership: cria se não existir; idempotente.
    const existingMembership = await this.prisma.userTenant.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: invitation.tenantId } },
    });

    let alreadyMember = false;
    if (existingMembership) {
      alreadyMember = true;
    } else {
      await this.prisma.userTenant.create({
        data: {
          userId: user.id,
          tenantId: invitation.tenantId,
          role: invitation.role,
        },
      });
    }

    await this.prisma.tenantInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(), acceptedById: user.id },
    });

    void this.audit(
      invitation.tenantId,
      user.id,
      EventType.TENANT_INVITATION_ACCEPTED,
      EventSeverity.SUCCESS,
      { invitationId: invitation.id, role: invitation.role, alreadyMember },
    );

    return {
      user: this.toUserView(user, invitation.role),
      tenantId: invitation.tenantId,
      alreadyMember,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Hierarquia mínima: inviter precisa ser admin para conceder `admin`;
   * supervisor pode invitar operator/ativador/digital/supervisor; demais roles
   * não podem invitar. Quando `inviterRole` é null (boot inicial / scripts),
   * permitimos — o caller é responsável por gating externo.
   */
  private inviterCanGrantRole(inviterRole: Role | null, target: Role): boolean {
    if (!inviterRole) return true;
    if (inviterRole === Role.admin) return true;
    if (inviterRole === Role.supervisor) return target !== Role.admin;
    return false;
  }

  private assertTenant(tenantId: string | null | undefined): asserts tenantId is string {
    if (!tenantId) throw new BadRequestException('tenantId is required');
  }

  private toView(row: TenantInvitation): TenantInvitationView {
    return {
      id: row.id,
      tenantId: row.tenantId,
      email: row.email,
      role: row.role,
      invitedById: row.invitedById,
      acceptedById: row.acceptedById,
      acceptedAt: row.acceptedAt,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  }

  private toUserView(
    user: { id: number; email: string; name: string },
    role: Role,
  ): AcceptResult['user'] {
    return { id: user.id, email: user.email, name: user.name, role };
  }

  private async audit(
    tenantId: string,
    actorId: number | null,
    type: EventType,
    severity: EventSeverity,
    payload: Prisma.JsonObject,
  ): Promise<void> {
    if (!this.systemEvents) return;
    try {
      await this.systemEvents.logEvent(
        type,
        EventModule.TENANT_INVITATIONS,
        payload,
        actorId,
        severity,
        tenantId,
      );
    } catch (err) {
      this.logger.warn(`Failed to audit ${type}: ${(err as Error).message}`);
    }
  }
}
