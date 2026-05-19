# BotFlow Manager - WordPress Plugin

Plugin WordPress para gerenciamento completo de bots WhatsApp com REST API.

## Instalação

1. Copie a pasta `botflow-manager` para `wp-content/plugins/`
2. Ative o plugin no painel do WordPress
3. Configure as credenciais em **BotFlow → Settings**

## Estrutura de Arquivos

```
botflow-manager/
├── botflow-manager.php          # Plugin principal
├── includes/
│   ├── class-botflow-activator.php   # Criação de tabelas
│   ├── class-botflow-jwt-auth.php    # Autenticação JWT
│   ├── class-botflow-rest-api.php    # Endpoints REST
│   ├── class-botflow-whatsapp.php    # Integração WhatsApp
│   └── class-botflow-webhook.php     # Handler de webhooks
└── admin/
    ├── admin-page.php           # Dashboard admin
    └── settings-page.php        # Página de configurações
```

## Endpoints da API

### Autenticação

```
POST /wp-json/botflow/v1/auth/login
Body: { "username": "...", "password": "..." }
Response: { "access_token": "...", "refresh_token": "..." }
```

### Bots

```
GET    /wp-json/botflow/v1/bots
POST   /wp-json/botflow/v1/bots
GET    /wp-json/botflow/v1/bots/{id}
PUT    /wp-json/botflow/v1/bots/{id}
DELETE /wp-json/botflow/v1/bots/{id}
```

### Fluxos de Conversa

```
GET    /wp-json/botflow/v1/flows
POST   /wp-json/botflow/v1/flows
GET    /wp-json/botflow/v1/flows/{id}
PUT    /wp-json/botflow/v1/flows/{id}
DELETE /wp-json/botflow/v1/flows/{id}
```

### Conversas e Mensagens

```
GET  /wp-json/botflow/v1/conversations
GET  /wp-json/botflow/v1/conversations/{id}
GET  /wp-json/botflow/v1/messages?conversation_id={id}
POST /wp-json/botflow/v1/messages
```

### Configuração WhatsApp

```
GET /wp-json/botflow/v1/whatsapp-config/{bot_id}
PUT /wp-json/botflow/v1/whatsapp-config/{bot_id}
```

### Webhook (para Meta)

```
GET  /wp-json/botflow/v1/webhook/{bot_id}  (verificação)
POST /wp-json/botflow/v1/webhook/{bot_id}  (mensagens)
```

## Configuração no React

```typescript
// .env
VITE_WORDPRESS_API_URL=https://seu-site.com/wp-json

// Login
const response = await fetch(`${WORDPRESS_API_URL}/botflow/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })
});
const { access_token } = await response.json();

// Usar token em requisições
const bots = await fetch(`${WORDPRESS_API_URL}/botflow/v1/bots`, {
  headers: { 'Authorization': `Bearer ${access_token}` }
});
```

## Configuração WhatsApp Business API

1. Crie uma conta no [Meta for Developers](https://developers.facebook.com)
2. Configure um App com WhatsApp Business
3. Obtenha o Phone Number ID e Access Token
4. Configure no painel do BotFlow
5. Use a URL de webhook gerada automaticamente

## Tabelas do Banco de Dados

- `wp_botflow_bots` - Bots cadastrados
- `wp_botflow_whatsapp_config` - Configurações WhatsApp
- `wp_botflow_flows` - Fluxos de conversa
- `wp_botflow_conversations` - Conversas
- `wp_botflow_messages` - Mensagens
- `wp_botflow_tokens` - Tokens JWT (para revogação)

## Hooks Disponíveis

```php
// Quando uma mensagem é recebida
add_action('botflow_message_received', function($bot_id, $conversation_id, $message) {
    // Sua lógica customizada
}, 10, 3);

// Quando status da mensagem muda
add_action('botflow_message_status_updated', function($message_id, $status) {
    // Sua lógica customizada
}, 10, 2);

// Quando um fluxo é executado
add_action('botflow_flow_executed', function($flow_id, $bot_id, $conversation_id) {
    // Sua lógica customizada
}, 10, 3);
```

## Segurança

- Tokens JWT com assinatura HMAC-SHA256
- Refresh tokens para renovação segura
- Validação de webhook com X-Hub-Signature-256
- CORS configurável
- Todas as rotas protegidas (exceto login e webhook)
