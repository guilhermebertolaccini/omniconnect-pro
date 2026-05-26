import { JwtService } from '@nestjs/jwt';
import { CrmGateway } from './crm.gateway';
import { CrmRealtimeService } from './crm-realtime.service';

describe('CrmGateway', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let jwtMock: any;
  let prismaMock: any;
  let realtime: CrmRealtimeService;
  let gateway: CrmGateway;
  let serverMock: any;

  beforeEach(() => {
    jwtMock = { verify: jest.fn() };
    prismaMock = {
      user: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === 1
            ? { id: 1, role: 'admin', tenantId: 'tenant-a' }
            : where.id === 7
              ? { id: 7, role: 'operator', tenantId: 'tenant-a' }
              : null,
        ),
      },
      userTenant: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.userId === 7 ? { role: 'broker' } : null,
        ),
      },
    };
    realtime = new CrmRealtimeService();
    gateway = new CrmGateway(
      jwtMock as unknown as JwtService,
      prismaMock,
      realtime,
    );
    serverMock = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    };
    (gateway as any).server = serverMock;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('onModuleInit wires itself to the realtime service', () => {
    gateway.onModuleInit();
    realtime.emitToTenant('tenant-a', 'crm.test', { ok: true });
    expect(serverMock.to).toHaveBeenCalledWith('crm:tenant-a');
  });

  it('handleConnection disconnects when token is missing', async () => {
    const client: any = {
      id: 'c1',
      handshake: { auth: {}, headers: {} },
      disconnect: jest.fn(),
      join: jest.fn(),
      data: {},
    };
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('handleConnection disconnects when JWT verify fails', async () => {
    jwtMock.verify.mockImplementation(() => {
      throw new Error('bad token');
    });
    const client: any = {
      id: 'c2',
      handshake: { auth: { token: 'bad' }, headers: {} },
      disconnect: jest.fn(),
      join: jest.fn(),
      data: {},
    };
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('handleConnection joins tenant room for admin', async () => {
    jwtMock.verify.mockReturnValue({ sub: 1, tenantId: 'tenant-a' });
    const client: any = {
      id: 'c3',
      handshake: { auth: { token: 'good' }, headers: {} },
      disconnect: jest.fn(),
      join: jest.fn(),
      data: {},
    };
    await gateway.handleConnection(client);
    expect(client.join).toHaveBeenCalledWith('crm:tenant-a');
    // admin não entra na sala de broker
    expect(client.join).not.toHaveBeenCalledWith(
      expect.stringContaining(':broker:'),
    );
  });

  it('handleConnection joins broker-specific room when role=broker', async () => {
    jwtMock.verify.mockReturnValue({ sub: 7, tenantId: 'tenant-a' });
    const client: any = {
      id: 'c4',
      handshake: {
        auth: {},
        headers: { authorization: 'Bearer good' },
      },
      disconnect: jest.fn(),
      join: jest.fn(),
      data: {},
    };
    await gateway.handleConnection(client);
    expect(client.join).toHaveBeenCalledWith('crm:tenant-a');
    expect(client.join).toHaveBeenCalledWith('crm:tenant-a:broker:7');
  });

  it('handleConnection disconnects when tenant cannot be resolved', async () => {
    jwtMock.verify.mockReturnValue({ sub: 999 });
    const client: any = {
      id: 'c5',
      handshake: { auth: { token: 'good' }, headers: {} },
      disconnect: jest.fn(),
      join: jest.fn(),
      data: {},
    };
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('handleConnection rejects missing membership in production', async () => {
    process.env.NODE_ENV = 'production';
    jwtMock.verify.mockReturnValue({ sub: 1, tenantId: 'tenant-a' });
    const client: any = {
      id: 'c6',
      handshake: { auth: { token: 'good' }, headers: {} },
      disconnect: jest.fn(),
      join: jest.fn(),
      data: {},
    };

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('handleConnection rejects an inactive tenant membership', async () => {
    jwtMock.verify.mockReturnValue({ sub: 7, tenantId: 'tenant-a' });
    prismaMock.userTenant.findFirst.mockResolvedValueOnce({
      role: 'broker',
      tenant: { isActive: false },
    });
    const client: any = {
      id: 'c7',
      handshake: { auth: { token: 'good' }, headers: {} },
      disconnect: jest.fn(),
      join: jest.fn(),
      data: {},
    };

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('emitToTenant targets crm:{tenantId} room', () => {
    gateway.emitToTenant('tenant-a', 'crm.lead.updated', { id: 'l1' });
    expect(serverMock.to).toHaveBeenCalledWith('crm:tenant-a');
  });

  it('emitToBroker targets crm:{tenantId}:broker:{userId} room', () => {
    gateway.emitToBroker('tenant-a', 42, 'crm.signature.updated', { ok: true });
    expect(serverMock.to).toHaveBeenCalledWith('crm:tenant-a:broker:42');
  });
});
