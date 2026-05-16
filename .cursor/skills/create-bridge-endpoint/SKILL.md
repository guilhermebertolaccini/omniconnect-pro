---
name: create-bridge-endpoint
description: >-
  Create a bridge endpoint in omniconnect-backend that sends or receives data
  to/from external apps (CRM Imobiliário, Smart Ad Automator, Botify) with
  proper auth, tenant resolution, idempotency, and event emission. Use when
  the user asks to integrate, connect, sync, or bridge OmniConnect with the
  CRM, the Ad platform, or Botify.
---

# Create Bridge Endpoint

Bridges are how `omniconnect-backend` talks to external apps in the monorepo (CRM, SAA, Botify) without sharing code/DB directly. Each bridge lives in its own module (`bot-bridge`, `crm-bridge`, `ads-bridge`).

## Direction matters

| Direction | Pattern |
|---|---|
| **Outbound** (OmniConnect → CRM/SAA/Botify) | HTTP client + signed payload + retry queue |
| **Inbound** (CRM/SAA/Botify → OmniConnect) | Webhook endpoint + signature + idempotency + queue |

Ask the user which direction first.

## Outbound bridge workflow

```
Task Progress:
- [ ] Step 1: Define payload DTO (use packages/shared-types if cross-app)
- [ ] Step 2: Create service method with signed request
- [ ] Step 3: Add retry policy via BullMQ queue
- [ ] Step 4: Emit event before send + after success/failure
- [ ] Step 5: Test with mocked HTTP
```

### Outbound template

```typescript
// apps/omniconnect-backend/src/crm-bridge/crm-bridge.service.ts
@Injectable()
export class CrmBridgeService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @InjectQueue('crm-bridge') private readonly queue: Queue,
    private readonly events: EventsService,
  ) {}

  async sendLeadAnalysis(tenantId: string, payload: LeadAnalysisPayload) {
    await this.queue.add('send-lead-analysis', { tenantId, payload }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      jobId: `${tenantId}:${payload.leadId}:${payload.analysisId}`,  // idempotency
    });
  }
}

// Worker
@Processor('crm-bridge')
export class CrmBridgeProcessor {
  @Process('send-lead-analysis')
  async handle(job: Job<{ tenantId: string; payload: LeadAnalysisPayload }>) {
    const { tenantId, payload } = job.data;
    const url = await this.resolveCrmUrl(tenantId);                // per-tenant URL
    const signature = sign(payload, this.config.get('CRM_BRIDGE_SECRET'));
    await this.http.post(url, payload, { headers: { 'X-Signature': signature } });
    await this.events.emit({ eventType: 'crm.lead_analysis_sent', tenantId, ... });
  }
}
```

## Inbound bridge workflow

```
Task Progress:
- [ ] Step 1: Define webhook DTO
- [ ] Step 2: Create webhook endpoint with signature verification
- [ ] Step 3: Resolve tenantId from trusted source (NOT the body)
- [ ] Step 4: Enqueue processing with idempotency key
- [ ] Step 5: Respond 200 immediately
- [ ] Step 6: Worker processes the payload
- [ ] Step 7: Tests for signature, idempotency, tenant resolution
```

### Inbound template

```typescript
@Controller('webhooks/ads')
export class AdsBridgeController {
  constructor(
    private readonly adsBridgeService: AdsBridgeService,
    @InjectQueue('ads-bridge') private readonly queue: Queue,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Body() raw: unknown,
    @Headers('x-signature') signature: string,
    @Headers('x-integration-id') integrationId: string,
  ) {
    this.adsBridgeService.verifySignature(raw, signature, integrationId);   // 🔒
    const tenantId = await this.adsBridgeService.resolveTenantFromIntegration(integrationId);

    const eventId = (raw as any).eventId;
    if (!eventId) throw new BadRequestException('Missing eventId');

    await this.queue.add('process', { tenantId, payload: raw }, {
      jobId: `${tenantId}:${eventId}`,                              // idempotency
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
    });

    return { received: true };
  }
}
```

## Security checklist (always)

- [ ] Signature verified before any DB write
- [ ] `tenantId` resolved from integration credentials, **never** from body
- [ ] Idempotency key set (provider event id)
- [ ] Rate limit on inbound (use internal `rate-limiting/` module — NOT `@nestjs/throttler`)
- [ ] Payload size limit (don't accept 100MB POST)
- [ ] PII not logged
- [ ] 200 response is independent of processing success (queue handles retry)

## Naming conventions

| External app | Bridge module | Outbound prefix | Inbound prefix |
|---|---|---|---|
| Botify | `bot-bridge` | `botify.handoff_sent` | `webhooks/botify` |
| CRM Imobiliário | `crm-bridge` | `crm.lead_pushed` | `webhooks/crm` |
| Smart Ad Automator | `ads-bridge` | `ads.lead_synced` | `webhooks/ads` |

## See also

- `.cursor/rules/12-api-standards.mdc` (webhook & idempotency)
- `.cursor/rules/13-events.mdc`
- `.cursor/rules/02-security.mdc`
- `docs/02-architecture.md` (event strategy + bridges)
