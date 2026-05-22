import { createFileRoute, Link } from "@tanstack/react-router";
import { ModuleGate } from "@/components/module-gate";
import { MockOnlyPage } from "@/components/mock-only-page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/kpi-card";
import { Progress } from "@/components/ui/progress";
import { JOURNEYS, JOURNEY_KPIS, WALLET_BUDGET_DEFAULT } from "@/lib/leads-data";
import { Plus, Wallet, Workflow, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const Route = createFileRoute("/_app/journeys/")({
  head: () => ({ meta: [{ title: "Régua de Acionamento — OmniconnectPRO" }] }),
  component: () => (
    <ModuleGate moduleId="journeys">
      <MockOnlyPage
        title="Régua de Acionamento"
        description="Construa jornadas automatizadas com blocos arrastáveis."
        roadmapNote={<>Módulo de domínio no <code>omniconnect-backend</code> ainda não existe — é trabalho multi-sprint (schema, CRUD, publish, wallet, execução).</>}
      >
        <JourneysPage />
      </MockOnlyPage>
    </ModuleGate>
  ),
});

const STATUS_COLOR: Record<string, string> = {
  Ativa: "bg-emerald-100 text-emerald-700",
  Pausada: "bg-amber-100 text-amber-700",
  Rascunho: "bg-slate-100 text-slate-600",
};

function JourneysPage() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Régua de Acionamento</h1>
          <p className="text-sm text-muted-foreground">
            Construa jornadas automatizadas que acionam o lead pelo melhor canal, no melhor momento.
          </p>
        </div>
        <Button asChild className="gap-1.5">
          <Link to="/journeys/builder" search={{ id: "new" }}>
            <Plus className="h-4 w-4" /> Nova jornada
          </Link>
        </Button>
      </header>

      <WalletBanner />



      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {JOURNEY_KPIS.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {JOURNEYS.map((j) => (
          <Card key={j.id} className="group transition hover:border-primary/40 hover:shadow-md">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Workflow className="h-4.5 w-4.5" />
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLOR[j.status])}>
                  {j.status}
                </span>
              </div>
              <div>
                <h3 className="font-semibold leading-tight">{j.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{j.trigger}</p>
              </div>
              <div className="grid grid-cols-4 gap-2 border-t pt-3 text-center">
                <Mini label="Audiência" value={j.audience.toLocaleString("pt-BR")} />
                <Mini label="Na jornada" value={j.inJourney.toLocaleString("pt-BR")} />
                <Mini label="Conversão" value={j.conversion} />
                <Mini label="Custo" value={j.totalCost} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-[10px] text-muted-foreground">
                <span>{j.sent.toLocaleString("pt-BR")} envios</span>
                <span>Médio {j.avgCost}/envio</span>
              </div>
              <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                <span>Atualizado {j.updatedAt}</span>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/journeys/builder" search={{ id: j.id }}>
                    Editar
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        <Link
          to="/journeys/builder"
          search={{ id: "new" }}
          className="grid place-items-center rounded-xl border-2 border-dashed bg-card/40 p-8 text-center transition hover:border-primary/60 hover:bg-accent/40"
        >
          <div>
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
              <Plus className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-medium">Criar jornada do zero</p>
            <p className="text-xs text-muted-foreground">Arraste blocos no canvas visual</p>
          </div>
        </Link>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
          <Badge variant="secondary">Sugestão</Badge>
          <span className="text-muted-foreground">
            Comece com o template <strong className="text-foreground">"Reengajamento Formulário 7d"</strong> — ideal para leads que preencheram o formulário mas não responderam.
          </span>
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <Link to="/journeys/builder" search={{ id: "j1" }}>Abrir template</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function WalletBanner() {
  const w = WALLET_BUDGET_DEFAULT;
  const pct = Math.min(100, (w.usedBudget / w.totalBudget) * 100);
  const remaining = w.totalBudget - w.usedBudget;
  const critical = pct >= 85;
  const warning = pct >= 70 && pct < 85;
  const tone = critical
    ? "border-destructive/40 bg-destructive/5"
    : warning
      ? "border-amber-300 bg-amber-50"
      : "border-primary/30 bg-primary/5";
  const barClass = critical
    ? "[&>div]:bg-destructive"
    : warning
      ? "[&>div]:bg-amber-500"
      : "";

  return (
    <Card className={cn("border", tone)}>
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <div
          className={cn(
            "grid h-10 w-10 place-items-center rounded-lg",
            critical ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary",
          )}
        >
          {critical ? <AlertTriangle className="h-5 w-5" /> : <Wallet className="h-5 w-5" />}
        </div>
        <div className="min-w-[200px] flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">
              Saldo da carteira{" "}
              <span className="font-normal text-muted-foreground">· ciclo {w.resetCycle}</span>
            </span>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {BRL(w.usedBudget)} / {BRL(w.totalBudget)} ({pct.toFixed(0)}%)
            </span>
          </div>
          <Progress value={pct} className={cn("mt-2 h-2", barClass)} />
          <p
            className={cn(
              "mt-1.5 text-xs",
              critical
                ? "text-destructive"
                : warning
                  ? "text-amber-700"
                  : "text-muted-foreground",
            )}
          >
            {critical
              ? `Saldo crítico — apenas ${BRL(remaining)} restantes. Jornadas podem ser bloqueadas no disparo.`
              : warning
                ? `Atenção: ${BRL(remaining)} restantes neste ciclo.`
                : `${BRL(remaining)} disponíveis para novos disparos.`}
          </p>
        </div>
        <div className="hidden items-center gap-4 border-l pl-4 text-xs sm:flex">
          {w.blockOnInsufficient && (
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">Guard:</span> bloqueio pré-disparo ativo
            </span>
          )}
          {w.realtimeDebit && (
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">Débito:</span> tempo real
            </span>
          )}
        </div>
        <Button asChild size="sm" variant={critical ? "destructive" : "outline"}>
          <Link to="/settings/budget">Gerenciar saldo</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
