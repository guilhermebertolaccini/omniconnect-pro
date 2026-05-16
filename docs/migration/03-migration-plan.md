# 03 — Plano de Migração

Plano em fases para sair do estado atual (`taticaofc` + 3 produtos soltos + 1 patch incompleto) para o estado-alvo (`omniconnect-pro` monorepo unificado).

> **Pré-requisito antes de começar:** ler `00-context-and-decisions.md` e responder as decisões pendentes lá (gerenciador de pacotes, estratégia Supabase, repos atuais).

---

## Fase 0 — Pré-requisitos

### 0.1 Decisões necessárias
- [ ] Definir gerenciador de pacotes (`pnpm` recomendado)
- [ ] Definir estratégia para Supabase (Opção A / B / C — ver `00`)
- [ ] Confirmar nome final: `omniconnect-pro` ✅
- [ ] Definir se outros repos atuais (botify, CRM, SAA no GitHub) também serão arquivados

### 0.2 Criar Rules e Skills do Cursor (antes de qualquer código)
- [ ] Criar `.cursor/rules/` com regras globais (Prisma, NestJS, monorepo, PII)
- [ ] Criar `.cursor/skills/` com procedimentos repetíveis (aplicar patch, migrar produto)

> O usuário pediu para fazer essas Rules/Skills **antes** de mover código. Documentar no `06-next-actions.md`.

### 0.3 Backup
- [ ] Garantir que todos os ZIPs originais estão preservados em `~/Desktop/AMBIENTE DEV/`
- [ ] Tag `pre-migration` no `taticaofc` atual: `git tag pre-migration && git push --tags`

---

## Fase 1 — Criar o repositório `omniconnect-pro`

### 1.1 No GitHub
1. New repository → `omniconnect-pro` → **Privado**
2. NÃO marcar README, .gitignore ou license (vamos criar local)
3. Create repository

### 1.2 Local
```bash
cd ~/Desktop/AMBIENTE\ DEV
mkdir omniconnect-pro && cd omniconnect-pro
git init
git branch -M main
mkdir -p apps packages docs/migration docs/adr .github/workflows .cursor/rules .cursor/skills
```

### 1.3 Arquivos base
- `.gitignore` — node_modules, dist, .env, .DS_Store, *.log, .turbo, etc.
- `.editorconfig`
- `.env.example`
- `README.md` (resumo do projeto e como rodar)
- `AGENTS.md` (rules legíveis pelo Cursor)
- `package.json` (workspace root)
- `pnpm-workspace.yaml`
- `tsconfig.base.json`

---

## Fase 2 — Migrar OmniConnect como base

### 2.1 Copiar backend e frontend
```bash
cp -r ~/Desktop/AMBIENTE\ DEV/taticaofc/backend  apps/omniconnect-backend
cp -r ~/Desktop/AMBIENTE\ DEV/taticaofc/frontend apps/omniconnect-frontend
```

### 2.2 Limpar artefatos
```bash
find apps/omniconnect-backend apps/omniconnect-frontend \
  -type d \( -name node_modules -o -name dist -o -name .git -o -name .next \) \
  -prune -exec rm -rf {} +
```

### 2.3 Mover docs e dados
```bash
cp ~/Desktop/AMBIENTE\ DEV/taticaofc/IMPLEMENTATION_PLAN.md docs/legacy/implementation-plan.md
cp -r ~/Desktop/AMBIENTE\ DEV/taticaofc/docs/migration/* docs/migration/
mkdir -p apps/omniconnect-backend/seed
mv ~/Desktop/AMBIENTE\ DEV/taticaofc/tabulacoes_import.csv apps/omniconnect-backend/seed/ 2>/dev/null
mv ~/Desktop/AMBIENTE\ DEV/taticaofc/usuarios_bv_contencioso.csv apps/omniconnect-backend/seed/ 2>/dev/null
```

### 2.4 Validar build do backend
```bash
cd apps/omniconnect-backend
pnpm install
pnpm prisma generate
pnpm run build
cd ../..
```

### 2.5 Validar build do frontend
```bash
cd apps/omniconnect-frontend
pnpm install
pnpm run build
cd ../..
```

