# Sprint Hub - Acesso Unico e Continuidade Entre Modulos

Status: em implementacao em 2026-05-26; H1-H4 implementados localmente e
pendentes de smoke autenticado no ambiente publicado.

## Objetivo

Fazer o Hub cumprir a promessa de entrada unica da plataforma sem apagar a
identidade visual dos aplicativos satelites:

- o usuario autentica uma unica vez no Hub;
- seleciona a empresa/tenant em que vai trabalhar;
- entende que esta abrindo uma interface dedicada;
- abre CRM, OmniHub, Ads Manager ou Botify ja autenticado e no tenant correto;
- nenhuma credencial ou identificador de tenant viaja na URL.

Esta sprint atende principalmente a escalabilidade multi-tenant e a
confiabilidade operacional: uma navegacao bonita que abre o tenant errado e
mais perigosa do que uma navegacao ainda intermediaria.

## Decisao de produto confirmada

O `ModulePlaceholder` sera **mantido** como etapa intermediaria dos modulos
externos. As UIs de CRM, OmniHub, Ads Manager e Botify nao sao identicas ao
Hub; a tela prepara a mudanca de contexto e reduz a sensacao de que o usuario
se perdeu.

Para o MVP:

- o menu continua levando a pagina contextual do modulo dentro do Hub;
- a pagina informa que o modulo tem interface propria;
- o botao `Abrir modulo` continua abrindo o aplicativo em **nova aba**, para
  preservar o Hub como ponto de retorno;
- a tela deve exibir o tenant ativo e, quando relevante, o perfil que sera
  utilizado;
- nao haverá redirect automatico a partir do menu nesta sprint.

Essa decisao e compativel com:

- [`ADR-0003`](../adr/ADR-0003-hub-identity-and-roles.md) - Hub como ponto de
  entrada e SSO por cookie;
- [`ADR-0004`](../adr/ADR-0004-hub-into-monorepo.md) - apps de dominio com
  interfaces e URLs proprias.

## Diagnostico do estado atual

| Superficie | Estado atual | Impacto |
|---|---|---|
| Gateway do Hub | `ModulePlaceholder` abre `VITE_CRM_URL`, `VITE_OMNIHUB_URL`, `VITE_SAA_URL` e `VITE_BOTIFY_URL` em nova aba, sem JWT na URL. | A narrativa intermediaria ja existe e deve ser preservada. |
| Tenant ativo no Hub | `switchTenant` altera label/menu e preferencia local, mas nao emite nova sessao escopada. | **Bloqueador:** o modulo externo pode operar no tenant do JWT anterior. |
| CRM Imobiliario | Restaura sessao com `POST /auth/refresh`; `/` e o dashboard protegido. | Proximo do comportamento desejado depois do tenant switch. |
| Botify | Em modo `VITE_BOTIFY_AUTH_SOURCE=omniconnect`, restaura sessao por cookie; `/` e protegido. | Proximo do comportamento desejado; producao deve impedir caminho legado/token fixo. |
| Ads Manager / SAA | Restaura sessao por cookie; `/` e protegido por perfil administrativo. | O Hub mostra Ads para `digital`, mas frontend/backend ainda nao oferecem a mesma matriz de permissao. |
| OmniHub Conversas | Cutover local remove `vend_token`, restaura cookie da API e mantem access token somente em memoria. | Validacao publicada ainda deve comprovar refresh, logout e reconexao WebSocket no tenant ativo. |
| Cookie cross-app | Backend e runbook foram alinhados para cookie host-only na API, `Path=/auth`, CORS allowlist e requests com credenciais. | A decisao de menor privilegio esta implementada localmente; prova em browser publicado permanece gate. |

### Evidencias principais no codigo

- `apps/omniconnect-hub/src/lib/auth-context.tsx`: a propria implementacao
  registra que o tenant selecionado ainda nao muda o JWT.
- `apps/omniconnect-hub/src/components/module-placeholder.tsx` e
  `src/lib/module-gateway.ts`: abertura externa ja e contextual e sem token em
  querystring/hash.
- `apps/crm-imobiliario/src/contexts/AuthContext.tsx` e
  `apps/smart-ad-automator/src/hooks/useAuth.ts`: recuperacao por cookie
  HttpOnly ja implementada.
