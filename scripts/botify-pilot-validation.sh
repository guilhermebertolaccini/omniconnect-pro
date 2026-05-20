#!/usr/bin/env bash
# Botify + Chips Omni — validação operacional automatizada (Fase 2 + piloto inbound).
# Uso:
#   cp scripts/botify-pilot-validation.env.example scripts/botify-pilot-validation.env
#   # editar .env (secret, senha admin, etc.)
#   ./scripts/botify-pilot-validation.sh
#
# Docs: docs/migration/botify-phase2-operational-validation.md
#       docs/migration/botify-inbound-channels-flow.md
#       docs/migration/pilot-flow-lead-to-recovery.md (§3.4 handoff manual)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_ENV_FILE="${REPO_ROOT}/apps/omniconnect-backend/.env"
PILOT_ENV_FILE="${SCRIPT_DIR}/botify-pilot-validation.env"

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  set -a
  # shellcheck source=/dev/null
  source "$file"
  set +a
}

load_env_file "$BACKEND_ENV_FILE"
BACKEND_BOTIFY_INTERNAL_SYNC_SECRET="${BOTIFY_INTERNAL_SYNC_SECRET:-}"
load_env_file "$PILOT_ENV_FILE"

OMNICONNECT_BACKEND_URL="${OMNICONNECT_BACKEND_URL:-http://localhost:3000}"
BOTIFY_MICROSERVICE_URL="${BOTIFY_MICROSERVICE_URL:-http://localhost:3001}"
OMNICONNECT_TENANT_ID="${OMNICONNECT_TENANT_ID:-default-tenant}"
OMNICONNECT_LOGIN_EMAIL="${OMNICONNECT_LOGIN_EMAIL:-admin@vend.com}"
BOTIFY_PILOT_WABA_ID="${BOTIFY_PILOT_WABA_ID:-pilot-waba-dev}"
BOTIFY_PILOT_PHONE_NUMBER_ID="${BOTIFY_PILOT_PHONE_NUMBER_ID:-000000000000000}"
BOTIFY_PILOT_PREFIX="${BOTIFY_PILOT_PREFIX:-pilot}"
BOTIFY_SKIP_MIGRATE="${BOTIFY_SKIP_MIGRATE:-0}"
BOTIFY_SKIP_CREATE="${BOTIFY_SKIP_CREATE:-0}"
BOTIFY_PILOT_CLEANUP="${BOTIFY_PILOT_CLEANUP:-0}"

RUN_ID="$(date +%Y%m%d%H%M%S)"
PILOT_TAG="${BOTIFY_PILOT_PREFIX}-${RUN_ID}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/botify-pilot-XXXXXX")"
trap 'rm -rf "${TMP_DIR}"' EXIT

BOT_ID=""
FLOW_ID=""
META_ACCOUNT_ID=""
JWT=""
CREATED_RESOURCES=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

usage() {
  cat <<'EOF'
botify-pilot-validation.sh — smoke Botify Omni (meta-accounts, fluxos, internal API)

Opções:
  -h, --help           Mostra esta ajuda
  --skip-migrate       Não executa prisma migrate deploy
  --skip-create        Só pré-requisitos + health + probes internos (sem criar bot/fluxo)
  --cleanup            Apaga recursos criados nesta execução (BOTIFY_PILOT_CLEANUP=1)

Variáveis: ver scripts/botify-pilot-validation.env.example
EOF
}

log_step() { echo -e "\n${CYAN}==> $*${NC}"; }
ok() { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Comando obrigatório em falta: $1"
}

json_get() {
  local file="$1" expr="$2"
  if [[ -f "$file" ]]; then
    jq -er "$expr" "$file" 2>/dev/null
  else
    jq -er "$expr" <<<"$file" 2>/dev/null
  fi
}

http_code() {
  local file="$1"
  head -n1 "$file" | awk '{print $2}'
}

http_body() {
  local file="$1"
  sed '1,2d' "$file"
}

save_response() {
  local out="$1"
  shift
  curl -sS -w '\nHTTP_STATUS:%{http_code}\n' "$@" | awk '
    /^HTTP_STATUS:/ { code = substr($0, 13); next }
    { body = body (NR>1 ? ORS : "") $0 }
    END {
      print "HTTP/1.1 " code;
      print "";
      printf "%s", body
    }
  ' >"$out"
}

