# Roadmap — OmniconnectPRO

Roadmap em fases. Cada fase tem **goal claro**, **entregáveis** e **critério de "pronto"**.

> Detalhes operacionais da migração inicial (do `taticaofc` para `omniconnect-pro`) estão em `docs/migration/`. Este roadmap olha para frente, **depois** que a migração estiver concluída.

### Como ler este documento (atualizado)

As fases **não são uma fila única**. No repositório, **CRM imobiliário** e **Smart Ad Automator** avançaram **além** do desenho linear abaixo (domínio e APIs no `omniconnect-backend`, ver `docs/migration/sprint-2-saa.md`, `docs/migration/sprint-3-crm.md`). **InsightAI** também evoluiu (multi-provedor, custo, dashboards). O **próximo gargalo de produto** é **orquestração ponta a ponta**: eventos e processors dos bridges preenchendo CRM/SAA com regras de negócio, Insight→CRM na UX, recovery e retroalimentação de campanha (ver `docs/migration/06-next-actions.md`, `docs/migration/sprint-4-bridge-processors.md`).

| Épico (este arquivo) | Leitura no código/docs (macro) |
|----------------------|--------------------------------|
| Fase 0 — Foundation | ✅ Concluída |
| Fase 1 — InsightAI | ✅ Núcleo + observabilidade de custo + UI Inteligência (`/inteligencia`); rate limiting dedicado em rotas IA pode evoluir |
| Fase 2 — CRM | 🟡 Muito além do “só bridge”: módulo CRM no Nest; critérios de “pronto” da tabela ainda guiam o que falta **na jornada** |
| Fase 3 — Botify | ⏳ App no monorepo; triagem no **mesmo padrão** de bridge + fila a priorizar |
| Fase 4 — Executive | 🟠 Base parcial (agregados, relatórios); dashboard CEO/CFO “fechado” ainda não |
| Fase 5 — SAA | 🟡 Backend/OAuth/proxies/análises avançados; fechar loop **anúncio → lead → conversa → IA → qualidade de volta** |

---

## Fase 0 — Migration & Foundation

**Goal:** Sair do `taticaofc` + 3 produtos soltos para o `omniconnect-pro` monorepo unificado, com multi-tenancy implementado.

**Entregáveis:**
- Monorepo `omniconnect-pro` criado com 5 apps
- Multi-tenant retrofit no backend (todas as 19 tabelas + Tenant model)
- Rules e Skills do Cursor configurados
- Documentação base completa
- CI básico (lint + test + build)

**Critério de pronto:**
- ✅ Backend builda sem erros
- ✅ Todos os queries antigos passam `tenantId`
- ✅ Testes de isolamento passam para todos os módulos
- ✅ `taticaofc` arquivado no GitHub

> Plano detalhado: `docs/migration/03-migration-plan.md`.

---

## Fase 1 — InsightAI MVP

**Goal:** Analisar conversas do WhatsApp e gerar inteligência comercial.

**Entregáveis (alinhados ao que o monorepo entrega hoje):**
- Análise **assíncrona** via fila `insight-ai` (Bull), com `jobId` determinístico e isolamento por tenant
- `POST /insight-ai/analyze/:phone` (enfileira) e modo `sync` administrativo; `POST /insight-ai/analyze` em lote
- Schema `ConversationAIAnalysis` + `AIUsageLog` + `ModelPricing` com `tenantId`
- Provedores LLM plugáveis (**OpenAI**, **Anthropic**, **Gemini** como `google` em log/pricing) + **fallback heurístico** se chave ausente ou erro
- Prompt versionado (`insight-ai.prompt` / `PROMPT_VERSION`), output alinhado a `@omniconnect/ai-contracts`, validação no serviço
- **PII redaction** antes do LLM (`redactPII`)
- `GET /insight-ai/analyses` (paginado `{ items, meta }`, filtros período/segmento/telefone — ver `docs/06-api-standards.md`)
- `GET /insight-ai/dashboard/summary` e `GET /insight-ai/dashboard/usage` (agregados tenant-scoped)
- Tracking de custo por chamada em `AIUsageLog`
- UI: página **Inteligência** em `omniconnect-frontend` → rota `/inteligencia` (admin / supervisor / digital)
- **Continua evoluindo:** rate limiting explícito só nas rotas InsightAI; agregações “billing” consolidadas em módulo dedicado se necessário