- `apps/botify/src/lib/omniconnectClient.ts`: recuperacao por cookie disponivel
  para o modo Omni.
- `apps/omniconnect-frontend/src/services/api.ts`: remove o legado
  `vend_token`, restaura a sessao via refresh cookie e mantem access token em
  memoria.
- `apps/omniconnect-backend/src/auth/refresh-token.service.ts`: cookie
  HttpOnly/Secure/SameSite host-only, `Path=/auth`, e refresh rejeitado apos
  remocao da membership.
- `apps/omniconnect-backend/src/websocket/websocket.gateway.ts` e
  `src/control-panel/*`: conexao, eventos e regras operacionais passam a usar
  o tenant da sessao confirmada.

## Regras nao negociaveis

1. O tenant efetivo vem da sessao/JWT emitido pelo backend, nunca de query,
   hash, storage ou parametro de redirecionamento.
2. O cliente pode pedir a troca de tenant, mas o backend so emite sessao nova
   apos validar `UserTenant` ativo para aquele usuario.
3. Nenhum JWT, refresh token, secret ou `tenantId` e enviado na URL ao abrir
   um modulo.
4. Refresh token permanece em cookie `HttpOnly`; access token deve ficar
   somente em memoria nos frontends migrados. O cookie usa o menor alcance
   capaz de suportar o SSO publicado.
5. A permissao mostrada pelo Hub deve ser igual ou mais restrita que a
   permissao realmente aceita pelo backend do modulo.
6. Deploy de producao so avanca com smoke autenticado e teste de isolamento
   entre dois tenants reais de teste.

## Escopo da sprint

### Inclui

- endpoint backend para troca segura do tenant ativo;
- aplicacao da troca de tenant pelo Hub antes de abrir modulo externo;
- decisao e hardening da topologia de cookie usada no SSO cross-app;
- cutover de auth do `omniconnect-frontend` para o cliente Omni;
- alinhamento de roles do Ads Manager com a matriz de produto/backend;
- verificacao/hardening de flags de CRM e Botify;
- texto e estados da tela intermediaria para nao prometer tenant ainda nao
  confirmado;
- testes automatizados e smoke em producao controlada.

### Nao inclui

- unificar a UI/UX dos satelites com o Hub;
- incorporar paginas do CRM, OmniHub, Ads ou Botify no bundle do Hub;
- passar estado de auth ou tenant via URL;
- criar novos modulos de dominio;
- expandir a Regua de Acionamento;
- mudar recuperacao de senha/email, que segue dependente do servidor de email
  de producao.

## Contrato implementado localmente (H1/H2/H3/H4)

### Troca de tenant

Endpoint implementado:

```http
POST /auth/switch-tenant
Authorization: Bearer <access_token_atual>
Cookie: oc_refresh=<http_only_cookie>
Content-Type: application/json

{ "tenantId": "<tenant selecionado>" }
```

Resposta publica: mesmo shape de sessao usado no login, sem expor refresh
token no body:

```json
{
  "access_token": "<novo access token>",
  "access_expires_in": 900,
  "user": {
    "id": 1,
    "name": "Usuario",
    "email": "usuario@example.com",
    "role": "supervisor",
    "tenantId": "<tenant selecionado>"
  }
}
```

Regras do endpoint:

- protegido por `JwtAuthGuard`;
- DTO valida `tenantId` como string nao vazia;
- a entrada `tenantId` representa apenas a escolha solicitada; a autorizacao
  exige lookup server-side de `UserTenant` + `Tenant.isActive`;
- role da nova sessao vem de `UserTenant.role`, nao de `User.role` nem do
  frontend;
- troca emite o sucessor e vincula/revoga o refresh apresentado em uma unica
  transacao condicional, evitando duas identidades ativas na mesma aba;
- falha como nao autorizado quando o usuario nao pertence ao tenant ou quando
  o tenant esta inativo, sem revelar informacao alem do necessario;
- sucesso e tentativa recusada geram evento de auditoria sem PII/token.

### Cookie de sessao cross-app

O contrato de implantacao deve ficar unico entre backend e documentacao. A
preferencia de seguranca e manter o refresh cookie **host-only no dominio da
API** quando todos os frontends fazem `POST https://api.<dominio>/auth/refresh`
com `credentials: include`; assim, o cookie nao e exposto aos hosts dos
frontends. Ampliar `Domain` para o dominio pai exige nova decisao de seguranca
e uma topologia publicada que prove a necessidade.

