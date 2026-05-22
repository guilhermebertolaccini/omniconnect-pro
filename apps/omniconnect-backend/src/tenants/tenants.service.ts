import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export interface MembershipDto {
  tenantId: string;
  tenantName: string;
  role: Role;
  isActive: boolean;
}

/**
 * Memberships do utilizador autenticado (ADR-0003 §2).
 *
 * Fonte de verdade: `UserTenant` × `Tenant` no Postgres. O Hub usa esta lista
 * para popular o seletor de tenant ativo e derivar o menu por papel; o
 * `tenantId` autoritativo continua vindo do JWT — esta lista é apenas o
 * conjunto de tenants para os quais o user pode pedir um novo access token.
 */
@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMyMemberships(userId: number): Promise<MembershipDto[]> {
    const rows = await this.prisma.userTenant.findMany({
      where: { userId },
      include: { tenant: true },
      orderBy: [{ tenant: { name: 'asc' } }],
    });

    return rows
      .filter((r) => r.tenant !== null)
      .map((r) => ({
        tenantId: r.tenantId,
        tenantName: r.tenant.name,
        role: r.role,
        isActive: r.tenant.isActive,
      }));
  }
}
