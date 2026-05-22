# Meta / WhatsApp Cloud API — staging setup (PR 7-prep)

Runbook **operacional manual** para provisionar o app Meta Developer + WABA
+ tokens + webhook necessários para validar end-to-end o piloto
(`docs/migration/pilot-flow-lead-to-recovery.md` §7) em staging público.

> **Tudo nesta página é trabalho humano feito no navegador, no Meta
> Developer Console** (`developers.facebook.com`). Claude não pode executar
> nenhum destes passos — ferramentas Meta exigem login interativo,
> verificação 2FA, aceite de termos e geração explícita de tokens.
>
> O que Claude já entregou:
> - `Dockerfile.backend` / `Dockerfile.hub` / `Dockerfile.spa` (PR 6).
> - `docker-compose.staging.yml` + `.env.staging.example` (PR 6).
> - Runbook Coolify (PR 6 — `coolify-staging.md`).
> - Esta doc + `scripts/meta-staging-preflight.sh` + `docs/migration/pilot-run-evidence.md`.

---

## 0. Pré-requisitos antes de começar

| Item | Estado esperado |
|---|---|
| Backend `omniconnect-backend` deployado em `https://api.staging.<domain>` | ✅ healthcheck verde |
| Hub `omniconnect-hub` em `https://app.staging.<domain>` | ✅ login funcional |
| Botify microservice em `https://botify-api.staging.<domain>` | ✅ `/health` 200 |
| DNS A/CNAME apontando para Coolify | ✅ propagado |
| TLS válido em todos os subdomínios | ✅ (Let's Encrypt via Coolify) |
| Tenant piloto criado no backend | ✅ `Tenant.id` conhecido |
| `IntegrationConnection` (provider=`bot`) criada para o tenant piloto | ✅ secret cifrado |
| `BOTIFY_INTERNAL_SYNC_SECRET` setado em backend e microservice | ✅ mesma string |

Se algum item acima estiver vermelho, **pare e resolva primeiro**.
PR 7 não diagnostica problemas de PR 6.

## 1. Criar app Meta Developer

### 1.1 Login

1. Abrir https://developers.facebook.com com a conta de negócio que será dona
   do app de **staging**. Não use conta pessoal.
2. Confirmar 2FA. Sem 2FA o Meta recusa criar apps com permissões sensíveis.

### 1.2 Criar app

1. Topo direito → **My Apps** → **Create App**.
2. Caso de uso: **Other**.
3. Tipo: **Business**.
4. **App name**: `OmniconnectPRO Staging` (use sempre o sufixo "Staging" para
   não confundir com prod no futuro).
5. **App contact email**: e-mail operacional, não pessoal.
6. **Business Account**: selecione a conta de negócio. Se ainda não existir,
   crie em https://business.facebook.com primeiro.
7. **Create App** → aceite termos.

### 1.3 Add products

No dashboard do app recém-criado:

1. Bloco **WhatsApp** → **Set up**. Aceite termos da WhatsApp Business Platform.
2. (Opcional) **Webhooks** → **Set up**. Geralmente o WhatsApp já cria o
   webhook config; só configure separadamente se quiser webhooks de outras
   APIs Meta.

## 2. Configurar WABA + número de teste

### 2.1 WABA (WhatsApp Business Account)

No menu lateral **WhatsApp → Getting Started**:

1. **API Setup**: a Meta cria automaticamente uma WABA de teste vinculada ao
   app. Anote o **WABA ID** (`metaWabaAccountId`).
2. **Phone number ID**: o número de teste vem pré-provisionado (limites: 5
   destinatários verificados, 1000 mensagens iniciadas pela empresa por mês,
   sem custo). Anote o **Phone number ID**.
3. **Add recipient phone number**: adicione um número real do qual você vai
   enviar a mensagem inbound de teste (precisa receber código SMS Meta para
   confirmar).

> **Não conecte um número de produção real nesta etapa.** Use o número de
> teste pré-provisionado. Só migre para um número da empresa quando este
> mesmo fluxo passar com o número de teste.

### 2.2 Temporary access token

Na mesma página **API Setup**:

1. Botão **Generate token** (no quadro azul superior). O token é válido por
   **24h** — útil para o smoke inicial mas insuficiente para staging contínuo.
2. Copie e guarde temporariamente. NÃO commit, NÃO Slack.

### 2.3 System User token (recomendado — válido 60 dias ou permanente)

Para staging contínuo, gere um **System User Access Token**:

1. https://business.facebook.com/settings → **Users → System Users**.
2. **Add** → nome `omni-staging-system-user` → role **Admin**.
3. Após criar: **Add Assets** → selecione o app `OmniconnectPRO Staging`
   com permissão **Develop**.
4. **Generate New Token**:
   - App: `OmniconnectPRO Staging`.
   - Token Expiration: **Never** (ou 60 dias).
   - Permissions: marque `whatsapp_business_messaging`,
     `whatsapp_business_management`, `business_management`.
5. Copie e guarde **com cuidado** — este é o token que vai para `.env.staging`.

## 3. Configurar webhook

No menu lateral **WhatsApp → Configuration**:

### 3.1 Webhook callback URL

- **Callback URL**: `https://botify-api.staging.<seu-domínio>/webhooks/meta`
- **Verify token**: escolha uma string aleatória forte:
  ```bash
  openssl rand -hex 32
  ```
  Esta string vai em **dois lugares**:
  1. Aqui no campo "Verify token" do Meta Developer Console.
  2. `META_WEBHOOK_VERIFY_TOKEN` no `.env.staging` do microservice Botify.
- **Verify and save**: Meta faz um GET ao endpoint validando o `hub.challenge`.
  Se falhar, o backend microservice ainda não está rodando ou o
  `META_WEBHOOK_VERIFY_TOKEN` está divergente.

### 3.2 App Secret

No menu **App Settings → Basic**:

- **App secret**: clique **Show**, copie.
- Vai em `META_APP_SECRET` no backend Omni *e* `META_APP_SECRET` no
  microservice Botify. Mesmo valor em ambos os lados.

### 3.3 Subscribe webhook fields

Na mesma página **WhatsApp → Configuration**:

- Em **Webhook fields**, marque apenas o necessário para o piloto:
  - ✅ `messages` (mensagens inbound — obrigatório).
  - ❌ `message_template_status_update` (só para HSM avançado).
  - ❌ `account_review_update`, `account_update`, etc. — fora do escopo.

> **Footgun:** marcar `messages` num app que ainda não tem WABA conectada
> resulta em silent-drop dos eventos. Confirme §2 está completo antes.

## 4. Mapear no backend Omni

### 4.1 Env vars do backend (`omniconnect-backend`)

No painel Coolify do backend:

```env
META_APP_ID=<copiado de App Settings → Basic>
META_APP_SECRET=<copiado de App Settings → Basic>
WHATSAPP_VERIFY_TOKEN=<a mesma string do Meta Developer Console §3.1>
WHATSAPP_ACCESS_TOKEN=<System User token §2.3>
```

Redeploy o backend para carregar. O healthcheck `/health` continua verde
(estes envs não bloqueiam o boot).

### 4.2 Env vars do microservice Botify

No painel Coolify do `botify-api.staging.<...>`:

```env
META_APP_SECRET=<mesmo valor do §3.2>
META_WEBHOOK_VERIFY_TOKEN=<mesmo do §3.1>
```

Redeploy. `GET /health` deve continuar OK.

### 4.3 Cadastrar BotifyMetaAccount no backend

Via Hub `app.staging.<...>` → **Configurações → Botify** (ou via API direta),
crie um `BotifyMetaAccount` para o tenant piloto:

```json
POST /botify/meta-accounts
Authorization: Bearer <jwt-admin>
{
  "metaWabaAccountId": "<WABA ID do §2.1>",
  "phoneNumberId": "<Phone Number ID do §2.1>",
  "accessToken": "<System User token §2.3>",
  "label": "Staging WABA test"
}
```

> O backend cifra o `accessToken` em repouso via `BridgeSecretCipher`
> (AES-256-GCM, Sprint 2.3). O plaintext nunca volta em listagens.

### 4.4 Publicar fluxo Botify

1. No Hub, abra **Botify → Fluxos**.
2. Crie ou importe o fluxo piloto.
3. **Publicar** → confirme que aparece `published=true`.
4. Anote o `flowId` para o próximo passo.

### 4.5 Configurar routing default

```json
POST /botify/bots/<bot-id>/routing
Authorization: Bearer <jwt-admin>
{
  "metaWabaAccountId": "<WABA ID>",
  "defaultFlowId": "<flowId do §4.4>"
}
```

## 5. Pre-flight — antes de mandar a mensagem real

Execute o script de pre-flight com as envs preenchidas:

```bash
export OMNICONNECT_API_URL=https://api.staging.<seu-domínio>
export META_APP_ID=<...>
export META_APP_SECRET=<...>
export WHATSAPP_ACCESS_TOKEN=<System User token>
export WHATSAPP_PHONE_NUMBER_ID=<Phone Number ID>
export META_WABA_ID=<WABA ID>

./scripts/meta-staging-preflight.sh
```

O script só faz **leituras** — não envia nem altera nada no Meta. Verifica:

- Token autentica em `graph.facebook.com/v22.0/me`.
- Phone number ID existe e está atribuído à WABA.
- Permissões do token incluem `whatsapp_business_messaging`.
- Webhook subscription (`messages`) está ativa para o app.
- Backend Omni responde `/health`.
- Backend Omni tem `BotifyMetaAccount` registrado para o WABA ID.

Saída esperada: todos os checks **verdes**. Qualquer ✗ pare e corrija
antes de prosseguir.

## 6. Smoke real — mande UMA mensagem

1. No app WhatsApp do número que você cadastrou no §2.1 ("recipient phone
   number"), envie uma mensagem para o número de teste Meta (também listado
   em §2.1, é o número que o app exibe como "From").
2. Texto sugerido: `Olá, quero saber sobre apartamentos.`
3. Em menos de 5 segundos, o webhook chega no microservice Botify.

### 6.1 O que esperar (logs em ordem)

```
[botify-microservice] POST /webhooks/meta  signature_ok=true
[botify-microservice] resolved tenant=<pilot-tenant> via BotifyMetaAccount
[botify-microservice] flow execution started flowId=<...>
[botify-microservice] transfer node → POST /webhooks/botify (HMAC)
[omniconnect-backend]  POST /webhooks/botify  alreadyProcessed=false
[omniconnect-backend]  IntegrationEvent created tenantId=<pilot> provider=bot
[omniconnect-backend]  MessageQueue created id=<...> contactPhone=+55...
[omniconnect-backend]  insight-ai job enqueued jobId=iai:<sha>
```

### 6.2 Verificações de aceite

Conforme `pilot-flow-lead-to-recovery.md` §7 — cada checkbox é evidência
no template `pilot-run-evidence.md`:

| ID | Verificação |
|---|---|
| A2 | Reenvie a mesma mensagem; `alreadyProcessed=true` no 2º POST |
| A3 | `ConversationAIAnalysis` row criado (verifique no Hub `/insightai` recents) |
| A3 | `AIUsageLog` linha com `tenantId=<pilot>` |
| A4 | Hub `/insightai` mostra a análise em ≤ 2 min (pilot SLA) |
| A5 | Hub `/insightai` "Análises recentes" lista o caso |
| A6 | Hub `/executive` Pilot Funnel atualiza `botifyHandoffs +1`, `insightAnalyses +1` |
| A7 | Login de outro tenant não vê este caso no Hub |
| A8 | Outra pessoa (não dev) consegue seguir este runbook |

## 7. Limites do número de teste Meta

O número pré-provisionado **não é produção**. Limites:

- **5 destinatários verificados** por app (você cadastra no §2.1).
- **1.000 mensagens iniciadas pela empresa** por mês.
- **Sem mensagens HSM aprovadas** — só inbound + replies dentro da janela
  de 24h.
- **Sem rebrand de display name**.

Suficiente para passar A1–A8. Para produção real (volume + número da empresa):

1. Migre o app de **Development** para **Live** (App Mode toggle no
   dashboard) — exige preencher política de privacidade + termos.
2. Submeta `whatsapp_business_messaging` para **App Review** (formulário no
   App Dashboard → App Review → Permissions and Features).
3. Inicie processo de **WhatsApp Business verification** (KYC do negócio).
4. Adicione número da empresa via **WhatsApp → Phone numbers → Add**.

**Nada disso é parte do PR 7.** Quando chegar lá, faça outra ADR.

## 8. Troubleshooting

| Sintoma | Causa provável | Fix |
|---|---|---|
| Meta "Verify and save" falha | Microservice não está rodando ou verify token divergente | Conferir `META_WEBHOOK_VERIFY_TOKEN` em ambos os lados e redeploy |
| Webhook chega mas 401 no microservice | `META_APP_SECRET` errado | Copiar novamente do §3.2 |
| Webhook chega mas tenant resolution falha | `BotifyMetaAccount` não cadastrado ou WABA ID divergente | §4.3 |
| `IntegrationEvent.status=failed` | Bridge HMAC errado entre microservice e backend | `OMNICONNECT_BOT_BRIDGE_WEBHOOK_SECRET` divergente |
| Mensagem chega no WABA mas nada no log | `messages` field não subscrito | §3.3 |
| Token "expirado" rapidamente | Usou o token de 24h em vez do System User | Volte para §2.3 |
| `whatsapp_business_messaging permission denied` | Token gerado sem essa scope | §2.3 step 4 — regerar |
| WSS upgrade falha em `/inteligencia` | Coolify Traefik sem WebSocket | Habilitar WebSocket no domínio no Coolify |

## 9. Rotação de tokens

| Quando | Ação |
|---|---|
| System User token expira (60d) | Regerar em §2.3; atualizar `WHATSAPP_ACCESS_TOKEN` no Coolify; **não** precisa rotacionar o `BotifyMetaAccount` no backend (apenas o env do microservice) |
| Suspeita de comprometimento | Revogar o System User inteiro (§2.3 step 2 → Delete); criar novo + regerar tokens |
| Antes de submeter App Review (produção) | Rotacionar tudo; o token submetido fica visível no review |

## 10. O que NÃO fazer

- ❌ Usar o token de 24h em staging permanente.
- ❌ Reutilizar o mesmo app Meta entre staging e produção.
- ❌ Conectar um número da empresa antes do número de teste passar.
- ❌ Submeter `messages` field sem WABA conectada (eventos somem).
- ❌ Logar `WHATSAPP_ACCESS_TOKEN` no log do microservice ou backend.
- ❌ Colar tokens em chat, Slack, e-mail. Guarde em 1Password/Doppler.
- ❌ Marcar todos os webhook fields "para garantir" — só `messages`.
- ❌ Subir o app para **Live** sem App Review (Meta bloqueia em alguns dias).

## 11. Done checklist

Marque cada item conforme executar:

- [ ] App Meta Developer "OmniconnectPRO Staging" criado
- [ ] WABA + número de teste provisionado
- [ ] Recipient phone number cadastrado e verificado
- [ ] System User token gerado (60d ou Never)
- [ ] Webhook callback configurado e **Verify and save** verde
- [ ] `messages` field subscrito
- [ ] `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`,
      `WHATSAPP_ACCESS_TOKEN` populados no Coolify (backend + microservice)
- [ ] `BotifyMetaAccount` criado no backend
- [ ] Botify flow publicado + routing configurado
- [ ] `scripts/meta-staging-preflight.sh` passa todos os checks
- [ ] Smoke real com 1 mensagem inbound passa A2–A6
- [ ] Smoke cross-tenant (login de outro tenant) prova A7
- [ ] Outra pessoa segue este runbook end-to-end (A8)
- [ ] Evidência registrada em `docs/migration/pilot-run-evidence.md`

## Ver também

- `coolify-staging.md` — pré-requisito (PR 6)
- `../migration/pilot-flow-lead-to-recovery.md` — aceite A1–A8
- `../migration/pilot-run-evidence.md` — template de evidência
- `../adr/ADR-0001-botify-tenancy-model.md` — tenancy do handoff
- `../adr/ADR-0002-botify-wordpress-to-backend-cutover.md` — origem dos fluxos
- `../04-security.md` — secrets handling
- `../05-ai-governance.md` — PII redaction antes do LLM (válido também aqui)