| Propriedade | Regra |
|---|---|
| `HttpOnly` | `true` |
| `Secure` | `true` em producao HTTPS |
| `SameSite` | `Lax`, enquanto todos os apps estiverem no mesmo site pai |
| `Domain` | Host-only da API; nao configurar `COOKIE_DOMAIN` |
| `Path` | `/auth`, pois refresh e logout usam o cookie |
| CORS | Allowlist explicita dos quatro apps + Hub, com credentials habilitado |

`ADR-0003` e o runbook Coolify agora registram essa politica; o smoke publicado
deve verificar somente atributos do cookie, nunca capturar seu valor.

## Matriz de entrada e autorizacao alvo

| Modulo | URL de abertura no MVP | Sessao alvo | Perfis do Hub | Decisao necessaria |
|---|---|---|---|---|
| CRM Imobiliario | raiz configurada em `VITE_CRM_URL` | Cookie Omni + JWT do tenant ativo | `broker`, `supervisor`, `admin` | Smoke e garantir que o tenant trocado chega ao CRM. |
| OmniHub Conversas | raiz configurada em `VITE_OMNIHUB_URL` | Cookie Omni + token em memoria implementados localmente | `operator`, `broker`, `supervisor`, `admin` | Confirmar no smoke e definir se `broker` realmente acessa inbox operacional ou somente CRM. |
| Ads Manager | raiz configurada em `VITE_SAA_URL` | Cookie Omni + JWT do tenant ativo | `digital`, `admin` hoje no Hub | Definir leitura vs gestao: backend atualmente permite `digital` apenas em parte das operacoes. |
| Botify | raiz configurada em `VITE_BOTIFY_URL` | Cookie Omni com `VITE_BOTIFY_AUTH_SOURCE=omniconnect` | `digital`, `admin` | Desabilitar dependencias de auth legado/token estatico no perfil de producao. |

Nao e necessario criar deep-links internos nesta etapa: a rota raiz de cada
satellite ja e protegida e funciona como entrada natural, desde que a sessao e
a matriz de permissao estejam corretas.

## Plano de execucao

| Bloco | Entrega | Modulos afetados | Gate de aceite |
|---|---|---|---|
| **H0 - Plano e decisao UX** | Este documento; referencia no indice/backlog; tela intermediaria e nova aba registradas como decisao do MVP. | `docs/` | Revisao de produto aprovada; nenhum codigo de runtime alterado. |
| **H1 - Tenant switch backend** | `POST /auth/switch-tenant`, DTO, emissao/rotacao de sessao escopada e auditoria. Login, refresh e JWT tambem rejeitam tenant inativo. | backend `auth`, `system-events` | Implementado localmente; unit tests verdes para membro, inativo, role efetivo e cookie de outro usuario. E2E publicado pendente. |
| **H2 - Cookie SSO e deploy** | Cookie host-only API, `Path=/auth`, CORS fail-closed e runbook Coolify alinhados. | backend auth, env/docs deployment | Implementado localmente; login no Hub deve permitir `POST /auth/refresh` nos satelites no smoke publicado, sem ampliar alcance do cookie. |
| **H3 - Hub aplica tenant real** | `switchTenant` chama H1; trava abertura enquanto troca esta pendente; placeholder mostra tenant confirmado e erros recuperaveis. | `omniconnect-hub` | Implementado localmente; testes Vitest confirmam sessao antes do link externo e ausencia de tenant na URL. |
| **H4 - OmniHub auth cutover** | `vend_token` removido; restore por refresh cookie; access token em memoria; websocket e regras de atendimento escopados pela membership ativa. | `omniconnect-frontend`, backend realtime/control-panel | Implementado localmente; abrir OmniHub pelo Hub sem novo login, refresh/logout e isolamento cross-tenant devem ser confirmados no smoke. |
| **H5 - Ads roles** | Fechar politica de `digital`: leitura ou operacao; alinhar `MODULE_ACCESS`, guards do SAA e roles dos endpoints Ads/OAuth. | Hub, SAA, backend ads/oauth | Um perfil permitido entra e ve somente operacoes autorizadas; perfil negado nao ve link e recebe 403 no backend. |
| **H6 - CRM/Botify hardening** | Confirmar zero mudanca funcional necessaria em CRM; exigir flags Omni no Botify produtivo e remover uso browser de token fixo se ainda alcancavel. | CRM, Botify, env/docs | Abertura via Hub recupera sessao; nenhum token sensivel em storage/env de bundle. |
| **H7 - QA e rollout** | Suite automatizada, smoke navegacional e rollout controlado em producao. | todos | Matriz de aceite abaixo concluida e rollback documentado. |

