import { NotFoundException } from '@nestjs/common';
import { BotifyConversationsService } from './botify-conversations.service';
import { PrismaService } from '../prisma.service';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const BOT_A = '00000000-0000-4000-8000-000000000001';
const CONV_A = '00000000-0000-4000-8000-0000000000aa';

describe('BotifyConversationsService — tenant isolation', () => {
  let service: BotifyConversationsService;
  let prisma: {
    botifyBot: { findFirst: jest.Mock; update: jest.Mock };
    botifyConversation: { findFirst: jest.Mock; upsert: jest.Mock };
  };
  const whatsappCloud = { sendTextMessage: jest.fn() };
  const channelConfigService = {
    parseChannelConfig: jest.fn().mockReturnValue({}),
    toStorageJson: jest.fn().mockReturnValue({}),
    isConnected: jest.fn().mockReturnValue(false),
    lineHealth: jest.fn().mockReturnValue('disconnected'),
  };

  beforeEach(() => {
    prisma = {
      botifyBot: { findFirst: jest.fn(), update: jest.fn() },
      botifyConversation: { findFirst: jest.fn(), upsert: jest.fn() },
    };
    service = new BotifyConversationsService(
      prisma as unknown as PrismaService,
      whatsappCloud as never,
      channelConfigService as never,
    );
  });

  it('resolveConversation scopes bot to tenant', async () => {
    prisma.botifyBot.findFirst.mockResolvedValueOnce({ id: BOT_A, tenantId: TENANT_A });
    prisma.botifyConversation.upsert.mockResolvedValueOnce({
      id: CONV_A,
      tenantId: TENANT_A,
      botId: BOT_A,
      contactPhone: '+5511999990000',
      contactName: 'Lead',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.resolveConversation(TENANT_A, {
      botId: BOT_A,
      contactPhone: '+5511999990000',
      contactName: 'Lead',
    });

    expect(result.id).toBe(CONV_A);
    expect(prisma.botifyBot.findFirst).toHaveBeenCalledWith({
      where: { id: BOT_A, tenantId: TENANT_A },
    });
  });

  it('throws when bot is not in tenant', async () => {
    prisma.botifyBot.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.resolveConversation(TENANT_B, {
        botId: BOT_A,
        contactPhone: '+5511999990000',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertConversationOwned rejects cross-tenant', async () => {
    prisma.botifyConversation.findFirst.mockResolvedValueOnce(null);

    await expect(service.assertConversationOwned(TENANT_B, CONV_A)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.botifyConversation.findFirst).toHaveBeenCalledWith({
      where: { id: CONV_A, tenantId: TENANT_B },
    });
  });
});
