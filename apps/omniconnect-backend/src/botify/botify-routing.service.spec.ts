import { NotFoundException } from '@nestjs/common';
import { BotifyRoutingService } from './botify-routing.service';
import { BotifyChannelConfigService } from './botify-channel-config.service';

const TENANT = 'tenant-a';
const BOT_ID = '00000000-0000-4000-8000-000000000001';

describe('BotifyRoutingService', () => {
  const channelConfig = {
    parseChannelConfig: jest.fn(),
  } as unknown as BotifyChannelConfigService;

  let prisma: { botifyBot: { findMany: jest.Mock; findFirst: jest.Mock } };
  let service: BotifyRoutingService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      botifyBot: { findMany: jest.fn(), findFirst: jest.fn() },
    };
    service = new BotifyRoutingService(
      prisma as never,
      channelConfig,
    );
  });

  it('resolves Meta account by metaWabaAccountId within tenant', async () => {
    prisma.botifyBot.findMany.mockResolvedValueOnce([
      {
        id: BOT_ID,
        channelConfig: { metaWabaAccountId: 'waba-123', defaultFlowId: 'flow-1' },
      },
    ]);
    (channelConfig.parseChannelConfig as jest.Mock).mockReturnValue({
      metaWabaAccountId: 'waba-123',
      defaultFlowId: 'flow-1',
    });

    const result = await service.resolveMetaAccount(TENANT, 'waba-123');
    expect(result).toEqual({ botId: BOT_ID, flowId: 'flow-1' });
    expect(prisma.botifyBot.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, isActive: true },
      select: { id: true, channelConfig: true },
    });
  });

  it('throws when Meta account is unknown', async () => {
    prisma.botifyBot.findMany.mockResolvedValueOnce([]);
    await expect(service.resolveMetaAccount(TENANT, 'unknown')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects wrong Evolution api key when configured', async () => {
    prisma.botifyBot.findMany.mockResolvedValueOnce([
      { id: BOT_ID, channelConfig: { evolutionInstance: 'inst-1' } },
    ]);
    (channelConfig.parseChannelConfig as jest.Mock)
      .mockReturnValueOnce({ evolutionInstance: 'inst-1', defaultFlowId: 'f1' })
      .mockReturnValueOnce({ evolutionInstance: 'inst-1', evolutionApiKey: 'secret-key' });
    prisma.botifyBot.findFirst.mockResolvedValueOnce({
      id: BOT_ID,
      channelConfig: {},
    });

    await expect(
      service.validateEvolutionApiKey(TENANT, 'inst-1', 'wrong'),
    ).resolves.toBe(false);
  });

  it('accepts matching Evolution api key', async () => {
    prisma.botifyBot.findMany.mockResolvedValueOnce([
      { id: BOT_ID, channelConfig: { evolutionInstance: 'inst-1' } },
    ]);
    (channelConfig.parseChannelConfig as jest.Mock)
      .mockReturnValueOnce({ evolutionInstance: 'inst-1', defaultFlowId: 'f1' })
      .mockReturnValueOnce({ evolutionInstance: 'inst-1', evolutionApiKey: 'secret-key' });
    prisma.botifyBot.findFirst.mockResolvedValueOnce({
      id: BOT_ID,
      channelConfig: {},
    });

    await expect(
      service.validateEvolutionApiKey(TENANT, 'inst-1', 'secret-key'),
    ).resolves.toBe(true);
  });
});
