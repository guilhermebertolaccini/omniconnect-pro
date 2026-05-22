# Piloto — Fluxo referência: anúncio → conversa → IA → CRM → recuperação

Este documento define **um único fluxo de produto** que o OmniconnectPRO deve provar em ambiente controlado (staging ou piloto com cliente). Ele consolida decisões de jornada, contratos, telas mínimas, dados demo e **critérios de aceite** mensuráveis.

**Objetivo:** sair da percepção de “módulos integrados por backend” para **uma narrativa comercial verificável**: *campanha gera lead → atendimento e triagem → análise → CRM mostra inteligência e oportunidade recuperável → visão executiva mínima do vazamento*.

**Relação com outras docs:**

- Arquitetura macro: `docs/02-architecture.md`, visão: `docs/01-product-vision.md`, fases: `docs/09-roadmap.md`.
- Ponte técnica (webhooks, processors, `IntegrationEntityLink`): `docs/migration/sprint-4-bridge-processors.md`.
- Elevar Botify à paridade operacional: `docs/migration/sprint-6-botify-maturity-plan.md`.
- **Fase 1 (config env / segredos / flags, sem piloto de produto):** `docs/migration/botify-phase1-operational-setup.md`.
- **Fase 2 (migrações Sprint 6 + smoke cutover interno):** `docs/migration/botify-phase2-operational-validation.md`.
- Contratos de evento suportados hoje (validação): `apps/omniconnect-backend/src/integration-events/bridge-event-contract.ts`.
- Conexões e segredos: `docs/operations/integration-connections.md`.
- Tenancy Botify ↔ Omni (1:1 vs multi): `docs/adr/ADR-0001-botify-tenancy-model.md`.
- Operação “o que fazer agora” no monorepo: `docs/migration/06-next-actions.md`.

---

## 1. Escopo do piloto

### Incluído (MVP pilotável)

1. **Origem paga** registra lead no domínio Omni (via `ads.lead.created` ou fluxo equivalente acordado).
2. **Contato/conversa** existem no core operacional (OmniConnect) com `tenantId` correto.
3. **Triagem Botify** (mínimo viável): handoff gera `botify.handoff.created` e materializa fila/atribuição acordada no piloto.
4. **InsightAI** produz análise persistida (`ConversationAIAnalysis`) e uso em `AIUsageLog` para o mesmo tenant.
5. **CRM** exibe inteligência comercial derivada da análise (campos acordados abaixo) no detalhe do lead/deal **sem drift de tipos** (preferir `packages/ai-contracts`).
6. **Lista ou marcador** de oportunidade recuperável / “perdida com sinal de retomada” visível para o papel “corretor” ou “supervisor CRM”.
7. **Dashboard piloto**: uma visão que una origem (campanha), estágio e sinal de abandono/perda (pode ser página dedicada ou composição de telas existentes + export CSV simples).

### Fora do escopo do primeiro piloto (explícito)

- UI única “suíte” com design system compartilhado entre todos os apps (objetivo de **V1 comercial**, não obrigatório no dia 1 do piloto).
- Billing planos/Stripe, onboarding self-service público.
- Omnichannel além do canal acordado no piloto (ex.: só WhatsApp).
- Dashboard executivo CFO completo (CAC multi-fonte, snapshots Bull, PDF gerencial).

---

## 2. Jornada feliz (referência)

Ordem lógica aceita para o piloto (ajustar tempos com SLAs reais):

| # | Etapa | Sistema principal | Evidência esperada |
|---|--------|-------------------|---------------------|
| 1 | Campanha/disparo gera lead pago | SAA / Ads | Evento `ads.lead.created` processado; `CrmLead` ou entidade equivalente; `IntegrationEntityLink` |
| 2 | Lead entra na fila de conversa | OmniConnect | `Contact` / `Conversation` / mensagens com `tenantId` |
| 3 | Triagem automática (enxuto) | Botify | `botify.handoff.created`; sem duplicar fila para mesmo `externalId` |
| 4 | Corretor assume e conversa | OmniConnect + CRM | Atribuição visível; timeline coerente |
| 5 | InsightAI analisa | Backend InsightAI | Linha em `ConversationAIAnalysis`; custo em `AIUsageLog` (mensagens do **Omni** para o mesmo telefone; ver `docs/05-ai-governance.md` — Botify ↔ InsightAI; enqueue imediato opcional com `INSIGHT_AI_ON_BOTIFY_HANDOFF`) |
| 6 | CRM mostra insight | CRM frontend | Painel “Inteligência” ou seção equivalente acordada |
| 7 | Oportunidade recuperável | CRM | Lista ou smartlist com regra explícita (ex.: `lostOpportunity` + intent) |
| 8 | Visão macro | Dashboard piloto | Filtro por período + origem; indicador de abandono/perda |

