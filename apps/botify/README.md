# BotFlow Manager

Frontend e plugin WordPress para gerenciamento de bots WhatsApp.

## OmniConnect — Fase 1 (setup local)

Checklists: **Fase 1** (env Postgres raiz + segredo interno + flags) → [`docs/migration/botify-phase1-operational-setup.md`](../../docs/migration/botify-phase1-operational-setup.md); **Fase 2** (migrações + smoke `/botify/internal/.../runtime-config`) → [`docs/migration/botify-phase2-operational-validation.md`](../../docs/migration/botify-phase2-operational-validation.md). Bridge HMAC: [`docs/operations/botify-omniconnect-bridge.md`](../../docs/operations/botify-omniconnect-bridge.md).

Resumo rápido:

1. **`apps/botify/.env`** — copie de `.env.example`. O Vite usa a porta **8090**; se o frontend chamar o `omniconnect-backend` direto no browser, inclua `http://localhost:8090` em **`CORS_ORIGINS`** no `.env` do backend (o `.env.example` do backend já sugere).
2. **Microserviço** (`wordpress-plugin/botflow-manager/microservice/`) — copie `.env.example` para `.env`; o mesmo **`BOTIFY_INTERNAL_SYNC_SECRET`** do backend só é necessário se `BOTIFY_FLOW_SOURCE` for `omniconnect` ou `dual` (gerar com `openssl rand -hex 32`).
3. Fluxo só WordPress (defaults): pode manter `BOTIFY_FLOW_SOURCE` e `VITE_BOTIFY_DATA_SOURCE` em `wordpress` sem configurar o segredo interno até precisares do grafo no Nest.
4. Verificação rápida: `GET http://localhost:3000/health` → `botifyInternalSync.configured`; microserviço `GET …/health` → objeto `botifyFlow` (`flowSource`, `omniconnectRuntimeConfigured`).

Plugin WordPress, Docker e Coolify: `wordpress-plugin/README.md`, `DEPLOYMENT-COOLIFY.md`.

## Desenvolvimento local

```sh
npm i
npm run dev
```

## Tecnologias

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Local webhook (Meta WhatsApp)

Meta exige URL pública HTTPS para webhook. Para testar no localhost:

```sh
# Instale o Cloudflare Tunnel
brew install cloudflare/cloudflare/cloudflared

# Exponha o Apache (WordPress) local
./start-tunnel.sh
```

Use a URL pública exibida no terminal e configure o webhook no Meta.
