#!/usr/bin/env bash
# Meta / WhatsApp Cloud API — staging pre-flight (PR 7-prep, Track A).
#
# Verifica — somente leituras — que o app Meta + WABA + token + webhook
# subscription configurados manualmente em
# `docs/deployment/meta-staging-setup.md` estão funcionais ANTES de mandar
# a mensagem real do piloto.
#
# Não cria, não envia, não altera nada em Meta nem no backend.
#
# Uso:
#   export OMNICONNECT_API_URL=https://api.staging.<seu-domínio>
#   export META_APP_ID=<...>
#   export META_APP_SECRET=<...>
#   export WHATSAPP_ACCESS_TOKEN=<System User token>
#   export WHATSAPP_PHONE_NUMBER_ID=<Phone Number ID>
#   export META_WABA_ID=<WABA ID>
#   ./scripts/meta-staging-preflight.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

step() { echo -e "\n${CYAN}==> $*${NC}"; }
ok() { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Comando obrigatório em falta: $1"
}

need_cmd curl
need_cmd jq

META_GRAPH_VERSION="${META_GRAPH_VERSION:-v22.0}"
GRAPH_BASE="https://graph.facebook.com/${META_GRAPH_VERSION}"

# ─── Required env ──────────────────────────────────────────────────────────

required_env() {
  local name="$1"
  local val="${!name:-}"
  [[ -n "$val" ]] || fail "Env obrigatória em falta: ${name}"
}

required_env META_APP_ID
required_env META_APP_SECRET
required_env WHATSAPP_ACCESS_TOKEN
required_env WHATSAPP_PHONE_NUMBER_ID
required_env META_WABA_ID

OMNICONNECT_API_URL="${OMNICONNECT_API_URL:-}"
OMNICONNECT_JWT="${OMNICONNECT_JWT:-}"

echo "Meta Graph version: ${META_GRAPH_VERSION}"
echo "App ID:             ${META_APP_ID}"
echo "WABA ID:            ${META_WABA_ID}"
echo "Phone number ID:    ${WHATSAPP_PHONE_NUMBER_ID}"
echo "Backend URL:        ${OMNICONNECT_API_URL:-(não conferido)}"

# ─── Helpers ───────────────────────────────────────────────────────────────

# Faz um GET autenticado em Graph API e devolve o JSON ou falha duro.
# Sempre passa o token via header Authorization para não vazar em logs/URLs.
graph_get() {
  local path="$1"
  local resp
  resp="$(
    curl -sS -G "${GRAPH_BASE}${path}" \
      -H "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}" \
      -w "\nHTTP_STATUS:%{http_code}"
  )"
  local code body
  code="$(printf '%s' "$resp" | awk -F: '/^HTTP_STATUS:/ {print $2}')"
  body="$(printf '%s' "$resp" | sed '$d')"
  if [[ "$code" != "200" ]]; then
    printf '%s' "$body" | head -c 500 >&2
    echo "" >&2
    fail "Graph GET ${path} retornou HTTP ${code}"
  fi
  printf '%s' "$body"
}

# ─── 1. Token válido ───────────────────────────────────────────────────────

step "1/6 — Token válido (Graph /me)"
me="$(graph_get "/me?fields=id,name")"
me_id="$(jq -r '.id // empty' <<<"$me")"
me_name="$(jq -r '.name // "(sem nome)"' <<<"$me")"
[[ -n "$me_id" ]] || fail "Resposta de /me sem id"
ok "Identidade Meta: id=${me_id} (${me_name})"

# ─── 2. Permissions do token (debug_token) ────────────────────────────────

step "2/6 — Permissions do token (/debug_token)"
# debug_token usa app access token (APP_ID|APP_SECRET) para inspecionar
# o user/system-user token.
debug_resp="$(
  curl -sS -G "${GRAPH_BASE}/debug_token" \
    --data-urlencode "input_token=${WHATSAPP_ACCESS_TOKEN}" \
    --data-urlencode "access_token=${META_APP_ID}|${META_APP_SECRET}" \
    -w "\nHTTP_STATUS:%{http_code}"
)"
debug_code="$(printf '%s' "$debug_resp" | awk -F: '/^HTTP_STATUS:/ {print $2}')"
debug_body="$(printf '%s' "$debug_resp" | sed '$d')"
if [[ "$debug_code" != "200" ]]; then
  printf '%s' "$debug_body" | head -c 500 >&2
  fail "/debug_token retornou HTTP ${debug_code}"