### 2.6 Primeiro commit estratégico
```bash
git add .
git commit -m "feat: initial monorepo with OmniConnect as core (backend + frontend)"
```

---

## Fase 3 — Aplicar o patch InsightAI (com correções)

> ⚠️ **NÃO seguir as instruções do INSIGHT_AI_PATCH_README.md literalmente.** Ler `04-insight-ai-patch-analysis.md` primeiro — há 3 bloqueadores.

### 3.1 Copiar apenas o módulo
```bash
cp -r ~/Desktop/AMBIENTE\ DEV/insight-ai-mvp-patch/omniconnect/taticaofc-main/backend/src/insight-ai \
      apps/omniconnect-backend/src/
```

### 3.2 Adicionar dependência faltante
```bash
cd apps/omniconnect-backend
pnpm add @nestjs/swagger
```

### 3.3 Criar arquivos faltantes
- `apps/omniconnect-backend/src/insight-ai/dto/analyze-conversation.dto.ts` (faltando no patch)
- Definir/usar enum `Role` ou trocar `@Roles(Role.admin, ...)` por strings literais

> Detalhes exatos em `04-insight-ai-patch-analysis.md`.

### 3.4 Editar `app.module.ts` manualmente (NÃO sobrescrever)
Adicionar:
```typescript
import { InsightAiModule } from './insight-ai/insight-ai.module';
// ...
imports: [
  // ... módulos existentes
  InsightAiModule,
],
```

### 3.5 Adicionar model ao Prisma (NÃO sobrescrever schema)
Copiar o `model ConversationAIAnalysis` (47 linhas) do patch e colar no fim do `apps/omniconnect-backend/prisma/schema.prisma`.

### 3.6 Gerar migration via Prisma (NÃO usar o SQL manual)
```bash
cd apps/omniconnect-backend
pnpm prisma migrate dev --name add_conversation_ai_analysis
```

### 3.7 Validar build
```bash
pnpm prisma generate
pnpm run build
pnpm run start:dev
```

### 3.8 Smoke test
```bash
# Sem OPENAI_API_KEY (modo heurístico)
curl -X POST http://localhost:3000/insight-ai/analyze/55119XXXXXXXX \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"days": 30}'
```

### 3.9 Commit
```bash
git add .
git commit -m "feat(insight-ai): add MVP module for conversation analytics"
```

---

## Fase 4 — Setup do monorepo

