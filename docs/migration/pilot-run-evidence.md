# Piloto — registro de evidência da execução

Template para registrar evidência objetiva da execução do piloto
(`pilot-flow-lead-to-recovery.md` §7). Preencher **após** PR 7 estar
operacionalmente concluída (Coolify deployado + Meta configurado + smoke
real passado).

> Cada coluna abaixo é evidência verificável. Se algo estiver vazio,
> aquele item não é "pass" — não invente. A8 do piloto exige que outra
> pessoa que **não implementou** o fluxo consiga seguir os runbooks
> (`coolify-staging.md` + `meta-staging-setup.md`) e preencher esta página
> sozinha. Esse é o teste real.

---

## Contexto da run

| Campo | Valor |
|---|---|
| **Data/hora UTC** | `_____` (ISO 8601, ex.: `2026-05-21T14:30:00Z`) |
| **Pessoa que executou** | `_____` (nome completo) |
| **Função/papel** | `_____` (corretor / supervisor / dev / outro) |
| **Tenant piloto** | `Tenant.id = _____` (UUID) |
| **Origem da branch deployada** | `_____` (commit hash ou tag) |
| **Backend URL** | `https://api.staging._____` |
| **Hub URL** | `https://app.staging._____` |
| **Botify microservice URL** | `https://botify-api.staging._____` |
| **WABA ID** | `_____` |
| **Phone number ID (Meta)** | `_____` |
| **Pilot phone (real, ofuscado)** | `+55 11 99XXX-XXXX` |

## Pre-flight (`scripts/meta-staging-preflight.sh`)

```
Cole aqui a saída completa do script. Esperado: todos os checks ✓.
```

## Smoke real — uma mensagem inbound

| Item | Valor |
|---|---|
| Texto enviado | `_____` |
| Hora UTC do envio (telefone) | `_____` |
| Hora UTC do webhook chegando | `_____` (logs microservice) |
| Latência inbound→handoff | `___ ms` |
| `IntegrationEvent.id` | `_____` |
| `MessageQueue.id` | `_____` |
| `IntegrationEntityLink.externalId` | `botify:flow:_____:conv:_____:transfer` |

## Aceite A1–A8 (`pilot-flow-lead-to-recovery.md` §7)

### A1 — `ads.lead.created` cria lead/conversa rastreável

> Esta run de **smoke Meta** não testa A1 (que é o fluxo SAA→bridge). A1
> deve ser provado separadamente via `scripts/botify-handoff-validation.sh`
> adaptado para `provider=ads` ou via emit JWT do SAA frontend.

| Item | Resultado |
|---|---|
| Comando executado | `_____` |
| `IntegrationEvent` criado | `id=_____` / `status=processed` |
| `CrmLead` (ou equivalente) materializado | `id=_____` |
| `IntegrationEntityLink` presente | ✅ / ❌ |
| **Pass** | ✅ / ❌ |

### A2 — `botify.handoff.created` não duplica fila para mesmo `externalId`

| Item | Resultado |
|---|---|
| Primeira mensagem inbound | `IntegrationEvent.id = _____`, `alreadyProcessed=false` |
| Segunda mensagem (reenvio do mesmo telefone, mesmo `externalId`) | `IntegrationEvent.id = _____`, `alreadyProcessed=true` |
| `MessageQueue` count antes/depois | `n=___` → `n=___` (deve ser igual) |
| **Pass** | ✅ / ❌ |

### A3 — InsightAI persiste análise + `AIUsageLog` correto

| Item | Resultado |
|---|---|
| `ConversationAIAnalysis.id` | `_____` |
| `tenantId` registrado | `_____` (deve casar com o tenant piloto) |
| `contactPhone` | `_____` (E.164 ofuscado) |
| `modelProvider` | `_____` (openai / anthropic / google / heuristic) |
| `AIUsageLog.id` | `_____` |
| `AIUsageLog.tenantId` | `_____` |
| `AIUsageLog.estimatedCost` | `USD _____` |
| **Pass** | ✅ / ❌ |

### A4 — CRM mostra campos §4.2 em até 2 min após análise

| Item | Resultado |
|---|---|
| Análise criada (UTC) | `_____` |
| Bloco "Inteligência Comercial" visível no CRM (UTC) | `_____` |
| Latência | `___ s` (deve ser ≤ 120 s) |
| Campos visíveis (marcar): | |
| · resumo executivo | ✅ / ❌ |
| · `leadIntent` (chip colorido) | ✅ / ❌ |
| · `mainObjection` + top 2 | ✅ / ❌ |
| · `qualificationScore` (barra) | ✅ / ❌ |
| · `nextBestAction` (CTA) | ✅ / ❌ |
| · evidence top 3 (colapsável) | ✅ / ❌ |
| · provider + freshness no rodapé | ✅ / ❌ |
| · botões: criar follow-up / marcar revisada / atribuir corretor | ✅ / ❌ |
| **Pass** | ✅ / ❌ |

### A5 — Lista "Recuperáveis" aplica a regra §4.2.1

| Item | Resultado |
|---|---|
| Endpoint `GET /crm/leads?filter=recoverable` retorna o lead | ✅ / ❌ |
| Aba "Recuperáveis" no CRM frontend lista o caso | ✅ / ❌ |
| Regra batida (uma das opções): `lostOpportunity=true` / `risk ∈ {alto, critico}` / `nextBestAction` recovery pattern | `_____` |
| Lead NÃO está em status `sold/signed/closed_won` | ✅ |
| Contact NÃO está em blocklist | ✅ |
| **Pass** | ✅ / ❌ |

### A6 — Hub `/executive` Pilot Funnel mostra a métrica

