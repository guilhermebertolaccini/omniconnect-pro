# Credenciais por Plataforma

Guia para obter as credenciais necessárias de Meta Ads, Google Ads e TikTok Ads. Sem essas credenciais o AdPilot não consegue puxar dados reais.

## 1. Meta Ads (já implementado)

Veja `docs/META_API_INTEGRATION.md`.

Em resumo: criar um App Meta no [developers.facebook.com](https://developers.facebook.com/), gerar um System User access token com permissões `ads_read`, `ads_management`, `business_management` e `pages_read_engagement`.

## 2. Google Ads

### Passo 1 — Conta Google Cloud + OAuth Client
1. Acesse [console.cloud.google.com](https://console.cloud.google.com/) e crie um projeto.
2. **APIs & Services → Library** → habilite **Google Ads API**.
3. **APIs & Services → OAuth consent screen** → configure como **External**, adicione seu email como Test User, e adicione o escopo `https://www.googleapis.com/auth/adwords`.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URIs: `https://yoeswyawhnovpntjbppd.supabase.co/functions/v1/google-ads-proxy/oauth/callback`
5. Anote **Client ID** e **Client Secret**.

### Passo 2 — Developer Token
1. Acesse [ads.google.com](https://ads.google.com/) com sua conta MCC (manager).
2. **Tools & Settings → API Center**.
3. Preencha o formulário e solicite o **Developer Token**.
4. Aprovação:
   - **Test access** (só contas test) — imediato
   - **Basic access** (contas de produção, até 15k ops/dia) — 1 a 3 dias úteis
   - **Standard access** — semanas, exige review do app

### Passo 3 — Login Customer ID
1. No Google Ads, no canto superior direito, copie o ID da sua conta MCC (formato `XXX-XXX-XXXX`).
2. Esse ID será enviado no header `login-customer-id` ao gerenciar contas de clientes.

### O que entregar ao AdPilot
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- (opcional) `GOOGLE_ADS_LOGIN_CUSTOMER_ID`

## 3. TikTok Ads

### Passo 1 — Criar App
1. Acesse [business-api.tiktok.com](https://business-api.tiktok.com/portal/) e cadastre uma conta de developer.
2. **My Apps → Create**.
3. Categoria: **Tools** ou **Advertising**.
4. **Redirect URL**: `https://yoeswyawhnovpntjbppd.supabase.co/functions/v1/tiktok-ads-proxy/oauth/callback`
5. Anote **App ID** e **Secret**.

### Passo 2 — Solicitar permissões
Marque os escopos:
- `Ad Account Management`
- `Campaign Management (read)`
- `Reporting`
- `Audience Management` (opcional)

### Passo 3 — Submeter para review
- O app começa em **Sandbox mode** (só funciona com advertisers de test).
- Para produção, submeta para review (1 a 2 semanas).

### O que entregar ao AdPilot
- `TIKTOK_APP_ID`
- `TIKTOK_APP_SECRET`

## Como entregar as credenciais

Depois de aprovado, peça ao AdPilot para configurar — ele vai abrir o formulário seguro de secrets para você colar cada valor. As credenciais ficam armazenadas criptografadas no backend e nunca aparecem no código.

## Tabela resumo

| Plataforma | O que pegar | Tempo de aprovação |
|---|---|---|
| Meta | App + System User Token | Imediato a 1 dia |
| Google Ads | OAuth Client + Developer Token | 1 a 3 dias (Basic) |
| TikTok Ads | App ID/Secret + review | 1 a 2 semanas |
