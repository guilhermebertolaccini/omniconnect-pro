import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Clock,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import {
  listGuardEvents,
  type GuardEvent,
} from "@/lib/omniconnectClient";

export const Route = createFileRoute("/_app/settings/audit")({
  head: () => ({ meta: [{ title: "Auditoria de Guards — Configurações" }] }),
  component: AuditPage,
});

const GUARD_ICON: Record<string, typeof ShieldAlert> = {
  antifatigue_blocked: ShieldAlert,
  wallet_insufficient: Wallet,
  message_broker_status_changed: AlertTriangle,
  line_banned: AlertTriangle,
};

const GUARD_LABEL: Record<string, string> = {
  antifatigue_blocked: "Anti-fadiga bloqueou",
  wallet_insufficient: "Saldo insuficiente",
  message_broker_status_changed: "Status de broker mudou",
  line_banned: "Linha banida",
};

const SEVERITY_BADGE: Record<string, string> = {
  info: "bg-sky-100 text-sky-700",
  warning: "bg-amber-100 text-amber-700",
  error: "bg-rose-100 text-rose-700",
  success: "bg-emerald-100 text-emerald-700",
};

function AuditPage() {
  const [events, setEvents] = useState<GuardEvent[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listGuardEvents({ limit: 100 })
      .then((r) => {
        if (cancelled) return;
        setEvents(r.events);
        setTotal(r.total);
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
  }, [tick]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldAlert className="h-5 w-5 text-primary" /> Auditoria de Guards
          </h1>
          <p className="text-sm text-muted-foreground">
            Eventos de bloqueio dos guards (anti-fadiga, wallet, broker, linha
            banida) emitidos pelos services. Lê <code>system-events</code>
            filtrando os tipos de guard. Tenant atual.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setTick((t) => t + 1)}
          disabled={loading}
        >
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      {error && (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="text-sm">
              <p className="font-medium">Falha ao carregar eventos</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !events ? (
        <Card>
          <CardContent className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
          </CardContent>
        </Card>
      ) : events && events.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhum evento de guard registrado ainda. Quando os helpers da Régua
            executarem (anti-fadiga, wallet, broker) e algum bloqueio ocorrer,
            aparece aqui.
          </CardContent>
        </Card>
      ) : events ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {events.length} eventos {total > events.length && <>de {total}</>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {events.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function EventRow({ event }: { event: GuardEvent }) {
  const Icon = GUARD_ICON[event.type] ?? ShieldAlert;
  const label = GUARD_LABEL[event.type] ?? event.type;
  return (
    <li className="flex items-start gap-3 p-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          <Badge variant="outline" className="text-[10px]">
            {event.module}
          </Badge>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${SEVERITY_BADGE[event.severity] ?? ""}`}
          >
            {event.severity}
          </span>
        </div>
        {event.data && (
          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
            {JSON.stringify(event.data, null, 0).slice(0, 280)}
          </pre>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Clock className="h-3 w-3" />
        {new Date(event.createdAt).toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        })}
      </span>
    </li>
  );
}
