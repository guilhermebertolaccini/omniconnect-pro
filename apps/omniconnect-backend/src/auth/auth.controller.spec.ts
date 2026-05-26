import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';

describe('AuthController', () => {
  it('returns only public identity fields using the tenant membership role', async () => {
    const controller = new AuthController(
      {} as AuthService,
      {} as RefreshTokenService,
    );

    const result = await controller.getMe({
      id: 1,
      name: 'User',
      email: 'user@example.com',
      password: 'must-not-leak',
      role: 'admin',
      tenantRole: 'operator',
      segment: 2,
      line: null,
      status: 'Online',
      oneToOneActive: true,
      tenantId: 'tenant-a',
    });

    expect(result).toEqual({
      id: 1,
      name: 'User',
      email: 'user@example.com',
      role: 'operator',
      segment: 2,
      line: null,
      status: 'Online',
      oneToOneActive: true,
      tenantId: 'tenant-a',
    });
    expect(result).not.toHaveProperty('password');
  });
});
