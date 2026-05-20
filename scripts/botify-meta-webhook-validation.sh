#!/usr/bin/env bash
# Meta webhook -> Botify microservice -> Omni runtime -> handoff -> MessageQueue.
#
# Uso:
#   ./scripts/botify-meta-webhook-validation.sh
#
# Requer backend Omni rodando em OMNICONNECT_BACKEND_URL e Redis local.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_ENV_FILE="${REPO_ROOT}/apps/omniconnect-backend/.env"
PILOT_ENV_FILE="${SCRIPT_DIR}/botify-pilot-validation.env"
MICRO_DIR="${REPO_ROOT}/apps/botify/wordpress-plugin/botflow-manager/microservice"

ENV_OMNICONNECT_BACKEND_URL="${OMNICONNECT_BACKEND_URL:-}"
ENV_BOTIFY_MICROSERVICE_URL="${BOTIFY_MICROSERVICE_URL:-}"

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
[[ -n "$ENV_OMNICONNECT_BACKEND_URL" ]] && OMNICONNECT_BACKEND_URL="$ENV_OMNICONNECT_BACKEND_URL"
[[ -n "$ENV_BOTIFY_MICROSERVICE_URL" ]] && BOTIFY_MICROSERVICE_URL="$ENV_BOTIFY_MICROSERVICE_URL"

OMNICONNECT_BACKEND_URL="${OMNICONNECT_BACKEND_URL:-http://localhost:3000}"
OMNICONNECT_TENANT_ID="${OMNICONNECT_TENANT_ID:-default-tenant}"
OMNICONNECT_LOGIN_EMAIL="${OMNICONNECT_LOGIN_EMAIL:-admin@vend.com}"
BOTIFY_MICROSERVICE_URL="${BOTIFY_MICROSERVICE_URL:-http://localhost:3001}"
BOTIFY_META_APP_SECRET="${BOTIFY_META_APP_SECRET:-dev-meta-app-secret}"
OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET="${OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET:-${BOTIFY_INTERNAL_SYNC_SECRET:-}}"
BOTIFY_META_PHONE="${BOTIFY_META_PHONE:-5511999990002}"
BOTIFY_META_QUEUE_PHONE="${BOTIFY_META_QUEUE_PHONE:-+${BOTIFY_META_PHONE//[^0-9]/}}"
BOTIFY_META_PREFIX="${BOTIFY_META_PREFIX:-pilot-meta}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"

