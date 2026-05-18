# 06 — Próximas Ações

> Histórico das fases anteriores (Blocos A–F, Sprints 1.1 / 1.2) está em
> `docs/migration/archive/06-next-actions-historical.md`. Esta página
> mantém apenas o estado atual e o que vem a seguir.

## Estado atual

| Capacidade | Status |
|---|---|
| Monorepo (`pnpm` workspace) | ✅ |
| `omniconnect-backend` (NestJS + Prisma + Postgres + Bull) | ✅ |
| `omniconnect-frontend` (operação) | ✅ |
| `botify`, `crm-imobiliario`, `smart-ad-automator` no monorepo | ✅ |
| `packages/ai-contracts`, `packages/shared-types` | ✅ |
| Multi-tenancy (tenantId em models, services, jobs, JWT, API keys) | ✅ |
| Auth: JWT valida membership por tenant + roles por tenant | ✅ (Sprint 1.3 Bloco B) |
| Bridges com HMAC real + segredo criptografado em repouso (AES-256-GCM) | ✅ (Sprint 1.3 Bloco A) |
| Idempotency `(tenantId, provider, key)` | ✅ (Sprint 1.3 Bloco A) |
| InsightAI: fila Bull + `AIUsageLog` + `ModelPricing` + jobId determinístico | ✅ (Sprint 1.3 Bloco C) |
| PII redactor LGPD-grade (CPF/CNPJ/CEP/data/renda/contrato/endereço) | ✅ (Sprint 1.3 Bloco C) |
| Testes: 148 unit + 19 E2E (HTTP real) cobrindo isolation | ✅ |
| CI: workflow GitHub Actions (backend bloqueante, satélites não-bloqueantes) | ✅ |
| Docs core (`docs/01..09`) | ✅ |

## Sprint 1.3 — Hardening final pré-Sprint 2 ✅ CONCLUÍDA

Fechou as 4 arestas que separavam a fundação de "production-ready":

| Bloco | Resumo |
|---|---|
| **A — Bridges** | `IntegrationConnection.secretHash` → `webhookSecretEncrypted` (AES-256-GCM com `BridgeSecretCipher`, versionado `v1.<iv>.<tag>.<ct>`). `IntegrationEvent.idempotencyKey` agora é unique composto `(tenantId, provider, key)` — colisões cross-tenant não são mais silenciadas. |
| **B — Auth** | `JwtStrategy` valida `UserTenant.findUnique({ userId_tenantId })` a cada request. Em produção, sem membership → 401. `RolesGuard` lê `tenantRole` primeiro (UserTenant.role) com fallback `user.role`. |
| **C — InsightAI** | `getJobStatus` é estrito: job sem `tenantId` no payload é 404. `enqueueAnalyzeByPhone` passa `jobId` determinístico `iai:<sha256(...)>` com hour-bucket (dedup real, telefone nunca no Redis). `redactPII` agora cobre CPF, CNPJ, CEP, RG, datas, renda/salário, contrato/matrícula/processo/protocolo/reserva, e endereços (número mascarado, rua preservada). |
| **D — Tests + docs** | E2E novo de InsightAI: 6 casos provando que tenant A nunca lê job/análise de B via HTTP real. Limpeza desta doc; histórico antigo arquivado em `archive/`. |

**Métricas finais:**
- 148 testes unit + integration verdes / 17 suites
- 19 testes E2E HTTP (ContactsController + InsightAiController)
- `tsc --noEmit -p src/` 100% limpo

## Sprint 2 — Migração de backends CRM + SAA (próxima)

A fundação multi-tenant está sólida. A próxima sprint absorve os
back-ends do CRM Imobiliário e do Smart Ad Automator (hoje em Supabase)
para módulos no `omniconnect-backend`, em padrão Strangler Fig.

### Fase 2.1 — Discovery (1 sprint)
- [ ] Mapear schema Supabase do CRM (`leads`, `pipeline_stages`,
      `deals`, `proposals`, `visits`, `units`, `loss_reasons`).
- [ ] Mapear schema Supabase do SAA (`ad_accounts`, `campaigns`,
      `ad_sets`, `ads`, `creatives`, `pixel_events`, OAuth tokens).
- [ ] Listar Supabase Edge Functions e Triggers em uso por cada app.
- [ ] Inventariar uso de Supabase Auth nos dois frontends.

### Fase 2.2 — CRM backend (`real-estate-crm` module)
- [ ] Prisma models multi-tenant para `Lead`, `Deal`, `Pipeline`,
      `PipelineStage`, `Proposal`, `Visit`, `RealEstateUnit`,
      `LossReason`. Skill: `add-prisma-model-multitenant`.
- [ ] Controllers + services com `tenantId` obrigatório no contrato.
- [ ] Importer one-shot do Supabase via `pg_dump` + ETL para o novo
      schema (com mapeamento `supabase_org_id → tenantId`).
- [ ] Endpoint bridge para receber webhook do CRM Imobiliário enquanto
      o frontend ainda fala com Supabase (strangler fig).

### Fase 2.3 — SAA backend (`smart-ad-automator` module)
- [ ] Prisma models para `AdAccount`, `Campaign`, `AdSet`, `Ad`,
      `Creative`, `PixelEvent`, `OAuthCredential`.
- [ ] Refresh de OAuth tokens (Meta, Google Ads, TikTok Ads) via job
      Bull recorrente; credenciais criptografadas com
      `BridgeSecretCipher` (ou cipher dedicado).
- [ ] Importer one-shot Supabase → Prisma.
- [ ] Endpoints bridge enquanto frontend ainda usa Supabase.

### Fase 2.4 — Auth unification
- [ ] Decidir flow de migração de usuários (`Supabase Auth →
      omniconnect-backend JWT`).
- [ ] Frontend CRM passa a chamar `/auth/login` do backend.
- [ ] Frontend SAA idem.
- [ ] Deprecar dependência de `@supabase/supabase-js` nos dois
      frontends por feature flag, com rollback rápido.

### Fase 2.5 — Cleanup
- [ ] Remover Supabase do `crm-imobiliario` e `smart-ad-automator`
      depois de período de paralelo.
- [ ] Promover `crm-imobiliario` e `smart-ad-automator` a jobs
      bloqueantes no CI (matriz `frontends-satellite` esvazia).
- [ ] Atualizar `docs/02-architecture.md` removendo referências a
      Supabase como dependência ativa.

## Decisões abertas

- **OAuth token storage**: usar o mesmo `BridgeSecretCipher` ou criar
  cipher dedicado por classe de credencial? Provavelmente o mesmo, com
  rótulo distinto no log.
- **Importador**: ETL script Node + Prisma, ou função Postgres
  `INSERT INTO ... SELECT FROM dblink(...)`? Tendência: ETL Node por
  ser auditável e testável.
- **Cutover do Auth**: big-bang ou dual-write durante 1 sprint? Decidir
  após Fase 2.1 com base na quantidade de usuários ativos.

## Roadmap longo (depois da Sprint 2)

1. **Sprint 3** — Bridges processors reais (consumir `IntegrationEvent`
   e propagar para `Lead`, `Deal`, `Campaign`). Hoje só persistimos +
   enfileiramos; o processor concreto ainda é stub.
2. **Sprint 4** — InsightAI v2: multi-provider (Anthropic, Gemini)
   plug-in, dashboard com filtros, custo agregado por tenant.
3. **Sprint 5** — Botify: revisar segurança, alinhar ao mesmo padrão
   de bridges + ApiKeys que CRM/SAA estarão usando.