fi

is_valid="$(jq -r '.data.is_valid // false' <<<"$debug_body")"
[[ "$is_valid" == "true" ]] || fail "Token marcado como inválido: $(jq -r '.data.error.message // "sem detalhe"' <<<"$debug_body")"
ok "Token reportado como valid=true"

# Permissões — separar por vírgula, tolerar formatos diversos
scopes="$(jq -r '.data.scopes // [] | join(",")' <<<"$debug_body")"
echo "  Scopes: ${scopes:-(nenhum reportado)}"

# WhatsApp Cloud não emite o scope tradicional para system user tokens —
# o controle real é via "tasks" do system user. Avisar se ausente, não falhar.
if [[ "$scopes" == *whatsapp_business_messaging* ]]; then
  ok "Scope whatsapp_business_messaging presente"
else
  warn "Scope whatsapp_business_messaging não declarado (System User tokens não exibem; ok)."
fi

expires_at="$(jq -r '.data.expires_at // 0' <<<"$debug_body")"
if [[ "$expires_at" == "0" ]]; then
  ok "Token sem expiração (System User permanente)"
else
  now_ts="$(date +%s)"
  remaining=$(( expires_at - now_ts ))
  remaining_days=$(( remaining / 86400 ))
  if (( remaining < 0 )); then
    fail "Token expirado em $(date -r "$expires_at" 2>/dev/null || echo "$expires_at")"
  elif (( remaining_days < 7 )); then
    warn "Token expira em ${remaining_days} dia(s). Renove antes da PR 7-exec."
  else
    ok "Token expira em ${remaining_days} dia(s)"
  fi
fi

# ─── 3. Phone number existe e está na WABA correta ─────────────────────────

step "3/6 — Phone number ID está na WABA correta"
phone_resp="$(graph_get "/${WHATSAPP_PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status")"
phone_display="$(jq -r '.display_phone_number // empty' <<<"$phone_resp")"
phone_verified_name="$(jq -r '.verified_name // empty' <<<"$phone_resp")"
phone_quality="$(jq -r '.quality_rating // "unknown"' <<<"$phone_resp")"
[[ -n "$phone_display" ]] || fail "Phone number ID não retornou display_phone_number"
ok "Phone: ${phone_display} (${phone_verified_name:-sem nome verificado}) quality=${phone_quality}"

# Confirma que esse phone_number_id pertence à WABA declarada.
waba_phones="$(graph_get "/${META_WABA_ID}/phone_numbers?fields=id,display_phone_number")"
found_in_waba="$(jq -r --arg id "$WHATSAPP_PHONE_NUMBER_ID" '.data[]? | select(.id == $id) | .id' <<<"$waba_phones")"
if [[ "$found_in_waba" == "$WHATSAPP_PHONE_NUMBER_ID" ]]; then
  ok "Phone number ID está atribuído à WABA ${META_WABA_ID}"
else
  fail "Phone number ID ${WHATSAPP_PHONE_NUMBER_ID} NÃO aparece na WABA ${META_WABA_ID}"
fi

# ─── 4. Webhook subscription do app ────────────────────────────────────────

step "4/6 — Webhook 'messages' subscrito no app"
sub_resp="$(
  curl -sS -G "${GRAPH_BASE}/${META_APP_ID}/subscriptions" \
    --data-urlencode "access_token=${META_APP_ID}|${META_APP_SECRET}" \
    -w "\nHTTP_STATUS:%{http_code}"
)"
sub_code="$(printf '%s' "$sub_resp" | awk -F: '/^HTTP_STATUS:/ {print $2}')"
sub_body="$(printf '%s' "$sub_resp" | sed '$d')"
if [[ "$sub_code" != "200" ]]; then
  printf '%s' "$sub_body" | head -c 500 >&2
  fail "/subscriptions retornou HTTP ${sub_code}"
fi

wa_obj="$(jq -r '.data[]? | select(.object == "whatsapp_business_account")' <<<"$sub_body")"
if [[ -z "$wa_obj" ]]; then
  fail "App não tem subscription para 'whatsapp_business_account'. Verifique §3.3 do runbook."