expect_status() {
  local file="$1" want="$2" label="$3"
  local got
  got="$(http_code "$file")"
  if [[ "$got" != "$want" ]]; then
    echo "--- resposta ($label, esperado HTTP $want, obteve $got) ---"
    http_body "$file" | head -c 2000
    echo ""
    if [[ "$label" == *"internal"* && "$got" == "401" ]]; then
      warn "401 em rota internal: o processo do backend pode ter sido iniciado com outro BOTIFY_INTERNAL_SYNC_SECRET."
      warn "Reinicie o backend após alterar apps/omniconnect-backend/.env (pnpm --filter omniconnect-backend run start:dev)."
      warn "Confirme que o valor em scripts/botify-pilot-validation.env é idêntico ao .env do backend em execução."
    fi
    fail "$label"
  fi
  ok "$label (HTTP $got)"
}

expect_status_in() {
  local file="$1" label="$2"
  shift 2
  local got want
  got="$(http_code "$file")"
  for want in "$@"; do
    if [[ "$got" == "$want" ]]; then
      ok "$label (HTTP $got)"
      return 0
    fi
  done
  echo "--- resposta ($label, esperado um de: $*, obteve $got) ---"
  http_body "$file" | head -c 2000
  echo ""
  fail "$label"
}

api_jwt() {
  local method="$1" path="$2" body="${3:-}"
  local out="${TMP_DIR}/jwt-$(echo -n "${method}${path}" | shasum -a 256 2>/dev/null | cut -c1-12 || echo "$RANDOM").resp"
  local args=(-sS -X "$method" "${OMNICONNECT_BACKEND_URL}${path}"
    -H "Authorization: Bearer ${JWT}"
    -H "Content-Type: application/json")
  if [[ -n "$body" ]]; then
    args+=(-d "$body")
  fi
  save_response "$out" "${args[@]}"
  echo "$out"
}

api_internal() {
  local method="$1" path="$2" body="${3:-}"
  local out="${TMP_DIR}/internal-$(echo -n "${method}${path}" | shasum -a 256 2>/dev/null | cut -c1-12 || echo "$RANDOM").resp"
  local args=(-sS -X "$method" "${OMNICONNECT_BACKEND_URL}${path}"
    -H "Authorization: Bearer ${BOTIFY_INTERNAL_SYNC_SECRET}"
    -H "X-Omni-Tenant-Id: ${OMNICONNECT_TENANT_ID}"
    -H "Content-Type: application/json")
  if [[ -n "$body" ]]; then
    args+=(-d "$body")
  fi
  save_response "$out" "${args[@]}"
  echo "$out"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --skip-migrate) BOTIFY_SKIP_MIGRATE=1 ;;
    --skip-create) BOTIFY_SKIP_CREATE=1 ;;
    --cleanup) BOTIFY_PILOT_CLEANUP=1 ;;
    *) fail "Opção desconhecida: $1 (use --help)" ;;
  esac
  shift
done

need_cmd curl
need_cmd jq

echo "Repositório: ${REPO_ROOT}"
echo "Backend:     ${OMNICONNECT_BACKEND_URL}"
echo "Tenant:      ${OMNICONNECT_TENANT_ID}"
echo "Tag piloto:  ${PILOT_TAG}"
[[ -f "$BACKEND_ENV_FILE" ]] && echo "Env backend: ${BACKEND_ENV_FILE}" || warn "apps/omniconnect-backend/.env não encontrado"
if [[ -n "$BACKEND_BOTIFY_INTERNAL_SYNC_SECRET" && -n "${BOTIFY_INTERNAL_SYNC_SECRET:-}" && "$BACKEND_BOTIFY_INTERNAL_SYNC_SECRET" != "$BOTIFY_INTERNAL_SYNC_SECRET" ]]; then
  fail "BOTIFY_INTERNAL_SYNC_SECRET diverge entre apps/omniconnect-backend/.env e scripts/botify-pilot-validation.env"
fi

# --- 1. Migrações ---
log_step "1/10 — Migrações Prisma (Sprint 6 Botify)"
if [[ "${BOTIFY_SKIP_MIGRATE}" == "1" ]]; then
  warn "BOTIFY_SKIP_MIGRATE=1 — a saltar migrate deploy"