### 4.1 `package.json` raiz
```json
{
  "name": "omniconnect-pro",
  "private": true,
  "packageManager": "pnpm@9.x.x",
  "scripts": {
    "dev:backend": "pnpm --filter omniconnect-backend run start:dev",
    "dev:frontend": "pnpm --filter omniconnect-frontend run dev",
    "build": "pnpm -r run build",
    "lint": "pnpm -r run lint",
    "test": "pnpm -r run test"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

### 4.2 `pnpm-workspace.yaml`
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 4.3 Criar pacotes compartilhados básicos
```bash
mkdir -p packages/ai-contracts/src packages/shared-types/src packages/tsconfig
# (criar package.json mínimo em cada um)
```

### 4.4 Mover tipos do InsightAI para `packages/ai-contracts`
Extrair `LeadIntent`, `OpportunityStatus`, `ConversationRisk`, `ConversationAIResult` de `apps/omniconnect-backend/src/insight-ai/insight-ai.types.ts` para `packages/ai-contracts/src/index.ts`. Importar de volta no backend.

---

## Fase 5 — Migrar Botify

### 5.1 Copiar
```bash
cp -r ~/Desktop/AMBIENTE\ DEV/botify-whatsapp apps/botify
find apps/botify -type d \( -name node_modules -o -name dist -o -name .git \) -prune -exec rm -rf {} +
```

### 5.2 Investigação prévia
- Mapear como o bot se conecta ao WhatsApp hoje (direto ou via outro backend?)
- Decidir se o handoff para humano vai chamar a API do `omniconnect-backend`
- Verificar se há credenciais em código (.env esquecido)

### 5.3 Ajustes
- Renomear package.json: `"name": "botify"`
- Apontar para `packages/ui` (substituir shadcn-ui local)
- Atualizar `tsconfig.json` para estender de `packages/tsconfig/base.json`

### 5.4 Build + commit
```bash
pnpm install
pnpm --filter botify run build
git add . && git commit -m "feat: import botify into monorepo"
```

---

## Fase 6 — Migrar CRM Imobiliário

### 6.1 Copiar
```bash
cp -r ~/Desktop/AMBIENTE\ DEV/t-tica-vendas-imobili-rias-main apps/crm-imobiliario
find apps/crm-imobiliario -type d \( -name node_modules -o -name dist -o -name .git \) -prune -exec rm -rf {} +
```

### 6.2 Decisões importantes
- **Supabase fica como está** (Opção A da estratégia híbrida em `02`)
- Auth: por enquanto, Lovable Cloud Auth (do CRM). Padronizar com OmniConnect num momento futuro.

### 6.3 Ajustes
- Renomear: `"name": "crm-imobiliario"`
- Adicionar dependência `ai-contracts` para receber tipos do InsightAI:
  ```bash
  cd apps/crm-imobiliario
  pnpm add @omniconnect-pro/ai-contracts@workspace:*
  ```
- Criar aba "Inteligência Comercial" no detalhe do lead (consumindo o backend)

### 6.4 Build + commit

---

## Fase 7 — Migrar Smart Ad Automator

Mesmo procedimento do CRM (são gêmeos em stack).

### 7.1 Copiar e renomear
```bash
cp -r ~/Desktop/AMBIENTE\ DEV/smart-ad-automator-main apps/smart-ad-automator
```

### 7.2 Pontos específicos
- Manter `docs/CREDENCIAIS_PLATAFORMAS.md` (mover para `apps/smart-ad-automator/docs/`)
- Validar `docs/META_API_INTEGRATION.md`
- Planejar bridge: SAA → OmniConnect (leads pagos viram conversas)

### 7.3 Build + commit

---

## Fase 8 — Bridge OmniConnect ↔ CRM ↔ SAA

### 8.1 Endpoint OmniConnect → CRM
- `POST /api/integrations/crm/lead-analysis` no `omniconnect-backend`
- Envia análise InsightAI para o CRM gravar na tabela `leads`
- Auth: JWT compartilhado ou webhook signature

### 8.2 Webhook SAA → OmniConnect
- `POST /api/integrations/saa/new-lead` no `omniconnect-backend`
- Recebe leads pagos do SAA com `campaignId`, `source`, custos
- Cria `Contact` e dispara primeira mensagem WhatsApp (template)

### 8.3 Dashboard CEO/CFO
- Onde? Provavelmente no `omniconnect-frontend` como nova aba
- Métricas: CAC por canal, qualidade de lead por origem, score médio de conversa, oportunidades perdidas, conversões

---

## Fase 9 — Arquivar repositórios antigos

### 9.1 `taticaofc`
- Adicionar nota no `README.md`: "Este projeto foi unificado em `omniconnect-pro`."
- GitHub → Settings → Archive this repository

### 9.2 Outros repos (se existirem)
- Mesmo procedimento para botify, CRM e SAA, **se** já existirem como repos próprios no GitHub.

---

## Estimativa de esforço

| Fase | Esforço estimado |
|---|---|
| 0 — Pré-requisitos + Rules/Skills | 0.5 dia |
| 1 — Criar repo novo | 1 hora |
| 2 — Migrar OmniConnect | 2-4 horas |
| 3 — Aplicar patch InsightAI (com correções) | 4-8 horas |
| 4 — Setup monorepo + packages | 1 dia |
| 5 — Migrar Botify | 0.5 dia |
| 6 — Migrar CRM | 1 dia |
| 7 — Migrar SAA | 0.5 dia |
| 8 — Bridges entre apps | 2-3 dias |
| 9 — Arquivar | 1 hora |
| **Total esqueleto funcional** | **~1 semana de trabalho focado** |

> Não inclui: tunar prompts da IA, refinar UX da aba de inteligência no CRM, dashboard executivo polido, observabilidade, CI/CD completo, deploy production.
