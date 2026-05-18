import { CrmRealtimeService } from './crm-realtime.service';

describe('CrmRealtimeService', () => {
  it('drops events silently when gateway is not registered', () => {
    const svc = new CrmRealtimeService();
    expect(() =>
      svc.emitToTenant('tenant-a', 'crm.lead.updated', { id: 'x' }),
    ).not.toThrow();
    expect(() => svc.emitToBroker('tenant-a', 1, 'x', {})).not.toThrow();
  });

  it('delegates to the registered gateway', () => {
    const gateway = {
      emitToTenant: jest.fn(),
      emitToBroker: jest.fn(),
    };
    const svc = new CrmRealtimeService();
    svc.setGateway(gateway);
    svc.emitToTenant('tenant-a', 'crm.lead.updated', { id: 'x' });
    svc.emitToBroker('tenant-a', 9, 'crm.commission.created.self', { id: 'c' });
    expect(gateway.emitToTenant).toHaveBeenCalledWith(
      'tenant-a',
      'crm.lead.updated',
      { id: 'x' },
    );
    expect(gateway.emitToBroker).toHaveBeenCalledWith(
      'tenant-a',
      9,
      'crm.commission.created.self',
      { id: 'c' },
    );
  });

  it('catches gateway errors and logs without throwing', () => {
    const gateway = {
      emitToTenant: jest.fn(() => {
        throw new Error('boom');
      }),
      emitToBroker: jest.fn(),
    };
    const svc = new CrmRealtimeService();
    svc.setGateway(gateway);
    expect(() =>
      svc.emitToTenant('tenant-a', 'crm.lead.updated', { id: 'x' }),
    ).not.toThrow();
  });
});
