## Plano: 4 próximos passos pós-migração

Os 4 itens serão entregues em sequência, em ordem de menor → maior risco/dependência externa.

---

### 1) Realtime no Kanban do CRM

**Objetivo:** quando um corretor mover/editar um lead, os outros usuários abertos no CRM veem a mudança ao vivo, sem F5.

**Como:**
- Ativar `REPLICA IDENTITY FULL` e adicionar as tabelas `leads`, `interactions` e `follow_ups` à publicação `supabase_realtime` via migration.
- Em `CRMContext`, abrir um canal Supabase Realtime (`supabase.channel("crm")`) e escutar `postgres_changes` (INSERT/UPDATE/DELETE) nessas três tabelas.
- Ao receber evento, fazer merge no estado local (atualizar/adicionar/remover sem recarregar tudo).
- Mostrar um indicador discreto "Atualizado por {nome} agora" (toast curto) quando a mudança vier de outro usuário.
- Cleanup do canal no unmount.

**Critério de aceite:** abrir o CRM em duas abas com usuários diferentes, mover um lead em uma → aparece no Kanban da outra em <2s.

---

### 2) Notificações por e-mail em transições

**Objetivo:** disparar e-mails automáticos em eventos-chave do fluxo de vendas.

**Eventos cobertos (v1):**
- Proposta enviada → cliente recebe link/PDF.
- Contrato criado e pendente de assinatura → signatários recebem link de assinatura.
- Parcela vencendo em 3 dias / vencida → cliente + corretor recebem aviso.
- Comissão liberada → corretor recebe aviso.

**Como:**
- Configurar domínio de envio (Lovable Emails) — exige passo do usuário no DNS.
- Templates React Email em `supabase/functions/_shared/email-templates/` (proposta, contrato, parcela, comissão).
- Edge function `send-transactional-email` (já vem com a infra) é chamada por:
  - **Triggers no banco** em `proposals` (status→sent), `contracts` (status→pending_signature) e `commissions` (status→paid) usando `pg_net` para invocar a função.
  - **Cron pg_cron diário** para varrer `payments` com `due_date` próximo/vencido.
- Tabela `notification_preferences` (por usuário) para opt-out por categoria.
- Página simples em `/settings/notifications` para gerenciar preferências.
- Dashboard de envio (`email_send_log`) restrito a admin em `/admin/emails`.

**Critério de aceite:** mudar uma proposta para "enviada" gera entrada em `email_send_log` com status `sent` e o e-mail chega na caixa do cliente.

---

### 3) Dashboard financeiro avançado

**Objetivo:** transformar `FinancialDashboard.tsx` num painel real de gestão.

**Conteúdo:**
- **KPIs:** A receber (30/60/90 dias), Recebido no mês, Inadimplência (R$ e %), Comissões a pagar, Comissões pagas, Ticket médio.
- **Gráficos** (Recharts):
  - Fluxo de caixa projetado (12 meses) — barras empilhadas: parcelas previstas vs recebidas.
  - Aging de inadimplência (0-30, 31-60, 61-90, 90+).
  - Top 10 clientes inadimplentes.
  - Comissões por corretor (mês corrente + projeção).
- **Tabelas:** parcelas em atraso (com ação rápida "marcar como pago" e "registrar contato"), próximas a vencer, comissões pendentes.
- **Filtros:** período, empreendimento, corretor.
- **Exports:** CSV das tabelas principais.

**Como:**
- Views SQL (`v_payments_aging`, `v_cashflow_projection`, `v_commissions_summary`) para evitar cálculos pesados no front.
- Hook `useFinancialKpis` que consulta as views com filtros.
- Reuso dos componentes de chart já presentes no projeto.

**Critério de aceite:** valores conferem com `payments`/`commissions` no banco; filtros aplicam-se a todos os blocos; exportação de CSV funciona.

---

### 4) Assinatura digital real

**Objetivo:** substituir o mock SHA-256 atual por integração com provedor real, mantendo o registro local em `signatures`.

**Provedor sugerido:** Clicksign (foco BR, API simples, certificado ICP-Brasil opcional). Alternativas: D4Sign, DocuSign.

**Como:**
- Pedir ao usuário a `CLICKSIGN_API_TOKEN` (secret).
- Edge function `signature-create`: ao acionar "Enviar para assinatura" no contrato:
  1. Faz upload do PDF do contrato para o Clicksign.
  2. Cria envelope com lista de signatários (comprador, vendedor, testemunhas).
  3. Salva `external_envelope_id` na linha do `contracts` e tokens em `signatures`.
  4. Dispara e-mails de assinatura (via item 2).
- Edge function pública `signature-webhook` (sem JWT, valida HMAC):
  - Recebe eventos do Clicksign (`auto_close`, `sign`, `refuse`).
  - Atualiza `signatures.status` + `signed_at` + `ip_address` + `signature_hash`.
  - O trigger existente `sync_contract_signatures_jsonb` já consolida tudo em `contracts.signatures` e marca `signed`.
- UI: substituir o diálogo de assinatura mock por "Enviar para assinatura digital" + status em tempo real (consumindo realtime de `signatures`).
- Manter o mock como fallback `dev`/sem token (flag `VITE_SIGNATURE_PROVIDER`).

**Critério de aceite:** enviar contrato → signatários recebem e-mail do Clicksign → assinaturas chegam no app via webhook → contrato marca `signed` automaticamente → trigger gera parcelas/comissões.

---

## Sequência recomendada

```
1. Realtime do CRM        (1 dia)  — sem dependência externa
2. Notificações por email (2 dias) — depende do usuário verificar domínio DNS
3. Dashboard financeiro   (2 dias) — só SQL + UI
4. Assinatura digital     (2 dias) — depende de conta + API token Clicksign
```

Posso começar pela **#1** que não exige nenhuma ação sua. As #2 e #4 vão pausar pedindo configuração quando chegarmos lá.