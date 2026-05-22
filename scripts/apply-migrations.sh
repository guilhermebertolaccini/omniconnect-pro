#!/usr/bin/env bash
# Aplica `prisma migrate deploy` nos DOIS bancos locais (dev + staging-mirror).
#
# Necessário porque o "Mix dos dois" cenário mantém estados separados — se
# você só roda migrate contra um, o outro desincroniza e o backend que
# usar o desatualizado quebra.
#
# Uso:
#   ./scripts/apply-migrations.sh         # aplica nos dois
#   ./scripts/apply-migrations.sh dev     # só dev
#   ./scripts/apply-migrations.sh staging # só staging
#
# Pré-requisitos:
#   - Pelo menos um dos Postgres up
#   - `pnpm install` já rodado na raiz
#
# Read-only sobre o banco em si: `migrate deploy` é idempotente; se já está
# aplicado, retorna no-op.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/apps/omniconnect-backend"
TARGET="${1:-both}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

step() { echo -e "\n${CYAN}==> $*${NC}"; }
ok() { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; }

# URLs canônicas locais — alinhadas com docker-compose.yml e .env.staging
DEV_URL="postgresql://dev:dev@localhost:5432/omniconnect?schema=public"
STAGING_URL="postgresql://omni:local-staging-pw@localhost:15432/omniconnect_staging?schema=public"

probe() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

run_migrate() {
  local name="$1"
  local url="$2"
  local port="$3"

  step "${name} (postgres :${port})"

  if ! probe "$port"; then
    warn "Postgres não está em :${port}. Skipping ${name}."
    return 1
  fi

  cd "$BACKEND_DIR"
  if DATABASE_URL="$url" npx pnpm@9.12.0 exec prisma migrate deploy 2>&1 | tail -10; then
    ok "${name} sincronizado"
    return 0
  else
    fail "${name} falhou"
    return 1
  fi
}

declare -i dev_done=0
declare -i staging_done=0

case "$TARGET" in
  dev)
    run_migrate "DEV" "$DEV_URL" 5432 && dev_done=1
    ;;
  staging)
    run_migrate "STAGING-MIRROR" "$STAGING_URL" 15432 && staging_done=1
    ;;
  both|"")
    run_migrate "DEV" "$DEV_URL" 5432 && dev_done=1
    run_migrate "STAGING-MIRROR" "$STAGING_URL" 15432 && staging_done=1
    ;;
  *)
    fail "Target inválido: $TARGET (use: dev | staging | both)"
    exit 2
    ;;
esac

echo ""
echo "─────────────────────────────────────────"
if [[ "$TARGET" == "both" || -z "$TARGET" ]]; then
  if (( dev_done == 1 && staging_done == 1 )); then
    ok "Ambos os bancos sincronizados."
    exit 0
  elif (( dev_done == 0 && staging_done == 0 )); then
    fail "Nenhum banco atualizado — verifique que pelo menos um Postgres esteja up."
    exit 1
  else
    warn "Parcial: dev=${dev_done} staging=${staging_done}."
    exit 1
  fi
fi
