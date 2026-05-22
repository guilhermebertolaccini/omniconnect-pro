import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  LINE_HEALTH_LINES,
  LINE_QUALITY_SCORE,
  type LineHealthLine,
  type LineQuality,
} from "@/lib/leads-data";

/**
 * Contrato compartilhado entre o gráfico de saúde da linha e o backend real.
 *
 * Hoje (modo mock) os dois server functions abaixo apenas devolvem os dados
 * estáticos de `LINE_HEALTH_LINES`. Os blocos marcados com `TODO[real-source]`
 * mostram exatamente onde plugar Meta Cloud API + Twilio Insights quando o
 * backend (Lovable Cloud + cron + tabela de samples) for habilitado.
 *
 * Decisão de produto (registrada no chat): híbrido Meta + Twilio, credencial
 * global (não por tenant), com persistência adiada — portanto este arquivo
 * mantém a forma final dos dados mas ainda não chama nenhuma API.
 */

export type LineHealthDataSource = "mock" | "meta" | "twilio" | "hybrid";

/** De onde veio cada pedaço de dado e qual a evidência exata da coleta. */
export type ProvenanceProvider = "meta" | "twilio" | "mock";

export type ProvenanceEntry = {
  provider: ProvenanceProvider;
  /** Endpoint / chamada que produziu o valor (exibido no tooltip). */
  endpoint: string;
  /** Campo bruto retornado pelo provedor. */
  field: string;
  /** Valor cru recebido (antes do mapeamento HIGH/MEDIUM/LOW). */
  rawValue: string;
  /** ISO da última coleta bem-sucedida. */
  fetchedAt: string;
};

export type LineProvenance = {
  quality: ProvenanceEntry;
  status: ProvenanceEntry;
  tier: ProvenanceEntry;
  /** Entregas/erros recentes — Twilio quando disponível. */
  delivery?: ProvenanceEntry;
};

export type LineHealthSnapshot = {
  source: LineHealthDataSource;
  fetchedAt: string; // ISO
  lines: Array<{
    id: string;
    displayName: string;
    phone: string;
    tenantId: string;
    tenantName: string;
    wabaId: string;
    tier: LineHealthLine["tier"];
    current: LineQuality;
    status: LineHealthLine["status"];
    primaryProvider: ProvenanceProvider;
    provenance: LineProvenance;
  }>;
};

export type LineHealthHistoryPoint = {
  date: string; // YYYY-MM-DD (UTC)
  quality: LineQuality;
  score: number; // 1 (LOW) | 2 (MEDIUM) | 3 (HIGH)
};

export type LineHealthHistory = {
  source: LineHealthDataSource;
  fetchedAt: string;
  rangeDays: 7 | 30;
  series: Array<{
    lineId: string;
    displayName: string;
    tenantId: string;
    /** Provedor que originou a série (ex.: quality_rating histórico vem da Meta). */
    provider: ProvenanceProvider;
    /** Evidência da coleta do histórico. */
    provenance: ProvenanceEntry;
    points: LineHealthHistoryPoint[];
  }>;
};

// ---------------------------------------------------------------------------
// Snapshot atual — Meta Graph API (`quality_rating`) é a fonte canônica.
// ---------------------------------------------------------------------------

export const fetchLineHealthSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<LineHealthSnapshot> => {
    const metaToken = process.env.META_GRAPH_TOKEN;
    const twilioConnected = !!process.env.TWILIO_API_KEY;

    // TODO[real-source]: quando META_GRAPH_TOKEN estiver disponível, para cada
    // linha registrada chamar:
    //
    //   GET https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}
    //       ?fields=quality_rating,messaging_limit_tier,status,name_status
    //       &access_token=${META_GRAPH_TOKEN}
    //
    // Mapear `quality_rating` (GREEN/YELLOW/RED) → HIGH/MEDIUM/LOW e `status`
    // (CONNECTED/FLAGGED/RESTRICTED/PENDING_REVIEW). Twilio (gateway):
    //
    //   GET https://connector-gateway.lovable.dev/twilio/Messages.json
    //       ?From=whatsapp:<phone>&PageSize=1
    //
    // serve para detectar `error_code=63016/63018` (qualidade) nas últimas
    // entregas como cross-check.
    //
    // Até lá devolvemos o mock para o gráfico continuar funcional.
    const source: LineHealthDataSource =
      metaToken && twilioConnected ? "hybrid" : metaToken ? "meta" : twilioConnected ? "twilio" : "mock";

    const fetchedAt = new Date().toISOString();
    return {
      source: source === "mock" ? "mock" : "mock", // força mock até implementarmos as chamadas
      fetchedAt,
      lines: LINE_HEALTH_LINES.map((l, i) => {
        const primary: ProvenanceProvider = i % 2 === 0 ? "meta" : "twilio";
        return {
          id: l.id,
          displayName: l.displayName,
          phone: l.phone,
          tenantId: l.tenantId,
          tenantName: l.tenantName,
          wabaId: l.wabaId,
          tier: l.tier,
          current: l.current,
          status: l.status,
          primaryProvider: primary,
          provenance: buildProvenance(l, primary, fetchedAt),
        };
      }),
    };
  },
);

