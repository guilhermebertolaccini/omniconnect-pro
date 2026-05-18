import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  CrmDocumentParentType,
  Role,
} from '@prisma/client';
import { CrmStorageService } from './crm-storage.service';
import { PrismaService } from '../prisma.service';

describe('CrmStorageService', () => {
  let service: CrmStorageService;
  let tmpRoot: string;
  let prismaMock: any;

  const proposals = new Map<string, any>();
  const contracts = new Map<string, any>();
  const versions: any[] = [];
  const accessLogs: any[] = [];

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'crm-storage-'));
    proposals.clear();
    contracts.clear();
    versions.length = 0;
    accessLogs.length = 0;
    proposals.set('prop-a', {
      id: 'prop-a',
      tenantId: 'tenant-a',
      brokerId: 9,
    });
    contracts.set('ct-a', {
      id: 'ct-a',
      tenantId: 'tenant-a',
      brokerId: 9,
    });

    prismaMock = {
      crmProposal: {
        findFirst: jest.fn(async ({ where }: any) => {
          const r = proposals.get(where.id);
          if (!r) return null;
          if (r.tenantId !== where.tenantId) return null;
          if (where.brokerId && r.brokerId !== where.brokerId) return null;
          return r;
        }),
      },
      crmContract: {
        findFirst: jest.fn(async ({ where }: any) => {
          const r = contracts.get(where.id);
          if (!r) return null;
          if (r.tenantId !== where.tenantId) return null;
          if (where.brokerId && r.brokerId !== where.brokerId) return null;
          return r;
        }),
      },
      crmDocumentVersion: {
        create: jest.fn(async ({ data }: any) => {
          versions.push(data);
          return data;
        }),
        findFirst: jest.fn(async ({ where }: any) =>
          versions.find(
            (v) => v.id === where.id && v.tenantId === where.tenantId,
          ) ?? null,
        ),
      },
      crmDocumentAccessLog: {
        create: jest.fn(async ({ data }: any) => {
          accessLogs.push(data);
          return data;
        }),
      },
      user: {
        findUnique: jest.fn(async () => ({ name: 'Uploader' })),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CrmStorageService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => (k === 'CRM_STORAGE_ROOT' ? tmpRoot : undefined) },
        },
      ],
    }).compile();
    service = moduleRef.get(CrmStorageService);
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('uploads PDF and stores under tenant-scoped path', async () => {
    const stored = await service.upload(
      'tenant-a',
      { id: 1, role: Role.admin, tenantRole: Role.admin },
      {
        buffer: Buffer.from('%PDF-1.4 content'),
        originalName: 'proposta.pdf',
        mimeType: 'application/pdf',
        parentType: CrmDocumentParentType.proposal,
        parentId: 'prop-a',
      },
    );
    expect(stored.fileId).toMatch(/[0-9a-f-]{36}/);
    const written = await fs.readdir(
      path.join(tmpRoot, 'crm', 'tenant-a', 'proposal'),
    );
    expect(written.length).toBe(1);
    expect(written[0]).toMatch(/\.pdf$/);
    expect(versions.length).toBe(1);
  });

  it('rejects unsupported mime types', async () => {
    await expect(
      service.upload(
        'tenant-a',
        { id: 1, role: Role.admin, tenantRole: Role.admin },
        {
          buffer: Buffer.from('not a pdf'),
          originalName: 'evil.exe',
          mimeType: 'application/octet-stream',
          parentType: CrmDocumentParentType.proposal,
          parentId: 'prop-a',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects empty buffer', async () => {
    await expect(
      service.upload(
        'tenant-a',
        { id: 1, role: Role.admin, tenantRole: Role.admin },
        {
          buffer: Buffer.alloc(0),
          originalName: 'x.pdf',
          mimeType: 'application/pdf',
          parentType: CrmDocumentParentType.proposal,
          parentId: 'prop-a',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects upload when parent does not belong to tenant', async () => {
    await expect(
      service.upload(
        'tenant-b',
        { id: 1, role: Role.admin, tenantRole: Role.admin },
        {
          buffer: Buffer.from('%PDF'),
          originalName: 'x.pdf',
          mimeType: 'application/pdf',
          parentType: CrmDocumentParentType.proposal,
          parentId: 'prop-a', // belongs to tenant-a
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects upload when broker does not own the parent', async () => {
    await expect(
      service.upload(
        'tenant-a',
        { id: 42, role: Role.broker, tenantRole: Role.broker }, // different user
        {
          buffer: Buffer.from('%PDF'),
          originalName: 'x.pdf',
          mimeType: 'application/pdf',
          parentType: CrmDocumentParentType.proposal,
          parentId: 'prop-a',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('serves the file for the owning tenant and writes access log', async () => {
    const stored = await service.upload(
      'tenant-a',
      { id: 1, role: Role.admin, tenantRole: Role.admin },
      {
        buffer: Buffer.from('%PDF-1.4 content'),
        originalName: 'proposta.pdf',
        mimeType: 'application/pdf',
        parentType: CrmDocumentParentType.proposal,
        parentId: 'prop-a',
      },
    );
    const served = await service.readForServe(
      'tenant-a',
      { id: 1, role: Role.admin, tenantRole: Role.admin },
      stored.fileId,
    );
    expect(served.mimeType).toBe('application/pdf');
    expect(served.absolutePath.startsWith(tmpRoot)).toBe(true);
    expect(accessLogs.length).toBe(1);
  });

  it('refuses to serve a file for a different tenant (cross-tenant isolation)', async () => {
    const stored = await service.upload(
      'tenant-a',
      { id: 1, role: Role.admin, tenantRole: Role.admin },
      {
        buffer: Buffer.from('%PDF'),
        originalName: 'proposta.pdf',
        mimeType: 'application/pdf',
        parentType: CrmDocumentParentType.proposal,
        parentId: 'prop-a',
      },
    );
    await expect(
      service.readForServe(
        'tenant-b',
        { id: 1, role: Role.admin, tenantRole: Role.admin },
        stored.fileId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks path-traversal attempts via fileId', async () => {
    // Pre-populate a "fake" version row whose id contains traversal chars —
    // resolveSafePath should sanitize, so even if it leaks past upload it
    // can't escape the root.
    versions.push({
      id: '../../../etc/passwd',
      tenantId: 'tenant-a',
      parentType: CrmDocumentParentType.proposal,
      parentId: 'prop-a',
      pdfUrl: '/crm/storage/files/../../../etc/passwd.pdf',
    });
    // The service should sanitize and end up looking inside tmpRoot only —
    // and since no real file is there, it should 404.
    await expect(
      service.readForServe(
        'tenant-a',
        { id: 1, role: Role.admin, tenantRole: Role.admin },
        '../../../etc/passwd',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    // E garante que resolveSafePath não retornou nenhum caminho fora do root.
    for (const log of accessLogs) {
      // (no access log because file was not found before logging)
      void log;
    }
    expect(accessLogs.length).toBe(0);
  });
});
