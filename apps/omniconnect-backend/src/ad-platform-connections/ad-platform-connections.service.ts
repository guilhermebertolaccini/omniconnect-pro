import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AdPlatform, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { BridgeSecretCipher } from '../integration-events/bridge-secret-cipher';
import { CreateAdPlatformConnectionDto } from './dto/create-ad-platform-connection.dto';
import { UpdateAdPlatformConnectionDto } from './dto/update-ad-platform-connection.dto';

/**
 * Public-safe shape of an AdPlatformConnection. Tokens are NEVER returned
 * — only a presence flag and the trailing 4 chars are exposed so the UI
 * can confirm something is configured. Use `getDecryptedAccessToken()`
 * server-side (e.g. inside an outbound proxy) when an actual call needs
 * the plaintext.
 */
export interface MaskedAdPlatformConnection {
  id: string;
  tenantId: string;
  advertiserCompanyId: string;
  platform: AdPlatform;
  accountId: string | null;
  isActive: boolean;
  tokenExpiresAt: Date | null;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  accessTokenHint: string | null; // last 4 chars only, never the full token
  extra: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: number | null;
}

@Injectable()
export class AdPlatformConnectionsService {
  private readonly logger = new Logger(AdPlatformConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: BridgeSecretCipher,
  ) {}

