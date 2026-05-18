# Multi-Tenancy

## Principle

OmniconnectPRO supports multiple clients (tenants) safely. **Every tenant is isolated from every other tenant.**

Multi-tenancy is **not** something added later. It's the default for every model, query, endpoint, job and webhook.

## Tenant-owned entities

The following must always include `tenantId`:

- User membership (`UserTenant` join — um usuário pode pertencer a vários tenants com papéis distintos)
- `Lead`
- `Contact`
- `Conversation`
- `Message`
- `Campaign`
- `Channel connection`
- `BotFlow`
- `CRMDeal`
- `Proposal`
- `RealEstateUnit`
- `AIAnalysis`
- `Event`
- `AuditLog`
- `DashboardMetric` (se materializado)
- `Integration`
- `Webhook`
- `BillingUsage`

## Request context

Toda request autenticada resolve:

- `userId`
- `tenantId`
- `role` — usar os valores reais do enum `Role` em `@prisma/client`: `admin`, `operator`, `supervisor`, `ativador`, `digital`
- `permissions`

Acesso via decorator `@CurrentUser()` (em `common/decorators/current-user.decorator.ts`).

`tenantId` vem do JWT (após o usuário escolher workspace ativo, no retrofit multi-tenant). **Nunca** confiar em `tenantId` no body se ele pode ser derivado da autenticação.

### `JwtStrategy` em produção (Sprint 1.1)

A `JwtStrategy` recusa qualquer token que chegue **sem `tenantId`** ou com `tenantId === 'default-tenant'` quando `NODE_ENV === 'production'`. Em desenvolvimento e teste o valor `default-tenant` continua aceito por compatibilidade — apenas para o ambiente local.

```typescript
// apps/omniconnect-backend/src/auth/strategies/jwt.strategy.ts
const tenantId = payload.tenantId;
if (
  process.env.NODE_ENV === 'production' &&
  (!tenantId || tenantId === 'default-tenant')
) {
  throw new UnauthorizedException('Tenant not explicitly defined in production context');
}
return { ...user, tenantId: tenantId || 'default-tenant' };
```

### Helper `ensureTenant` (Sprint 1.1)

Controllers passam o `user` por `ensureTenant(user)` antes de delegar para o service. Isso centraliza a regra "sem tenant em produção" e elimina checks ad-hoc.

```typescript
// apps/omniconnect-backend/src/common/utils/tenant-context.ts
import { ensureTenant, withTenant, ensureJobTenant } from '../common/utils/tenant-context';

// Controller
@Get()
findAll(@CurrentUser() user: any) {
  return this.svc.findAll(ensureTenant(user));
}

// Service / dynamic filter builder
const where = withTenant(tenantId, baseFilter);
return this.prisma.lead.findMany({ where });

// Bull processor
@Process('analyze-conversation')
handle(job: Job<{ tenantId: string; conversationId: number }>) {
  const tenantId = ensureJobTenant(job.data); // mesma semântica, source = payload
  // ...
}
```

## Query rule

```typescript
// ❌ BAD
await prisma.lead.findMany();

// ❌ BAD — tenantId do body
await prisma.lead.findMany({ where: { tenantId: req.body.tenantId } });

// ✅ GOOD (idiomático no projeto)
@Get()
list(@CurrentUser() user) {
  return prisma.lead.findMany({ where: { tenantId: user.tenantId } });
}
```

## Cross-tenant access

Cross-tenant é **proibido** exceto para `admin` em operações de plataforma (suporte, billing). Quando autorizado, **sempre** auditado.

> Hoje o taticaofc tem 5 papéis (`admin`, `operator`, `supervisor`, `ativador`, `digital`) sem distinção formal entre "platform admin" e "tenant admin". Por escolha de produto, **mantemos esses 5 papéis** — `admin` cumpre o papel de operador maior. Cross-tenant fica restrito a `admin` com auditoria.

## Webhooks

Tenant resolvido a partir de **credencial de integração confiável**:

- ID da conexão de canal (registrada por tenant via `IntegrationConnection`)
- Token do provedor
- Webhook secret
- Mapeamento de número de telefone → tenant (resolvido via `App.tenantId` da `LinesStock` que recebeu o evento)
- API key

**Nunca** confiar em campo `tenantId`/`companyId`/`accountId` no payload — atacante controla.

### Bridges externos (CRM / Ads / Bot — Sprint 1.1)

Endpoints `/crm-bridge/webhook`, `/ads-bridge/webhook` e `/bot-bridge/webhook` exigem:

1. **`x-integration-id`** — identifica a `IntegrationConnection` ativa do tenant.
2. **`x-signature`** — HMAC-SHA256 do **raw body** assinado com `IntegrationConnection.secretHash`. Verificado com `crypto.timingSafeEqual`.
3. **`idempotency-key`** (opcional) — fallback determinístico: SHA-256 do raw body.

