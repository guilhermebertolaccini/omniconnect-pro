import { CrmEventProcessor } from './crm-event.processor';
import { IntegrationEventsService } from '../integration-events.service';
import { BridgeEventDispatcherService } from '../bridge-event-dispatcher.service';

describe('CrmEventProcessor', () => {
  let processor: CrmEventProcessor;
  let events: jest.Mocked<
    Pick<
      IntegrationEventsService,
      'getEventForProcessing' | 'markProcessed' | 'markFailed'
    >
  >;
  let dispatcher: jest.Mocked<Pick<BridgeEventDispatcherService, 'dispatch'>>;

  beforeEach(() => {
    events = {
      getEventForProcessing: jest.fn(),
      markProcessed: jest.fn(),
      markFailed: jest.fn(),
    };
    dispatcher = { dispatch: jest.fn() };
    processor = new CrmEventProcessor(
      events as unknown as IntegrationEventsService,
      dispatcher as unknown as BridgeEventDispatcherService,
    );
  });

  it('loads event with tenant + provider scope, dispatches, then marks processed', async () => {
    const event = {
      id: 'evt-1',
      tenantId: 'tenant-a',
      provider: 'crm' as const,
      status: 'received',
      payload: {},
    };
    events.getEventForProcessing.mockResolvedValue(event);
    await processor.handle({
      data: { eventId: 'evt-1', tenantId: 'tenant-a' },
    } as any);
    expect(events.getEventForProcessing).toHaveBeenCalledWith(
      'evt-1',
      'tenant-a',
      'crm',
    );
    expect(dispatcher.dispatch).toHaveBeenCalledWith(event, 'crm');
    expect(events.markProcessed).toHaveBeenCalledWith('evt-1', 'tenant-a');
  });

  it('marks failed with tenant scope when dispatch fails', async () => {
    events.getEventForProcessing.mockResolvedValue({
      id: 'evt-1',
      tenantId: 'tenant-a',
      provider: 'crm',
      status: 'received',
      payload: {},
    });
    dispatcher.dispatch.mockRejectedValue(new Error('invalid payload'));
    await expect(
      processor.handle({
        data: { eventId: 'evt-1', tenantId: 'tenant-a' },
      } as any),
    ).rejects.toThrow('invalid payload');
    expect(events.markFailed).toHaveBeenCalledWith(
      'evt-1',
      'tenant-a',
      expect.any(Error),
    );
  });
});
