import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { generateApiKey, hashApiKey, GeneratedApiKey } from './tenant-api-keys.util';

export interface ResolvedApiKey {
  id: string;
  tenantId: string;
  label: string;
  prefix: string;
}

export interface CreateApiKeyOutput {
  id: string;
  tenantId: string;
  label: string;
  prefix: string;
  plaintext: string;
  createdAt: Date;
  expiresAt: Date | null;
}

@Injectable()
export class TenantApiKeysService {
  constructor(private prisma: PrismaService) {}

  async create(params: {
    tenantId: string;
    label: string;
    createdById?: number;
    expiresAt?: Date | null;
    scopes?: unknown;
  }): Promise<CreateApiKeyOutput> {
    if (!params.tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    if (!params.label?.trim()) {
      throw new BadRequestException('label is required');
    }

    const generated: GeneratedApiKey = generateApiKey();
    const record = await this.prisma.tenantApiKey.create({
      data: {
        tenantId: params.tenantId,
        hashedKey: generated.hashedKey,
        prefix: generated.prefix,
        label: params.label.trim(),
        createdById: params.createdById ?? null,
        expiresAt: params.expiresAt ?? null,
        scopes: (params.scopes ?? null) as any,
      },
      select: {
        id: true,
        tenantId: true,
        label: true,
        prefix: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return {
      ...record,
      plaintext: generated.plaintext,
    };
  }

  /**
   * Resolves the tenant context for a presented plaintext API key.
   * Returns null if the key is unknown, revoked or expired. Updates
   * lastUsedAt asynchronously (fire-and-forget).
   */
  async resolve(plaintext: string): Promise<ResolvedApiKey | null> {
    if (!plaintext) return null;
    const hashedKey = hashApiKey(plaintext);
    const record = await this.prisma.tenantApiKey.findUnique({
      where: { hashedKey },
      select: {
        id: true,
        tenantId: true,
        label: true,
        prefix: true,
        revokedAt: true,
        expiresAt: true,
      },
    });

    if (!record) return null;
    if (record.revokedAt) return null;
    if (record.expiresAt && record.expiresAt < new Date()) return null;

    this.prisma.tenantApiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return {
      id: record.id,
      tenantId: record.tenantId,
      label: record.label,
      prefix: record.prefix,
    };
  }

  async listForTenant(tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.prisma.tenantApiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        prefix: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
  }

  async revoke(tenantId: string, id: string) {
    const existing = await this.prisma.tenantApiKey.findFirst({
      where: { id, tenantId },
      select: { id: true, revokedAt: true },
    });
    if (!existing) {
      throw new NotFoundException('API key not found for this tenant');
    }
    if (existing.revokedAt) {
      return { id: existing.id, revokedAt: existing.revokedAt, alreadyRevoked: true };
    }
    const updated = await this.prisma.tenantApiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: { id: true, revokedAt: true },
    });
    return { ...updated, alreadyRevoked: false };
  }
}
