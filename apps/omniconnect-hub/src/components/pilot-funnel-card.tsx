import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  ClipboardList,
  Loader2,
  MessageCircle,
  RefreshCw,
  Sparkles,
  TrendingDown,
  Megaphone,
} from "lucide-react";
import {
  getPilotOverview,
  type PilotOverview,
  type PilotOverviewOrigin,
} from "@/lib/omniconnectClient";

/**
 * A6 do piloto (`pilot-flow-lead-to-recovery.md` §7). Mostra o funil
 * ads → conversas → handoffs Botify → análises → recuperáveis,
 * mais sinais de perda/abandono e custo IA agregados por tenant.
 *
 * Tenant scope vem do JWT — esta card **não** envia `tenantId`; o backend
 * recusa qualquer payload com `tenantId` no query. Sem cross-tenant leak.
 */
export function PilotFunnelCard() {
  const [days, setDays] = useState<number>(30);
  const [origin, setOrigin] = useState<PilotOverviewOrigin>("all");
  const [data, setData] = useState<PilotOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPilotOverview({ days, origin })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, origin]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Pilot Funnel
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Ads → conversas → Botify → InsightAI → recuperáveis. Tenant atual.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={origin}
            onValueChange={(v) => setOrigin(v as PilotOverviewOrigin)}
          >
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas origens</SelectItem>
              <SelectItem value="ads">Pago (ads)</SelectItem>
              <SelectItem value="hsm">HSM</SelectItem>
              <SelectItem value="organic">Orgânico</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="h-8 w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={loading}
            onClick={() => setDays((d) => d)}
            aria-label="Recarregar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <ErrorState message={error} />
        ) : loading && !data ? (
          <SkeletonState />
        ) : data ? (
          <>
            <Funnel data={data} />
            <Secondaries data={data} />
            <Period data={data} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Funnel({ data }: { data: PilotOverview }) {
  const steps = [
    { label: "Leads ingeridos", value: data.leadsIngested, icon: Megaphone },
    { label: "Conversas", value: data.conversationsCreated, icon: MessageCircle },
    { label: "Handoffs Botify", value: data.botifyHandoffs, icon: Bot },
    { label: "Análises IA", value: data.insightAnalyses, icon: Sparkles },
    {
      label: "Recuperáveis",
      value: data.recoverableOpportunities,
      icon: ClipboardList,
      highlight: true,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <div
            key={s.label}
            className={`relative rounded-md border p-3 ${
              s.highlight ? "border-warning/40 bg-warning/5" : "bg-card"
            }`}
          >
            <Icon
              className={`mb-1 h-4 w-4 ${
                s.highlight ? "text-warning-foreground" : "text-muted-foreground"
              }`}
            />
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-semibold tracking-tight">
              {s.value.toLocaleString("pt-BR")}
            </p>
            {i < steps.length - 1 && (
              <ArrowRight className="absolute -right-3 top-1/2 hidden h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40 sm:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Secondaries({ data }: { data: PilotOverview }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="flex items-center gap-3 rounded-md border bg-card p-3">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-destructive/10 text-destructive">
          <TrendingDown className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">
            Sinais de perda / abandono
          </p>
          <p className="text-lg font-semibold leading-tight">
            {data.lossOrAbandonmentSignals.toLocaleString("pt-BR")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-md border bg-card p-3">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-muted text-muted-foreground">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Custo IA no período</p>
          <p className="text-lg font-semibold leading-tight">
            {formatCost(data.aiCost.amount, data.aiCost.currency)}
          </p>
        </div>
      </div>
    </div>
  );
}

function Period({ data }: { data: PilotOverview }) {
  const from = new Date(data.period.from);
  const to = new Date(data.period.to);
  return (
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
      {from.toLocaleDateString("pt-BR")} → {to.toLocaleDateString("pt-BR")} ·
      origem: {data.origin}
    </p>
  );
}

function SkeletonState() {
  return (
    <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
      <p className="font-medium">Falha ao carregar funil piloto</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function formatCost(amount: number, currency: string): string {
  if (currency === "USD") {
    return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  if (currency === "BRL") {
    return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  return `${amount.toFixed(4)} ${currency}`;
}