---

## 3. Contratos de evento (ponte)

### 3.1 Entradas suportadas pelo dispatcher (hoje)

Validação central em `parseBridgeEventPayload` — tipos por `provider`:

| `provider` | `eventType` permitido |
|------------|------------------------|
| `crm` | `crm.lead.created`, `crm.lead.updated` |
| `ads` | `ads.lead.created` |
| `bot` | `botify.handoff.created` |

Envelope comum (corpo do webhook ou corpo normalizado pelo emissor JWT):

```json
{
  "eventType": "string",
  "externalId": "string",
  "occurredAt": "2026-05-18T12:00:00.000Z",
  "source": "opcional",
  "data": {}
}
```

**Regras:**

- `tenantId` **nunca** vem do `data` para autorização; vem de `IntegrationConnection` + JWT (emissor) ou verificação HMAC do webhook.
- Idempotência forte: `(tenantId, provider, idempotencyKey)` em `IntegrationEvent`.

### 3.2 Emissão a partir dos apps satélite

- **CRM / SAA (browser):** `POST /integrations/bridge/events` com JWT — ver `EmitBridgeEventDto` e `packages/api-client`.
- **Botify (servidor):** HMAC para `POST /webhooks/botify` — ver variáveis em `docs/migration/sprint-4-bridge-processors.md` (Bloco 5).

### 3.3 Mapeamento para entidades (dedupe)

- Tabela **`IntegrationEntityLink`**: `(tenantId, provider, externalId, entityType) → entityId`.
- Objetivo do piloto: para cada `externalId` do fluxo, existir **caminho verificável** do evento até lead/conversa/CRM sem duplicar filas.
- **Botify:** o handoff usa `externalId` estável `botify:flow:{flowKey}:conv:{conversationId}:transfer` (detalhes em `docs/operations/botify-omniconnect-bridge.md`).

### 3.4 Campos mínimos em `data` (matriz de implementação)

Matriz alinhada ao processador em `BridgeEventDispatcherService.createBotifyHandoff` e ao tipo `BotifyHandoffWebhookPayload` em `packages/shared-types/src/botify-bridge.ts`. Ajustes de contrato exigem PR no backend + atualização desta tabela.

#### `botify.handoff.created` — envelope (raiz do JSON)

| Campo | Obrigatório | Notas |
|--------|-------------|--------|
| `eventType` | Sim | Literal `botify.handoff.created`. |
| `externalId` | Sim | Estável e dedupe; padrão operacional `botify:flow:{flowKey}:conv:{conversationId}:transfer` — ver [`botify-omniconnect-bridge.md`](../operations/botify-omniconnect-bridge.md). |
| `occurredAt` | Sim | ISO-8601 (string). |
| `source` | Não | Metadado livre curto. |
| `data` | Sim | Objeto — ver tabela seguinte. |

#### `data` (nível raiz dentro do envelope)

| Campo | Obrigatório | Processamento / limites |
|--------|-------------|-------------------------|
| `phone` | **Sim** | Sem telefone o dispatcher **falha**. String máx. 40 após trim (E.164 recomendado). |
| `name` | Não | Fallback: `contactName`, depois `phone`. Máx. 255. |
| `contactName` | Não | Sinónimo de `name` (mesmo fallback). |
| `message` | Não | Default interno: `"Handoff solicitado pelo Botify"`. Máx. 2000. |
| `segment` | Não | Número (ou string numérica). |
| `leadSummary` | Não | Objeto; só campos abaixo são persistidos (whitelist). |

#### `data.leadSummary` (opcional, triagem rica)

| Campo | Máx. (chars) | Notas |
|--------|--------------|--------|
| `intent` | 80 | |
| `urgency` | 32 | |
| `budget` | 120 | |
| `region` | 120 | |
| `propertyInterest` | 255 | |
| `notes` | 500 | |
| `flowId` | 120 | |
| `flowName` | 120 | |
| `lastUserMessage` | 600 | |
| `lastAssistantReply` | 600 | |
| `collectedFields` | — | Objeto chave→string: até **15** chaves (máx. 60 cada), valores máx. **200** cada. |

