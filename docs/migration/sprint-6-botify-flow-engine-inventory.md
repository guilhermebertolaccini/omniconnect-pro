# Inventário — FlowEngine (microserviço BotFlow) vs editor Botify

Documento **C1** da Sprint 6. O **motor de execução** que processa filas WhatsApp vive em  
`apps/botify/wordpress-plugin/botflow-manager/microservice/src/engine/flow-engine.ts`.  
O **editor visual** (arrastar nós) está em `apps/botify/src/components/flow-editor/`.

## Matriz nó a nó

| Tipo `node.type` | Motor microserviço | Editor (paleta) | Notas |
|------------------|-------------------|-----------------|--------|
| `start` | Sim (entrada) | Sim | Sem efeito colateral; só define grafo. |
| `message` | Sim | Sim | Envia texto via `microservice/send`. |
| `delay` | Sim | Sim | `setTimeout` por `delayMs`. |
| `ai` | Sim | Sim | Histórico carregado de WP (`GET .../microservice/conversation/{id}/messages`) + `AIProcessor`. |
| `condition` | Sim | Sim | Salvar fluxo no editor grava `sourceHandle` `yes`/`no` nas ligações; ramificação via regex em `data.condition` (ver `flow-engine-navigation.ts`). Fluxos antigos só com `connections: string[]` seguem a **primeira** aresta. |
| `action` | Parcial (`transfer` only) | Sim | Outras ações (`tag`, `webhook`, `end`) → log; sem efeito no microserviço. |
| `media` | Não | **Em breve** (paleta bloqueada) | Envio real depende de API WhatsApp no microserviço. |
| `buttons` | Não | **Em breve** | Interação por botões não implementada no motor Node. |
| `list` | Não | **Em breve** | Idem. |

## WordPress plugin (legado)

`class-botflow-webhook.php` ainda contém `execute_node` com botões/lista/mídia para um caminho PHP legado. O **microserviço** é o caminho usado quando a fila Bull processa mensagens com `FlowEngine`; não confundir os dois pipelines.

## Referências

- Navegação: `microservice/src/engine/flow-engine-navigation.ts`  
- Histórico IA: `microservice/src/engine/flow-engine-history.ts`  
- API mensagens microserviço: `GET /wp-json/botflow/v1/microservice/conversation/{id}/messages`  
- Plano sprint: `docs/migration/sprint-6-botify-maturity-plan.md`
