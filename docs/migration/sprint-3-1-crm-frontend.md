# Sprint 3.1 — CRM Frontend Cutover

Status: concluído localmente, aguardando commit/push.

## Objetivo

Migrar `apps/crm-imobiliario` do Supabase para o `omniconnect-backend`,
mantendo o strangler-fig usado no SAA: primeiro cortar auth e data access,
depois remover SDK/artefatos Supabase do app.

## Blocos Entregues

| Bloco | Entrega |
|---|---|
| A — Auth | `src/lib/omniconnectClient.ts`, `AuthContext`, `Auth.tsx` e `ResetPassword.tsx` passam a usar JWT + refresh cookie do backend. |
| B — Base CRM | `PropertyContext` e `ClientContext` usam `/crm/properties`, `/crm/units` e `/crm/clients`. |
| C — Fluxo comercial | `CRMContext`, `ProposalContext`, `ContractContext` e `FinancialContext` usam `/crm/leads`, `/crm/proposals`, `/crm/contracts`, `/crm/payments` e `/crm/commissions`. |
| D — Arquivos/AI/realtime | Upload PDF via `/crm/storage/upload`, parser via `/crm/pdf-parser`, assinaturas via `/crm/signatures`, realtime `/crm` com cliente Socket.io mínimo sobre WebSocket nativo. |
| E — Cleanup | Removidos imports/deps Supabase/Lovable e artefatos legados (`supabase/`, `bun.lock`, integrations). |
| F — Smoke | `vite build` e Vitest verdes. |

## Decisões

- O frontend mantém os tipos legados (`Property`, `Client`, `Proposal`,
  `Contract`) para reduzir blast radius; o mapeamento fica em
  `src/lib/api/crm.ts`.
- O access token fica em memória, igual ao SAA. Refresh usa cookie HttpOnly
  via `/auth/refresh`.
- Document versions/access logs e timelines locais usam fallback em
  `localStorage` porque o backend ainda não expõe endpoints de listagem
  frontend-safe.
- O parser de PDF recebe texto extraído no browser. Sem `pdf.js` instalado
  neste bloco, o fallback é `File.text()`; robustez de extração fica como
  pendência explícita.

## Validação

```bash
cd "apps/crm-imobiliario"
./node_modules/.bin/vite build
./node_modules/.bin/vitest run
```

Resultado local:

- `vite build`: verde
- Vitest: `9/9` testes verdes
- `ReadLints`: sem erros nos arquivos alterados

## Pendências

- Adicionar endpoints backend para listar `CrmDocumentVersion`,
  `CrmDocumentAccessLog`, `CrmProposalEvent` e `CrmContractEvent`.
- Substituir fallback `File.text()` por extração real com `pdf.js`.
- Ampliar smoke tests para contexts e telas críticas.
- Promover `crm-imobiliario` a job bloqueante no CI após estabilizar fixtures.