#### Exemplo mínimo válido (corpo após verificação HMAC)

```json
{
  "eventType": "botify.handoff.created",
  "externalId": "botify:flow:demo:conv:42:transfer",
  "occurredAt": "2026-05-19T12:00:00.000Z",
  "source": "botify-microservice",
  "data": {
    "phone": "+5511999990000",
    "name": "Lead demo",
    "message": "Quero falar com corretor",
    "leadSummary": {
      "intent": "compra",
      "urgency": "hoje",
      "region": "Zona Sul"
    }
  }
}
```

Para **outros** `eventType` (`crm.*`, `ads.*`), esta matriz não aplica — ver DTOs e processors em `integration-events`.

---

## 4. InsightAI → CRM (superfície de produto) — DECISÕES FECHADAS

> Esta secção foi fechada em 2026-05-20 (PR 1 do Hub absorção, ver [ADR-0003](../adr/ADR-0003-hub-identity-and-roles.md) e [ADR-0004](../adr/ADR-0004-hub-into-monorepo.md)). Os placeholders anteriores (`A/B/C`, `X minutos`, "regra explícita no CRM") foram substituídos pelos valores normativos abaixo. Mudanças exigem PR + revisão dos critérios de aceite §7.

### 4.1 Gatilho — **política C com tetos de custo**

A análise InsightAI roda automaticamente após o handoff Botify quando houver contexto mínimo, e pode ser disparada manualmente pelos papéis autorizados.

**Gatilho automático:**

- Flag `INSIGHT_AI_ON_BOTIFY_HANDOFF=true` em `apps/omniconnect-backend/.env`.
- Após `botify.handoff.created` criar um `MessageQueue` **novo** (idempotência inalterada), o backend enfileira `analyze-conversation` com `jobId` determinístico (`iai:sha256(tenantId|phone|days|limit|segment|userId|hourBucket)`, ver `docs/05-ai-governance.md`).
- A primeira execução pode ver poucas mensagens (até o atendente atuar). O hour-bucket no `jobId` permite nova fila legítima depois.

**Gatilho manual:**

- `POST /insight-ai/analyze/:phone` (async, 202 + `jobId`) — papéis: `admin`, `supervisor`, `digital`.
- `POST /insight-ai/analyze/:phone?sync=true` — apenas `admin`, para debug / smoke.
- O Hub (`apps/omniconnect-hub`) pode acionar a mesma rota a partir do componente `InsightConversationAnalyzer` (também já presente no shell Lovable). Respeita os mesmos tetos.
- `broker` / corretor **não** dispara análise — apenas consome o resultado. Mantém o custo previsível.

**Tetos de custo (enforcement no enqueue):**

| Limite | Default | Fonte de verdade |
|---|---|---|
| Por lead / 24h (auto) | **1 análise** | `AIUsageLog` filtrado por `tenantId + conversationId + createdAt >= now()-24h` |
| Por tenant / dia (auto + manual) | **500 análises** | `AIUsageLog` filtrado por `tenantId + createdAt >= today` |
| Por tenant / minuto (rate) | **10 / min** | módulo interno `rate-limiting/` no controller |

Excedido → **429** com `code: RATE_LIMITED`. Fallback heurístico permanece sempre habilitado (sem custo LLM).

### 4.2 Campos visíveis — bloco "Inteligência Comercial" no CRM

Bloco fixo no topo do detalhe de lead/deal em `crm-imobiliario`, alimentado pela `ConversationAIAnalysis` mais recente para o telefone primário do lead, no mesmo tenant.

#### Para o papel `broker` (corretor)