RUN_ID="$(date +%Y%m%d%H%M%S)"
PILOT_TAG="${BOTIFY_META_PREFIX}-${RUN_ID}"
WABA_ID="${BOTIFY_META_WABA_ID:-${PILOT_TAG}-waba}"
PHONE_NUMBER_ID="${BOTIFY_META_PHONE_NUMBER_ID:-${RUN_ID}}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/botify-meta-XXXXXX")"
STARTED_MICRO=0
MICRO_PID=""
cleanup() {
  if [[ -n "$MICRO_PID" ]]; then
    kill "$MICRO_PID" >/dev/null 2>&1 || true
    wait "$MICRO_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_step() { echo -e "\n${CYAN}==> $*${NC}"; }
ok() { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Comando obrigatório em falta: $1"
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

json_get() {
  local file="$1" expr="$2"
  jq -r "$expr" "$file" 2>/dev/null
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

need_cmd curl
need_cmd jq
need_cmd node

[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL em falta; confira apps/omniconnect-backend/.env"
[[ -n "${BOTIFY_INTERNAL_SYNC_SECRET:-}" ]] || fail "BOTIFY_INTERNAL_SYNC_SECRET em falta no env piloto/backend"
[[ -n "$OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET" ]] || fail "OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET ou BOTIFY_INTERNAL_SYNC_SECRET em falta"
if [[ -n "$BACKEND_BOTIFY_INTERNAL_SYNC_SECRET" && "$BACKEND_BOTIFY_INTERNAL_SYNC_SECRET" != "$BOTIFY_INTERNAL_SYNC_SECRET" ]]; then
  fail "BOTIFY_INTERNAL_SYNC_SECRET diverge entre backend e scripts/botify-pilot-validation.env"
fi

echo "Repositório: ${REPO_ROOT}"
echo "Backend:     ${OMNICONNECT_BACKEND_URL}"
echo "Micro:       ${BOTIFY_MICROSERVICE_URL}"
echo "Tenant:      ${OMNICONNECT_TENANT_ID}"
echo "Tag piloto:  ${PILOT_TAG}"

log_step "1/8 — Health backend + login JWT"
health_file="${TMP_DIR}/backend-health.resp"
save_response "$health_file" "${OMNICONNECT_BACKEND_URL}/health"
expect_status_in "$health_file" "GET /health backend" 200

if [[ -n "${BOTIFY_JWT_TOKEN:-}" ]]; then
  JWT="$BOTIFY_JWT_TOKEN"
else
  [[ -n "${OMNICONNECT_LOGIN_PASSWORD:-}" ]] || fail "Defina OMNICONNECT_LOGIN_PASSWORD ou BOTIFY_JWT_TOKEN"
  login_file="${TMP_DIR}/login.resp"
  save_response "$login_file" -X POST "${OMNICONNECT_BACKEND_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc --arg e "$OMNICONNECT_LOGIN_EMAIL" --arg p "$OMNICONNECT_LOGIN_PASSWORD" '{email:$e,password:$p}')"
  expect_status_in "$login_file" "POST /auth/login" 200 201
  JWT="$(json_get <(http_body "$login_file") '.access_token // .accessToken')"
fi
[[ -n "$JWT" && "$JWT" != "null" ]] || fail "JWT em falta"
ok "JWT pronto"

log_step "2/8 — IntegrationConnection provider=bot"
CONNECTION_ID="$(
  cd "${REPO_ROOT}/apps/omniconnect-backend"
  OMNICONNECT_TENANT_ID="$OMNICONNECT_TENANT_ID" \
  OMNICONNECT_BOT_BRIDGE_CONNECTION_ID="${OMNICONNECT_BOT_BRIDGE_CONNECTION_ID:-}" \
  OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET="$OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET" \
  node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const crypto = require('crypto');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
(async () => {
  const tenantId = process.env.OMNICONNECT_TENANT_ID || 'default-tenant';
  const explicitId = process.env.OMNICONNECT_BOT_BRIDGE_CONNECTION_ID || '';
  const secret = process.env.OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET;
  let connection = explicitId
    ? await prisma.integrationConnection.findUnique({ where: { id: explicitId } })
    : await prisma.integrationConnection.findFirst({
        where: { tenantId, provider: 'bot', status: 'active' },
        orderBy: { createdAt: 'desc' },
      });
  if (!connection) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to create plaintext IntegrationConnection in production.');
    }
    connection = await prisma.integrationConnection.create({
      data: {
        id: explicitId || crypto.randomUUID(),
        tenantId,
        provider: 'bot',
        webhookSecretEncrypted: secret,
        status: 'active',
      },
    });
  }
  process.stdout.write(connection.id);
})()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
NODE
)"
[[ -n "$CONNECTION_ID" ]] || fail "connectionId em falta"
ok "connectionId=${CONNECTION_ID}"

log_step "3/8 — Criar bot + fluxo transfer + conta Meta"
bot_file="$(api_jwt POST /botify/bots "$(jq -nc --arg n "${PILOT_TAG}-bot" '{name:$n, isActive:true}')")"
expect_status_in "$bot_file" "POST /botify/bots" 200 201
BOT_ID="$(json_get <(http_body "$bot_file") '.id')"

TRANSFER_NODES='[
  {"id":"start-1","type":"start","position":{"x":0,"y":0},"data":{},"connections":["transfer-1"]},
  {"id":"transfer-1","type":"action","position":{"x":220,"y":0},"data":{"actionType":"transfer","message":"Handoff Meta simulado","contactName":"Lead Meta Simulado","intent":"compra","urgency":"alta","region":"Zona Sul","propertyInterest":"apartamento 2 quartos","notes":"Webhook Meta simulado via microserviço"},"connections":[]}
]'
flow_file="$(api_jwt POST /botify/flows "$(jq -nc --arg botId "$BOT_ID" --arg n "${PILOT_TAG}-flow" --argjson nodes "$TRANSFER_NODES" '{botId:$botId,name:$n,nodes:$nodes}')")"
expect_status_in "$flow_file" "POST /botify/flows" 200 201
FLOW_ID="$(json_get <(http_body "$flow_file") '.id')"
pub_file="$(api_jwt POST "/botify/flows/${FLOW_ID}/publish" "")"
expect_status_in "$pub_file" "POST /botify/flows/:id/publish" 200 201

