#!/usr/bin/env bash
# Botify -> Omni handoff smoke.
# Valida localmente o trecho server-to-server: POST /webhooks/botify ->
# IntegrationEvent -> MessageQueue + IntegrationEntityLink.
#
# Uso:
#   ./scripts/botify-handoff-validation.sh
#
# Lê apps/omniconnect-backend/.env e scripts/botify-pilot-validation.env.

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
load_env_file "$PILOT_ENV_FILE"

OMNICONNECT_BACKEND_URL="${OMNICONNECT_BACKEND_URL:-http://localhost:3000}"
OMNICONNECT_TENANT_ID="${OMNICONNECT_TENANT_ID:-default-tenant}"
OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET="${OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET:-${BOTIFY_INTERNAL_SYNC_SECRET:-}}"
BOTIFY_HANDOFF_PHONE="${BOTIFY_HANDOFF_PHONE:-+5511999990001}"
BOTIFY_HANDOFF_NAME="${BOTIFY_HANDOFF_NAME:-Lead Botify Piloto}"
BOTIFY_HANDOFF_MESSAGE="${BOTIFY_HANDOFF_MESSAGE:-Quero falar com um corretor}"
BOTIFY_HANDOFF_PREFIX="${BOTIFY_HANDOFF_PREFIX:-pilot-handoff}"

RUN_ID="$(date +%Y%m%d%H%M%S)"
EXTERNAL_ID="${BOTIFY_HANDOFF_EXTERNAL_ID:-botify:flow:${BOTIFY_HANDOFF_PREFIX}:conv:${RUN_ID}:transfer}"
IDEMPOTENCY_KEY="botify:handoff:${EXTERNAL_ID}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/botify-handoff-XXXXXX")"
trap 'rm -rf "${TMP_DIR}"' EXIT

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

expect_status() {
  local file="$1" want="$2" label="$3"
  local got
  got="$(http_code "$file")"
  if [[ "$got" != "$want" ]]; then
    echo "--- resposta ($label, esperado HTTP $want, obteve $got) ---"
    http_body "$file" | head -c 2000
    echo ""
    fail "$label"
  fi
  ok "$label (HTTP $got)"
}

json_get() {
  local file="$1" expr="$2"
  jq -r "$expr" "$file" 2>/dev/null
}

need_cmd curl
need_cmd jq
need_cmd node

[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL em falta; confira apps/omniconnect-backend/.env"
[[ -n "$OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET" ]] || fail "Defina OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET ou BOTIFY_INTERNAL_SYNC_SECRET"

echo "Repositório: ${REPO_ROOT}"
echo "Backend:     ${OMNICONNECT_BACKEND_URL}"
echo "Tenant:      ${OMNICONNECT_TENANT_ID}"
echo "ExternalId:  ${EXTERNAL_ID}"

log_step "1/6 — Health backend"
health_file="${TMP_DIR}/health.resp"
save_response "$health_file" "${OMNICONNECT_BACKEND_URL}/health"
expect_status "$health_file" "200" "GET /health"

log_step "2/6 — IntegrationConnection provider=bot"
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

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);

  let connection = explicitId
    ? await prisma.integrationConnection.findUnique({ where: { id: explicitId } })
    : await prisma.integrationConnection.findFirst({
        where: { tenantId, provider: 'bot', status: 'active' },
        orderBy: { createdAt: 'desc' },
      });

  if (!connection) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to create plaintext IntegrationConnection in production; create an encrypted row first.');
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

  if (connection.tenantId !== tenantId || connection.provider !== 'bot' || connection.status !== 'active') {
    throw new Error(`Invalid bot IntegrationConnection: ${connection.id}`);
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
[[ -n "$CONNECTION_ID" ]] || fail "Não foi possível obter IntegrationConnection"
ok "connectionId=${CONNECTION_ID}"

log_step "3/6 — Payload + HMAC"
PAYLOAD_FILE="${TMP_DIR}/handoff.json"
node >"$PAYLOAD_FILE" <<NODE
const payload = {
  eventType: 'botify.handoff.created',
  externalId: process.env.EXTERNAL_ID || '${EXTERNAL_ID}',
  occurredAt: new Date().toISOString(),
  source: 'botify-handoff-validation',
  data: {
    phone: '${BOTIFY_HANDOFF_PHONE}',
    name: '${BOTIFY_HANDOFF_NAME}',
    message: '${BOTIFY_HANDOFF_MESSAGE}',
    leadSummary: {
      intent: 'compra',
      urgency: 'alta',
      budget: 'ate 500k',
      region: 'Zona Sul',
      propertyInterest: 'apartamento 2 quartos',
      notes: 'Smoke local do handoff Botify Omni',
      flowId: '${BOTIFY_HANDOFF_PREFIX}',
      flowName: 'Piloto Botify',
      lastUserMessage: 'Quero falar com corretor',
      lastAssistantReply: 'Vou transferir para um atendente'
    }
  }
};
process.stdout.write(JSON.stringify(payload));
NODE
SIGNATURE="$(
  OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET="$OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET" \
  PAYLOAD_FILE="$PAYLOAD_FILE" \
  node <<'NODE'
const crypto = require('crypto');
const fs = require('fs');
const body = fs.readFileSync(process.env.PAYLOAD_FILE);
process.stdout.write(
  crypto.createHmac('sha256', process.env.OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET).update(body).digest('hex')
);
NODE
)"
ok "payload assinado"

