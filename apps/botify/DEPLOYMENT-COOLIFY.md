# BotFlow Manager – Deploy no Coolify (VPS)

Guia para rodar o BotFlow Manager em produção no Coolify.

---

## Arquitetura

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Frontend   │────►│  WordPress   │◄────│ Microservice│
│  (React)    │     │  (PHP+MySQL) │     │  (Node.js)  │
└─────────────┘     └──────┬───────┘     └──────┬──────┘
       │                   │                    │
       │                   │                    │
       │                   ▼                    ▼
       │            ┌──────────────┐     ┌─────────────┐
       └───────────►│    MySQL     │     │    Redis    │
                    └──────────────┘     └─────────────┘
```

---

## Serviços no Coolify

### 1. MySQL (Database)

- **Tipo:** Database / MySQL
- **Versão:** 8.x
- **Variáveis:** Definir `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE` (ex: `wordpress`)
- **Porta interna:** 3306
- **Anotar:** hostname interno (ex: `mysql-xxxxx`) para o WordPress

---

### 2. Redis

- **Tipo:** Database / Redis
- **Versão:** 7-alpine
- **Porta:** 6379
- **Persistência:** Habilitar (appendonly)
- **Anotar:** hostname interno (ex: `redis-xxxxx`) para o microservice

---

### 3. WordPress

- **Tipo:** Template WordPress ou Docker
- **Build:** Se usar template, instalar o plugin manualmente (zip)
- **Variáveis de ambiente:**

| Variável | Valor | Onde |
|----------|-------|------|
| `WORDPRESS_DB_HOST` | Hostname interno do MySQL | Coolify |
| `WORDPRESS_DB_NAME` | Nome do banco | Coolify |
| `WORDPRESS_DB_USER` | Usuário | Coolify |
| `WORDPRESS_DB_PASSWORD` | Senha | Coolify |

- **Domínio:** Ex: `wordpress.seudominio.com`
- **Após deploy:** Instalar e ativar o plugin BotFlow Manager
- **Configurações no WP Admin:**
  - BotFlow → Settings: definir **Allowed Origins** (domínio do frontend)
  - BotFlow → Microservice: definir **URL** e **API Key** do microservice

---

### 4. Microservice (Node.js)

- **Tipo:** Application / Dockerfile
- **Repositório:** `guilhermebertolaccini/botify-whatsapp`
- **Base Directory:** `wordpress-plugin/botflow-manager/microservice`
- **Dockerfile:** `wordpress-plugin/botflow-manager/microservice/Dockerfile`
- **Porta:** 3001
- **Domínio:** Ex: `microservice.seudominio.com` (ou interno apenas)

#### Variáveis de ambiente (Runtime)

| Variável | Valor | Buildtime |
|----------|-------|-----------|
| `PORT` | 3001 | Não |
| `NODE_ENV` | production | Não |
| `WORDPRESS_API_URL` | `http://<hostname-wp-interno>:80` | Não |
| `WORDPRESS_API_KEY` | Chave do plugin (32+ chars) | Não |
| `JWT_SECRET` | String aleatória 32+ chars | Não |
| `ALLOWED_ORIGINS` | `https://frontend.seudominio.com` | Não |
| `REDIS_URL` | `redis://<hostname-redis-interno>:6379` | Não |
| `OPENAI_API_KEY` | (opcional) | Não |
| `GEMINI_API_KEY` | (opcional) | Não |
| `LOVABLE_API_KEY` | (opcional) | Não |

**Importante:** `WORDPRESS_API_URL` deve usar o **hostname interno** do WordPress no Coolify (ex: `http://wordpress-abc123:80`), não o domínio público.

---

### 5. Frontend (React)

- **Tipo:** Application / Nixpacks
- **Repositório:** `guilhermebertolaccini/botify-whatsapp`
- **Base Directory:** `/` (raiz)
- **Porta:** 3000
- **Domínio:** Ex: `app.seudominio.com`

#### Variáveis de ambiente (Buildtime)

| Variável | Valor | Buildtime |
|----------|-------|-----------|
| `VITE_WORDPRESS_API_URL` | `https://wordpress.seudominio.com` | **Sim** |
| `VITE_MICROSERVICE_URL` | `https://microservice.seudominio.com` | **Sim** |

**Importante:** `VITE_*` precisa estar marcado como **Available at Buildtime** no Coolify.

---

## Ordem de deploy

1. MySQL
2. Redis
3. WordPress (conectar ao MySQL)
4. Microservice (conectar ao WordPress e Redis)
5. Frontend (conectar ao WordPress e Microservice)

---

## Wiring (configurações finais)

### WordPress

1. **Allowed Origins:** Adicionar o domínio do frontend (ex: `https://app.seudominio.com`)
2. **Microservice URL:** URL pública do microservice (ex: `https://microservice.seudominio.com`)
3. **Microservice API Key:** Gerar no WP e copiar para as variáveis do microservice

### Meta / Evolution

- **Webhook URL:** Apontar para o **microservice** (não o WordPress):
  - Meta: `https://microservice.seudominio.com/webhooks/meta`
  - Evolution: `https://microservice.seudominio.com/webhooks/evolution` ou `/webhooks/evolution/:instance`

### Testes

- Frontend: `https://app.seudominio.com`
- WordPress health: `https://wordpress.seudominio.com/wp-json/botflow/v1/health`
- Microservice health: `https://microservice.seudominio.com/health`

---

## Checklist rápido

- [ ] MySQL rodando
- [ ] Redis rodando
- [ ] WordPress rodando + plugin ativado
- [ ] Microservice com `REDIS_URL` e `WORDPRESS_API_URL` (interno)
- [ ] Frontend com `VITE_WORDPRESS_API_URL` e `VITE_MICROSERVICE_URL` (buildtime)
- [ ] Allowed Origins no WordPress
- [ ] Microservice URL e API Key no WordPress
- [ ] Webhooks Meta/Evolution apontando para o microservice
