import type { Message } from '../services/ai-processor.js';

export interface WpMessageRow {
  direction: string;
  content: string;
  mediaUrl?: string | null;
}

const MAX_TURNS = 24;

/**
 * Maps WordPress-stored rows to chat turns for the LLM.
 * Strips the last user line when it duplicates the current inbound message (it is re-sent as the prompt).
 */
export function wpMessagesToAiHistory(rows: WpMessageRow[], currentUserText: string): Message[] {
  const out: Message[] = [];

  for (const row of rows) {
    const trimmed = (row.content || '').trim();
    const line = trimmed || (row.mediaUrl ? '[mídia]' : '');
    if (!line) {
      continue;
    }
    if (row.direction === 'incoming') {
      out.push({ role: 'user', content: line });
    } else if (row.direction === 'outgoing') {
      out.push({ role: 'assistant', content: line });
    }
  }

  const last = out[out.length - 1];
  if (last?.role === 'user' && last.content.trim() === currentUserText.trim()) {
    out.pop();
  }

  if (out.length > MAX_TURNS) {
    return out.slice(-MAX_TURNS);
  }
  return out;
}