post_handoff() {
  local out="$1"
  save_response "$out" -X POST "${OMNICONNECT_BACKEND_URL}/webhooks/botify" \
    -H "Content-Type: application/json" \
    -H "x-integration-id: ${CONNECTION_ID}" \
    -H "x-signature: ${SIGNATURE}" \
    -H "idempotency-key: ${IDEMPOTENCY_KEY}" \
    --data-binary "@${PAYLOAD_FILE}"
}

log_step "4/6 — POST /webhooks/botify"
first_resp="${TMP_DIR}/first.resp"
post_handoff "$first_resp"
expect_status "$first_resp" "200" "primeiro handoff"
FIRST_BODY="${TMP_DIR}/first.json"
http_body "$first_resp" >"$FIRST_BODY"
EVENT_ID="$(json_get "$FIRST_BODY" '.eventId')"
ALREADY="$(json_get "$FIRST_BODY" '.alreadyProcessed')"
[[ "$ALREADY" == "false" ]] && ok "evento novo eventId=${EVENT_ID}" || warn "evento já existia eventId=${EVENT_ID}"

log_step "5/6 — Dedupe do mesmo externalId/idempotency-key"
second_resp="${TMP_DIR}/second.resp"
post_handoff "$second_resp"
expect_status "$second_resp" "200" "segundo handoff idêntico"
SECOND_BODY="${TMP_DIR}/second.json"
http_body "$second_resp" >"$SECOND_BODY"
SECOND_EVENT_ID="$(json_get "$SECOND_BODY" '.eventId')"
SECOND_ALREADY="$(json_get "$SECOND_BODY" '.alreadyProcessed')"
[[ "$SECOND_EVENT_ID" == "$EVENT_ID" ]] || fail "Dedupe retornou outro eventId"
[[ "$SECOND_ALREADY" == "true" ]] && ok "dedupe OK (alreadyProcessed=true)" || fail "Dedupe falhou"

log_step "6/6 — Processamento assíncrono e materialização"
for _ in $(seq 1 30); do
  CHECK_JSON="$(
    cd "${REPO_ROOT}/apps/omniconnect-backend"
    EVENT_ID="$EVENT_ID" \
    OMNICONNECT_TENANT_ID="$OMNICONNECT_TENANT_ID" \
    EXTERNAL_ID="$EXTERNAL_ID" \
    node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
(async () => {
  const tenantId = process.env.OMNICONNECT_TENANT_ID;
  const externalId = process.env.EXTERNAL_ID;
  const event = await prisma.integrationEvent.findUnique({
    where: { id: process.env.EVENT_ID },
    select: { id: true, status: true, errorMessage: true },
  });
  const link = await prisma.integrationEntityLink.findUnique({
    where: {
      tenantId_provider_externalId_entityType: {
        tenantId,
        provider: 'bot',
        externalId,
        entityType: 'MessageQueue',
      },
    },
    select: { entityId: true },
  });
  const queue = link
    ? await prisma.messageQueue.findUnique({
        where: { id: Number(link.entityId) },
        select: {
          id: true,
          tenantId: true,
          contactPhone: true,
          contactName: true,
          status: true,
          leadSummary: true,
        },
      })
    : null;
  process.stdout.write(JSON.stringify({ event, link, queue }));
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
  STATUS="$(jq -r '.event.status // "missing"' <<<"$CHECK_JSON")"
  QUEUE_ID="$(jq -r '.queue.id // empty' <<<"$CHECK_JSON")"
  if [[ "$STATUS" == "processed" && -n "$QUEUE_ID" ]]; then
    ok "IntegrationEvent processed"
    ok "MessageQueue criada id=${QUEUE_ID}"
    jq '{event: .event, link: .link, queue: {id: .queue.id, tenantId: .queue.tenantId, contactPhone: .queue.contactPhone, contactName: .queue.contactName, status: .queue.status, leadSummary: .queue.leadSummary}}' <<<"$CHECK_JSON"
    ok "Handoff Botify validado."
    exit 0
  fi
  if [[ "$STATUS" == "failed" ]]; then
    jq . <<<"$CHECK_JSON"
    fail "IntegrationEvent falhou"
  fi
  sleep 1
done

warn "Evento ainda não materializou após 30s; verifique Redis/processador bot-events."
exit 1
