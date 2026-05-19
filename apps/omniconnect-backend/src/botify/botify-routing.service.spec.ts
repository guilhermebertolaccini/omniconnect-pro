import { NotFoundException } from '@nestjs/common';
import { BotifyRoutingService } from './botify-routing.service';
import { BotifyChannelConfigService } from './botify-channel-config.service';

const TENANT = 'tenant-a';
const BOT_ID = '00000000-0000-4000-8000-000000000001';

describe('BotifyRoutingService', () => {
  const channelConfig = {
    parseChannelConfig: jest.fn(),
  } as unknown as BotifyChannelConfigService;
  const metaAccounts = {
    validateEvolutionApiKey: jest.fn(),
  } as unknown as import('./botify-meta-accounts.service').BotifyMetaAccountsService;

  let prisma: {
    botifyBot: { findMany: jest.Mock; findFirst: jest.Mock };
    botifyMetaAccount: { findMany: jest.Mock; findFirst: jest.Mock };
  };
  let service: BotifyRoutingService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      botifyBot: { findMany: jest.fn(), findFirst: jest.fn() },
      botifyMetaAccount: { findMany: jest.fn(), findFirst: jest.fn() },
    };
    service = new BotifyRoutingService(
      prisma as never,
      channelConfig,
      metaAccounts,
    );
  });

  it('resolves Meta account from BotifyMetaAccount table', async () => {
    prisma.botifyMetaAccount.findMany.mockResolvedValueOnce([
      {
        id: 'meta-1',
        metaWabaAccountId: 'waba-123',
        businessManagerId: null,
        phoneNumberIds: [],
        defaultBotId: BOT_ID,
        defaultFlowId: 'flow-1',
      },
    ]);

    const result = await service.resolveMetaAccount(TENANT, 'waba-123');
    expect(result).toEqual({ botId: BOT_ID, flowId: 'flow-1' });
  });

  it('throws when Meta account is unknown', async () => {
    prisma.botifyMetaAccount.findMany.mockResolvedValueOnce([]);
    prisma.botifyBot.findMany.mockResolvedValueOnce([]);
    await expect(service.resolveMetaAccount(TENANT, 'unknown')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('validates Evolution via meta accounts service', async () => {
    (metaAccounts.validateEvolutionApiKey as jest.Mock).mockResolvedValueOnce(true);
    await expect(
      service.validateEvolutionApiKey(TENANT, 'inst-1', 'secret-key'),
    ).resolves.toBe(true);
  });
});