  async create(
    tenantId: string,
    dto: CreateAdPlatformConnectionDto,
    actorUserId?: number,
  ): Promise<MaskedAdPlatformConnection> {
    if (!dto.advertiserCompanyId) {
      throw new BadRequestException('advertiserCompanyId is required');
    }
    const company = await this.prisma.advertiserCompany.findFirst({
      where: { id: dto.advertiserCompanyId, tenantId },
      select: { id: true },
    });
    if (!company) {
      throw new NotFoundException('Advertiser company not found for this tenant');
    }

    const existing = await this.prisma.adPlatformConnection.findUnique({
      where: {
        advertiserCompanyId_platform: {
          advertiserCompanyId: dto.advertiserCompanyId,
          platform: dto.platform,
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        `Connection for platform=${dto.platform} already exists on this advertiser company`,
      );
    }

    const accessTokenEncrypted = dto.accessToken
      ? this.cipher.encrypt(dto.accessToken)
      : null;
    const refreshTokenEncrypted = dto.refreshToken
      ? this.cipher.encrypt(dto.refreshToken)
      : null;

    const record = await this.prisma.adPlatformConnection.create({
      data: {
        tenantId,
        advertiserCompanyId: dto.advertiserCompanyId,
        platform: dto.platform,
        accountId: dto.accountId ?? null,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenExpiresAt: dto.tokenExpiresAt ? new Date(dto.tokenExpiresAt) : null,
        isActive: dto.isActive ?? true,
        extra: (dto.extra ?? null) as Prisma.InputJsonValue,
        createdById: actorUserId ?? null,
      },
    });
    return this.mask(record, dto.accessToken);
  }

  async findAll(tenantId: string, advertiserCompanyId?: string): Promise<MaskedAdPlatformConnection[]> {
    const records = await this.prisma.adPlatformConnection.findMany({
      where: {
        tenantId,
        ...(advertiserCompanyId ? { advertiserCompanyId } : {}),
      },
      orderBy: [{ advertiserCompanyId: 'asc' }, { platform: 'asc' }],
    });
    return records.map((r) => this.mask(r));
  }

  async findOne(tenantId: string, id: string): Promise<MaskedAdPlatformConnection> {
    const record = await this.prisma.adPlatformConnection.findFirst({
      where: { id, tenantId },
    });
    if (!record) {
      throw new NotFoundException('Ad platform connection not found for this tenant');
    }
    return this.mask(record);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateAdPlatformConnectionDto,
  ): Promise<MaskedAdPlatformConnection> {
    const existing = await this.prisma.adPlatformConnection.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Ad platform connection not found for this tenant');
    }

    const data: Prisma.AdPlatformConnectionUpdateInput = {};
    if (dto.accountId !== undefined) data.accountId = dto.accountId;
    if (dto.accessToken !== undefined) {
      data.accessTokenEncrypted = dto.accessToken
        ? this.cipher.encrypt(dto.accessToken)
        : null;
    }
    if (dto.refreshToken !== undefined) {
      data.refreshTokenEncrypted = dto.refreshToken
        ? this.cipher.encrypt(dto.refreshToken)
        : null;
    }
    if (dto.tokenExpiresAt !== undefined) {
      data.tokenExpiresAt = dto.tokenExpiresAt ? new Date(dto.tokenExpiresAt) : null;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.extra !== undefined) {
      data.extra = (dto.extra ?? null) as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.adPlatformConnection.update({
      where: { id },
      data,
    });
    return this.mask(updated, dto.accessToken);
  }

  async remove(tenantId: string, id: string): Promise<{ id: string }> {
    const existing = await this.prisma.adPlatformConnection.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Ad platform connection not found for this tenant');
    }
    await this.prisma.adPlatformConnection.delete({ where: { id } });
    return { id };
  }

  /**
   * Returns the plaintext access token for an active connection. Intended
   * for server-side outbound proxy use only — never to be returned to a
   * REST caller. Throws if the connection is missing/inactive or has no
   * access token configured.
   */
  async getDecryptedAccessToken(tenantId: string, id: string): Promise<{
    accessToken: string;
    platform: AdPlatform;
    accountId: string | null;
    extra: Prisma.JsonValue | null;
  }> {
    const record = await this.prisma.adPlatformConnection.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        platform: true,
        accountId: true,
        accessTokenEncrypted: true,
        isActive: true,
        extra: true,
      },
    });
    if (!record) {
      throw new NotFoundException('Ad platform connection not found for this tenant');
    }
    if (!record.isActive) {
      throw new BadRequestException('Ad platform connection is inactive');
    }
    if (!record.accessTokenEncrypted) {
      throw new BadRequestException('Ad platform connection has no access token configured');
    }
    let plaintext: string;
    try {
      plaintext = this.cipher.decryptWithLegacyFallback(record.accessTokenEncrypted);
    } catch (err) {
      this.logger.error(
        `Failed to decrypt access token for AdPlatformConnection id=${id} tenant=${tenantId}`,
      );
      throw err;
    }
    return {
      accessToken: plaintext,
      platform: record.platform,
      accountId: record.accountId,
      extra: record.extra,
    };
  }

  /**
   * Smoke-test endpoint: validates the stored token can be decrypted and
   * (optionally) that the provider answers a trivial GET. Today we only
   * verify the decrypt step and that the row is active — the actual
   * provider ping lives in advertiser-companies / token-refresh modules
   * (where the HTTP client and rate-limit handling already exist).
   */
  async testConnection(tenantId: string, id: string): Promise<{
    id: string;
    platform: AdPlatform;
    canDecrypt: boolean;
    isActive: boolean;
    tokenExpiresAt: Date | null;
  }> {
    const record = await this.prisma.adPlatformConnection.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        platform: true,
        accessTokenEncrypted: true,
        isActive: true,
        tokenExpiresAt: true,
      },
    });
    if (!record) {
      throw new NotFoundException('Ad platform connection not found for this tenant');
    }
    let canDecrypt = false;
    if (record.accessTokenEncrypted) {
      try {
        const plain = this.cipher.decryptWithLegacyFallback(record.accessTokenEncrypted);
        canDecrypt = typeof plain === 'string' && plain.length > 0;
      } catch {
        canDecrypt = false;
      }
    }
    return {
      id: record.id,
      platform: record.platform,
      canDecrypt,
      isActive: record.isActive,
      tokenExpiresAt: record.tokenExpiresAt,
    };
  }

  /**
   * Build the public-safe shape. `recentPlaintext` is only used when we
   * just received it as input on create/update — it lets the response
   * include the trailing 4 chars without having to decrypt for every list
   * call. Listing never exposes a hint (cheaper + safer default).
   */
  private mask(
    record: {
      id: string;
      tenantId: string;
      advertiserCompanyId: string;
      platform: AdPlatform;
      accountId: string | null;
      isActive: boolean;
      tokenExpiresAt: Date | null;
      accessTokenEncrypted: string | null;
      refreshTokenEncrypted: string | null;
      extra: Prisma.JsonValue | null;
      createdAt: Date;
      updatedAt: Date;
      createdById: number | null;
    },
    recentPlaintext?: string,
  ): MaskedAdPlatformConnection {
    const hint = recentPlaintext && recentPlaintext.length >= 4
      ? recentPlaintext.slice(-4)
      : null;
    return {
      id: record.id,
      tenantId: record.tenantId,
      advertiserCompanyId: record.advertiserCompanyId,
      platform: record.platform,
      accountId: record.accountId,
      isActive: record.isActive,
      tokenExpiresAt: record.tokenExpiresAt,
      hasAccessToken: !!record.accessTokenEncrypted,
      hasRefreshToken: !!record.refreshTokenEncrypted,
      accessTokenHint: hint,
      extra: record.extra,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      createdById: record.createdById,
    };
  }
}
