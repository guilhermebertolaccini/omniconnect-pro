# Guia de Deployment - Backend Vend

## Como funciona o deployment automático

Quando você faz o build e deploy do Docker, o sistema executa automaticamente:

### 1. Build (Dockerfile)
- Instala dependências
- Gera Prisma Client
- Compila a aplicação NestJS
- Copia arquivos necessários (migrations, seed, etc)

### 2. Inicialização (docker-entrypoint.sh)
Ao subir o container, o entrypoint executa automaticamente:

1. **Migrations**: Aplica todas as migrations pendentes
   ```bash
   npx prisma migrate deploy
   ```

2. **Seed de desenvolvimento (apenas fora de produção)**: Se o banco estiver vazio, executa o seed
   ```bash
   npx tsx prisma/seed.ts
   ```
   - Cria usuário Admin
   - Cria usuário Supervisor
   - Cria usuário Operator
   - Cria segmento padrão
   - Cria tags de exemplo
   - Exige `SEED_ADMIN_PASSWORD`, `SEED_SUPERVISOR_PASSWORD` e `SEED_OPERATOR_PASSWORD`

3. **Bootstrap de tenant em produção (opt-in)**: Quando
   `PRODUCTION_BOOTSTRAP_ENABLED=true`, associa um usuário já existente a um
   tenant real por `prisma/seed-production-tenant.ts`. Ele não cria usuário
   nem aceita `default-tenant`.

4. **Inicia aplicação**: Sobe o servidor NestJS
   ```bash
   node dist/main
   ```

## Deploy na VPS

### Opção 1: Docker Compose (desenvolvimento/VPS simples)

```bash
# Na VPS
cd /seu/projeto
git pull
docker-compose up -d --build
```

### Opção 2: Build manual do Docker

```bash
# Build da imagem
docker build -t vend-backend .

# Run do container
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e JWT_SECRET="seu-secret" \
  --name vend-backend \
  vend-backend
```

### Opção 3: Com docker-compose.yml

```bash
docker-compose up -d --build
```

## Scripts disponíveis

### Para desenvolvimento local:

```bash
# Inicializar banco (primeira vez)
./init-database.sh

# Resetar banco (CUIDADO: apaga tudo!)
./reset-database.sh

# OU usar comandos Prisma diretamente:
npx prisma migrate dev      # Criar nova migration
npx prisma migrate deploy   # Aplicar migrations (produção)
npx prisma db seed         # Executar seed
npx tsx prisma/seed.ts     # Executar seed diretamente
npx prisma studio          # Abrir interface visual
```

## Variáveis de ambiente necessárias

Crie um arquivo `.env` na VPS com:

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"

# Redis
REDIS_HOST="localhost"
REDIS_PORT=6379

# JWT
JWT_SECRET="seu-secret-super-seguro"
JWT_EXPIRES_IN="7d"

# Server
PORT=3000
NODE_ENV=production
APP_URL="https://seu-dominio.com"

# Bootstrap operacional de uma conta existente (usar somente em um deploy)
PRODUCTION_BOOTSTRAP_ENABLED=false
PRODUCTION_BOOTSTRAP_TENANT_ID=""
PRODUCTION_BOOTSTRAP_TENANT_NAME=""
PRODUCTION_BOOTSTRAP_ADMIN_EMAIL=""
# Opcional: rotaciona a senha e revoga sessoes ativas; minimo de 16 caracteres.
PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD=""

# CORS
CORS_ORIGINS="https://seu-frontend.com"

# InsightAI — LLM (opcional; sem chave → heurística)
INSIGHT_AI_DEFAULT_PROVIDER="openai"
# INSIGHT_AI_ANTHROPIC_DISABLED=1
# INSIGHT_AI_GEMINI_DISABLED=1
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-4o-mini"
ANTHROPIC_API_KEY=""
ANTHROPIC_MODEL="claude-3-5-haiku-20241022"
GEMINI_API_KEY=""
# ou: GOOGLE_AI_API_KEY=""
GEMINI_MODEL="gemini-2.0-flash"
# Opcional: após `botify.handoff.created`, enfileira análise InsightAI pelo mesmo E.164 (default off)
# INSIGHT_AI_ON_BOTIFY_HANDOFF=true

# Meta WhatsApp
META_WEBHOOK_TOKEN="seu-token"
META_APP_SECRET="seu-secret"
```

## Verificar se funcionou

```bash
# Ver logs do container
docker logs vend-backend

# Em desenvolvimento, você deve ver:
# 🔄 Executando migrações do Prisma...
# ✅ Migrações concluídas
# 🌱 Verificando se precisa executar seed...
# 📦 Banco vazio, executando seed...
# ✅ Seed concluído com sucesso!
```

## Seed de desenvolvimento

O seed de desenvolvimento cria os usuários de exemplo somente com senhas
fornecidas por variáveis `SEED_*_PASSWORD`. Senhas não são versionadas nem
impressas nos logs. Ele falha deliberadamente se executado com
`NODE_ENV=production`.

## Vincular conta a tenant em produção

No painel de ambiente do container, habilite temporariamente:

```env
PRODUCTION_BOOTSTRAP_ENABLED=true
PRODUCTION_BOOTSTRAP_TENANT_ID=tatica-marketing
PRODUCTION_BOOTSTRAP_TENANT_NAME="Tatica Marketing"
PRODUCTION_BOOTSTRAP_ADMIN_EMAIL=admin@vend.com
PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD="<senha-nova-segura>"
```

Faça um deploy do backend e verifique no log:

```text
Production tenant membership ensured for admin@vend.com in tatica-marketing.
Administrator password rotated: yes.
```

Depois, remova `PRODUCTION_BOOTSTRAP_*` do ambiente e faça novo restart/deploy.
O campo de senha deve ser usado quando a conta tiver passado por um seed antigo
ou outra credencial exposta; a rotação revoga todas as sessões refresh ativas.

## Troubleshooting

### Seed não executa
```bash
# Somente desenvolvimento, com as senhas SEED_* definidas
docker exec -it vend-backend npx tsx prisma/seed.ts
```

### Migrations não aplicam
```bash
# Verificar conexão com banco
docker exec -it vend-backend npx prisma db pull

# Forçar migrations
docker exec -it vend-backend npx prisma migrate deploy
```

### Resetar banco em produção (CUIDADO!)
```bash
docker exec -it vend-backend npx prisma migrate reset
```

## Atualizações futuras

Quando fizer mudanças no código:

```bash
# Na VPS
git pull
docker-compose up -d --build
```

O entrypoint vai aplicar automaticamente:
- Novas migrations (se houver)
- Seed (apenas se banco estiver vazio)
- Nova versão da aplicação