else
  if command -v pnpm >/dev/null 2>&1; then
    (cd "${REPO_ROOT}" && pnpm --filter omniconnect-backend exec prisma migrate deploy)
  elif [[ -x "${REPO_ROOT}/apps/omniconnect-backend/node_modules/.bin/prisma" ]]; then
    (cd "${REPO_ROOT}/apps/omniconnect-backend" && ./node_modules/.bin/prisma migrate deploy)
  else
    fail "pnpm ou prisma local não encontrados — instale deps ou use --skip-migrate"
  fi
  ok "migrate deploy concluído"
  for mig in \
    20260523140000_sprint_6_botify_domain \
    20260524120000_sprint_6_botify_conversations \
    20260525100000_sprint_6_botify_meta_accounts; do
    if [[ -d "${REPO_ROOT}/apps/omniconnect-backend/prisma/migrations/${mig}" ]] || \
       (cd "${REPO_ROOT}/apps/omniconnect-backend" && \
        command -v pnpm >/dev/null 2>&1 && \
        pnpm exec prisma migrate status 2>/dev/null | grep -q "$mig"); then
      ok "migration presente: $mig"
    else
      warn "não foi possível confirmar $mig no migrate status (verifique manualmente)"
    fi
  done
fi

# --- 2. Health backend ---
log_step "2/10 — GET /health (backend)"
health_file="${TMP_DIR}/health.resp"
save_response "$health_file" -sS "${OMNICONNECT_BACKEND_URL}/health"
expect_status "$health_file" "200" "Backend health"
health_body="$(http_body "$health_file")"
echo "$health_body" | jq . 2>/dev/null || echo "$health_body"
if [[ -z "${BOTIFY_INTERNAL_SYNC_SECRET:-}" ]]; then
  warn "BOTIFY_INTERNAL_SYNC_SECRET não definido — passos internal (7) falharão"
else
  configured="$(echo "$health_body" | jq -r '.botifyInternalSync.configured // false')"
  [[ "$configured" == "true" ]] && ok "botifyInternalSync.configured=true" || warn "botifyInternalSync.configured=$configured (defina o secret no .env do backend)"
fi

# --- 3. JWT ---
log_step "3/10 — Autenticação JWT"
if [[ -n "${BOTIFY_JWT_TOKEN:-}" ]]; then
  JWT="$BOTIFY_JWT_TOKEN"
  ok "BOTIFY_JWT_TOKEN definido (login ignorado)"
else
  if [[ -z "${OMNICONNECT_LOGIN_PASSWORD:-}" ]]; then
    fail "Defina OMNICONNECT_LOGIN_PASSWORD ou BOTIFY_JWT_TOKEN em scripts/botify-pilot-validation.env"
  fi
  login_file="${TMP_DIR}/login.resp"
  save_response "$login_file" -sS -X POST "${OMNICONNECT_BACKEND_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc --arg e "$OMNICONNECT_LOGIN_EMAIL" --arg p "$OMNICONNECT_LOGIN_PASSWORD" '{email:$e,password:$p}')"
  expect_status_in "$login_file" "POST /auth/login" 200 201
  JWT="$(json_get "$(http_body "$login_file")" '.access_token // .accessToken')"
  [[ -n "$JWT" && "$JWT" != "null" ]] || fail "access_token em falta na resposta de login"
  ok "JWT obtido"
fi

me_file="$(api_jwt GET /auth/me)"
if [[ "$(http_code "$me_file")" == "200" ]]; then
  ok "GET /auth/me"
else
  warn "GET /auth/me retornou $(http_code "$me_file") — token pode estar inválido"
fi

if [[ "${BOTIFY_SKIP_CREATE}" == "1" ]]; then
  log_step "4–6/10 — SKIP_CREATE (sem criar bot/fluxo/conta)"
  if [[ -n "${BOTIFY_EXISTING_FLOW_ID:-}" ]]; then
    FLOW_ID="$BOTIFY_EXISTING_FLOW_ID"
    ok "BOTIFY_EXISTING_FLOW_ID=$FLOW_ID"
  else
    warn "Defina BOTIFY_EXISTING_FLOW_ID para testar runtime-config/simulate"
  fi
  if [[ -n "${BOTIFY_EXISTING_WABA_ID:-}" ]]; then
    BOTIFY_PILOT_WABA_ID="$BOTIFY_EXISTING_WABA_ID"
  fi
