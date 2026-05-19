import { NotFoundException } from '@nestjs/common';
import { BotifyMetaAccountsService } from './botify-meta-accounts.service';
import { BotifyChannelConfigService } from './botify-channel-config.service';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const META_ID = '00000000-0000-4000-8000-000000000099';

describe('BotifyMetaAccountsService — tenant isolation', () => {
  const cipher = {
    encrypt: jest.fn((s: string) => `enc:${s}`),
    decrypt: jest.fn((s: string) => s.replace(/^enc:/, '')),
  };
  const channelConfigService = {
    parseChannelConfig: jest.fn().mockReturnValue({}),
  } as unknown as BotifyChannelConfigService;

  let prisma: {
    botifyMetaAccount: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    botifyBot: { findFirst: jest.Mock };
  };
  let service: BotifyMetaAccountsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      botifyMetaAccount: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      botifyBot: { findFirst: jest.fn() },
    };
    service = new BotifyMetaAccountsService(
      prisma as never,
      cipher as never,
      channelConfigService,
    );
  });

  it('get rejects cross-tenant', async () => {
    prisma.botifyMetaAccount.findFirst.mockResolvedValueOnce(null);
    await expect(service.get(TENANT_B, META_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.botifyMetaAccount.findFirst).toHaveBeenCalledWith({
      where: { id: META_ID, tenantId: TENANT_B },
    });
  });

  it('getCredentials only for own tenant', async () => {
    prisma.botifyMetaAccount.findFirst.mockResolvedValueOnce({
      id: META_ID,
      tenantId: TENANT_A,
      name: 'BM',
      businessManagerId: 'bm1',
      metaWabaAccountId: 'waba',
      accessTokenEnc: 'enc:token',
      webhookCallbackUrl: null,
      webhookVerifyToken: null,
      webhookEvents: null,
      phoneNumberIds: null,
      defaultBotId: null,
      defaultFlowId: null,
      evolutionInstance: null,
      evolutionApiKeyEnc: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const creds = await service.getCredentials(TENANT_A, META_ID);
    expect(creds.accessToken).toBe('token');
  });
});