meta_file="$(api_jwt POST /botify/meta-accounts "$(jq -nc \
  --arg name "${PILOT_TAG}-meta" \
  --arg waba "$WABA_ID" \
  --arg botId "$BOT_ID" \
  --arg flowId "$FLOW_ID" \
  --arg phone "$PHONE_NUMBER_ID" \
  --arg token "dev-pilot-token-minimum-32-chars-long" \
  '{name:$name,metaWabaAccountId:$waba,accessToken:$token,phoneNumberIds:[$phone],defaultBotId:$botId,defaultFlowId:$flowId,activate:true}')")"
expect_status_in "$meta_file" "POST /botify/meta-accounts" 200 201
META_ACCOUNT_ID="$(json_get <(http_body "$meta_file") '.id')"
ch_file="$(api_jwt PATCH "/botify/bots/${BOT_ID}/channel" "$(jq -nc --arg mid "$META_ACCOUNT_ID" --arg flow "$FLOW_ID" --arg phone "$PHONE_NUMBER_ID" --arg waba "$WABA_ID" '{metaAccountId:$mid, defaultFlowId:$flow, phoneNumberId:$phone, metaWabaAccountId:$waba}')")"
expect_status_in "$ch_file" "PATCH /botify/bots/:id/channel" 200
ok "botId=${BOT_ID} flowId=${FLOW_ID} metaAccountId=${META_ACCOUNT_ID} waba=${WABA_ID}"

log_step "4/8 — Subir/validar microserviço"
micro_health="${TMP_DIR}/micro-health.resp"
if save_response "$micro_health" --connect-timeout 2 "${BOTIFY_MICROSERVICE_URL}/health" 2>/dev/null && [[ "$(http_code "$micro_health")" == "200" ]]; then
  ok "Microserviço já está rodando"
else
  [[ -x "${MICRO_DIR}/node_modules/.bin/tsx" ]] || fail "tsx não encontrado no microserviço; rode npm install na pasta do microserviço"
  (
    cd "$MICRO_DIR"
    PORT="${BOTIFY_MICROSERVICE_URL##*:}" \
    NODE_ENV=development \
    JWT_SECRET="${JWT_SECRET:-dev-jwt-secret-minimum-32-characters!!}" \
    ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:3000,http://localhost:5173,http://localhost:8090}" \
    REDIS_URL="$REDIS_URL" \
    BOTIFY_FLOW_SOURCE=omniconnect \
    OMNICONNECT_BACKEND_URL="$OMNICONNECT_BACKEND_URL" \
    BOTIFY_INTERNAL_SYNC_SECRET="$BOTIFY_INTERNAL_SYNC_SECRET" \
    OMNICONNECT_BOTIFY_TENANT_ID="$OMNICONNECT_TENANT_ID" \
    OMNICONNECT_API_URL="$OMNICONNECT_BACKEND_URL" \
    OMNICONNECT_BOT_BRIDGE_CONNECTION_ID="$CONNECTION_ID" \
    OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET="$OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET" \
    META_APP_SECRET="$BOTIFY_META_APP_SECRET" \
    META_WEBHOOK_VERIFY_TOKEN="${META_WEBHOOK_VERIFY_TOKEN:-dev-verify-token}" \
    ./node_modules/.bin/tsx src/index.ts >"${TMP_DIR}/microservice.log" 2>&1
  ) &
  MICRO_PID="$!"
  STARTED_MICRO=1
  for _ in $(seq 1 30); do
    if save_response "$micro_health" --connect-timeout 2 "${BOTIFY_MICROSERVICE_URL}/health" 2>/dev/null && [[ "$(http_code "$micro_health")" == "200" ]]; then
      ok "Microserviço iniciado"
      break
    fi
    sleep 1
  done
  [[ "$(http_code "$micro_health" 2>/dev/null || true)" == "200" ]] || {
    tail -80 "${TMP_DIR}/microservice.log" 2>/dev/null || true
    fail "Microserviço não ficou saudável"
  }
fi
http_body "$micro_health" | jq '{status, omniconnectBridge, botifyFlow, checks: {wordpress: .checks.wordpress, redis: .checks.redis, meta_webhook: .checks.meta_webhook}}' 2>/dev/null || true

log_step "5/8 — Webhook Meta verify"
verify_file="${TMP_DIR}/verify.resp"
save_response "$verify_file" "${BOTIFY_MICROSERVICE_URL}/webhooks/meta?hub.mode=subscribe&hub.verify_token=${META_WEBHOOK_VERIFY_TOKEN:-dev-verify-token}&hub.challenge=botify-ok"
expect_status_in "$verify_file" "GET /webhooks/meta verify" 200
[[ "$(http_body "$verify_file")" == "botify-ok" ]] && ok "challenge OK" || fail "challenge inesperado"