else
  # --- 4. Bot + fluxo + publish ---
  log_step "4/10 — Bot, fluxo mínimo e publish"
  bot_file="$(api_jwt POST /botify/bots "$(jq -nc --arg n "${PILOT_TAG}-bot" '{name:$n, isActive:true}')")"
  expect_status_in "$bot_file" "POST /botify/bots" 200 201
  BOT_ID="$(json_get "$(http_body "$bot_file")" '.id')"
  CREATED_RESOURCES=1

  MINIMAL_NODES='[
    {"id":"start-1","type":"start","position":{"x":0,"y":0},"data":{},"connections":["msg-1"]},
    {"id":"msg-1","type":"message","position":{"x":200,"y":0},"data":{"content":"Olá — piloto Botify Omni."},"connections":[]}
  ]'

  flow_file="$(api_jwt POST /botify/flows "$(jq -nc --arg botId "$BOT_ID" --arg n "${PILOT_TAG}-flow" --argjson nodes "$MINIMAL_NODES" '{botId:$botId,name:$n,nodes:$nodes}')")"
  expect_status_in "$flow_file" "POST /botify/flows" 200 201
  FLOW_ID="$(json_get "$(http_body "$flow_file")" '.id')"

  pub_file="$(api_jwt POST "/botify/flows/${FLOW_ID}/publish" "")"
  expect_status_in "$pub_file" "POST /botify/flows/:id/publish" 200 201
  ok "flowId=$FLOW_ID botId=$BOT_ID"

  # --- 5. Meta account (Chips Omni) ---
  log_step "5/10 — Conta Meta (CRUD smoke)"
  DEV_TOKEN="dev-pilot-token-minimum-32-chars-long"
  meta_file="$(api_jwt POST /botify/meta-accounts "$(jq -nc \
    --arg name "${PILOT_TAG}-meta" \
    --arg waba "$BOTIFY_PILOT_WABA_ID" \
    --arg botId "$BOT_ID" \
    --arg flowId "$FLOW_ID" \
    --arg phone "$BOTIFY_PILOT_PHONE_NUMBER_ID" \
    --arg token "$DEV_TOKEN" \
    '{
      name: $name,
      metaWabaAccountId: $waba,
      accessToken: $token,
      phoneNumberIds: [$phone],
      defaultBotId: $botId,
      defaultFlowId: $flowId,
      activate: true
    }')")"
  expect_status_in "$meta_file" "POST /botify/meta-accounts" 200 201
  META_ACCOUNT_ID="$(json_get "$(http_body "$meta_file")" '.id')"
  ok "metaAccountId=$META_ACCOUNT_ID"

  list_file="$(api_jwt GET /botify/meta-accounts)"
  expect_status "$list_file" "200" "GET /botify/meta-accounts"

  active_file="$(api_jwt GET /botify/meta-accounts/active)"
  expect_status "$active_file" "200" "GET /botify/meta-accounts/active"

  cred_file="$(api_jwt GET "/botify/meta-accounts/${META_ACCOUNT_ID}/credentials")"
  expect_status "$cred_file" "200" "GET /botify/meta-accounts/:id/credentials"
  masked="$(json_get "$(http_body "$cred_file")" '.accessToken // .accessTokenMasked // empty')"
  [[ -n "$masked" ]] && ok "credentials devolvidas (mascaradas ou token)" || warn "resposta credentials sem token visível"

  # --- 6. Vincular bot ao canal ---
  log_step "6/10 — PATCH bot channel (metaAccountId + defaultFlowId)"
  ch_file="$(api_jwt PATCH "/botify/bots/${BOT_ID}/channel" "$(jq -nc \
    --arg mid "$META_ACCOUNT_ID" \
    --arg flow "$FLOW_ID" \
    --arg phone "$BOTIFY_PILOT_PHONE_NUMBER_ID" \
    --arg waba "$BOTIFY_PILOT_WABA_ID" \
    '{metaAccountId:$mid, defaultFlowId:$flow, phoneNumberId:$phone, metaWabaAccountId:$waba}')")"
  expect_status "$ch_file" "200" "PATCH /botify/bots/:id/channel"
fi

# --- 7. Internal API ---
log_step "7/10 — Internal sync (runtime-config + routing)"
[[ -n "${BOTIFY_INTERNAL_SYNC_SECRET:-}" ]] || fail "BOTIFY_INTERNAL_SYNC_SECRET obrigatório para passo 7"

if [[ -n "$FLOW_ID" ]]; then
  unauth_file="${TMP_DIR}/unauth.resp"
  save_response "$unauth_file" -sS "${OMNICONNECT_BACKEND_URL}/botify/internal/flows/${FLOW_ID}/runtime-config" \
    -H "X-Omni-Tenant-Id: ${OMNICONNECT_TENANT_ID}"
  expect_status "$unauth_file" "401" "runtime-config sem Bearer (esperado 401)"

  rt_file="$(api_internal GET "/botify/internal/flows/${FLOW_ID}/runtime-config")"
  expect_status "$rt_file" "200" "GET internal flows/:id/runtime-config"
  node_count="$(json_get "$(http_body "$rt_file")" '(.nodes // []) | length')"
  [[ "${node_count:-0}" -ge 1 ]] && ok "runtime-config com ${node_count} nó(s)" || warn "runtime-config sem nós"
