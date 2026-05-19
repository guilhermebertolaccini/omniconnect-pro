# Botify — Fase 1 (só config operacional Omni)

Objetivo da **Fase 1**: deixar documentado e repetível o mínimo para **segredos internos** (`BOTIFY_INTERNAL_SYNC_SECRET`) e **flags de origem** (`BOTIFY_FLOW_SOURCE` / `VITE_BOTIFY_DATA_SOURCE`) alinhados ao [ADR-0002](../adr/ADR-0002-botify-wordpress-to-backend-cutover.md) e à secção 6 do [plano Sprint 6](./sprint-6-botify-maturity-plan.md), **sem** fechar ainda o piloto de produto ([`pilot-flow-lead-to-recovery.md`](./pilot-flow-lead-to-recovery.md)).

**Não faz parte da Fase 1:** aceite binário completo do piloto (critérios A1–A8), runbook ponta-a-ponta, telas CRM/SAA — ver [`pilot-flow-lead-to-recovery.md`](./pilot-flow-lead-to-recovery.md). Os campos mínimos de `data` para **`botify.handoff.created`** estão documentados na **§3.4** desse arquivo (apoio ao cutover/handoff).

---

## 1. Postgres local (raiz do monorepo)

Se usas `docker compose` na **raiz** do repositório (`docker-compose.yml`), a base é **`omniconnect`**, user **`dev`**, password **`dev`**.

No **`apps/omniconnect-backend/.env`** (ficheiro local, nunca commit):

```bash
DATABASE_URL="postgresql://dev:dev@localhost:5432/omniconnect?schema=public"
```

O ficheiro **`.env.example`** do backend espelha este padrão como comentário opcional; mantém também o URL legado `vend` para quem ainda usa outro compose.

---

## 2. Gerar `BOTIFY_INTERNAL_SYNC_SECRET` (dev)

1. Gera um valor aleatório (mínimo recomendado 32 caracteres), **só na tua máquina**:
   ```bash
   openssl rand -hex 32
   ```
2. Coloca **o mesmo valor** em:
   - `apps/omniconnect-backend/.env` → `BOTIFY_INTERNAL_SYNC_SECRET="..."`  
   - `apps/botify/wordpress-plugin/botflow-manager/microservice/.env` → `BOTIFY_INTERNAL_SYNC_SECRET=...`  

**Nunca** commits estes ficheiros nem colas o segredo em tickets públicos.

Este segredo protege `GET /botify/internal/flows/:flowId/runtime-config` (header `Authorization: Bearer …` + `X-Omni-Tenant-Id`).

---

## 3. Tenant UUID para o microserviço (`omniconnect` / `dual`)

Quando `BOTIFY_FLOW_SOURCE` for **`omniconnect`** ou **`dual`**, o microserviço precisa do tenant cujos fluxos vão ser lidos:

- `OMNICONNECT_BOTIFY_TENANT_ID=<id do Tenant no Postgres>`

Este valor deve ser exatamente o `Tenant.id` em Prisma (UUID ou slug). O seed usa `default-tenant` — é válido e alinhado com `GET /botify/internal/…` (`X-Omni-Tenant-Id`). Confirma com:
```sql
SELECT id, name FROM "Tenant" LIMIT 10;
```

---

## 4. Flags por componente

| Onde | Variável | Default seguro (Fase 1) | Quando mudar |
|------|----------|-------------------------|--------------|
| Microserviço Botify | `BOTIFY_FLOW_SOURCE` | `wordpress` | `omniconnect` ou `dual` quando fluxos forem lidos do Nest |
| Microserviço | `OMNICONNECT_BACKEND_URL` | *(vazio)* | URL base do backend, ex. `http://localhost:3000` |
| Vite Botify | `VITE_BOTIFY_DATA_SOURCE` | `wordpress` *(ou omitir)* | `omniconnect` / `dual` quando o editor usar JWT + API Nest |

Com `wordpress` em ambos os lados, **não** precisas de secret interno nem de `OMNICONNECT_BOTIFY_TENANT_ID` para o grafo (continuas a precisar do bridge HMAC para handoff se usares Omni).

---

## 5. Variáveis relacionadas (handoff — fora do grafo)

Handoff continua em `POST /webhooks/botify` com HMAC, conforme [`docs/operations/botify-omniconnect-bridge.md`](../operations/botify-omniconnect-bridge.md):

- `OMNICONNECT_API_URL`
- `OMNICONNECT_BOT_BRIDGE_CONNECTION_ID`
- `OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET`

Isto é **independente** do `BOTIFY_INTERNAL_SYNC_SECRET` (são canais diferentes).

---

## 6. Checklist Fase 1 (aceite)

- [ ] `.env` do backend com `DATABASE_URL` compatível com o teu Docker/local.
- [ ] `BOTIFY_INTERNAL_SYNC_SECRET` igual no backend e no microserviço **se** fores usar `omniconnect` ou `dual` no microserviço.
- [ ] `BOTIFY_FLOW_SOURCE` e `VITE_BOTIFY_DATA_SOURCE` definidos com intenção (default `wordpress` ok).
- [ ] `pnpm prisma migrate deploy` (ou `migrate dev`) aplicado no backend.
- [ ] Smoke: backend `GET /health` inclui `botifyInternalSync.configured`; microserviço `GET /health` inclui `botifyFlow.flowSource` / `botifyFlow.omniconnectRuntimeConfigured` (sem valores de segredo).
- [ ] Opcional seguinte — **Fase 2**: [`docs/migration/botify-phase2-operational-validation.md`](./botify-phase2-operational-validation.md) (migrações + curl runtime interno).

---

## Ver também

- `docs/migration/sprint-6-botify-maturity-plan.md`
- `docs/migration/botify-phase2-operational-validation.md`
- `docs/migration/06-next-actions.md`
- `docs/operations/botify-omniconnect-bridge.md`
