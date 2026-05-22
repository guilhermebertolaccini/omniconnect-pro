#!/usr/bin/env bash
# Aponta o Hub (vite dev no host) para o backend STAGING-MIRROR em `localhost:13000`.
#
# Após rodar este script:
#   1. Mate o processo vite dev atual
#   2. Suba de novo: `pnpm --filter omniconnect-hub run dev`
#
# Pré-requisito: stack staging up (`docker compose --env-file .env.staging
# -f docker-compose.staging.yml up -d`). Containers expostos em portas
# offset (13000/14173/15432/16379/18080-18083).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/apps/omniconnect-hub/.env.local"

cat > "$ENV_FILE" <<'EOF'
# omniconnect-hub — vite dev no host apontando para backend STAGING-MIRROR.
# Gerado por scripts/hub-aim-staging.sh. .gitignored.

VITE_API_URL=http://localhost:13000

VITE_CRM_URL=http://localhost:18081
VITE_OMNIHUB_URL=http://localhost:18080
VITE_SAA_URL=http://localhost:18082
VITE_BOTIFY_URL=http://localhost:18083

VITE_USE_MOCK_AUTH=false
VITE_USE_MOCK_DATA=false
EOF

echo "✓ Hub apontando para STAGING-MIRROR backend (localhost:13000)"
echo "  Reinicie o vite dev:   pnpm --filter omniconnect-hub run dev"
echo "  Browser:               http://localhost:8083"
echo ""
echo "Lembrete: o backend STAGING (:13000) usa o DB de :15432 (omniconnect_staging)."
echo "Confira que ele está up:  curl -sS http://localhost:13000/health | jq .status"