else
  warn "FLOW_ID vazio — a saltar runtime-config"
fi

route_file="$(api_internal GET "/botify/internal/routing/meta/${BOTIFY_PILOT_WABA_ID}")"
expect_status "$route_file" "200" "GET internal routing/meta/:accountId"
route_bot="$(json_get "$(http_body "$route_file")" '.botId')"
[[ -n "$route_bot" && "$route_bot" != "null" ]] && ok "routing → botId=$route_bot" || warn "routing sem botId"

# --- 8. Simulate ---
log_step "8/10 — POST /botify/runtime/simulate"
if [[ -n "$FLOW_ID" ]]; then
  sim_file="$(api_jwt POST /botify/runtime/simulate "$(jq -nc --arg fid "$FLOW_ID" '{flowId:$fid,text:"oi piloto"}')")"
  expect_status_in "$sim_file" "POST /botify/runtime/simulate" 200 201
  steps="$(json_get "$(http_body "$sim_file")" '(.steps // []) | length')"
  ok "simulate steps=$steps"
  http_body "$sim_file" | jq '{flowId, steps: (.steps | length), outboundMessages}' 2>/dev/null || true
else
  warn "FLOW_ID vazio — a saltar simulate"
fi

# --- 9. Microserviço health ---
log_step "9/10 — GET microserviço /health (opcional)"
ms_file="${TMP_DIR}/ms-health.resp"
if save_response "$ms_file" -sS --connect-timeout 3 "${BOTIFY_MICROSERVICE_URL}/health" 2>/dev/null; then
  code="$(http_code "$ms_file")"
  if [[ "$code" == "200" ]]; then
    ok "Microserviço health OK"
    http_body "$ms_file" | jq '.botifyFlow // .checks // .' 2>/dev/null || http_body "$ms_file" | head -c 500
  else
    warn "Microserviço respondeu HTTP $code (subir serviço se quiser validar webhook)"
  fi
else
  warn "Microserviço inacessível em ${BOTIFY_MICROSERVICE_URL} (normal se só backend estiver up)"
fi

# Conversas (JWT)
if [[ -n "$BOT_ID" ]]; then
  conv_list="$(api_jwt GET "/botify/conversations?botId=${BOT_ID}&limit=5")"
  [[ "$(http_code "$conv_list")" == "200" ]] && ok "GET /botify/conversations" || warn "list conversations HTTP $(http_code "$conv_list")"
fi

# --- 10. Manual ---
log_step "10/10 — Passos manuais (handoff + CRM + webhook real)"
cat <<EOF

Os passos automáticos cobrem API Omni + internal sync. Complete manualmente:

  A) Webhook Meta real
     - Microserviço: META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN
     - URL: ${BOTIFY_MICROSERVICE_URL}/webhooks/meta
     - Conta WABA/telefone reais no Chips (Settings)

  B) Três entradas (HSM / SAA / orgânico) — mesmo pipeline:
     docs/migration/botify-inbound-channels-flow.md

  C) Handoff humano → Omni inbox
     - Nó transfer no fluxo; evento botify.handoff.created
     - Campos: docs/migration/pilot-flow-lead-to-recovery.md §3.4

  D) Tabulação → CRM Imobiliário (integração do tenant)

IDs desta execução (se criados):
  botId=${BOT_ID:-—}
  flowId=${FLOW_ID:-—}
  metaAccountId=${META_ACCOUNT_ID:-—}
  metaWabaAccountId=${BOTIFY_PILOT_WABA_ID}
EOF

# --- Cleanup ---
if [[ "${BOTIFY_PILOT_CLEANUP}" == "1" && "${CREATED_RESOURCES}" == "1" ]]; then
  log_step "Cleanup — apagar recursos do piloto"
  [[ -n "$FLOW_ID" ]] && api_jwt DELETE "/botify/flows/${FLOW_ID}" >/dev/null && ok "flow apagado" || true
  [[ -n "$META_ACCOUNT_ID" ]] && api_jwt DELETE "/botify/meta-accounts/${META_ACCOUNT_ID}" >/dev/null && ok "meta account apagada" || true
  [[ -n "$BOT_ID" ]] && api_jwt DELETE "/botify/bots/${BOT_ID}" >/dev/null && ok "bot apagado" || true
fi

echo ""
ok "Validação automatizada concluída."
