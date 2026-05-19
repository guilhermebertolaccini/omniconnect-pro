import type { Prisma } from '@prisma/client';

/**
 * Appends a readable Botify triage block for operators when opening a queued thread.
 * Structured snapshot remains in `MessageQueue.leadSummary` for APIs/reporting.
 */
export function formatQueueMessageWithTriage(
  baseMessage: string,
  leadSummary: Prisma.JsonValue | null | undefined,
): string {
  if (leadSummary == null || typeof leadSummary !== 'object' || Array.isArray(leadSummary)) {
    return baseMessage;
  }
  const s = leadSummary as Record<string, unknown>;
  const lines: string[] = [];
  const pairs: [string, string][] = [
    ['intent', 'Intent'],
    ['urgency', 'Urgência'],
    ['budget', 'Orçamento'],
    ['region', 'Região'],
    ['propertyInterest', 'Interesse'],
    ['flowId', 'Fluxo'],
    ['flowName', 'Nome do fluxo'],
    ['lastUserMessage', 'Última msg. usuário'],
    ['lastAssistantReply', 'Última resposta bot'],
    ['notes', 'Notas'],
  ];
  for (const [key, label] of pairs) {
    const v = s[key];
    if (typeof v === 'string' && v.trim()) {
      lines.push(`${label}: ${v.trim().slice(0, 400)}`);
    }
  }
  const collected = s.collectedFields;
  if (collected && typeof collected === 'object' && !Array.isArray(collected)) {
    for (const [k, v] of Object.entries(collected)) {
      if (lines.length >= 24) break;
      if (typeof v === 'string' && v.trim()) {
        lines.push(`${k.slice(0, 48)}: ${v.trim().slice(0, 200)}`);
      }
    }
  }
  if (lines.length === 0) {
    return baseMessage;
  }
  return `${baseMessage.trim()}\n\n---\n[Botify — triagem]\n${lines.join('\n')}`;
}