**Critério de pronto:**
- ✅ Análise de conversas reais retorna resultado válido (LLM ou heurística)
- ✅ Sem chave de provedor configurada, heurística produz output utilizável
- ✅ Custo e tokens rastreados por tenant (`AIUsageLog` + dashboards de uso)
- ✅ Tenant isolation testado (incl. E2E HTTP em jobs e listagens)
- ✅ PII redaction cobre amostras acordadas na governança (`docs/05-ai-governance.md`)

---

## Fase 2 — CRM Integration

**Goal:** Levar insights da IA para o CRM Imobiliário.

**Nota (estado do repositório):** O trabalho **não** se limitou ao bridge: há **domínio CRM** no `omniconnect-backend` (schema Prisma, assinaturas, storage, parser, realtime — ver `docs/migration/sprint-3-crm.md`). Esta fase no roadmap continua válida pelos **critérios de pronto centrados na experiência** (IA visível no CRM, eventos de stage, recovery). O que falta é **costura operacional** com InsightAI e processors de eventos.

**Entregáveis:**
- `crm-bridge` module no backend
- Endpoint OUT: `omniconnect-backend → crm-imobiliario` (`POST /api/v1/leads/:id/ai-analysis` no CRM)
- Webhook IN: `crm-imobiliario → omniconnect-backend` (mudanças de stage, perda, conversão)
- `packages/ai-contracts` consumido pelo CRM
- UI no CRM: aba "Inteligência Comercial" no detalhe do lead/deal
- Lista de "oportunidades perdidas recuperáveis" no CRM
- Campo `aiSuggestedStage` no Deal (humano aprova)

**Critério de pronto:**
- ✅ Análise IA aparece dentro do CRM em <1min após gerada
- ✅ Mudança de stage no CRM dispara evento `crm.stage_changed` no backend
- ✅ Lead perdido aparece na lista de recovery
- ✅ Tipos compartilhados, sem drift

---

## Fase 3 — Botify Triage

**Goal:** Qualificar leads antes do handoff humano.

**Plano de maturidade (repo):** decomposição em fases A–F, critérios mensuráveis e CI — `docs/migration/sprint-6-botify-maturity-plan.md`.

**Entregáveis:**
- `bot-bridge` module no backend
- Botify recebe nova conversa via webhook do OmniConnect
- Botify faz N perguntas de qualificação (configurável por tenant)
- Botify gera `LeadSummary` (intent, orçamento, urgência, região)
- Handoff: Botify devolve para o OmniConnect que atribui a vendedor
- CRM cria/atualiza `Deal` com dados da triagem
- InsightAI analisa também as conversas do bot

**Critério de pronto:**
- ✅ Lead novo entra → bot triage → vendedor recebe lead já qualificado
- ✅ Resumo do bot aparece no painel do vendedor
- ✅ Métrica: % de leads qualificados pelo bot (vs descartados)

---

## Fase 4 — Executive Dashboard

**Goal:** Visão CEO/CFO de vazamento de conversão.

**Entregáveis:**
- Dashboard "Executive" no omniconnect-frontend
- Métricas:
  - Aquisição: leads por canal/campanha, CAC inferido
  - Atendimento: tempo primeira resposta, abandono, score médio de vendedor
  - IA: qualidade média, top objeções, oportunidades perdidas
  - Vendas: conversão por estágio, ciclo médio, ticket médio
- Filtros: período, tenant (se super admin), equipe, vendedor, canal
- Export PDF/CSV
- Snapshots periódicos (job Bull) para histórico

**Critério de pronto:**
- ✅ CEO consegue ver "onde estou perdendo dinheiro" em <3 cliques
- ✅ Dados refrescam <5min após eventos
- ✅ Export funciona

---

## Fase 5 — Smart Ad Automator Integration

**Goal:** Conectar campanhas pagas ao funil de conversas.

**Nota (estado do repositório):** O **SAA** já tem **módulo e schema** no `omniconnect-backend` (conexões de plataforma, proxies, análise IA de campanha, refresh de tokens — ver `docs/migration/sprint-2-saa.md`). Permanecem os entregáveis abaixo para **fechar o loop comercial** (lead pago ↔ conversa ↔ insight ↔ métrica de volta).

