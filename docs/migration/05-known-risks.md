# 05 — Riscos Conhecidos

Riscos identificados durante o planejamento. Cada um tem severidade e mitigação proposta. Esta lista deve ser revisada antes do go-live de cada fase.

## Legenda
- 🔴 **Crítico** — pode causar perda de dados, vazamento ou downtime
- 🟠 **Alto** — afeta funcionalidade central ou custo
- 🟡 **Médio** — degrada experiência ou aumenta dívida técnica
- 🟢 **Baixo** — convém tratar, mas não bloqueia

---

## Riscos do patch InsightAI

### 🔴 R-AI-01 — PII enviada para OpenAI sem redação/consentimento
**Onde:** `apps/omniconnect-backend/src/insight-ai/insight-ai.prompt.ts`
**Detalhe:** O transcript inclui texto cru das mensagens, contendo CPF, telefones, valores financeiros, endereços.
**Impacto LGPD:** uso de dados pessoais sensíveis em serviço LLM em outra jurisdição (EUA) sem base legal explícita.
**Mitigação:**
- Redação automatizada antes do prompt (regex CPF, RG, e-mails, telefones de terceiros)
- Flag de consentimento por conta/cliente (`tenant.aiConsent: boolean`)
- DPA com OpenAI (eles oferecem) e configurar `OPENAI_API_KEY` com flag `no-training`
- Política de privacidade atualizada
**Status:** ❌ Não tratado no patch — **antes de produção**

### 🟠 R-AI-02 — OpenAI chamada síncrona pode estourar timeout
**Onde:** `analyzeManyPending` no service
**Detalhe:** Loop `for...await` sem fila, sem retry, sem backoff
**Impacto:** Em lote de 50 telefones, 30s+ de espera → 502/504 do proxy/load balancer; queima de API key
**Mitigação:** Mover para **BullMQ** (já configurado no projeto). Envolver provider OpenAI em **circuit breaker** via módulo `circuit-breaker/` (opossum). Endpoint responde 202 + jobIds, cliente faz polling.
**Status:** ❌ Não tratado no patch — **antes de produção**

### 🟡 R-AI-03 — Sem rate limiting nos endpoints
**Detalhe:** Admin pode disparar análise em loop e estourar custo
**Mitigação:** Usar o módulo interno **`rate-limiting/`** do projeto (não `@nestjs/throttler`) no controller (ex.: 10 req/min por usuário)
**Status:** ❌ Não tratado

### 🟢 R-AI-04 — Custo OpenAI sem observabilidade
**Detalhe:** Sem tracking de quantos tokens foram gastos por análise/tenant
**Mitigação:** Persistir `promptTokens` + `completionTokens` em cada `ConversationAIAnalysis` (a resposta da API traz isso)
**Status:** Sugestão de melhoria

---

## Riscos da migração para monorepo

### 🟠 R-MIG-01 — Build TS dos pacotes compartilhados
**Detalhe:** `packages/ai-contracts` precisa estar compilado antes de o backend usar. Em monorepo TS isso é resolvido com `tsc --build` + `paths` no tsconfig, ou com bundlers.
**Mitigação:** Decidir entre `tsc -b`, `tsup`, ou simplesmente publicar como `*` workspace e deixar o TS resolver via path mapping. Testar antes da Fase 4.
**Status:** ⚠️ Planejado

### 🟠 R-MIG-02 — Conflito de versões de deps entre os 4 apps
**Detalhe:** Cada um veio com sua versão de `react`, `vite`, `tailwind`, `radix-*`. Em monorepo com hoist, versões diferentes podem conviver, mas `pnpm` faz hoist agressivo.
**Mitigação:**
- Padronizar versões críticas (`react@18.3.x`, `vite@5.x`)
- Usar `pnpm overrides` no root para forçar versões específicas
- Quando possível, mesma major em todos os apps
**Status:** ⚠️ A tratar na Fase 4

### 🟠 R-MIG-03 — Lovable Cloud Auth no CRM
**Detalhe:** O CRM usa `@lovable.dev/cloud-auth-js`. Se a Lovable descontinuar, o CRM quebra.
**Mitigação:** Documentar esse acoplamento. Planejar migração para Supabase Auth ou para o `AuthModule` do OmniConnect.
**Status:** ⚠️ Risco aceito por ora

### 🟡 R-MIG-04 — Dois bancos (Postgres NestJS + Supabase) durante a transição
**Detalhe:** Estratégia híbrida proposta no `02-target-architecture.md`. Dados de "lead" vão existir nos dois lugares.
**Mitigação:**
- Definir **fonte de verdade** por entidade: lead/conversa = OmniConnect; pipeline/propostas = CRM
- Sync via eventos/webhooks, não via leitura cruzada
- Não fazer JOINs entre bancos
**Status:** ⚠️ Inerente à estratégia

