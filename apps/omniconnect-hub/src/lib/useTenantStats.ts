import { useEffect, useState } from "react";
import {
  getInsightSummary,
  getPilotOverview,
  type InsightSummary,
  type PilotOverview,
} from "@/lib/omniconnectClient";

export interface TenantStats {
  summary: InsightSummary | null;
  pilot: PilotOverview | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook compartilhado para KPIs da Home + `/executive` — combina os dois
 * endpoints reais já disponíveis (PR 4 + PR 5) numa única chamada
 * concorrente. Ambos respeitam `tenantId` do JWT.
 *
 * Falha não-bloqueante: erros vão para `error` e os componentes decidem se
 * caem em fallback ("—") ou propagam.
 */
export function useTenantStats(days: number = 30): TenantStats {
  const [summary, setSummary] = useState<InsightSummary | null>(null);
  const [pilot, setPilot] = useState<PilotOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getInsightSummary({ days }).catch(() => null),
      getPilotOverview({ days }).catch(() => null),
    ])
      .then(([s, p]) => {
        if (cancelled) return;
        setSummary(s);
        setPilot(p);
        if (!s && !p) setError("Falha ao carregar estatísticas do tenant");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [days]);

  return { summary, pilot, loading, error };
}

/** Helper de formatação para KPIs PT-BR. */
export function formatStat(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR");
}
