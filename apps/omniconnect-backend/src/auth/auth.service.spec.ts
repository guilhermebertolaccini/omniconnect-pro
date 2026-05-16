import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
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
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('deve retornar usuário quando credenciais são válidas', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: '$2b$10$hashedpassword',
        name: 'Test User',
        role: 'operator',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(require('argon2'), 'verify').mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
      });
    });

    it('deve retornar null quando usuário não existe', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('invalid@example.com', 'password');
      expect(result).toBeNull();
    });

    it('deve retornar null quando senha é inválida', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: '$2b$10$hashedpassword',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(require('argon2'), 'verify').mockResolvedValue(false);

      const result = await service.validateUser('test@example.com', 'wrongpassword');
      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('deve retornar token JWT quando login é bem-sucedido', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'operator',
        segment: 1,
        line: null,
        status: 'Offline',
        oneToOneActive: false,
      };

      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, status: 'Online' });
      mockJwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.login(mockUser);

      expect(result).toEqual({
        access_token: 'mock-jwt-token',
        user: {
          id: mockUser.id,
          name: mockUser.name,
          email: mockUser.email,
          role: mockUser.role,
          segment: mockUser.segment,
          line: mockUser.line,
          status: 'Online',
          oneToOneActive: mockUser.oneToOneActive,
        },
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        email: mockUser.email,
        sub: mockUser.id,
        role: mockUser.role,
      });
    });
  });
});


