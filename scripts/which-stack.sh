#!/usr/bin/env bash
# Diagnostic: o que está rodando localmente?
#
# Mostra estado das duas stacks (dev + staging-mirror) lado a lado, mais
# o vite dev do Hub no host. Read-only: não inicia nem para nada.
#
# Uso:
#   ./scripts/which-stack.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HUB_ENV="${REPO_ROOT}/apps/omniconnect-hub/.env.local"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

# ─── Helpers ───────────────────────────────────────────────────────────────

port_owner() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 { printf "%s (PID %s)", $1, $2; exit }' || true
}

port_status() {
  local port="$1"
  local owner
  owner="$(port_owner "$port")"
  if [[ -n "$owner" ]]; then
    printf "${GREEN}✓${NC} %-7s  ${DIM}%s${NC}" "$port" "$owner"
  else
    printf "${RED}✗${NC} %-7s  ${DIM}(livre)${NC}" "$port"
  fi
}

container_status() {
  local name="$1"
  local state
  state="$(docker ps --filter "name=^${name}$" --format '{{.Status}}' 2>/dev/null | head -n1)"
  if [[ -n "$state" ]]; then
    printf "${GREEN}✓${NC} %s" "$state"
  else
    printf "${RED}✗${NC} parado"
  fi
}

health_http() {
  local url="$1"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 "$url" 2>/dev/null || echo "000")"
  if [[ "$code" == "200" ]]; then
    printf "${GREEN}HTTP 200${NC}"
  else
    printf "${YELLOW}HTTP %s${NC}" "$code"
  fi
}

# ─── Output ────────────────────────────────────────────────────────────────

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║ DEV stack — docker-compose.yml (raiz)                        ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
printf "  postgres :5432   "; port_status 5432; echo ""
printf "  redis    :6379   "; port_status 6379; echo ""
printf "  backend host :3000   "; port_status 3000; echo "   $(health_http http://localhost:3000/health)"
echo -e "  ${DIM}Containers:${NC} omniconnect-pro-postgres / omniconnect-pro-redis"
echo -e "  ${DIM}DB:${NC} postgresql://dev:dev@localhost:5432/omniconnect"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║ STAGING-MIRROR stack — docker-compose.staging.yml             ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
printf "  postgres :15432  "; port_status 15432; echo ""
printf "  redis    :16379  "; port_status 16379; echo ""
printf "  backend  :13000  "; port_status 13000; echo "   $(health_http http://localhost:13000/health)"
printf "  hub      :14173  "; port_status 14173; echo "   $(health_http http://localhost:14173/)"
echo -e "  ${DIM}Containers:${NC}"
echo -n "    omni-staging-postgres : "; container_status omni-staging-postgres; echo ""
echo -n "    omni-staging-redis    : "; container_status omni-staging-redis;    echo ""
echo -n "    omni-staging-backend  : "; container_status omni-staging-backend;  echo ""
echo -n "    omni-staging-hub      : "; container_status omni-staging-hub;      echo ""
echo -e "  ${DIM}DB:${NC} postgresql://omni:***@localhost:15432/omniconnect_staging"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║ HOST vite dev — Hub fora do Docker                            ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
printf "  hub vite :8083   "; port_status 8083; echo "   $(health_http http://localhost:8083/)"
if [[ -f "$HUB_ENV" ]]; then
  api_url="$(grep -E '^VITE_API_URL' "$HUB_ENV" 2>/dev/null | head -1 | sed 's/^VITE_API_URL=//')"
  mock_auth="$(grep -E '^VITE_USE_MOCK_AUTH' "$HUB_ENV" 2>/dev/null | head -1 | sed 's/^VITE_USE_MOCK_AUTH=//')"
  mock_data="$(grep -E '^VITE_USE_MOCK_DATA' "$HUB_ENV" 2>/dev/null | head -1 | sed 's/^VITE_USE_MOCK_DATA=//')"
  echo -e "  ${DIM}.env.local:${NC} ${HUB_ENV/$REPO_ROOT\//}"
  echo -e "  ${DIM}VITE_API_URL=${NC} ${api_url:-${YELLOW}<não setado>${NC}}"
  echo -e "  ${DIM}VITE_USE_MOCK_AUTH=${NC} ${mock_auth:-${YELLOW}<não setado>${NC}}   ${DIM}VITE_USE_MOCK_DATA=${NC} ${mock_data:-${YELLOW}<não setado>${NC}}"
else
  echo -e "  ${YELLOW}sem .env.local — rode ./scripts/hub-aim-dev.sh ou ./scripts/hub-aim-staging.sh${NC}"
fi

echo ""
echo -e "${DIM}Para alternar:${NC}"
echo -e "  ${DIM}./scripts/hub-aim-dev.sh       # Hub → backend host :3000 + DB :5432${NC}"
echo -e "  ${DIM}./scripts/hub-aim-staging.sh   # Hub → backend Docker :13000 + DB :15432${NC}"
echo -e "  ${DIM}./scripts/apply-migrations.sh  # Migrate ambos os bancos${NC}"
echo ""
