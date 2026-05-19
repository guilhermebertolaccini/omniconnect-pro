# BotFlow Microservice

AI processing and webhook handling microservice for BotFlow Manager WordPress plugin.

## Features

- 🤖 **AI Processing**: Support for Lovable AI Gateway, OpenAI, and Google Gemini
- 📨 **Webhook Handling**: Process Meta (WhatsApp Business API) and Evolution API webhooks
- ⚡ **Real-time Events**: Server-Sent Events (SSE) for live updates
- 📊 **Message Queue**: Asynchronous message processing
- 🔒 **Security**: JWT authentication, rate limiting, signature verification

## Requirements

- Node.js 18+
- npm or yarn
- Redis (optional, for production-grade queue)

### Monorepo: `@omniconnect/shared-types`

Este serviço depende do pacote `file:../../../../../packages/shared-types`. **Antes** de `npm install` aqui, gere o `dist/` no monorepo (na raiz do repositório):

```bash
npx pnpm@9 --filter @omniconnect/shared-types run build
```

Depois:

```bash
cd apps/botify/wordpress-plugin/botflow-manager/microservice
npm install
```

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env

# Start development server
npm run dev
```

### Production (Docker)

O `docker-compose` nesta pasta usa **contexto na raiz do monorepo** (para compilar `packages/shared-types`).

```bash
# A partir de apps/botify/wordpress-plugin/botflow-manager/microservice
docker compose up -d

# Build manual a partir da raiz omniconnect-pro:
# docker build -f apps/botify/wordpress-plugin/botflow-manager/microservice/Dockerfile .
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3001) |
| `NODE_ENV` | No | Environment (development/production) |
| `WORDPRESS_API_URL` | Yes | WordPress site URL |
| `WORDPRESS_API_KEY` | Yes | API key for WordPress authentication |
| `JWT_SECRET` | Yes | Secret for JWT token verification |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of allowed CORS origins |
| `LOVABLE_API_KEY` | No* | Lovable AI Gateway API key |
| `OPENAI_API_KEY` | No* | OpenAI API key |
| `GEMINI_API_KEY` | No* | Google Gemini API key |
| `REDIS_URL` | No | Redis URL for message queue |

\* At least one AI provider key is required

## WordPress APIs usadas pelo microserviço

Além de `POST` de mensagens e envio, o motor de fluxo usa:

- `GET /wp-json/botflow/v1/microservice/conversation/{id}/messages?limit=40` — histórico cronológico para o nó **IA** (autenticação `X-API-Key` do microserviço).

Ver também: `docs/migration/sprint-6-botify-flow-engine-inventory.md`.

## API Endpoints

### Health

- `GET /health` - Full health check with provider status
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe

### AI Processing

- `POST /ai/process` - Process AI request (non-streaming)
- `GET /ai/stream` - Process AI request (streaming via SSE)
- `POST /ai/test` - Test AI configuration

### Webhooks

- `GET /webhooks/meta` - Meta webhook verification
- `POST /webhooks/meta` - Meta webhook events
- `POST /webhooks/evolution` - Evolution API webhooks
- `POST /webhooks/evolution/:instanceName` - Instance-specific webhooks
- `POST /webhooks/generic` - Generic webhook endpoint

### Real-time Events

- `GET /events/subscribe` - Subscribe to all events
- `GET /events/subscribe/flow/:flowId` - Subscribe to flow-specific events
- `GET /events/connections` - List active connections (admin only)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Microservice (Node.js)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  AI Routes  │  │  Webhooks   │  │   Events    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│         │                │                │                      │
│         ▼                ▼                ▼                      │
│  ┌─────────────────────────────────────────────────┐            │
│  │              Message Queue                       │            │
│  └─────────────────────────────────────────────────┘            │
│         │                │                │                      │
│         ▼                ▼                ▼                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  AI Engine  │  │  WP Client  │  │ SSE Manager │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   WordPress Backend (PHP)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   REST API  │  │  Database   │  │  WhatsApp   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## SSE Events

The microservice emits the following real-time events:

### Meta Webhooks
- `meta:webhook` - Raw webhook data
- `meta:template_update` - Template status changes

### Evolution Webhooks
- `evolution:webhook` - Raw webhook data
- `evolution:message_update` - Message status updates
- `evolution:connection_update` - Connection state changes
- `evolution:qrcode` - QR code updates

### AI Processing
- `ai:processing_started` - Processing started
- `ai:processing_completed` - Processing completed
- `ai:processing_error` - Processing error

## License

GPL v2 or later
