# Security Standards

OmniconnectPRO handles commercial data, personal data and message histories. **Security is a product requirement, not optional.**

## Security baseline

Use sempre:

- Validação estrita via DTOs (`class-validator`) — `ValidationPipe` global já configurado em `main.ts` (`whitelist + forbidNonWhitelisted + transform`)
- Sanitização onde aplicável
- CORS allowlist estrito (sem `*` em produção) — configurado em `main.ts` via `CORS_ORIGINS`
- Rate limiting via módulo interno **`rate-limiting/`** do projeto (**não** `@nestjs/throttler`)
- RBAC via `JwtAuthGuard` + `RolesGuard` + `@Roles(Role.X)` (com `Role` do `@prisma/client`)
- Autorização por tenant
- Audit logs em ações sensíveis
- Tratamento estruturado de erros (sem stack trace na resposta)
- Logs estruturados via `winston` + `nest-winston` (módulo `logger/`)
- Métricas via `prom-client` (Prometheus)

**A adicionar (roadmap, não bloqueador):**

- **Helmet** — não instalado hoje no `taticaofc`. Adicionar quando conveniente.
- **HSTS** — configurar no edge (Cloudflare/proxy) ou via Helmet quando instalado.

## Authentication

- Hashing seguro de senha via **`argon2`** (já instalado em `taticaofc`; **não usar** bcrypt — manter consistência)
- Arquitetura **MFA-ready** (TOTP/WebAuthn — implementar quando contratos exigirem)
- Access tokens curtos (JWT 15min)
- Refresh tokens com **rotação** (verificar estratégia atual em `auth/strategies/`)
- Invalidação de sessão (revogação por user/tenant)
- Token de reset com expiração curta (15min)
- Proteção contra brute force (rate limit + lockout temporário) via módulo `rate-limiting/`
- **`JwtStrategy` recusa tokens sem `tenantId`** (ou com `default-tenant`) em `NODE_ENV=production`. Em dev/test esses valores ainda são aceitos por compatibilidade. Detalhe em `03-multitenancy.md`.

## Authorization

Todo endpoint **deve** validar:

1. Usuário autenticado (`JwtAuthGuard`)
2. Contexto de tenant resolvido
3. Papel adequado (`@Roles(...)`)
4. Permissão específica (se RBAC granular)
5. Ownership do recurso (recurso pertence ao tenant)

## Database security

Prefira **sempre** queries via Prisma ORM. Raw SQL apenas em casos excepcionais:

```typescript
// ✅ GOOD — parametrized
await prisma.$queryRaw`SELECT * FROM users WHERE email = ${email}`;

// ❌ BAD — concatenation
await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email='${email}'`);
```

Migrations: sempre via `prisma migrate dev`. Nunca SQL manual fora do Prisma.

## Secrets

**Nunca** commitar:
- API keys (OpenAI, WhatsApp, Meta, Google, TikTok)
- Tokens
- Senhas
- Chaves privadas
- Webhook secrets
- Database URLs

Usar:
- `.env` no desenvolvimento local (em `.gitignore`)
- Secret manager (Doppler, 1Password, AWS Secrets Manager) ou variáveis injetadas pelo provedor (Coolify, Vercel, Railway) em produção

Rotacionar secrets quando suspeita de comprometimento — sem cerimônia.

## Logging

**Não** logar:
- Senhas, tokens, API keys completas (mascarar: `sk-abc...***`)
- CPF, RG, documentos pessoais
- Conteúdo cru de mensagens (LGPD)
- Prompts de IA com PII

**Logar** (estruturado, JSON):
- `requestId`
- `tenantId`
- `actorId` (userId)
- `eventType`
- `errorCode`
- `integrationProvider`
- `jobId` / `jobStatus`
- `duration_ms`

## Dependency security

Antes de cada deploy:

```bash
pnpm audit                          # vulnerabilidades conhecidas
pnpm outdated                       # atualizações disponíveis
```

Evite pacotes:
- Abandonados (último commit > 12 meses)
- Sem testes
- Com vulnerabilidades não corrigidas
- Que dependem de C bindings frágeis (a menos que justificado)

Lockfile (`pnpm-lock.yaml`) **sempre commitado**.

## OWASP alignment

Use **OWASP Top 10** e **OWASP API Security Top 10** como checklists de revisão:

| OWASP API | O que checar |
|---|---|
| API1 — Broken Object Level Auth | Tenant isolation (ver `03-multitenancy.md`) |
| API2 — Broken Authentication | JWT, refresh rotation, lockout |
| API3 — Excessive Data Exposure | DTOs de resposta (sem `passwordHash`) |
| API4 — Lack of Rate Limiting | Módulo `rate-limiting/` interno em auth, IA, webhooks |
| API5 — Broken Function Level Auth | `@Roles` em todo endpoint |
| API6 — Mass Assignment | DTOs com whitelist explícita |
| API7 — Security Misconfiguration | CORS, Helmet (a adicionar), env handling |
| API8 — Injection | Prisma ORM, raw query parametrizada |
| API9 — Improper Inventory | Audit logs, lista de endpoints atualizada |
| API10 — Insufficient Logging | Logs estruturados sem secrets |

## PII / LGPD

Dados pessoais sensíveis (CPF, RG, financeiro, mensagens):

- **Minimizar** — coletar só o necessário
- **Mascarar em logs**
- **Redação** antes de enviar para LLM (ver `05-ai-governance.md`)
- **Consentimento explícito** para análise IA (flag por tenant: `tenant.aiConsent`)
- **DPA** com provedores externos (OpenAI já oferece, configurar account flag `no-training`)
- **Retenção** documentada (quanto tempo guardamos cada tipo)
- **Direito de acesso/exclusão** (suporte ao titular do dado)

## Webhook security

- Sempre verificar assinatura quando provedor suportar (WhatsApp, Meta, Stripe-like)
- Resolver tenant via credencial de integração, nunca do payload
- Idempotência: rejeitar duplicatas (chave: `provider:eventId`)
- Rate limit no endpoint público
- Payload size limit (evitar 100MB POST)
- Responder 200 imediatamente, processar async via fila

### HMAC sobre raw body (Sprint 1.1)

Os bridges externos (`/crm-bridge`, `/ads-bridge`, `/bot-bridge`) usam o middleware `RawBodyMiddleware` para preservar o buffer original da request antes do parse JSON. Sem isso, qualquer reformatação do body (espaços, ordem de chaves) quebra a assinatura.

```typescript
// bridge controller
@Post('webhook')
async receive(
  @Req() req: RawBodyRequest<Request>,
  @Headers('x-signature') signature: string,
  @Headers('x-integration-id') integrationId: string,
  @Headers('idempotency-key') idempotencyKey?: string,
) {
  return this.service.handleWebhook({
    rawBody: req.rawBody!,      // Buffer cru, intocado
    signature,
    integrationId,
    idempotencyKey,
  });
}

// service
verifyHmac(rawBody, signature, connection.secretHash); // timingSafeEqual
```

A função `verifyHmac` em `integration-events/bridge-helpers.ts`:

1. Computa `HMAC-SHA256(secretHash, rawBody)` em hex.
2. Compara via `crypto.timingSafeEqual` (resistente a timing attacks).
3. Falha duro com `UnauthorizedException` se comprimento ou conteúdo divergirem.

A função `assertActiveConnection`:

- Em **produção**: exige `IntegrationConnection` existente, com `provider` correto, `status === 'active'` e `tenant.isActive`. Caso contrário, `NotFoundException`.
- Em **dev/test**: retorna `null` e o service cai em `default-tenant` apenas para destravar a DX local.

### Idempotência (Sprint 1.1)

`IntegrationEvent.idempotencyKey` tem `@unique` global. O service:

- Usa o header `Idempotency-Key` quando presente.
- Fallback: SHA-256 do raw body.
- Em colisão, devolve o evento existente (`alreadyProcessed: true`) sem reprocessar.

Isso protege contra retries do provedor (Meta retenta até 24h em caso de timeout) e contra replays maliciosos com o mesmo payload.

## Production checklist

Antes do go-live:

- [ ] HTTPS obrigatório (HSTS header)
- [ ] Secrets em secret manager (não em código)
- [ ] Backups automáticos do Postgres (diário + retenção 30d mínimo)
- [ ] Logs centralizados
- [ ] Monitoring (latência, erro, queue depth)
- [ ] Health checks (`/health/live`, `/health/ready`)
- [ ] Migrations com plano de rollback
- [ ] Ambientes separados: dev, staging, production
- [ ] DR (Disaster Recovery) testado — restaurar backup em ambiente isolado
- [ ] Documentação de incident response

## Incident response

Quando algo acontecer:

1. Conter (revogar secret comprometido, isolar tenant afetado)
2. Avaliar impacto (que dados, quantos tenants, janela temporal)
3. Comunicar (DPO + cliente + autoridade se LGPD)
4. Corrigir + post-mortem
5. Atualizar runbook

## See also

- `.cursor/rules/02-security.mdc`
- `03-multitenancy.md`
- `05-ai-governance.md`
- skill `security-review`
