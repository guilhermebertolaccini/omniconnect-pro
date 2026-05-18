## Objetivo
Garantir que `useRealtimeAuditLogs` mantenha **uma única assinatura realtime ativa** por aba/usuário, mesmo se o hook for usado em múltiplos componentes simultaneamente (ex.: `AuditAlertsBell` no Header + `AuditLogPanel` em `/settings?tab=audit`) ou re-montado pelo StrictMode.

## Problema atual
Hoje cada chamada de `useRealtimeAuditLogs` cria seu próprio canal com nome aleatório (`audit-logs-stream-xxxx`). Isso evita o erro de “`.on` após `.subscribe()`”, mas:
- Abrir o painel de auditoria com o sino já montado abre **2 canais** simultâneos.
- Em StrictMode, mount/unmount/mount pode deixar canais duplicados em flight.
- Cada canal consome quota do realtime e dispara invalidações duplicadas no react-query.

## Solução: singleton de canal com refcount
Substituir a lógica do hook por um **gerenciador module-level** que mantém apenas um canal Supabase para `audit_logs`, compartilhado entre todos os consumidores.

### Comportamento
- Primeiro consumidor cria o canal e faz `.subscribe()`.
- Consumidores seguintes apenas registram seu callback num `Set` e incrementam o refcount.
- No cleanup, decrementa o refcount; quando chega a zero, faz `removeChannel` e limpa o singleton.
- Cada componente registra um callback estável via `useRef`, evitando re-subscrições por mudança de identidade da função.

### Estrutura técnica
Em `src/hooks/useAuditLogs.ts`:

```text
module scope
├─ channel: RealtimeChannel | null
├─ subscribers: Set<(row) => void>
├─ refCount: number
├─ ensureChannel(qc) → cria canal único com .on(postgres_changes INSERT audit_logs)
│     → no callback: invalida queries + dispara todos subscribers
└─ releaseChannel() → decrementa; se 0, removeChannel + reset

useRealtimeAuditLogs(onInsert)
├─ cbRef = useRef(onInsert) (atualizado em effect)
├─ useEffect([qc]):
│     ensureChannel(qc)
│     subscribers.add(stableCb que chama cbRef.current)
│     return () => { subscribers.delete(...); releaseChannel(); }
```

### Detalhes
- Nome do canal fixo: `audit-logs-stream` (único por aba; o singleton garante não-duplicação).
- `qc.invalidateQueries` para `['audit-logs']` e `['audit-alerts-count']` é feito **uma vez por evento**, dentro do callback do canal — não por subscriber.
- `removeChannel` só ocorre quando o último consumidor desmonta, evitando ciclo de tear-down/setup quando há navegação entre páginas que ambas consomem.
- Sem dependência de `onInsert` no effect (usamos ref) → estável.

## Arquivos
- **Editar**: `src/hooks/useAuditLogs.ts` (apenas a função `useRealtimeAuditLogs` + helpers module-scope).

Nenhuma mudança em componentes consumidores (`AuditAlertsBell`, `AuditLogPanel`) — assinatura do hook permanece idêntica.

## Validação
1. Abrir `/unified` (sino visível) e navegar para `/settings?tab=audit`: console não deve mostrar erro de subscribe duplicado; aba Network/WS mostra **1 só** canal `audit-logs-stream`.
2. Inserir um audit log via edge function e confirmar que a contagem do sino e a tabela atualizam **uma única vez**.
3. Desmontar o painel mantendo o sino: canal continua ativo. Fechar a aba: canal é removido.