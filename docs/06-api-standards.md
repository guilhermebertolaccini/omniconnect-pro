# API Standards

## General rules

Toda API deve ser:

- **Tenant-aware** (resolver tenant do contexto autenticado)
- **Autenticada** (a menos que explicitamente pública)
- **Validada** com DTOs (`class-validator`)
- **Documentada** (Swagger auto-gerado a partir das anotações)
- **Paginada** em endpoints de listagem
- **Protegida** com `@Roles` apropriado
- **Rate-limited** quando sensível (auth, IA, webhooks, broadcasts)

## Response format

### Success (success body)

```json
{
  "data": { /* DTO ou array */ },
  "meta": { "page": 1, "pageSize": 25, "total": 142 }
}
```

`meta` é opcional para responses não-paginados (e.g. detalhe de 1 recurso).

### Error

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Lead not found",
    "details": { "leadId": "ckxyz..." }
  }
}
```

`code` é string-enum estável (use para i18n/UX):
- `VALIDATION_FAILED`
- `RESOURCE_NOT_FOUND`
- `RESOURCE_CONFLICT`
- `TENANT_FORBIDDEN`
- `INSUFFICIENT_PERMISSIONS`
- `AUTHENTICATION_REQUIRED`
- `RATE_LIMITED`
- `INTEGRATION_ERROR`
- `INTERNAL_ERROR` (genérico, sem stack trace)

**Nunca** expor stack trace ou query SQL na resposta.

## Pagination

### Offset (default)

```
GET /leads?page=0&pageSize=25
```

- `page` zero-indexed
- `pageSize` default 25, máximo 200

### Cursor (high-volume feeds)

Para `messages`, `events`, `notifications`:

```
GET /conversations/:id/messages?cursor=ckabc123&limit=50&direction=before
```

- `cursor` é o ID do último item conhecido
- `direction` é `before` (mais antigos) ou `after` (mais novos)

## Filtering

Filtros explícitos como query params:

```
GET /leads?status=qualified&source=whatsapp&assignedTo=user-123
```

DTOs validam cada filtro. Filtros desconhecidos → `VALIDATION_FAILED`.

## InsightAI — dashboard (Sprint 5)

Leitura agregada, sempre com `tenantId` do JWT (roles: `admin`, `supervisor`, `digital`):

| Método | Path | Notas |
| --- | --- | --- |
| `GET` | `/insight-ai/dashboard/summary` | `days` (1–365) *ou* par `from` + `to` (ISO 8601); `segment` opcional. Resposta: `period`, `periodDays`, `sampleCap` (2000), métricas agregadas. |
| `GET` | `/insight-ai/dashboard/usage` | Mesma janela; `status`: `success`, `failed` ou `all` (default `success`); `limit`/`offset` na lista de linhas; `byProvider` agrega tokens e custo. |
| `GET` | `/insight-ai/analyses` | Paginação `limit` (≤200) + `offset`; `from`/`to` opcionais (ambos obrigatórios se usar); `contactPhone`, `segment`. Corpo: `{ items, meta }`. |

`from` sem `to` (ou o inverso) → `400`.

## Sorting

```
GET /leads?sortBy=createdAt&sortDir=desc
```

Lista permitida de `sortBy` no DTO. Outros valores → `VALIDATION_FAILED`.

## Endpoint naming

Plural nouns, kebab-case:

```
GET    /leads                                   # listar
POST   /leads                                   # criar
GET    /leads/:id                               # detalhe
PATCH  /leads/:id                               # update parcial
PUT    /leads/:id                               # update total (raro)
DELETE /leads/:id                               # remover (soft default)

# Nested
GET    /conversations/:id/messages
POST   /conversations/:id/messages

# Action-style (RPC-ish, quando REST puro fica forçado)
POST   /insight-ai/conversations/:id/analyze
POST   /leads/:id/assign
POST   /campaigns/:id/launch

# Read-only aggregations
GET    /dashboards/executive-summary
GET    /dashboards/conversion-leakage
```

## DTO conventions

- Entrada: sempre DTO com decorators `class-validator` + `@ApiProperty`
- Saída: DTO explícito (mapper Prisma → response), **nunca** retornar entidade Prisma crua
- DTOs vão em `apps/omniconnect-backend/src/<module>/dto/`
- Tipos cross-module ou cross-app: em `packages/shared-types/`

## HTTP status codes

| Status | Quando |
|---|---|
| 200 | Sucesso (GET, PATCH, POST que retorna recurso) |
| 201 | Sucesso (POST que cria, com `Location` header) |
| 202 | Aceito para processamento async (queue) |
| 204 | Sucesso sem body (DELETE) |
| 400 | `VALIDATION_FAILED` — DTO inválido |
| 401 | `AUTHENTICATION_REQUIRED` |
| 403 | `INSUFFICIENT_PERMISSIONS` / `TENANT_FORBIDDEN` |
| 404 | `RESOURCE_NOT_FOUND` (também usado para cross-tenant — não revela existência) |
| 409 | `RESOURCE_CONFLICT` |
| 410 | Gone (recurso soft-deleted) |
| 422 | Validação semântica falhou (regra de negócio) |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` (sem detalhes) |
| 502/503/504 | Falha em integração externa |

## Webhooks (inbound)

Endpoints públicos que recebem de provedores externos (WhatsApp Cloud, Meta, etc.):

```typescript
@Post('webhooks/<provider>')
@HttpCode(200)
async receive(@Body() raw: unknown, @Headers() headers) {
  // 1. Verificar assinatura (provedor)
  // 2. Resolver tenantId da integração (NÃO do body)
  // 3. Verificar idempotência (provider:eventId)
  // 4. Enfileirar para processamento async
  // 5. Responder 200 imediatamente
}
```

- Sempre 200 (mesmo se falha de processamento — provedor retentaria)
- Idempotência por `Idempotency-Key` ou `provider:eventId`
- Payload size limit (10MB padrão)
- Rate limit por integração

## Idempotency

Header `Idempotency-Key` aceito em:
- `POST /campaigns/:id/launch`
- `POST /messages` (envio direto)
- `POST /billing/charges` (futuro)
- `POST /imports`
- Todos os webhooks (chave: `provider:eventId`)

Persistir mapeamento `key → response` por 24h. Mesma chave → mesma resposta.

## Versioning

Sem versão na URL (`/v1/leads`) **até precisar de breaking change**. Quando precisar:
- Adicionar `/v2/leads` em paralelo
- Deprecar `/v1` com header `Deprecation: <date>` + `Sunset: <date>`
- Comunicar 60 dias antes do sunset

## Documentation

- Swagger UI em `/api/docs` (apenas dev/staging)
- Cada controller tem `@ApiTags`, cada endpoint tem `@ApiOperation`
- DTOs com `@ApiProperty` (descrição + exemplo + enum)
- Endpoints que processam PII têm nota no `@ApiOperation`

## See also

- `.cursor/rules/12-api-standards.mdc`
- `02-architecture.md`
- `04-security.md`
