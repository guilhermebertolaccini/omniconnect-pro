import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  CrmDocumentAccessAction,
  CrmDocumentParentType,
  CrmDocumentVersionAction,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CrmActor, effectiveRole } from '../crm/common/actor';
import { Role } from '@prisma/client';

interface UploadInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  parentType: CrmDocumentParentType;
  parentId: string;
  fileName?: string;
}

export interface StoredFile {
  fileId: string;
  url: string;
  parentType: CrmDocumentParentType;
  parentId: string;
  size: number;
  mimeType: string;
}

/**
 * Storage filesystem para PDFs do CRM. Paths são SEMPRE
 * `{root}/crm/{tenantId}/{parentType}/{fileId}.{ext}` — tenantId nunca
 * vem do usuário; é sempre derivado de `req.user.tenantId` (JwtStrategy).
 *
 * Para serve: o endpoint `GET /crm/storage/files/:fileId` valida o
 * tenant scope antes de devolver o stream. NÃO há rota pública — quem
 * precisa do PDF (Clicksign, por exemplo) recebe uma signed URL no
 * formato `?token={jwt}` (lifetime curto, gerado pelo backend) ou
 * acessa via session JWT.
 */
@Injectable()
export class CrmStorageService {
  private readonly logger = new Logger(CrmStorageService.name);
  private readonly root: string;
  private readonly maxFileSize = 25 * 1024 * 1024; // 25MB

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.root = path.resolve(
      this.config.get<string>('CRM_STORAGE_ROOT') ?? './uploads',
    );
  }

  /**
   * Resolve absolute storage path while preventing traversal. Throws if
   * the resolved path escapes the root (defense in depth — fileId é
   * gerado pelo backend mas mantemos a guarda).
   */
  private resolveSafePath(
    tenantId: string,
    parentType: CrmDocumentParentType,
    fileId: string,
    ext: string,
  ): string {
    const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeFileId = fileId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    const tenantBase = path.join(this.root, 'crm', safeTenant, parentType);
    const filePath = path.join(tenantBase, `${safeFileId}.${safeExt}`);
    const resolved = path.resolve(filePath);
    const resolvedRoot = path.resolve(this.root);
    if (!resolved.startsWith(resolvedRoot + path.sep)) {
      throw new ForbiddenException('Invalid storage path');
    }
    return resolved;
  }

  async upload(
    tenantId: string,
    actor: CrmActor,
    input: UploadInput,
  ): Promise<StoredFile> {
    if (!input.buffer || input.buffer.length === 0) {
      throw new BadRequestException('Empty file');
    }
    if (input.buffer.length > this.maxFileSize) {
      throw new BadRequestException(
        `File exceeds maximum size (${this.maxFileSize} bytes)`,
      );
    }
    const allowed = new Set([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
    ]);
    if (!allowed.has(input.mimeType)) {
      throw new BadRequestException(`Unsupported mime type ${input.mimeType}`);
    }

    // Valida que o parent existe e pertence ao tenant.
    await this.assertParentBelongsToTenant(
      tenantId,
      input.parentType,
      input.parentId,
      actor,
    );

    const fileId = randomUUID();
    const ext = input.mimeType === 'application/pdf' ? 'pdf' : input.mimeType.split('/')[1];
    const filePath = this.resolveSafePath(
      tenantId,
      input.parentType,
      fileId,
      ext,
    );
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, input.buffer);

    const fileNameSafe = (input.fileName ?? input.originalName ?? `file.${ext}`)
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 255);
    const uploader = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { name: true },
    });

    await this.prisma.crmDocumentVersion.create({
      data: {
        id: fileId,
        tenantId,
        parentType: input.parentType,
        parentId: input.parentId,
        pdfUrl: this.buildUrlPath(tenantId, input.parentType, fileId, ext),
        fileName: fileNameSafe,
        action: CrmDocumentVersionAction.attached,
        uploadedById: actor.id,
        uploaderName: uploader?.name ?? null,
      },
    });

    return {
      fileId,
      url: `/crm/storage/files/${fileId}`,
      parentType: input.parentType,
      parentId: input.parentId,
      size: input.buffer.length,
      mimeType: input.mimeType,
    };
  }

  async readForServe(
    tenantId: string,
    actor: CrmActor,
    fileId: string,
  ): Promise<{ absolutePath: string; mimeType: string; fileName: string | null }> {
    const version = await this.prisma.crmDocumentVersion.findFirst({
      where: { id: fileId, tenantId },
    });
    if (!version) {
      throw new NotFoundException('File not found for this tenant');
    }
    // Broker scope: brokers só baixam PDFs cujo parent pertence a eles.
    if (effectiveRole(actor) === Role.broker) {
      await this.assertParentBelongsToTenant(
        tenantId,
        version.parentType,
        version.parentId,
        actor,
      );
    }
    const ext = path.extname(version.pdfUrl).replace('.', '') || 'pdf';
    const absolutePath = this.resolveSafePath(
      tenantId,
      version.parentType,
      version.id,
      ext,
    );
    try {
      await fs.access(absolutePath);
    } catch {
      throw new NotFoundException('File missing on disk');
    }
    const mimeType =
      ext === 'pdf'
        ? 'application/pdf'
        : ext === 'png'
          ? 'image/png'
          : ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : 'application/octet-stream';

    await this.prisma.crmDocumentAccessLog.create({
      data: {
        tenantId,
        parentType: version.parentType,
        parentId: version.parentId,
        pdfUrl: version.pdfUrl,
        action: CrmDocumentAccessAction.downloaded,
        userId: actor.id,
      },
    });

    return { absolutePath, mimeType, fileName: version.fileName };
  }

  private buildUrlPath(
    tenantId: string,
    parentType: CrmDocumentParentType,
    fileId: string,
    ext: string,
  ): string {
    void tenantId;
    void parentType;
    return `/crm/storage/files/${fileId}.${ext}`;
  }

  /**
   * Valida que `parentId` existe e pertence ao tenant. Para brokers,
   * exige que o parent seja "deles" (broker scope). Recusa silenciosa
   * com NotFound — pattern padrão.
   */
  private async assertParentBelongsToTenant(
    tenantId: string,
    parentType: CrmDocumentParentType,
    parentId: string,
    actor: CrmActor,
  ): Promise<void> {
    const isBroker = effectiveRole(actor) === Role.broker;
    if (parentType === CrmDocumentParentType.proposal) {
      const row = await this.prisma.crmProposal.findFirst({
        where: {
          id: parentId,
          tenantId,
          ...(isBroker ? { brokerId: actor.id } : {}),
        },
        select: { id: true },
      });
      if (!row) {
        throw new NotFoundException('Proposal not found for this tenant');
      }
    } else if (parentType === CrmDocumentParentType.contract) {
      const row = await this.prisma.crmContract.findFirst({
        where: {
          id: parentId,
          tenantId,
          ...(isBroker ? { brokerId: actor.id } : {}),
        },
        select: { id: true },
      });
      if (!row) {
        throw new NotFoundException('Contract not found for this tenant');
      }
    } else {
      throw new BadRequestException(`Unsupported parentType ${parentType}`);
    }
  }
}
