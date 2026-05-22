import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KpiCard } from "@/components/kpi-card";
import {
  AlertTriangle,
  Loader2,
  PhoneCall,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  analyzeConversationByPhone,
  getInsightAnalyses,
  getInsightSummary,
  getInsightUsage,
  OmniconnectError,
  type InsightAnalysis,
  type InsightSummary,
  type InsightUsage,
} from "@/lib/omniconnectClient";

/**
 * Sprint Hub — PR 5. Painel "real" do InsightAI no Hub.
 *
 * Consome:
 *  - GET /insight-ai/dashboard/summary
 *  - GET /insight-ai/dashboard/usage
 *  - GET /insight-ai/analyses
 *  - POST /insight-ai/analyze/:phone
 *
 * Tenant scope vem do JWT. Sem cross-tenant leak. Não passa `tenantId` em
 * query string. Tetos de custo da §4.1 do piloto são enforced no backend
 * (rate-limit module); aqui apenas surfacing o resultado/erro.
 */
export function InsightBackendPanel() {
  const [days, setDays] = useState<number>(30);
  const [summary, setSummary] = useState<InsightSummary | null>(null);
  const [usage, setUsage] = useState<InsightUsage | null>(null);
  const [analyses, setAnalyses] = useState<InsightAnalysis[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getInsightSummary({ days }),
      getInsightUsage({ days, status: "success", limit: 50 }),
      getInsightAnalyses({ limit: 10, offset: 0 }),
    ])
      .then(([s, u, a]) => {
        if (cancelled) return;
        setSummary(s);
        setUsage(u);
        setAnalyses(a.items);
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
  }, [days, reloadTick]);

  return (
    <div className="space-y-5">
      <PanelHeader
        days={days}
        onDaysChange={setDays}
        onReload={() => setReloadTick((t) => t + 1)}
        loading={loading}
      />

      {error ? (
        <ErrorBanner message={error} />
      ) : (
        <>
          <KpiRow summary={summary} loading={loading} />
          <div className="grid gap-4 lg:grid-cols-3">
            <UsageCard usage={usage} loading={loading} className="lg:col-span-1" />
            <AnalysesCard
              items={analyses}
              loading={loading}
              className="lg:col-span-2"
            />
          </div>
        </>
      )}

      <AnalyzeForm onDone={() => setReloadTick((t) => t + 1)} />
    </div>
  );
}

function PanelHeader({
  days,
  onDaysChange,
  onReload,
  loading,
}: {
  days: number;
  onDaysChange: (d: number) => void;
  onReload: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">InsightAI · dados do tenant</h2>
        <Badge variant="secondary" className="font-normal">
          Backend
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <Select value={String(days)} onValueChange={(v) => onDaysChange(Number(v))}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
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
          onClick={onReload}
          disabled={loading}
          aria-label="Recarregar"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
}

function KpiRow({
  summary,
  loading,
}: {
  summary: InsightSummary | null;
  loading: boolean;
}) {
  if (loading && !summary) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-[88px]">
            <CardContent className="flex h-full items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  if (!summary) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Análises no período"
        value={summary.analyzedConversations.toLocaleString("pt-BR")}
      />
      <KpiCard
        label="Qualidade média (atendente)"
        value={`${summary.averageSellerQualityScore}`}
      />
      <KpiCard
        label="Oportunidades perdidas"
        value={summary.lostOpportunities.toLocaleString("pt-BR")}
      />
      <KpiCard
        label="Tentativas de visita / proposta"
        value={(
          summary.schedulingAttempts + summary.proposalOrSimulationAttempts
        ).toLocaleString("pt-BR")}
      />
    </div>
  );
}

function UsageCard({
  usage,
  loading,
  className,
}: {
  usage: InsightUsage | null;
  loading: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Custo IA por provedor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !usage ? (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : !usage || usage.byProvider.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem chamadas IA registradas no período.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {usage.byProvider.map((p) => (
                <li key={p.modelProvider} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{p.modelProvider}</span>
                  <span className="text-muted-foreground">
                    {p.calls.toLocaleString("pt-BR")} chamadas ·{" "}
                    {formatUsd(p.estimatedCost)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t pt-2 text-xs text-muted-foreground">
              Total no período: <b>{formatUsd(usage.totals.estimatedCost)}</b> ·{" "}
              {usage.totals.calls.toLocaleString("pt-BR")} chamadas
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AnalysesCard({
  items,
  loading,
  className,
}: {
  items: InsightAnalysis[] | null;
  loading: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Análises recentes (top 10)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading && !items ? (
          <div className="flex items-center p-4 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : !items || items.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhuma análise registrada ainda. Dispare a primeira pelo formulário
            abaixo.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <IntentBadge intent={a.leadIntent} />
                    <span className="truncate text-sm font-medium">
                      {a.contactName || a.contactPhone}
                    </span>
                    {a.lostOpportunity && (
                      <Badge variant="destructive" className="text-[10px]">
                        perdido
                      </Badge>
                    )}
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {a.nextBestAction}
                  </p>
                </div>
                <div className="shrink-0 text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                  <div>{new Date(a.createdAt).toLocaleDateString("pt-BR")}</div>
                  <div>{a.modelProvider}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function IntentBadge({ intent }: { intent: string }) {
  const low = intent?.toLowerCase() ?? "";
  const cls =
    low === "quente" || low === "pronto_para_visita"
      ? "bg-orange-500/15 text-orange-700 border-orange-500/30"
      : low === "qualificado"
        ? "bg-blue-500/15 text-blue-700 border-blue-500/30"
        : "bg-slate-500/15 text-slate-700 border-slate-500/30";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${cls}`}>
      {intent || "—"}
    </span>
  );
}

function AnalyzeForm({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState("");
  const [days, setDays] = useState<number>(30);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = phone.trim();
    if (!trimmed) return;
    setPending(true);
    try {
      const result = (await analyzeConversationByPhone(trimmed, { days })) as {
        jobId?: string;
      };
      if (result?.jobId) {
        toast.success(
          `Análise enfileirada (jobId ${result.jobId.slice(0, 12)}…). Recarregue em alguns segundos.`,
        );
      } else {
        toast.success("Análise gerada com sucesso.");
      }
      // Otimismo: dispara reload das análises depois de um delay leve.
      setTimeout(onDone, 2000);
      setPhone("");
    } catch (err) {
      const msg =
        err instanceof OmniconnectError
          ? `${err.status === 429 ? "Limite atingido. " : ""}${err.message}`
          : err instanceof Error
            ? err.message
            : "Falha desconhecida";
      toast.error(msg);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <PhoneCall className="h-4 w-4" /> Analisar conversa por telefone
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1">
            <label
              htmlFor="phone-input"
              className="text-xs font-medium text-muted-foreground"
            >
              Telefone (E.164)
            </label>
            <Input
              id="phone-input"
              type="tel"
              placeholder="+5511999990000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="w-full sm:w-[130px]">
            <label
              htmlFor="days-input"
              className="text-xs font-medium text-muted-foreground"
            >
              Janela
            </label>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger id="days-input" className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={pending || !phone.trim()}>
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enfileirando…
              </>
            ) : (
              "Analisar"
            )}
          </Button>
        </form>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Papéis autorizados: admin, supervisor, digital. Tetos de custo
          (pilot §4.1) são aplicados no backend e podem retornar 429.
        </p>
      </CardContent>
    </Card>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
      <div className="text-sm">
        <p className="font-medium">Não foi possível carregar dados do InsightAI</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}
