# Sprint 3.2 — CRM Hardening Pós-Cutover

Status: concluído localmente, aguardando commit/push.

## Objetivo

Reduzir risco operacional depois do cutover do `crm-imobiliario` para o
`omniconnect-backend`, removendo fallbacks locais de auditoria e fechando
as listagens que o frontend precisava para PDFs e timelines.

## Entregas

| Área | Entrega |
|---|---|
| Document audit | `GET /crm/storage/documents/:parentType/:parentId/versions` lista `CrmDocumentVersion` tenant-scoped. |
| Access logs | `GET /crm/storage/documents/:parentType/:parentId/access-logs` lista `CrmDocumentAccessLog` tenant-scoped. |
| Proposal events | `GET /crm/proposals/:id/events` lista timeline após `findOne` validar tenant/broker scope. |
| Contract events | `GET /crm/contracts/:id/events` lista timeline após `findOne` validar tenant/broker scope. |
| PDF events | `PATCH /crm/proposals/:id` e `PATCH /crm/contracts/:id` registram `pdf_attached`/`pdf_removed` quando `pdfUrl` muda. |
| Frontend | `documentVersions.ts`, `ProposalDetail` e `ContractDetail` passaram a consumir os endpoints backend. |

## Segurança e Multi-Tenancy

- Nenhum endpoint aceita `tenantId` do cliente.
- `tenantId` vem de `ensureTenant(user)`.
- Listagens de documentos chamam a mesma validação de parent usada para
  upload/serve: o parent precisa existir no tenant e, para broker, pertencer
  ao próprio broker.
- Timelines de proposta/contrato chamam `findOne(...)` antes de listar
  eventos, reaproveitando tenant scope e broker scope.

## Validação

```bash
cd "apps/omniconnect-backend"
npx tsc --noEmit -p tsconfig.build.json
npx jest src/crm-storage/crm-storage.service.spec.ts src/crm/proposals/crm-proposals.service.spec.ts src/crm/contracts/crm-contracts.service.spec.ts --runInBand

cd "../crm-imobiliario"
./node_modules/.bin/vite build
```

Resultado local:

- Backend specs afetadas: `26/26` verdes
- Backend typecheck: limpo
- CRM frontend build: verde

## Pendências

- Substituir extração de PDF `File.text()` por `pdf.js`.
- Adicionar endpoint persistente para preferências de notificação no frontend.
- Ampliar smoke tests do `crm-imobiliario` para fluxos de proposta/contrato.
- Promover `crm-imobiliario` a job bloqueante no CI quando a suite estiver
  mais representativa.
