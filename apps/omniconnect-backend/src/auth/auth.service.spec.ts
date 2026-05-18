import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma.service';
import { RefreshTokenService } from './refresh-token.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userTenant: {
      findMany: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockRefresh: jest.Mocked<Partial<RefreshTokenService>> = {
    issue: jest.fn(),
    rotate: jest.fn(),
    revoke: jest.fn(),
    revokeAllForUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: RefreshTokenService, useValue: mockRefresh },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('returns the user (without password) on a valid argon2 credential', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: '$argon2id$v=19$m=65536,t=3,p=4$hashedpassword',
        name: 'Test User',
        role: 'operator',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(require('argon2'), 'verify').mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toMatchObject({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
      });
      expect((result as any).password).toBeUndefined();
    });

    it('returns null when user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser(
        'invalid@example.com',
        'password',
      );
      expect(result).toBeNull();
    });

    it('returns null when password does not match', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: '$argon2id$hash',
      };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(require('argon2'), 'verify').mockResolvedValue(false);

      const result = await service.validateUser(
        'test@example.com',
        'wrongpassword',
      );
      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('issues access+refresh through RefreshTokenService scoped to the active tenant', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        segment: 1,
        line: null,
        status: 'Offline',
        oneToOneActive: false,
      };
      mockPrismaService.userTenant.findMany.mockResolvedValue([
        { tenantId: 'tenant-a' },
      ]);
      (mockRefresh.issue as jest.Mock).mockResolvedValue({
        accessToken: 'access-jwt',
        accessExpiresIn: 900,
        refreshToken: 'raw-refresh',
        refreshExpiresAt: new Date('2030-01-01T00:00:00Z'),
        refreshTokenId: 'rt-1',
      });

      const result = await service.login(mockUser);

      expect(result.access_token).toBe('access-jwt');
      expect(result.refresh_token).toBe('raw-refresh');
      expect(result.user.tenantId).toBe('tenant-a');
      expect(mockRefresh.issue).toHaveBeenCalledWith(
        { id: mockUser.id, email: mockUser.email, role: mockUser.role },
        'tenant-a',
        {},
      );
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('flips operator status to Online on login', async () => {
      mockPrismaService.userTenant.findMany.mockResolvedValue([]);
      mockPrismaService.user.update.mockResolvedValue({});
      (mockRefresh.issue as jest.Mock).mockResolvedValue({
        accessToken: 'x',
        accessExpiresIn: 900,
        refreshToken: 'y',
        refreshExpiresAt: new Date(),
        refreshTokenId: 'rt',
      });

      await service.login({
        id: 7,
        email: 'op@example.com',
        name: 'Op',
        role: 'operator',
      });

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { status: 'Online' },
      });
    });
  });

  describe('refresh', () => {
    it('delegates to RefreshTokenService and returns sanitized payload', async () => {
      (mockRefresh.rotate as jest.Mock).mockResolvedValue({
        accessToken: 'new-access',
        accessExpiresIn: 900,
        refreshToken: 'new-refresh',
        refreshExpiresAt: new Date('2030-02-01T00:00:00Z'),
        refreshTokenId: 'rt-2',
      });

      const result = await service.refresh('old-refresh', {
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      });

      expect(mockRefresh.rotate).toHaveBeenCalledWith('old-refresh', {
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      });
      expect(result.access_token).toBe('new-access');
      expect(result.refresh_token).toBe('new-refresh');
    });
  });

  describe('logout', () => {
    it('revokes the presented refresh and flips operator to Offline', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 7,
        role: 'operator',
      });
      await service.logout(7, 'raw');
      expect(mockRefresh.revoke).toHaveBeenCalledWith('raw');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { status: 'Offline' },
      });
    });
  });

  describe('logoutAll', () => {
    it('delegates to RefreshTokenService.revokeAllForUser', async () => {
      (mockRefresh.revokeAllForUser as jest.Mock).mockResolvedValue(3);
      const result = await service.logoutAll(7);
      expect(mockRefresh.revokeAllForUser).toHaveBeenCalledWith(7);
      expect(result.revoked).toBe(3);
    });
  });
});
