# Roadmap — OmniconnectPRO

Roadmap em fases. Cada fase tem **goal claro**, **entregáveis** e **critério de "pronto"**.

> Detalhes operacionais da migração inicial (do `taticaofc` para `omniconnect-pro`) estão em `docs/migration/`. Este roadmap olha para frente, **depois** que a migração estiver concluída.

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

**Entregáveis:**
- Endpoint `POST /insight-ai/conversations/:id/analyze` (assíncrono via BullMQ)
- Schema `ConversationAIAnalysis` com `tenantId`
- Provider OpenAI + fallback heurístico
- Prompt versionado (`v1`)
- Output validado via Zod
- PII redaction antes do LLM
- Endpoint `GET /insight-ai/analyses?conversationId=X`
- Endpoint `GET /insight-ai/dashboard/summary` (métricas agregadas)
- Tracking de custo (`promptTokens`, `completionTokens`, `estimatedCost`)
- Rate limiting via módulo interno `rate-limiting/`
- UI: aba "Inteligência" na tela de conversa (omniconnect-frontend)

**Critério de pronto:**
- ✅ Análise de uma conversa real retorna JSON válido
- ✅ Sem OPENAI_KEY, heurística produz output válido
- ✅ Custo aparece em `/billing-usage/ai`
- ✅ Tenant isolation testado
- ✅ PII redaction testado com sample real

---

## Fase 2 — CRM Integration

**Goal:** Levar insights da IA para o CRM Imobiliário.

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

## Snapshot timeline (estimativa)

| Fase | Duração estimada | Inicia |
|---|---|---|
| 0 — Migration | 2-3 semanas | Maio 2026 |
| 1 — InsightAI MVP | 3-4 semanas | Junho 2026 |
| 2 — CRM Integration | 3 semanas | Julho 2026 |
| 3 — Botify Triage | 3-4 semanas | Agosto 2026 |
| 4 — Executive Dashboard | 3 semanas | Setembro 2026 |
| 5 — SAA Integration | 4 semanas | Outubro 2026 |
| 6 — Omnichannel | 6-8 semanas | Q4 2026 |
| 7+ — Maturity | contínuo | 2027 |

> Estimativas conservadoras assumindo 1 dev full-time + analista. Ajustar conforme time cresce.

## See also

- `01-product-vision.md`
- `docs/migration/03-migration-plan.md` (Fase 0 detalhada)
- skill `product-owner` (filtro de decisão)
