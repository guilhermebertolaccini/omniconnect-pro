# BotFlow Manager

Frontend e plugin WordPress para gerenciamento de bots WhatsApp.

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
