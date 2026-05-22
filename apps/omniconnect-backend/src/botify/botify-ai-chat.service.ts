import { Injectable, Logger } from '@nestjs/common';

/**
 * Helper interno do engine Botify para nós tipo `ai` — chama OpenAI Chat
 * Completions com a config do nó. Não é o mesmo `InsightAI` (que faz
 * análise comercial estruturada via Zod-validated JSON). Aqui é chat
 * livre, response em texto plano.
 *
 * Sem `OPENAI_API_KEY` → fallback determinístico ("Recebi sua mensagem: …")
 * para destravar dev/staging sem custo LLM. Em produção real, a chave é
 * obrigatória — sem ela, o nó AI ainda funciona, mas com qualidade óbvia
 * de fallback.
 */
@Injectable()
export class BotifyAIChatService {
  private readonly logger = new Logger(BotifyAIChatService.name);

  /**
   * Roda chat completion. Retorna texto plano da resposta ou um fallback
   * heurístico. NÃO lança — falhas no provider degradam silenciosamente
   * pro fallback pra que o flow não quebre.
   */
  async chat(args: {
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    userMessage: string;
  }): Promise<{ text: string; provider: 'openai' | 'fallback' }> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return {
        text: this.fallback(args.userMessage),
        provider: 'fallback',
      };
    }

    const model = args.model?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
    const temperature = typeof args.temperature === 'number' ? args.temperature : 0.2;
    const maxTokens = typeof args.maxTokens === 'number' && args.maxTokens > 0 ? args.maxTokens : 500;

    const messages: Array<{ role: string; content: string }> = [];
    if (args.systemPrompt?.trim()) {
      messages.push({ role: 'system', content: args.systemPrompt.trim() });
    }
    for (const m of args.history) {
      messages.push({ role: m.role, content: m.content });
    }
    messages.push({ role: 'user', content: args.userMessage });

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(
          `OpenAI Chat ${res.status}: ${body.slice(0, 200)}`,
        );
        return { text: this.fallback(args.userMessage), provider: 'fallback' };
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        return { text: this.fallback(args.userMessage), provider: 'fallback' };
      }
      return { text: content, provider: 'openai' };
    } catch (err) {
      this.logger.warn(
        `OpenAI Chat falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { text: this.fallback(args.userMessage), provider: 'fallback' };
    }
  }

  private fallback(userMessage: string): string {
    const trimmed = userMessage.trim();
    if (!trimmed) {
      return 'Recebi sua mensagem, mas ela está vazia. Pode reformular?';
    }
    return `Recebi sua mensagem: "${trimmed.slice(0, 200)}". Um atendente vai te responder em breve.`;
  }
}
