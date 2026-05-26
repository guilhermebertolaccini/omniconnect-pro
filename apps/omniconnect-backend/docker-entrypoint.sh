#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL não definida. Configure a URL interna do Postgres no Coolify antes de iniciar o backend."
  exit 1
fi

# Regenerar Prisma Client para garantir que está sincronizado com o schema
echo "🔄 Regenerando Prisma Client..."
npx prisma generate

# Aplicar migrations versionadas. Idempotente — no-op se já no head.
# Sem isto, `seed` e `main` falham com "table does not exist" no primeiro boot.
echo "🚚 Aplicando migrations (prisma migrate deploy)..."
npx prisma migrate deploy

# Bootstrap operacional opt-in: associa um usuario existente a um tenant real.
# Deve ser habilitado apenas durante o deploy de inicializacao/correcao.
if [ "$PRODUCTION_BOOTSTRAP_ENABLED" = "true" ]; then
  echo "Running explicit production tenant bootstrap..."
  npx tsx prisma/seed-production-tenant.ts
fi

# O seed de demonstracao nunca deve popular um banco em producao.
if [ "$NODE_ENV" != "production" ]; then
  echo "Checking whether the development seed is required..."
  USER_COUNT=$(npx prisma db execute --stdin <<EOF
SELECT COUNT(*) as count FROM "User";
EOF
2>/dev/null | tail -n 1 | grep -o '[0-9]\+' || echo "0")

  if [ "$USER_COUNT" = "0" ]; then
    echo "Empty development database, running development seed..."
    if npx tsx prisma/seed.ts; then
      echo "Development seed finished successfully."
    else
      echo "Development seed failed; continuing startup."
    fi
  else
    echo "Database already contains users ($USER_COUNT); skipping development seed."
  fi
else
  echo "Production environment: development seed is disabled."
fi

# Executar comando passado como argumento (geralmente "node dist/main")
exec "$@"
