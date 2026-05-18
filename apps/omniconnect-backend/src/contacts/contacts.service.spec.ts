import { NotFoundException } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { PrismaService } from '../prisma.service';
import { PhoneValidationService } from '../phone-validation/phone-validation.service';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const tenantAContact = {
  id: 1,
  tenantId: TENANT_A,
  name: 'Alice',
  phone: '5511999990001',
  cpf: null,
  contract: null,
  segment: 1,
};

const tenantBContact = {
  id: 2,
  tenantId: TENANT_B,
  name: 'Bob',
  phone: '5511999990002',
  cpf: null,
  contract: null,
  segment: 1,
};

describe('ContactsService — tenant isolation', () => {
  let service: ContactsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      contact: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const phoneValidation = {
      normalizePhone: jest.fn((phone: string) => phone),
    } as unknown as PhoneValidationService;

    service = new ContactsService(prisma as PrismaService, phoneValidation);
  });

  describe('findAll', () => {
    it('scopes Prisma query to tenantId from caller', async () => {
      prisma.contact.findMany.mockResolvedValueOnce([tenantAContact]);

      const result = await service.findAll(TENANT_A);

      expect(prisma.contact.findMany).toHaveBeenCalledTimes(1);
      const args = prisma.contact.findMany.mock.calls[0][0];
      expect(args.where.tenantId).toBe(TENANT_A);
      expect(result).toEqual([tenantAContact]);
    });

    it('keeps tenantId when a search filter is applied', async () => {
      prisma.contact.findMany.mockResolvedValueOnce([]);

      await service.findAll(TENANT_B, 'foo', 2);

      const args = prisma.contact.findMany.mock.calls[0][0];
      expect(args.where.tenantId).toBe(TENANT_B);
      expect(args.where.segment).toBe(2);
      expect(args.where.OR).toBeDefined();
    });
  });

  describe('findByPhone', () => {
    it('filters by tenantId and phone', async () => {
      prisma.contact.findFirst.mockResolvedValueOnce(tenantAContact);

      await service.findByPhone(TENANT_A, '5511999990001');

      expect(prisma.contact.findFirst).toHaveBeenCalledWith({
        where: { phone: '5511999990001', tenantId: TENANT_A },
      });
    });

    it('does not return contact when phone exists but belongs to other tenant', async () => {
      // The DB layer would naturally return null because tenantId differs;
      // we simulate that contract here.
      prisma.contact.findFirst.mockImplementationOnce(({ where }: any) => {
        if (where.tenantId === TENANT_A && where.phone === tenantBContact.phone) {
          return Promise.resolve(null);
        }
        return Promise.resolve(tenantBContact);
      });

      const result = await service.findByPhone(TENANT_A, tenantBContact.phone);
      expect(result).toBeNull();
    });
  });

  describe('findOne / update / remove', () => {
    it('findOne refuses to return contact from another tenant', async () => {
      prisma.contact.findFirst.mockResolvedValueOnce(null);

      await expect(service.findOne(TENANT_A, tenantBContact.id)).rejects.toThrow(
        NotFoundException,
      );

      const args = prisma.contact.findFirst.mock.calls[0][0];
      expect(args.where.tenantId).toBe(TENANT_A);
    });

    it('update gates on tenant-scoped findOne before mutating', async () => {
      prisma.contact.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.update(TENANT_A, tenantBContact.id, { name: 'pwn' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('remove gates on tenant-scoped findOne before deleting', async () => {
      prisma.contact.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.remove(TENANT_A, tenantBContact.id),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.contact.delete).not.toHaveBeenCalled();
    });
  });

  describe('create (upsert)', () => {
    it('keys upsert on tenantId_phone compound and stamps tenantId on create', async () => {
      prisma.contact.upsert.mockResolvedValueOnce(tenantAContact);

      await service.create(TENANT_A, {
        name: 'Alice',
        phone: '5511999990001',
      } as any);

      const args = prisma.contact.upsert.mock.calls[0][0];
      expect(args.where).toEqual({
        tenantId_phone: { tenantId: TENANT_A, phone: '5511999990001' },
      });
      expect(args.create.tenantId).toBe(TENANT_A);
    });
  });
});