| Campo | Fonte (Prisma) | Elemento UI |
|---|---|---|
| Resumo executivo | `summary` | Parágrafo (≤ 280 char no card; texto completo no expand) |
| `leadIntent` | `leadIntent` | Chip colorido (`frio` cinza, `qualificado` azul, `quente` laranja, `pronto_para_visita` verde) |
| Objeção principal + top 2 | `mainObjection`, `objections[]` | Chips |
| Score de qualificação | `qualificationScore` (0–100) | Barra única — sinal acionável primário |
| `nextBestAction` | `nextBestAction` | Linha destacada com call-to-action, copy-to-clipboard |
| Evidência (top 3) | `evidence[]` | Colapsável "Por quê?" com trechos citados das mensagens |
| Badge "Recuperável" | derivado da §4.2.1 | Pílula amarela quando a regra dispara |
| Provedor + frescura | `modelProvider`, `createdAt` | Rodapé: `Análise heurística há 4min` / `gpt-4o-mini há 4min` |
| **Ações humanas** | — | Botões: **criar follow-up**, **marcar revisada**, **atribuir corretor** (mantêm-se ativos mesmo se IA falhar) |

#### Adicional para `supervisor` / `admin` / `digital`

| Campo | Fonte | Elemento UI |
|---|---|---|
| `sellerQualityScore` | `sellerQualityScore` | Barra 0–100 |
| `hasSellerAbandonment` | `hasSellerAbandonment` | Pílula vermelha quando `true` |
| `firstResponseMinutes` | `firstResponseMinutes` | Métrica inline |
| Custo (lead, últimos 30d) | agregado `AIUsageLog` | Linha de rodapé, USD |

#### Fora do bloco do piloto

`opportunityStatus`, `risk`, `responseQualityScore`, `followUpScore`, `hasLeadAbandonment`, `hasQualification`, `hasSchedulingAttempt`, `hasProposalOrSimulationAttempt`, `metrics{}` — persistidos em `ConversationAIAnalysis` mas mantidos fora da superfície do corretor para evitar score-overload. Acessíveis via `GET /insight-ai/analyses` para quem precisar.

#### 4.2.1 Regra de oportunidade recuperável

```text
recoverableOpportunity = TRUE  ⇔
       leadIntent ∈ { 'qualificado', 'quente', 'pronto_para_visita' }    -- intenção média-a-alta
   AND (
            lostOpportunity = TRUE
         OR conversationRisk ∈ { 'alto', 'critico' }
         OR nextBestAction matches recovery/follow-up pattern
       )
   AND CRM lead/deal NOT IN status { 'sold', 'signed', 'closed_won' }
   AND contact.blocklisted = FALSE
```

Notas de implementação (informativas, **não vinculam código nesta PR**):

- Exposto como campo derivado no DTO de leitura da análise; calculado em query time para permitir tuning sem reanalisar conversas.
- Persistido como boolean denormalizado **apenas** quando a query do A6 precisar (índice composto por `tenantId, createdAt`).

#### 4.2.2 Lista de recuperáveis (broker / supervisor)

`GET /crm/leads?filter=recoverable&sortBy=updatedAt&sortDir=desc` retorna os leads cuja `ConversationAIAnalysis` mais recente case com a regra, escopado por `tenantId`, e — para `broker` — `brokerId = currentUser.id`. Página default 25, máx. 200 (padrão `docs/06-api-standards.md`).

UI: lista de leads do CRM com aba **"Recuperáveis"**.

### 4.3 Human-in-the-loop — IA não muda estágio CRM

- A IA **nunca** muda `CrmLead.status` / `CrmDeal.stage` automaticamente no piloto.
- Quando `aiSuggestedStage` estiver presente, o bloco mostra a **sugestão** com ações explícitas **Aprovar / Rejeitar**.
- Aprovação emite `crm.stage_changed` e grava `AuditLog` com `action='ai.analysis.accepted'`; rejeição grava `action='ai.analysis.overridden'`.
- Auto-apply permanece **OFF** para o piloto (per-tenant config; revisitar após 30 dias de auditoria HITL).

---

## 5. Telas e papéis (checklist)

Marcar ✅ quando validado **em ambiente real** (não só por código).

| Onde | Papel | O que validar |
|------|--------|----------------|
| `omniconnect-frontend` | Operador / supervisor | Conversa ativa; dados do lead; linha visível no piloto |
| `omniconnect-frontend` | Supervisor / admin | `/inteligencia` mostra agregados do tenant no período do piloto |
| `crm-imobiliario` | Corretor / back-office | Detalhe lead/deal mostra bloco Insight; timeline coerente |
| `crm-imobiliario` | Supervisor | Lista recovery / filtros piloto |
| `smart-ad-automator` | Digital / admin | Campanha e lead de teste disparam evento; sem vazar outro tenant |
| Botify | Configurador | Fluxo mínimo de triagem + handoff dispara evento correto |
| Dashboard piloto | Executivo / analista | Visão período + origem + sinal de perda/abandono |