**Entregáveis:**
- `ads-bridge` module no backend
- Webhook SAA → OmniConnect: novo lead pago, criativo, custo
- OmniConnect cria `Contact` e dispara primeira mensagem (template WhatsApp)
- Atribuição: lead → conversa → análise IA → conversão
- Métricas que voltam para o SAA:
  - Qualidade do lead por canal/criativo (via score IA)
  - CAC real (custo / leads convertidos), não CPL bruto
  - Recomendação de re-alocação de orçamento
- Dashboard SAA: campanhas com alta qualidade vs alto volume baixa qualidade

**Critério de pronto:**
- ✅ Lead pago do Meta Ads chega no OmniConnect em <2min
- ✅ Análise IA do lead retroalimenta o SAA em <1h
- ✅ CAC por canal aparece no dashboard executive

---

## Fase 6 — Omnichannel Expansion

**Goal:** Ir além do WhatsApp.

**Entregáveis:**
- Channel abstraction (`channels` module evolui)
- Drivers:
  - Email (IMAP + SMTP, ou SendGrid)
  - SMS (Twilio)
  - RCS (Google Business Messages)
  - Instagram Direct (Meta API)
  - Facebook Messenger
- Unified inbox no omniconnect-frontend (todos os canais em 1 painel)
- IA analisa todos os canais com prompts ajustados por canal

**Critério de pronto:**
- ✅ Vendedor responde lead independente do canal de origem na mesma UI
- ✅ Análise IA cross-channel
- ✅ Métricas separadas por canal no executive dashboard

---

## Fase 7+ — Platform Maturity

**Possíveis direções (a decidir baseado em demanda):**

- **Self-service onboarding** (criar tenant via signup público)
- **Billing & subscriptions** (Stripe/Pagar.me, planos)
- **Marketplace de templates** (campanhas, fluxos bot, prompts IA)
- **API pública** (clientes integram com sistemas próprios)
- **App mobile** para vendedor (responder no celular)
- **Verticais adicionais** (auto, educação, healthcare)
- **Voice channel** (chamadas integradas)
- **Workflow builder visual** (no-code automation)

## Princípio de priorização

Cada decisão de fase consulta o **product filter** (ver skill `product-owner`):

> Does this help transform conversations into opportunities and opportunities into predictable sales?

Se a resposta não é "sim, claramente", a feature volta pro backlog.

## Linhas de trabalho (paralelo) — preferir a `06-next-actions`

A execução **antecipou** Fases 2 e 5 em relação à linha do tempo linear original. Use esta visão por **trilho**:

| Trilho | Conteúdo típico |
|--------|-----------------|
| **Core conversacional** | WhatsApp, conversas, operação no `omniconnect-frontend` |
| **InsightAI** | Análise, custo, dashboards; evoluição contínua de governança |
| **CRM (Nest)** | Domínio + CRM bridge + processors que materializam leads/deals |
| **SAA (Nest)** | Conexões ads, proxies, análise, integração com bridges |
| **Orquestração** | `IntegrationEvent`, dedupe, `IntegrationEntityLink`, emit para satélites |
| **Botify** | Triagem com mesmo rigor de tenant/secrets/bridges |
| **Executive** | Agregações C-level quando os eventos do funil estiverem confiáveis |

**Plano histórico (estimativa linear original — referência apenas):**

| Fase | Duração estimada | Inicia |
|---|---|---|
| 0 — Migration | 2-3 semanas | Maio 2026 |
| 1 — InsightAI MVP | 3-4 semanas | plano original |
| 2 — CRM Integration | 3 semanas | plano original |
| 3 — Botify Triage | 3-4 semanas | plano original |
| 4 — Executive Dashboard | 3 semanas | plano original |
| 5 — SAA Integration | 4 semanas | plano original |
| 6 — Omnichannel | 6-8 semanas | Q4 2026 |
| 7+ — Maturity | contínuo | 2027 |

> Para “o que fazer agora”, priorizar **`docs/migration/06-next-actions.md`** e o filtro em `01-product-vision.md`.

## See also

- `01-product-vision.md`
- `docs/migration/06-next-actions.md` (operacional: próximo foco)
- `docs/migration/pilot-flow-lead-to-recovery.md` (piloto: jornada ponta a ponta e aceite)
- `docs/migration/sprint-6-botify-maturity-plan.md` (Botify: paridade operacional)
- `docs/migration/03-migration-plan.md` (Fase 0 detalhada)
- `docs/02-architecture.md` (diagrama e estratégia de dados atualizada)
- skill `product-owner` (filtro de decisão)