## Ordem de commits sugerida

Os commits devem permanecer pequenos; nao misturar bootstrap/deploy anterior
com auth cross-app sem revisao explicita do diff.

| Commit / PR | Conteudo | Tipo sugerido |
|---|---|---|
| 1 | Plano H0 e referencias documentais | `docs(hub): plan cross-module session continuity` |
| 2 | H1 + testes backend + docs do endpoint | `feat(auth): issue tenant-scoped session on tenant switch` |
| 3 | H2 + testes cookie/config + runbook | `security(auth): align refresh cookie with cross-app sso` |
| 4 | H3 + testes Hub | `fix(hub): open modules only after tenant session switch` |
| 5 | H4 + testes OmniHub | `security(frontend): migrate operations auth to shared session` |
| 6 | H5 + testes roles | `fix(saa): align ads access with hub roles` |
| 7 | H6/H7 flags, smoke evidence e docs finais | `chore(deploy): validate cross-module production access` |

Para producao, H1, H2, H3 e H4 formam o conjunto minimo antes de declarar
acesso unico concluido. CRM/Botify podem ser validados antes; OmniHub nao deve
ser anunciado como SSO enquanto H4 nao estiver implantado.

## Matriz de testes e QA

### Automatizados

| Area | Casos minimos |
|---|---|
| Auth backend | troca com membership ativa; tenant inexistente; tenant de outro usuario; tenant inativo; refresh rotacionado; role vem da membership. |
| Cookie | set e clear incluem a politica de `Domain` decidida, `Path=/auth`, `HttpOnly`, `Secure` em producao e `SameSite`; CORS com credentials. |
| Hub | botao desabilita durante troca; falha nao abre modulo; sucesso mostra tenant confirmado; destino continua sem query/hash de token/tenant. |
| OmniHub | boot chama refresh; acesso protegido abre com sessao restaurada; logout limpa memoria/cookie; ausencia de `vend_token`. |
| Ads | role `digital` de acordo com decisao; acesso negado consistente entre Hub, UI e API. |
| CRM/Botify | restore session no boot e route guard com tenant emitido apos switch. |

### Smoke em ambiente publicado

Executar com dois tenants de teste e ao menos tres perfis (`admin`,
`supervisor`/`digital`, `operator` ou `broker`):

1. Entrar no Hub e confirmar que nenhum token aparece na URL ou no storage.
2. Selecionar Tenant A, abrir cada modulo permitido pela tela intermediaria e
   confirmar nome/escopo dos dados.
3. Voltar ao Hub, selecionar Tenant B e repetir; nenhum dado do Tenant A pode
   permanecer visivel.
4. Tentar abrir um modulo negado para o perfil atual; o Hub nao oferece acesso
   e a API continua recusando chamada direta.
5. Fazer logout no Hub e recarregar cada modulo aberto; todos devem retornar
   ao fluxo anonimo.
6. Inspecionar cookie apenas por atributos: host/domain aprovado, `HttpOnly`,
   `Secure`, `SameSite` e path corretos; nunca registrar seu valor em
   evidencia.

### Evidencias para aceite

- capturas de tela sem dados pessoais ou secrets;
- status HTTP e identificadores de caso, sem copiar tokens/cookies;
- logs de auditoria de troca de tenant com IDs tecnicos minimos;
- resultado das suites automatizadas executadas;
- registro do rollback adotado se algum modulo falhar.

## Riscos e rollback