O service:

- Busca a connection pelo `integrationId`.
- Valida via `assertActiveConnection` (provider correto, status `active`, tenant ativo).
- Em `NODE_ENV=production`, valida HMAC sobre o raw body.
- Grava um `IntegrationEvent` (com `idempotencyKey` único) e enfileira no Bull para processamento assíncrono.

Em desenvolvimento, se a connection não existir, o service **registra um warning** e cai em `default-tenant` para não travar a DX local. Em produção, falha duro com `NotFoundException`.

### Webhooks Meta Cloud API / Evolution (Sprint 1.1)

Esses não passam por `IntegrationConnection` — vêm direto do provedor. A regra continua valendo: `tenantId` é resolvido por **lookup confiável no banco**:

```typescript
// apps/omniconnect-backend/src/webhooks/cloud-api-webhook.service.ts
const line = await prisma.linesStock.findFirst({ where: { numberId: phoneNumberId, oficial: true } });
const app = await prisma.app.findUnique({ where: { id: line.appId } });
const tenantId: string = app?.tenantId || 'default-tenant'; // App é trusted
```

`(line as any).app.tenantId` nunca depende de campos do payload do WhatsApp.

## Background jobs

Todo job BullMQ inclui `tenantId` no payload. Worker re-valida antes de qualquer escrita.

```typescript
await queue.add('analyze-conversation', { tenantId, conversationId });
// Worker:
async process(job: Job) {
  const { tenantId, conversationId } = job.data;
  const conv = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId } });
  if (!conv) throw new Error('Conversation not found for tenant');
}
```

## Dashboards

Toda agregação é **scopada por tenant**. Cross-tenant somente em views da plataforma (super_admin), auditadas.

## Multi-tenant retrofit (importante)

O `taticaofc` atual (que vira `apps/omniconnect-backend`) **não tem multi-tenancy implementado**. Adicionar é uma fase obrigatória da migração.

Plano resumido (detalhe em `migration/03-migration-plan.md`):

1. Criar model `Tenant` + tabela
2. Migration: adicionar `tenantId` em todas as ~15 tabelas operacionais
3. Criar Tenant "default" para dados legados (se houver produção)
4. Refatorar todos os queries existentes para passar `tenantId`
5. Refatorar `AuthModule` para resolver `tenantId` no JWT
6. Adicionar `JwtAuthGuard` em endpoints que ainda não têm
7. Bateria de testes de isolamento

## Testing

Cada módulo crítico **deve** incluir testes de isolamento:

- Tenant A não acessa Tenant B (read)
- Tenant A não atualiza Tenant B (write)
- Tenant A não deleta Tenant B (delete)
- Webhook de Tenant A não muta Tenant B
- Dashboard só agrega dados do tenant

### Cobertura atual (Sprint 1.1)

- `src/common/utils/tenant-context.spec.ts` — `ensureTenant` / `withTenant` / `ensureJobTenant`
- `src/auth/strategies/jwt.strategy.spec.ts` — bloqueio de `default-tenant` em produção
- `src/contacts/contacts.service.spec.ts` — todas as queries escopadas por `tenantId`
- `src/apps/apps.service.spec.ts` — uniqueness por tenant (mesmo nome de App em tenants distintos)
- `src/integration-events/bridge-helpers.spec.ts` — `verifyHmac` rejeita assinaturas forjadas, body tamperado e secret de outro tenant

Total: 50 testes verdes (`pnpm --filter omniconnect-backend run test`). Próximos blocos devem cobrir leads, conversations e dashboards quando esses módulos existirem.

## RBAC (Role-Based Access Control)

**Papéis canônicos = enum `Role` em `apps/omniconnect-backend/prisma/schema.prisma`**. Mantemos exatamente os 5 valores existentes no `taticaofc`:

| Papel | Escopo | Responsabilidades |
|---|---|---|
| `admin` | Plataforma + tenant | Configuração total, cross-tenant (auditado), billing |
| `supervisor` | 1 tenant | Gerencia equipe, configura fluxos, vê tudo do tenant |
| `operator` | 1 tenant | Atende conversas, edita seus contatos/leads |
| `ativador` | 1 tenant | Especialista em ativação / outbound / campanhas |
| `digital` | 1 tenant | Marketing digital, dashboards, IA |

> **Decisão de produto:** não introduzimos `platform_super_admin`, `tenant_owner`, `manager`, `seller`, `analyst`, `viewer` ou `integration_service`. Caso surja necessidade real (ex.: separar billing de operação), adicionar o valor ao enum em uma migration explícita e atualizar este doc.

> Service-to-service (bots, integrações) usa **API keys** dedicadas, não papel de usuário humano.

## See also

- `.cursor/rules/01-multitenancy.mdc`
- `04-security.md`
- skill `multitenancy-review`