### 🟡 R-MIG-05 — Credenciais espalhadas em `.env` de cada projeto
**Detalhe:** Cada um dos 4 projetos tem (ou terá) seu próprio `.env`. Risco de commit acidental.
**Mitigação:**
- `.gitignore` global cobrindo `**/.env`
- `.env.example` em cada app
- Considerar gerenciador de secrets (1Password, Doppler) ou variáveis injetadas no Coolify/CI
**Status:** ⚠️ Procedimento operacional

---

## Riscos de produto / negócio

### 🔴 R-BIZ-01 — Confiar cegamente nos scores da IA
**Detalhe:** `sellerQualityScore`, `leadIntent`, `lostOpportunity` vão para dashboards CEO. Se mal calibrados, geram decisões erradas (demitir corretor, pausar canal).
**Mitigação:**
- Sempre mostrar **evidência** (mensagens citadas) junto do score
- Período de **shadow mode** (gerar análise mas não exibir) por X semanas, comparando com tabulações manuais
- Permitir override humano
**Status:** Crítico para o produto — discutir antes de exibir para usuários finais

### 🟠 R-BIZ-02 — Custo OpenAI escala com volume de conversas
**Detalhe:** Cada análise = ~1500 tokens prompt + ~500 tokens resposta. A R$ ~0,01 por análise com gpt-4o-mini. 1000 análises/dia = R$ 300/mês. 10k = R$ 3.000/mês.
**Mitigação:**
- Cache de análise (não reanalisar se conversa não mudou nas últimas 24h)
- Throttle por tenant
- Modelo barato para triagem (`gpt-4o-mini`), modelo bom só para reanálise sob demanda
- Monitorar via tracking de tokens (R-AI-04)
**Status:** ⚠️ Modelar antes de habilitar volume real

### 🟡 R-BIZ-03 — Suporte multi-tenant
**Detalhe:** O schema atual tem `Segment` e `User`, mas não tem `Tenant`. Se o `omniconnect-pro` virar SaaS, vai precisar isolamento.
**Mitigação:** Decidir cedo se é multi-tenant (e migrar) ou single-tenant por instância (deploy separado por cliente).
**Status:** ⚠️ Decisão arquitetural pendente

---

## Riscos operacionais

### 🟠 R-OPS-01 — Migration do schema atual vs migration do patch
**Detalhe:** O patch sugere SQL manual (`prisma/migrations/manual_insight_ai/migration.sql`), o que dessincroniza `_prisma_migrations`. O plano corrige isso usando `prisma migrate dev`.
**Mitigação:** Já tratado no plano. **Não executar o SQL manual sob hipótese alguma.**
**Status:** ✅ Mitigado pelo plano

### 🟠 R-OPS-02 — Perda do histórico de produção do OmniConnect
**Detalhe:** Se o `taticaofc` já estiver rodando em produção com dados reais e fizermos `prisma migrate` numa base nova, perdemos dados.
**Mitigação:**
- Confirmar se há produção rodando
- Se sim: backup, migration testada em staging, plano de rollback
**Status:** ⚠️ A confirmar com o usuário

### 🟡 R-OPS-03 — Botify integrar com WhatsApp duplicando o OmniConnect
**Detalhe:** Se o Botify hoje tem sua própria conexão com WhatsApp Cloud API, vamos ter 2 sistemas falando com o mesmo número, brigando por mensagens.
**Mitigação:** Decidir cedo que **só o OmniConnect** fala com a API do WhatsApp. Botify recebe mensagens via webhook do OmniConnect, processa o fluxo, devolve resposta via API interna do OmniConnect.
**Status:** ⚠️ A confirmar na Fase 5

### 🟢 R-OPS-04 — Deploys descoordenados
**Detalhe:** Sem CI/CD, deploys manuais em horários ruins quebram cliente.
**Mitigação:** GitHub Actions desde o início, mesmo que simples (`build + test`).
**Status:** Planejado

---

## Riscos legais/compliance

### 🔴 R-LEG-01 — LGPD na análise de conversas
Ver R-AI-01. Reforço aqui porque vai além do prompt — vale para a tabela `ConversationAIAnalysis` também.

### 🟠 R-LEG-02 — Retenção de dados
**Detalhe:** Conversas + análises crescem indefinidamente. LGPD pede política de retenção.
**Mitigação:** O OmniConnect já tem `ArchivingModule` para conversas. Estender para `ConversationAIAnalysis`.
**Status:** Verificar como funciona o archiving hoje

### 🟢 R-LEG-03 — Termos de uso OpenAI
**Detalhe:** Aceitar termos comerciais que proíbem treino com nossos dados.
**Mitigação:** OpenAI API (não ChatGPT) já não treina por padrão. Confirmar settings da conta.
**Status:** Verificação de conta