| Risco | Mitigacao | Rollback |
|---|---|---|
| Usuario troca label do tenant mas abre dados do anterior | H1/H3 sao bloqueadores; abrir modulo somente apos resposta do backend. | Desativar botao externo e manter somente Hub ate corrigir sessao. |
| Cookie nao permite restore a partir dos frontends publicados | H2 + validacao em browser real sob dominio de producao, preferindo host-only da API. | Reverter config de cookie/CORS e manter modulos nao anunciados como SSO. |
| OmniHub expor token em storage durante transicao | H4 remove `vend_token`; security review antes do deploy. | Retirar link OmniHub do gateway enquanto migracao nao for segura. |
| Evento ou regra operacional misturar tenants apos troca de sessao | WebSocket valida membership, usa salas por tenant e painel/repescagem passam `tenantId`; migration torna a chave de repescagem composta. | Desabilitar OmniHub no gateway e reverter release ate confirmar isolamento. |
| Duas abas/modulos chamarem `/auth/refresh` simultaneamente sobre o mesmo cookie rotativo | Definir e testar estrategia de concorrencia de refresh (sessao por modulo ou janela controlada/auditada) antes de anunciar SSO multiaba. | No rollout inicial, abrir um modulo por vez e retirar links externos se ocorrer revogacao por reuse legitimo. |
| Handler Evolution legado resolver linha ambigua ou registrar payload bruto | Security review H6 deve bloquear rota em producao ou exigir vinculo de integracao confiavel e logs sanitizados. | Manter apenas Cloud API/bridges validadas ativos em producao ate correção. |
| Ads mostrar modulo que recusa o perfil | Fechar matriz H5 antes de liberar `digital`. | Ocultar Ads para perfis inconsistentes; backend continua autoridade. |
| Mudanca de auth afetar sessoes abertas | Deploy controlado, informar novo login quando houver rotacao/revogacao. | Rollback da release e revogacao de sessoes afetadas, sem reusar tokens. |

## Definicao de pronto

- [ ] Tela intermediaria continua coerente com a experiencia aprovada e abre
      nova aba sem parametros sensiveis.
- [ ] Tenant escolhido no Hub corresponde ao `tenantId` do JWT usado pelo
      modulo aberto.
- [ ] A politica de Domain, cookie path e CORS permite restore seguro nos apps
      publicados com o menor alcance necessario.
- [ ] CRM, OmniHub, Ads e Botify entram pela sessao compartilhada ou sao
      explicitamente bloqueados ate estarem prontos.
- [ ] Matriz de roles do Hub, satellite e backend nao possui permissao
      enganosa.
- [ ] Access/refresh tokens nao sao persistidos em `localStorage` nem enviados
      por URL.
- [ ] Testes automatizados e smoke cross-tenant foram registrados.
- [ ] Refresh concorrente entre duas abas/modulos foi testado sem revogar uma
      sessao legitima.
- [ ] Runbook de deploy e rollback foi atualizado antes do push produtivo.

## Arquivos previstos por bloco

| Bloco | Arquivos ou areas esperadas |
|---|---|
| H1 | `apps/omniconnect-backend/src/auth/*`, `src/tenants/*`, `src/system-events/*`, testes E2E, docs API/ADR |
| H2 | `apps/omniconnect-backend/src/auth/refresh-token.service.ts`, env examples se necessarios, `docs/deployment/*`, ADR-0003 |
| H3 | `apps/omniconnect-hub/src/lib/auth-context.tsx`, `omniconnectClient.ts`, `components/module-placeholder.tsx`, testes |
| H4 | `apps/omniconnect-frontend/src/contexts/AuthContext.tsx`, `src/services/api.ts` ou novo cliente, websocket, testes |
| H5 | `apps/omniconnect-hub/src/lib/permissions.ts`, `apps/smart-ad-automator/src/**`, controllers Ads/OAuth, testes |
| H6 | Config/documentacao Botify/CRM e testes de smoke correspondentes |

## Referencias

- [`ADR-0003 - Hub identity and roles`](../adr/ADR-0003-hub-identity-and-roles.md)
- [`ADR-0004 - Hub into monorepo`](../adr/ADR-0004-hub-into-monorepo.md)
- [`06-next-actions.md`](./06-next-actions.md)
- [`sprint-2-4-saa-frontend.md`](./sprint-2-4-saa-frontend.md)
- [`sprint-3-1-crm-frontend.md`](./sprint-3-1-crm-frontend.md)
- [`botify-g7-wordpress-removal.md`](./botify-g7-wordpress-removal.md)
- [`docs/03-multitenancy.md`](../03-multitenancy.md)
- [`docs/04-security.md`](../04-security.md)
- [`docs/08-development-workflow.md`](../08-development-workflow.md)
