import { createFileRoute } from "@tanstack/react-router";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Line,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { ModuleGate } from "@/components/module-gate";
import { PilotFunnelCard } from "@/components/pilot-funnel-card";
import { VGV_TREND } from "@/lib/mock-data";
import { useTenantStats, formatStat } from "@/lib/useTenantStats";
import { LineChart as LineIcon, AlertTriangle } from "lucide-react";

// Mocks que ainda não têm equivalente no `omniconnect-backend`:
// - série temporal de VGV (precisa de aggregator próprio em CRM)
// - cartões de alerta (precisam de regras de produto + AlertEngine)
// Quando `VITE_USE_MOCK_DATA=false`, esses blocos não são renderizados.
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === "true";

export const Route = createFileRoute("/_app/executive")({
  head: () => ({ meta: [{ title: "Painel Executivo — OmniconnectPRO" }] }),
  component: () => (
    <ModuleGate moduleId="executive">
      <ExecutivePage />
    </ModuleGate>
  ),
});

function ExecutivePage() {
  const { summary, pilot, loading } = useTenantStats(30);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <LineIcon className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Painel CEO / CFO</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Indicadores consolidados do funil piloto, conversas e InsightAI.
        </p>
      </header>

      {/* KPIs principais — backend real (Sprint Hub). */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Leads ingeridos (30d)"
          value={loading ? "…" : formatStat(pilot?.leadsIngested)}
        />
        <KpiCard
          label="Conversas (30d)"
          value={loading ? "…" : formatStat(pilot?.conversationsCreated)}
        />
        <KpiCard
          label="Análises IA (30d)"
          value={loading ? "…" : formatStat(pilot?.insightAnalyses)}
        />
        <KpiCard
          label="Recuperáveis"
          value={loading ? "…" : formatStat(pilot?.recoverableOpportunities)}
        />
      </div>

      {/* A6 do piloto — alimentado por GET /dashboards/pilot-overview */}
      <PilotFunnelCard />

      {/* KPIs secundários (qualidade média / abandono) — backend real. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Qualidade média (atendente)"
          value={loading ? "…" : formatStat(summary?.averageSellerQualityScore)}
        />
        <KpiCard
          label="Score de qualificação"
          value={loading ? "…" : formatStat(summary?.averageQualificationScore)}
        />
        <KpiCard
          label="Oportunidades perdidas"
          value={loading ? "…" : formatStat(summary?.lostOpportunities)}
        />
        <KpiCard
          label="Sinais de perda/abandono"
          value={loading ? "…" : formatStat(pilot?.lossOrAbandonmentSignals)}
        />
      </div>

      {USE_MOCK_DATA && (
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">VGV vendido (R$ milhões)</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={VGV_TREND} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="vendido"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  fill="url(#g1)"
                />
                <Line
                  type="monotone"
                  dataKey="meta"
                  stroke="var(--color-muted-foreground)"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-warning-foreground" /> Alertas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert
              tone="warning"
              title="CPL acima do alvo em 2 campanhas"
              body="AdpilotAI sugere realocar verba do canal Meta para Google Performance Max."
            />
            <Alert
              tone="destructive"
              title="Queda de conversão no funil Aurora"
              body="Conversão lead→proposta caiu 1,4pp na última semana."
            />
            <Alert
              tone="success"
              title="ROI acima da meta trimestral"
              body="ROI estimado em 5,8x vs meta de 4,5x."
            />
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}

function Alert({
  tone,
  title,
  body,
}: {
  tone: "warning" | "destructive" | "success";
  title: string;
  body: string;
}) {
  const styles = {
    warning: "border-warning/30 bg-warning/10",
    destructive: "border-destructive/30 bg-destructive/10",
    success: "border-success/30 bg-success/10",
  }[tone];
  return (
    <div className={`rounded-md border ${styles} p-3`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}
