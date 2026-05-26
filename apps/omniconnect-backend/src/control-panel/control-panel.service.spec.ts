import { ControlPanelService } from './control-panel.service';

describe('ControlPanelService tenant isolation', () => {
  let prisma: any;
  let cache: any;
  let service: ControlPanelService;

  beforeEach(() => {
    prisma = {
      controlPanel: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      contact: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      contactRepescagem: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    cache = {
      getOrSet: jest.fn(async (_key: string, loader: () => Promise<unknown>) => loader()),
      del: jest.fn(),
    };
    service = new ControlPanelService(prisma, cache);
  });

  it('keys configuration cache and query by tenant', async () => {
    await service.findOne('tenant-a', 3);

    expect(cache.getOrSet).toHaveBeenCalledWith(
      'control-panel:tenant-a:3',
      expect.any(Function),
      expect.any(Number),
    );
    expect(prisma.controlPanel.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', segmentId: 3 },
    });
  });

  it('checks CPC only against contacts from the active tenant', async () => {
    await service.canContactCPC('tenant-b', '5511999999999');

    expect(prisma.contact.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-b', phone: '5511999999999' },
    });
  });

  it('resets repescagem only inside the active tenant', async () => {
    await service.registerClientResponse('tenant-a', '5511888888888');

    expect(prisma.contactRepescagem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', contactPhone: '5511888888888' },
      }),
    );
  });
});
