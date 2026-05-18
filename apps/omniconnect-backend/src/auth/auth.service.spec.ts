import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma.service';

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
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
    it('signs JWT with tenantId resolved from UserTenant table', async () => {
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
      mockJwtService.sign.mockReturnValue('mock-jwt-token');
      mockPrismaService.userTenant.findMany.mockResolvedValue([
        { tenantId: 'tenant-a' },
      ]);

      const result = await service.login(mockUser);

      expect(result.access_token).toBe('mock-jwt-token');
      expect(result.user.tenantId).toBe('tenant-a');
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        email: mockUser.email,
        sub: mockUser.id,
        role: mockUser.role,
        tenantId: 'tenant-a',
      });
      // Non-operator users should not have their status auto-flipped to Online.
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('flips operator status to Online on login', async () => {
      mockJwtService.sign.mockReturnValue('mock-jwt-token');
      mockPrismaService.userTenant.findMany.mockResolvedValue([]);
      mockPrismaService.user.update.mockResolvedValue({});

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
});