| Item | Antes | Depois |
|---|---|---|
| Leads ingeridos | `___` | `___` |
| Conversas criadas | `___` | `___` |
| Handoffs Botify | `___` | `___ (+1)` |
| Análises IA | `___` | `___ (+1)` |
| Recuperáveis | `___` | `___` |
| Sinais de perda/abandono | `___` | `___` |

| Item | Resultado |
|---|---|
| Endpoint `GET /dashboards/pilot-overview` retorna delta esperado | ✅ / ❌ |
| Card "Pilot Funnel" no Hub `/executive` reflete as novas contagens | ✅ / ❌ |
| **Pass** | ✅ / ❌ |

### A7 — Sem leitura cross-tenant

| Item | Resultado |
|---|---|
| Login com tenant secundário (`Tenant.id = _____`) | ✅ |
| Hub `/executive` desse tenant NÃO mostra contagens do piloto | ✅ / ❌ |
| Hub `/insightai` desse tenant NÃO lista a análise do piloto | ✅ / ❌ |
| `GET /dashboards/pilot-overview` desse tenant não vaza | ✅ / ❌ |
| **Pass** | ✅ / ❌ |

### A8 — Outsider segue o runbook

| Item | Resultado |
|---|---|
| Pessoa designada | `_____` (deve ser DIFERENTE de quem implementou) |
| Runbooks usados (só estes): `coolify-staging.md`, `meta-staging-setup.md`, este arquivo | ✅ |
| Tempo até concluir (start → A6 verde) | `___ minutos` |
| Quantas vezes precisou perguntar ao dev original | `___` (alvo: 0) |
| Quaisquer ambiguidades que foram resolvidas no runbook depois | Listar abaixo |
| **Pass** | ✅ / ❌ |

#### Ajustes feitos no runbook após o A8

> Cada ajuste vira um PR pequeno em `docs/deployment/*`. Não deixe melhoria
> só na cabeça da pessoa.

- `_____`
- `_____`

## Captura de logs (sem PII)

Cole os campos abaixo extraídos dos logs estruturados — sem texto cru de
mensagens, sem CPF, sem telefone completo (mascarar 4 últimos dígitos).

### Microservice Botify (POST /webhooks/meta)

```
ts=_____  level=info  event=webhook_received  signature_ok=true  payloadSize=___
ts=_____  level=info  event=tenant_resolved  tenantId=_____  via=BotifyMetaAccount
ts=_____  level=info  event=flow_started  flowId=_____
ts=_____  level=info  event=transfer_emit  externalId=_____  hmac_ok=true
```

### Backend Omni (POST /webhooks/botify)

```
ts=_____  level=info  event=bridge_received  provider=bot  tenantId=_____  alreadyProcessed=false
ts=_____  level=info  event=integration_event_persisted  id=_____  status=received
ts=_____  level=info  event=message_queue_created  id=_____  contactPhoneMask=+55**** 
ts=_____  level=info  event=insight_ai_enqueued  jobId=_____  bucket=_____
ts=_____  level=info  event=insight_ai_completed  jobId=_____  durationMs=___  modelProvider=_____
```

## Screenshots

Salve com nomes determinísticos em `docs/migration/pilot-run-evidence/`
(crie a pasta no commit que fechar o piloto):

- `01-meta-developer-app.png` — dashboard do app Meta confirmando WABA + número subscrito.
- `02-meta-webhook-verified.png` — "Verify and save" verde em WhatsApp → Configuration.
- `03-coolify-services.png` — todas as apps Coolify deployed + healthcheck verde.
- `04-hub-login.png` — login Hub bem-sucedido (sem PII na tela).
- `05-hub-tenants.png` — lista de tenants em `/tenants/me` no Hub (mascarar nomes).
- `06-hub-executive-funnel-before.png` — Pilot Funnel card antes do smoke.
- `07-hub-executive-funnel-after.png` — Pilot Funnel card depois (deltas +1).
- `08-hub-insightai-analyses.png` — análise do caso piloto listada em `/insightai`.
- `09-crm-insight-block.png` — bloco "Inteligência Comercial" no detalhe do lead CRM.
- `10-crm-recoverable-tab.png` — aba "Recuperáveis" mostrando o lead.
- `11-cross-tenant-empty.png` — A7: outro tenant logado, sem leak.

## Veredito final

| ID | Pass | Notas |
|---|---|---|
| A1 | ✅ / ❌ | |
| A2 | ✅ / ❌ | |
| A3 | ✅ / ❌ | |
| A4 | ✅ / ❌ | |
| A5 | ✅ / ❌ | |
| A6 | ✅ / ❌ | |
| A7 | ✅ / ❌ | |
| A8 | ✅ / ❌ | |

**Resultado**: piloto **passou** / **falhou** / **passou com ressalvas**.

Se passou com ressalvas, abra issues numeradas em
`docs/migration/06-next-actions.md` (próxima sprint) com os ajustes
necessários.

## Próximos passos depois desta página fechada

- Atualizar `docs/migration/06-next-actions.md` marcando PR 7 ✅.
- Decidir promoção do app Meta para **Live** (App Review) — abrir ADR-0005
  ou similar antes; **não automático**.
- Decidir migração do número de teste para número da empresa — exige WhatsApp
  Business Verification (KYC).
- Promover Hub a job bloqueante no CI (ADR-0004 §5 — quando auth real +
  ≥1 página real consumida, ambas verdadeiras agora).

---

## Ver também

- `pilot-flow-lead-to-recovery.md` — o que estamos testando
- `../deployment/coolify-staging.md` — PR 6 (infra)
- `../deployment/meta-staging-setup.md` — PR 7-prep (Meta)
- `../adr/ADR-0003-hub-identity-and-roles.md`
- `../adr/ADR-0004-hub-into-monorepo.md`
- `06-next-actions.md`
