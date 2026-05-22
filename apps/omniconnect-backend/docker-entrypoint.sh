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

# Executar seed apenas se não houver usuários no banco (se DATABASE_URL estiver definida)
echo "🌱 Verificando se precisa executar seed..."
USER_COUNT=$(npx prisma db execute --stdin <<EOF
SELECT COUNT(*) as count FROM "User";
EOF
2>/dev/null | tail -n 1 | grep -o '[0-9]\+' || echo "0")

if [ "$USER_COUNT" = "0" ]; then
  echo "📦 Banco vazio, executando seed..."
  if npx tsx prisma/seed.ts; then
    echo "✅ Seed concluído com sucesso!"
  else
    echo "⚠️  Erro ao executar seed, mas continuando..."
  fi
else
  echo "ℹ️  Banco já possui dados ($USER_COUNT usuários), pulando seed"
fi

# Executar comando passado como argumento (geralmente "node dist/main")
exec "$@"