fi

callback_url="$(jq -r '.callback_url // empty' <<<"$wa_obj")"
fields="$(jq -r '.fields[]? | (.name // .)' <<<"$wa_obj" | tr '\n' ',' | sed 's/,$//')"
echo "  callback_url: ${callback_url}"
echo "  fields:       ${fields:-(vazio)}"

if [[ "$fields" == *messages* ]]; then
  ok "Field 'messages' subscrito"
else
  fail "Field 'messages' NÃO está subscrito (§3.3 do runbook)"
fi

if [[ "$callback_url" == https://* ]]; then
  ok "callback_url é HTTPS"
else
  warn "callback_url não é HTTPS — Meta exige HTTPS válido"
fi

# ─── 5. Backend Omni saudável ──────────────────────────────────────────────

step "5/6 — Backend Omni alcançável"
if [[ -z "$OMNICONNECT_API_URL" ]]; then
  warn "OMNICONNECT_API_URL não definida — pulando checks do backend"
else
  health_resp="$(
    curl -sS "${OMNICONNECT_API_URL%/}/health" -w "\nHTTP_STATUS:%{http_code}"
  )"
  health_code="$(printf '%s' "$health_resp" | awk -F: '/^HTTP_STATUS:/ {print $2}')"
  health_body="$(printf '%s' "$health_resp" | sed '$d')"
  if [[ "$health_code" != "200" ]]; then
    printf '%s' "$health_body" | head -c 300 >&2
    fail "Backend /health retornou HTTP ${health_code}"
  fi
  db_status="$(jq -r '.database // empty' <<<"$health_body")"
  bot_sync="$(jq -r '.botifyInternalSync.configured // false' <<<"$health_body")"
  [[ "$db_status" == "connected" ]] || fail "Backend database != connected"
  ok "Backend /health: database=connected, botifyInternalSync.configured=${bot_sync}"
  if [[ "$bot_sync" != "true" ]]; then
    warn "BOTIFY_INTERNAL_SYNC_SECRET ausente no backend — necessário se microservice usar BOTIFY_FLOW_SOURCE=omniconnect"
  fi
fi

# ─── 6. BotifyMetaAccount registrado no backend ────────────────────────────

step "6/6 — BotifyMetaAccount registrado para esta WABA"
if [[ -z "$OMNICONNECT_API_URL" || -z "$OMNICONNECT_JWT" ]]; then
  warn "OMNICONNECT_API_URL ou OMNICONNECT_JWT ausente — pulando check de BotifyMetaAccount."
  warn "Para validar: gere um JWT admin do tenant piloto e re-execute com OMNICONNECT_JWT exportado."
else
  ba_resp="$(
    curl -sS "${OMNICONNECT_API_URL%/}/botify/meta-accounts" \
      -H "Authorization: Bearer ${OMNICONNECT_JWT}" \
      -w "\nHTTP_STATUS:%{http_code}"
  )"
  ba_code="$(printf '%s' "$ba_resp" | awk -F: '/^HTTP_STATUS:/ {print $2}')"
  ba_body="$(printf '%s' "$ba_resp" | sed '$d')"
  if [[ "$ba_code" != "200" ]]; then
    warn "GET /botify/meta-accounts retornou HTTP ${ba_code} (rota pode ainda não existir nesta versão do backend)"
  else
    matched="$(jq -r --arg waba "$META_WABA_ID" --arg pn "$WHATSAPP_PHONE_NUMBER_ID" \
      '.data[]? // .[]? | select(.metaWabaAccountId == $waba or .phoneNumberId == $pn) | .id' \
      <<<"$ba_body" | head -n1)"
    if [[ -n "$matched" ]]; then
      ok "BotifyMetaAccount id=${matched} encontrado para esta WABA/phone"
    else
      fail "Nenhum BotifyMetaAccount no backend casa com WABA ${META_WABA_ID} / phone ${WHATSAPP_PHONE_NUMBER_ID} — §4.3 do runbook"
    fi
  fi
fi

# ─── Summary ───────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}Pre-flight Meta concluído.${NC}"
echo "Próximo passo: rodar o smoke real (§6 do meta-staging-setup.md) e"
echo "registrar evidência em docs/migration/pilot-run-evidence.md."