const META_RATING_OF: Record<LineQuality, "GREEN" | "YELLOW" | "RED"> = {
  HIGH: "GREEN",
  MEDIUM: "YELLOW",
  LOW: "RED",
};

function buildProvenance(
  l: LineHealthLine,
  primary: ProvenanceProvider,
  fetchedAt: string,
): LineProvenance {
  if (primary === "meta") {
    const base = `GET https://graph.facebook.com/v22.0/${l.wabaId}`;
    return {
      quality: {
        provider: "meta",
        endpoint: `${base}?fields=quality_rating`,
        field: "quality_rating",
        rawValue: META_RATING_OF[l.current],
        fetchedAt,
      },
      status: {
        provider: "meta",
        endpoint: `${base}?fields=status,name_status`,
        field: "status",
        rawValue: l.status,
        fetchedAt,
      },
      tier: {
        provider: "meta",
        endpoint: `${base}?fields=messaging_limit_tier`,
        field: "messaging_limit_tier",
        rawValue: l.tier,
        fetchedAt,
      },
      delivery: {
        provider: "twilio",
        endpoint: `GET /twilio/Messages.json?From=whatsapp:${l.phone}&PageSize=20`,
        field: "error_code",
        rawValue: "0 erros 63016/63018 nas últimas 20 msgs",
        fetchedAt,
      },
    };
  }
  // Twilio primário — sender lifecycle + Insights
  const senderBase = `GET /twilio/v1/Channels/whatsapp/Senders?PhoneNumber=${l.phone}`;
  return {
    quality: {
      provider: "twilio",
      endpoint: `${senderBase} → properties.quality_rating`,
      field: "quality_rating",
      rawValue: META_RATING_OF[l.current],
      fetchedAt,
    },
    status: {
      provider: "twilio",
      endpoint: `${senderBase} → status`,
      field: "status",
      rawValue: l.status,
      fetchedAt,
    },
    tier: {
      provider: "twilio",
      endpoint: `${senderBase} → properties.messaging_limit`,
      field: "messaging_limit",
      rawValue: l.tier,
      fetchedAt,
    },
    delivery: {
      provider: "twilio",
      endpoint: `GET /twilio/Messages.json?From=whatsapp:${l.phone}&PageSize=20`,
      field: "error_code",
      rawValue: "0 erros 63016/63018 nas últimas 20 msgs",
      fetchedAt,
    },
  };
}

// ---------------------------------------------------------------------------
// Histórico 7/30 dias — requer persistência (cron amostrando o snapshot).
// ---------------------------------------------------------------------------

const HistoryInput = z.object({
  range: z.union([z.literal(7), z.literal(30)]),
  scope: z.string().default("all"), // "all" | "tenant:<id>" | <lineId>
});

export const fetchLineHealthHistory = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => HistoryInput.parse(input))
  .handler(async ({ data }): Promise<LineHealthHistory> => {
    // TODO[real-source]: ao habilitar Lovable Cloud criar tabela
    //   line_health_samples(line_id, sampled_at timestamptz, quality text)
    // alimentada por cron pg_cron a cada 30 min chamando
    // `fetchLineHealthSnapshot()`. Aqui basta:
    //
    //   select date_trunc('day', sampled_at) as day,
    //          mode() within group (order by quality) as quality
    //   from line_health_samples
    //   where line_id = any($1) and sampled_at >= now() - $2 * interval '1 day'
    //   group by 1 order by 1
    //
    // Mapear cada agregação para LineHealthHistoryPoint. Enquanto não há
    // tabela usamos o `history` mockado já alinhado com a UI.
    const scoped = scopeLines(data.scope);
    const fetchedAt = new Date().toISOString();
    const series = scoped.map((l, i) => {
      const provider: ProvenanceProvider = i % 2 === 0 ? "meta" : "twilio";
      const provenance: ProvenanceEntry =
        provider === "meta"
          ? {
              provider: "meta",
              endpoint: `daily mode() de quality_rating amostrado a cada 30min via Meta Graph (${l.wabaId})`,
              field: "quality_rating",
              rawValue: `${data.range}d · ${l.history.slice(-data.range).length} samples`,
              fetchedAt,
            }
          : {
              provider: "twilio",
              endpoint: `daily mode() de Senders.properties.quality_rating (Twilio WhatsApp Senders, ${l.phone})`,
              field: "quality_rating",
              rawValue: `${data.range}d · ${l.history.slice(-data.range).length} samples`,
              fetchedAt,
            };
      return {
        lineId: l.id,
        displayName: l.displayName,
        tenantId: l.tenantId,
        provider,
        provenance,
        points: l.history.slice(-data.range).map<LineHealthHistoryPoint>((p) => ({
          date: p.date,
          quality: p.quality,
          score: LINE_QUALITY_SCORE[p.quality],
        })),
      };
    });

    return {
      source: "mock",
      fetchedAt: new Date().toISOString(),
      rangeDays: data.range,
      series,
    };
  });

function scopeLines(scope: string): LineHealthLine[] {
  if (scope === "all") return LINE_HEALTH_LINES;
  if (scope.startsWith("tenant:")) {
    const t = scope.slice("tenant:".length);
    return LINE_HEALTH_LINES.filter((l) => l.tenantId === t);
  }
  return LINE_HEALTH_LINES.filter((l) => l.id === scope);
}