---

## 6. Dados demo e ambiente

### 6.1 Pré-requisitos

- Um **tenant piloto** fixo (`tenantId` conhecido).
- Três **`IntegrationConnection`** (ou o mínimo necessário): `provider=crm`, `provider=ads`, `provider=bot`, com segredos cifrados conforme `docs/operations/integration-connections.md`.
- Usuários de teste com `UserTenant` e papéis esperados.

### 6.2 Seeds / fixtures

Entregar **um** dos caminhos (escolher no PR do piloto):

1. **Script SQL ou Prisma seed** idempotente que cria tenant + conexões fake + usuários (sem secrets reais no repo — usar vars).  
2. **Documento “manual demo”** passo a passo (criar tenant no admin, criar conexões, colar secrets em ambiente seguro).

### 6.3 Dados sintéticos de campanha

- Nome de campanha / `utm` / id criativo **estáveis** para bater com o dashboard piloto.

---

## 7. Critérios de aceite (binários)

O piloto só é considerado **pass** se **todos** os itens abaixo forem verdadeiros num único run guiado.

| ID | Critério |
|----|----------|
| A1 | Um evento `ads.lead.created` válido resulta em lead/conversa rastreável no tenant piloto, com `IntegrationEntityLink` quando aplicável. |
| A2 | `botify.handoff.created` não duplica fila de atendimento para o mesmo `externalId` (reprocessamento / mesma idempotência). |
| A3 | InsightAI gera análise persistida para o telefone/conversa do caso piloto; `AIUsageLog` com `tenantId` correto. |
| A4 | CRM exibe os campos acordados em §4.2 para esse caso, em até **2 minutos** após a análise ser persistida (SLA fechado em 2026-05-20). |
| A5 | Oportunidade recuperável aparece na lista/regra acordada em §4.2.1 / §4.2.2. |
| A6 | **Hub `apps/omniconnect-hub` `/executive`** mostra um card **"Pilot Funnel"** com leads ingeridos, conversas criadas, handoffs Botify, análises geradas, recuperáveis e sinais de perda/abandono — alimentado por `GET /dashboards/pilot-overview` (ver Phase 6 do plano de execução). |
| A7 | Não há leitura cross-tenant (validar com usuário de outro tenant ou teste automatizado equivalente). |
| A8 | Runbook do piloto (§8) foi seguido por uma pessoa que não implementou o fluxo, sem passos “só o dev sabe”. |

---

## 8. Runbook do piloto (uma página operacional)

1. Subir backend + Redis + DB migrado; aplicar migrations; `VITE_*` / `OMNICONNECT_*` corretos nos frontends/Botify.  
2. Confirmar saúde (`/health` ou equivalente).  
3. Criar ou carregar tenant piloto e conexões de integração.  
4. **Passo demo campanha:** disparar lead pago de teste.  
5. **Passo conversa:** enviar mensagens mínimas (script ou UI).  
6. **Passo Botify:** completar triagem mínima até handoff.  
   Smoke local sem Meta real: `./scripts/botify-handoff-validation.sh` valida `botify.handoff.created`, dedupe e materialização em `MessageQueue`.
7. **Passo Insight:** disparar análise conforme política §4.1.  
8. **Passo CRM:** abrir lead/deal e validar §7 A4–A5.  
9. **Passo dashboard:** validar §7 A6.  
10. Coletar logs estruturados (sem PII): `IntegrationEvent.id`, `eventType`, `tenantId`, erro de processor se houver.

Anexar tempos reais medidos na primeira execução (para calibrar promessa comercial).

---

## 9. Pós-piloto

- Promover melhorias de **UI/UX unificada** e dashboard executivo completo (Fase 4 do roadmap) **com base nos mesmos eventos** do piloto.  
- Expandir matriz §3.4 com novos `eventType` apenas com versionamento e testes de isolamento.  
- Revisitar `docs/migration/06-next-actions.md` para refletir “piloto fechado” vs próximos incrementos.

---

## Ver também

- `docs/migration/sprint-3-1-crm-frontend.md` — pendências conscientes do CRM UI.  
- `docs/migration/sprint-5-insight-ai-v2.md` — dashboards API e governança.  
- `docs/05-ai-governance.md` — limites de IA e PII.