log_step "6/8 — POST /webhooks/meta assinado"
META_PAYLOAD="${TMP_DIR}/meta.json"
node >"$META_PAYLOAD" <<NODE
const payload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: '${WABA_ID}',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { phone_number_id: '${PHONE_NUMBER_ID}' },
        contacts: [{ wa_id: '${BOTIFY_META_PHONE}', profile: { name: 'Lead Meta Simulado' } }],
        messages: [{
          id: 'wamid.${RUN_ID}',
          from: '${BOTIFY_META_PHONE}',
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: 'text',
          text: { body: 'Quero falar com um corretor' }
        }]
      }
    }]
  }]
};
process.stdout.write(JSON.stringify(payload));
NODE
META_SIGNATURE="$(
  BOTIFY_META_APP_SECRET="$BOTIFY_META_APP_SECRET" \
  META_PAYLOAD="$META_PAYLOAD" \
  node <<'NODE'
const crypto = require('crypto');
const fs = require('fs');
const raw = fs.readFileSync(process.env.META_PAYLOAD);
process.stdout.write('sha256=' + crypto.createHmac('sha256', process.env.BOTIFY_META_APP_SECRET).update(raw).digest('hex'));
NODE
)"
meta_resp="${TMP_DIR}/meta.resp"
save_response "$meta_resp" -X POST "${BOTIFY_MICROSERVICE_URL}/webhooks/meta" \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: ${META_SIGNATURE}" \
  --data-binary "@${META_PAYLOAD}"
expect_status_in "$meta_resp" "POST /webhooks/meta" 200

log_step "7/8 — Esperar handoff materializar no Omni"
for _ in $(seq 1 45); do
  CHECK_JSON="$(
    cd "${REPO_ROOT}/apps/omniconnect-backend"
    OMNICONNECT_TENANT_ID="$OMNICONNECT_TENANT_ID" \
    FLOW_ID="$FLOW_ID" \
    BOT_ID="$BOT_ID" \
    BOTIFY_META_PHONE="$BOTIFY_META_QUEUE_PHONE" \
    BOTIFY_META_PHONE_DIGITS="${BOTIFY_META_PHONE//[^0-9]/}" \
    node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
(async () => {
  const tenantId = process.env.OMNICONNECT_TENANT_ID;
  const phone = process.env.BOTIFY_META_PHONE;
  const phoneDigits = process.env.BOTIFY_META_PHONE_DIGITS;
  const flowId = process.env.FLOW_ID;
  const queue = await prisma.messageQueue.findFirst({
    where: {
      tenantId,
      contactPhone: phone,
      message: 'Handoff Meta simulado',
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, tenantId: true, contactPhone: true, contactName: true, status: true, leadSummary: true },
  });
  const link = queue
    ? await prisma.integrationEntityLink.findFirst({
        where: { tenantId, provider: 'bot', entityType: 'MessageQueue', entityId: String(queue.id), externalId: { contains: flowId } },
        select: { externalId: true, entityId: true },
      })
    : null;
  const conversation = await prisma.botifyConversation.findFirst({
    where: {
      tenantId,
      botId: process.env.BOT_ID,
      contactPhone: { in: [phone, phoneDigits].filter(Boolean) },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, contactPhone: true },
  });
  process.stdout.write(JSON.stringify({ queue, link, conversation }));
})()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
NODE
  )"
  QUEUE_ID="$(jq -r '.queue.id // empty' <<<"$CHECK_JSON")"
  LINK_EXTERNAL_ID="$(jq -r '.link.externalId // empty' <<<"$CHECK_JSON")"
  if [[ -n "$QUEUE_ID" && -n "$LINK_EXTERNAL_ID" ]]; then
    ok "MessageQueue criada id=${QUEUE_ID}"
    ok "IntegrationEntityLink externalId=${LINK_EXTERNAL_ID}"
    jq . <<<"$CHECK_JSON"
    log_step "8/8 — Resultado"
    ok "Meta webhook simulado validado até handoff Omni."
    [[ "$STARTED_MICRO" == "1" ]] && warn "Microserviço temporário será encerrado ao sair do script"
    exit 0
  fi
  sleep 1
done

[[ -f "${TMP_DIR}/microservice.log" ]] && tail -120 "${TMP_DIR}/microservice.log" || true
fail "Webhook Meta não materializou MessageQueue no tempo limite"
