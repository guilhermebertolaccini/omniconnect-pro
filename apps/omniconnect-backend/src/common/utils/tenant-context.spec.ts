import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  DEFAULT_TENANT_SENTINEL,
  ensureJobTenant,
  ensureTenant,
  withTenant,
} from './tenant-context';

describe('tenant-context helpers', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  describe('ensureTenant', () => {
    it('throws UnauthorizedException when user is missing', () => {
      expect(() => ensureTenant(undefined)).toThrow(UnauthorizedException);
      expect(() => ensureTenant(null)).toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException when tenantId is missing or empty', () => {
      expect(() => ensureTenant({ id: 1 } as any)).toThrow(ForbiddenException);
      expect(() => ensureTenant({ id: 1, tenantId: '' } as any)).toThrow(
        ForbiddenException,
      );
      expect(() => ensureTenant({ id: 1, tenantId: '   ' } as any)).toThrow(
        ForbiddenException,
      );
    });

    it('accepts default-tenant in non-production environments', () => {
      process.env.NODE_ENV = 'development';
      expect(ensureTenant({ tenantId: DEFAULT_TENANT_SENTINEL })).toBe(
        DEFAULT_TENANT_SENTINEL,
      );
    });

    it('refuses default-tenant in production', () => {
      process.env.NODE_ENV = 'production';
      expect(() =>
        ensureTenant({ tenantId: DEFAULT_TENANT_SENTINEL }),
      ).toThrow(ForbiddenException);
    });

    it('returns a real tenantId in production', () => {
      process.env.NODE_ENV = 'production';
      expect(ensureTenant({ tenantId: 'tenant-a' })).toBe('tenant-a');
    });
  });

  describe('withTenant', () => {
    it('injects tenantId into an empty where clause', () => {
      expect(withTenant('tenant-a')).toEqual({ tenantId: 'tenant-a' });
    });

    it('preserves existing filters and adds tenantId', () => {
      const where = withTenant('tenant-a', { archived: false, segment: 1 });
      expect(where).toEqual({
        archived: false,
        segment: 1,
        tenantId: 'tenant-a',
      });
    });

    it('refuses empty tenantId', () => {
      expect(() => withTenant('', { foo: 'bar' })).toThrow(ForbiddenException);
    });
  });

  describe('ensureJobTenant', () => {
    it('throws on null/undefined payload', () => {
      expect(() => ensureJobTenant(null)).toThrow(ForbiddenException);
      expect(() => ensureJobTenant(undefined)).toThrow(ForbiddenException);
    });

    it('throws when payload has no tenantId', () => {
      expect(() => ensureJobTenant({} as any)).toThrow(ForbiddenException);
    });

    it('refuses default-tenant in production jobs', () => {
      process.env.NODE_ENV = 'production';
      expect(() =>
        ensureJobTenant({ tenantId: DEFAULT_TENANT_SENTINEL }),
      ).toThrow(ForbiddenException);
    });

    it('accepts default-tenant in development jobs', () => {
      process.env.NODE_ENV = 'development';
      expect(ensureJobTenant({ tenantId: DEFAULT_TENANT_SENTINEL })).toBe(
        DEFAULT_TENANT_SENTINEL,
      );
    });
  });
});
