# Integração com Meta Marketing API & Instagram Graph API

> Guia completo para conectar o AdPilotAI às APIs reais da Meta.

---

## 1. Pré-requisitos

| Item | Descrição |
|------|-----------|
| **Meta for Developers** | Conta ativa em [developers.facebook.com](https://developers.facebook.com/) |
| **App Meta** | Um app do tipo "Business" criado no painel de developers |
| **Página do Facebook** | Vinculada à conta de anúncios |
| **Conta do Instagram Business** | Conectada à Página do Facebook |
| **Conta de Anúncios** | Pelo menos uma conta ativa no Meta Business Suite |

### Permissões necessárias

| Permissão | Uso |
|-----------|-----|
| `ads_read` | Leitura de campanhas, conjuntos de anúncios e criativos |
| `ads_management` | (Opcional) Para criar/editar campanhas no futuro |
| `instagram_basic` | Acesso a posts do Instagram |
| `instagram_manage_insights` | Métricas de posts (alcance, engajamento, etc.) |
| `pages_read_engagement` | Leitura de métricas da página |
| `pages_show_list` | Listagem de páginas vinculadas |
| `business_management` | Acesso a contas de anúncios do Business Manager |

---

## 2. Configuração do App Meta

### 2.1 Criar o App

1. Acesse [developers.facebook.com/apps](https://developers.facebook.com/apps/)
2. Clique em **"Criar App"**
3. Selecione o tipo **"Business"**
4. Preencha nome (ex: "AdPilotAI") e email de contato
5. No painel do app, adicione os produtos:
   - **Marketing API**
   - **Instagram Graph API**

### 2.2 Configurar permissões

1. Vá em **App Review > Permissions and Features**
2. Solicite as permissões listadas acima
3. Para desenvolvimento, use o **Graph API Explorer** para gerar tokens de teste

### 2.3 Adicionar testadores

1. Em **Roles > Roles**, adicione usuários como "Testers"
2. Cada testador precisa aceitar o convite em [developers.facebook.com/requests](https://developers.facebook.com/requests/)

---

## 3. Fluxo de Autenticação — Tokens

### 3.1 Token de curta duração (1-2 horas)

Gerado via Graph API Explorer ou OAuth dialog:

```
https://www.facebook.com/v22.0/dialog/oauth?
  client_id={app-id}&
  redirect_uri={redirect-uri}&
  scope=ads_read,instagram_basic,instagram_manage_insights,pages_read_engagement,pages_show_list,business_management
```

### 3.2 Token de longa duração (60 dias)

Troque o token curto por um de longa duração:

```
GET https://graph.facebook.com/v22.0/oauth/access_token?
  grant_type=fb_exchange_token&
  client_id={app-id}&
  client_secret={app-secret}&
  fb_exchange_token={short-lived-token}
```

**Resposta:**
```json
{
  "access_token": "EAABs...",
  "token_type": "bearer",
  "expires_in": 5184000
}
```

### 3.3 Renovação automática

O token de longa duração pode ser renovado antes de expirar (a partir de 24h antes do vencimento):

```
GET https://graph.facebook.com/v22.0/oauth/access_token?
  grant_type=fb_exchange_token&
  client_id={app-id}&
  client_secret={app-secret}&
  fb_exchange_token={long-lived-token}
```

> **⚠️ Importante:** Armazene `app-secret` apenas no backend (nunca no frontend).

---

## 4. Endpoints Utilizados

### 4.1 Contas de Anúncio

```
GET /me/adaccounts?fields=id,name,account_status,currency,timezone_name,amount_spent,balance,business_name
```

**Resposta exemplo:**
```json
{
  "data": [
    {
      "id": "act_123456789",
      "name": "Minha Loja",
      "account_status": 1,
      "currency": "BRL",
      "timezone_name": "America/Sao_Paulo",
      "amount_spent": "4523050",
      "balance": "0",
      "business_name": "Loja Virtual LTDA"
    }
  ]
}
```

### 4.2 Campanhas

```
GET /act_{id}/campaigns?fields=id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time
```

### 4.3 Insights de Campanha

```
GET /{campaign_id}/insights?fields=impressions,clicks,spend,ctr,cpc,cpm,actions,cost_per_action_type&date_preset=last_7d
```

**Com detalhamento diário:**
```
GET /{campaign_id}/insights?fields=impressions,clicks,spend,ctr,cpc,cpm,actions&time_increment=1&date_preset=last_7d
```

### 4.4 Segmentação (via AdSets)

```
GET /{campaign_id}/adsets?fields=targeting,promoted_object
```

### 4.5 Criativos (via Ads)

```
GET /{campaign_id}/ads?fields=creative{title,body,image_url,video_url,call_to_action_type,object_story_spec}
```

### 4.6 Posts do Instagram

```
GET /{ig_user_id}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,permalink
```

### 4.7 Insights de Post

```
GET /{media_id}/insights?metric=reach,impressions,likes,comments,shares,saved,total_interactions&period=lifetime
```

---

## 5. Mapeamento de Dados

### Campaign Status

| Meta `effective_status` | Status local |
|-------------------------|-------------|
| `ACTIVE` | `active` |
| `PAUSED`, `CAMPAIGN_PAUSED`, `ADSET_PAUSED` | `paused` |
| `DELETED`, `ARCHIVED`, `COMPLETED` | `ended` |
| `DISAPPROVED`, `WITH_ISSUES`, `PENDING_REVIEW` | `issue` |

### Campaign Objective

| Meta `objective` | Label PT-BR |
|-----------------|-------------|
| `OUTCOME_TRAFFIC` | Tráfego |
| `OUTCOME_LEADS` | Geração de Leads |
| `OUTCOME_ENGAGEMENT` | Engajamento |
| `OUTCOME_AWARENESS` | Reconhecimento |
| `OUTCOME_SALES` | Vendas |
| `MESSAGES` | Mensagens |

### Valores monetários

- A Meta retorna valores em **centavos** (ex: `"4523050"` = R$ 45.230,50)
- Os services dividem por 100 automaticamente

---

## 6. Limites da API

| Recurso | Limite |
|---------|--------|
| **Rate limit por usuário** | ~200 chamadas/hora |
| **Rate limit por app** | Proporcional ao número de usuários |
| **Paginação** | Cursor-based, ~25 itens/página (configurável com `limit`) |
| **Batch requests** | Até 50 chamadas por batch |

### Headers de rate limit

Verifique os headers de resposta:
- `x-business-use-case-usage` — uso por conta de negócio
- `x-app-usage` — uso total do app
- `x-ad-account-usage` — uso por conta de anúncio

### Estratégias de mitigação

1. Cache local de dados que mudam pouco (contas, targeting)
2. Use `date_preset` em vez de ranges customizados quando possível
3. Implemente retry com backoff exponencial para código 32 (rate limit)
4. Use batch requests para consolidar múltiplas chamadas

---

## 7. Estrutura de Arquivos do Projeto

```
src/services/
  metaApi.ts              ← Cliente base (fetch, paginação, erros)
  adAccountsService.ts    ← Contas de anúncio
  campaignsService.ts     ← Campanhas + Insights + Targeting + Criativos
  postsService.ts         ← Posts orgânicos do Instagram

src/types/
  metaApiTypes.ts         ← Tipos raw da API + funções de mapeamento
  campaign.ts             ← Tipos locais (Campaign, AdAccount, Post, etc.)
```

---

## 8. Como Usar no Frontend

### Verificar se há token configurado

```typescript
import { hasStoredToken } from '@/services/metaApi';

// Se não há token, usar dados mock como fallback
const useMockData = !hasStoredToken();
```

### Buscar dados com react-query

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchAdAccounts } from '@/services/adAccountsService';
import { mockAccounts } from '@/data/mockData';
import { hasStoredToken } from '@/services/metaApi';

const { data: accounts } = useQuery({
  queryKey: ['adAccounts'],
  queryFn: () => fetchAdAccounts(),
  enabled: hasStoredToken(),
  initialData: mockAccounts,  // fallback mock
});
```

---

## 9. Configuração de Token (Desenvolvimento)

1. Acesse **Configurações** no AdPilotAI
2. Cole seu **Meta Access Token** no campo
3. Clique **"Testar Conexão"** para validar
4. O token é armazenado no `localStorage` (temporário)

> **⚠️ Para produção**, migre para armazenamento seguro (Supabase Secrets + Edge Functions).

---

## 10. Próximos Passos (Produção)

### 10.1 Backend seguro com Edge Functions

```
supabase/functions/
  meta-proxy/         ← Proxy para chamadas Meta (token seguro no backend)
  meta-token-refresh/ ← Renovação automática de tokens
  meta-webhook/       ← Receber notificações de mudanças
```

### 10.2 Armazenamento seguro de tokens

- Usar **Supabase Secrets** ou **Vault** para armazenar tokens
- O frontend nunca terá acesso direto ao token em produção
- Edge Functions atuam como proxy, adicionando o token server-side

### 10.3 Webhook para sincronização automática

A Meta pode notificar mudanças em campanhas via webhooks:

```
POST /webhook
  object=ad_account
  fields=campaigns,insights
```

Isso elimina a necessidade de polling constante.

### 10.4 Cache inteligente

- Redis ou tabela Supabase para cache de insights (atualizar a cada 1h)
- Dados de targeting/criativos podem ser cacheados por mais tempo (6h+)
- Posts orgânicos: cache de 2h é suficiente

---

## FAQ

**P: Preciso de um App aprovado para usar?**
R: Para desenvolvimento com suas próprias contas, não. Para acessar contas de terceiros em produção, sim — é necessário passar pela App Review da Meta.

**P: O token expira?**
R: Sim. Tokens de longa duração duram 60 dias. Configure renovação automática.

**P: Posso acessar dados de qualquer conta?**
R: Apenas contas às quais o usuário autenticado tem acesso no Business Manager.

**P: E os dados de WhatsApp Business?**
R: Conversas iniciadas via Click-to-WhatsApp Ads aparecem como `actions` com tipo `onsite_conversion.messaging_conversation_started_7d` nos insights da campanha.
