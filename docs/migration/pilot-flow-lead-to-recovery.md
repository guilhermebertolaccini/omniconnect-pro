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

## 4. InsightAI → CRM (superfície de produto)

### 4.1 Gatilho

Definir uma política piloto (uma só):

- **A)** análise sob demanda (botão no CRM/Omni), ou  
- **B)** job após N mensagens ou após fechamento de conversa, ou  
- **C)** ambos, com limite de custo por lead/dia.

### 4.2 Campos mínimos visíveis no CRM

Alinhar com `ConversationAIResult` / persistência em `ConversationAIAnalysis` (nomes exatos no Prisma). Objetivo do piloto:

- Resumo executivo (1 parágrafo).
- `leadIntent`, objeção principal, `nextBestAction`.
- Scores relevantes para o corretor (ex.: qualificação / qualidade).
- Flag ou derivado para **oportunidade recuperável** (regra de negócio explícita no CRM).

### 4.3 Human-in-the-loop

Se existir `aiSuggestedStage`, o piloto deve mostrar **sugestão** e ação humana explícita (aprovar/realizar), em linha com `docs/05-ai-governance.md`.

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
| A4 | CRM exibe os campos acordados em §4.2 para esse caso, em até **X minutos** após a análise (definir X, ex.: 2 min). |
| A5 | Oportunidade recuperável aparece na lista/regra acordada em §4.2. |
| A6 | Dashboard piloto mostra pelo menos **uma** métrica de vazamento ou abandono ligada ao caso (ex.: contagem ou flag agregada). |
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
