#!/usr/bin/env bash
# Aponta o Hub (vite dev no host) para o backend DEV em `localhost:3000`.
#
# Após rodar este script:
#   1. Mate o processo vite dev atual (Ctrl+C ou `kill <pid>`)
#   2. Suba de novo: `pnpm --filter omniconnect-hub run dev`
#      (o Vite só lê `.env.local` no startup; HMR não cobre env)
#
# Pré-requisito: backend host rodando em :3000 (`pnpm dev:backend`).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/apps/omniconnect-hub/.env.local"

cat > "$ENV_FILE" <<'EOF'
# omniconnect-hub — vite dev no host apontando para backend DEV.
# Gerado por scripts/hub-aim-dev.sh. .gitignored.

VITE_API_URL=http://localhost:3000

VITE_CRM_URL=http://localhost:5174
VITE_OMNIHUB_URL=http://localhost:5173
VITE_SAA_URL=http://localhost:5175
VITE_BOTIFY_URL=http://localhost:5176

VITE_USE_MOCK_AUTH=false
VITE_USE_MOCK_DATA=false
EOF

echo "✓ Hub apontando para DEV backend (localhost:3000)"
echo "  Reinicie o vite dev:   pnpm --filter omniconnect-hub run dev"
echo "  Browser:               http://localhost:8083"
echo ""
echo "Lembrete: o backend DEV (:3000) usa o DB de :5432 (omniconnect)."
echo "Confira que ele está up:  curl -sS http://localhost:3000/health | jq .status"
