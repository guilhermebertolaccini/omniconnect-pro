import { HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitingService } from './rate-limiting.service';

describe('RateLimitingService webhook limits', () => {
  let service: RateLimitingService;

  beforeEach(() => {
    service = new RateLimitingService({} as any);
  });

  it('allows requests up to the configured window limit', () => {
    expect(() =>
      service.assertWebhookAllowed('bridge:crm:conn-1', {
        maxRequests: 2,
        windowMs: 60_000,
      }),
    ).not.toThrow();
    expect(() =>
      service.assertWebhookAllowed('bridge:crm:conn-1', {
        maxRequests: 2,
        windowMs: 60_000,
      }),
    ).not.toThrow();
  });

  it('blocks requests over the configured window limit per key', () => {
    service.assertWebhookAllowed('bridge:crm:conn-1', {
      maxRequests: 1,
      windowMs: 60_000,
    });
    expect(() =>
      service.assertWebhookAllowed('bridge:crm:conn-1', {
        maxRequests: 1,
        windowMs: 60_000,
      }),
    ).toThrow(HttpException);
    try {
      service.assertWebhookAllowed('bridge:crm:conn-1', {
        maxRequests: 1,
        windowMs: 60_000,
      });
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it('isolates counters by provider/integration key', () => {
    service.assertWebhookAllowed('bridge:crm:conn-1', {
      maxRequests: 1,
      windowMs: 60_000,
    });
    expect(() =>
      service.assertWebhookAllowed('bridge:ads:conn-1', {
        maxRequests: 1,
        windowMs: 60_000,
      }),
    ).not.toThrow();
  });
});
