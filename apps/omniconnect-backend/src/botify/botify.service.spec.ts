import { NotFoundException } from '@nestjs/common';
import { BotifyService } from './botify.service';
import { PrismaService } from '../prisma.service';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const FLOW_A = 'flow-a';

describe('BotifyService — tenant isolation', () => {
  let service: BotifyService;
  let prisma: {
    botifyFlow: { findFirst: jest.Mock };
    botifyBot: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      botifyFlow: { findFirst: jest.fn() },
      botifyBot: { findFirst: jest.fn() },
    };
    const channelConfigService = {
      parseChannelConfig: jest.fn().mockReturnValue({}),
      lineHealth: jest.fn().mockReturnValue('disconnected'),
    };
    const systemEvents = { logEvent: jest.fn() };
    service = new BotifyService(
      prisma as unknown as PrismaService,
      channelConfigService as never,
      systemEvents as never,
    );
  });

  it('scopes assertFlowOwned to tenantId', async () => {
    prisma.botifyFlow.findFirst.mockResolvedValueOnce({
      id: FLOW_A,
      tenantId: TENANT_A,
      botId: 'b1',
      name: 'F',
      triggerKeyword: '',
      draftGraph: { nodes: [] },
      publishedGraph: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(service.assertFlowOwned(TENANT_A, FLOW_A)).resolves.toBeDefined();
    expect(prisma.botifyFlow.findFirst).toHaveBeenCalledWith({
      where: { id: FLOW_A, tenantId: TENANT_A },
    });
  });

  it('throws when flow belongs to another tenant', async () => {
    prisma.botifyFlow.findFirst.mockResolvedValueOnce(null);

    await expect(service.assertFlowOwned(TENANT_B, FLOW_A)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.botifyFlow.findFirst).toHaveBeenCalledWith({
      where: { id: FLOW_A, tenantId: TENANT_B },
    });
  });
});
