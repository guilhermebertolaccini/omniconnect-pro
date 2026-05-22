import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Clock,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import {
  getMyAntiFatigueRule,
  listAntiFatigueDedupeLog,
  OmniconnectError,
  upsertMyAntiFatigueRule,
  type AntiFatigueAppliesTo,
  type AntiFatigueDedupeLog,
  type AntiFatigueRule,
} from "@/lib/omniconnectClient";

export const Route = createFileRoute("/_app/settings/anti-fatigue")({
  head: () => ({ meta: [{ title: "Anti-fadiga — Configurações" }] }),
  component: AntiFatiguePage,
});

function AntiFatiguePage() {
  const [rule, setRule] = useState<AntiFatigueRule | null>(null);
  const [logs, setLogs] = useState<AntiFatigueDedupeLog[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getMyAntiFatigueRule(),
      listAntiFatigueDedupeLog({ limit: 25 }).catch(() => ({
        items: [] as AntiFatigueDedupeLog[],
        meta: { total: 0, limit: 25, offset: 0 },
      })),
    ])
      .then(([r, l]) => {
        if (cancelled) return;
        setRule(r);
        setLogs(l.items);
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
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Anti-fadiga</h1>
          <p className="text-sm text-muted-foreground">
            Janela mínima entre envios para o mesmo contato. Aplica antes do
            send em qualquer canal (SMS / Email / RCS / HSM / WhatsApp).
            Pré-requisito de execução da Régua de Acionamento.
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
              <p className="font-medium">Falha ao carregar regra</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !rule ? (
        <Card>
          <CardContent className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
          </CardContent>
        </Card>
      ) : rule ? (
        <>
          <RuleForm
            rule={rule}
            onSaved={(saved) => {
              setRule(saved);
              setTick((t) => t + 1);
            }}
          />
          <DedupeLogList logs={logs ?? []} />
        </>
      ) : null}
    </div>
  );
}

function RuleForm({
  rule,
  onSaved,
}: {
  rule: AntiFatigueRule;
  onSaved: (next: AntiFatigueRule) => void;
}) {
  const [enabled, setEnabled] = useState(rule.enabled);
  const [windowHours, setWindowHours] = useState(String(rule.windowHours));
  const [appliesTo, setAppliesTo] = useState<AntiFatigueAppliesTo>(rule.appliesTo);
  const [allowBypassForUrgent, setAllowBypassForUrgent] = useState(rule.allowBypassForUrgent);
  const [businessHoursStart, setBusinessHoursStart] = useState(rule.businessHoursStart ?? "");
  const [businessHoursEnd, setBusinessHoursEnd] = useState(rule.businessHoursEnd ?? "");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setEnabled(rule.enabled);
    setWindowHours(String(rule.windowHours));
    setAppliesTo(rule.appliesTo);
    setAllowBypassForUrgent(rule.allowBypassForUrgent);
    setBusinessHoursStart(rule.businessHoursStart ?? "");
    setBusinessHoursEnd(rule.businessHoursEnd ?? "");
  }, [rule]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const hasStart = businessHoursStart.trim() !== "";
    const hasEnd = businessHoursEnd.trim() !== "";
    if (hasStart !== hasEnd) {
      toast.error("Preencha horário inicial e final juntos (ou deixe ambos vazios).");
      return;
    }
    setPending(true);
    try {
      const saved = await upsertMyAntiFatigueRule({
        enabled,
        windowHours: Math.max(1, Math.min(720, Number(windowHours) || 24)),
        appliesTo,
        allowBypassForUrgent,
        businessHoursStart: hasStart ? businessHoursStart : null,
        businessHoursEnd: hasEnd ? businessHoursEnd : null,
      });
      toast.success("Regra atualizada.");
      onSaved(saved);
    } catch (err) {
      toast.error(ruleErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-primary" /> Regra do tenant
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="flex items-center gap-3">
            <Switch id="af-enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="af-enabled" className="text-sm">
              Ativada
            </Label>
            {!enabled && (
              <Badge variant="secondary" className="ml-2">
                Sends NUNCA bloqueados enquanto desligada
              </Badge>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="af-window">Janela (horas)</Label>
              <Input
                id="af-window"
                type="number"
                min={1}
                max={720}
                value={windowHours}
                onChange={(e) => setWindowHours(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">1–720 horas (30 dias)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="af-applies">Aplica-se a</Label>
              <Select
                value={appliesTo}
                onValueChange={(v) => setAppliesTo(v as AntiFatigueAppliesTo)}
              >
                <SelectTrigger id="af-applies">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Apenas telefone</SelectItem>
                  <SelectItem value="document">Apenas documento (CPF/CNPJ)</SelectItem>
                  <SelectItem value="both">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3 pb-1">
              <Switch
                id="af-bypass"
                checked={allowBypassForUrgent}
                onCheckedChange={setAllowBypassForUrgent}
              />
              <Label htmlFor="af-bypass" className="text-sm font-normal">
                Permitir bypass para urgentes
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" /> Horário comercial (UTC)
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="time"
                value={businessHoursStart}
                onChange={(e) => setBusinessHoursStart(e.target.value)}
                className="w-[140px]"
                placeholder="Início"
              />
              <span className="text-muted-foreground">até</span>
              <Input
                type="time"
                value={businessHoursEnd}
                onChange={(e) => setBusinessHoursEnd(e.target.value)}
                className="w-[140px]"
                placeholder="Fim"
              />
              {(businessHoursStart || businessHoursEnd) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBusinessHoursStart("");
                    setBusinessHoursEnd("");
                  }}
                >
                  Limpar
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Vazio = sem restrição (24h). Janela cruzando meia-noite é
              suportada (ex.: 22:00 → 06:00).
            </p>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…
              </>
            ) : (
              "Salvar regra"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DedupeLogList({ logs }: { logs: AntiFatigueDedupeLog[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Bloqueios recentes</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {logs.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhum bloqueio registrado ainda. Quando a Régua executar e a
            regra bloquear, os eventos aparecerão aqui.
          </p>
        ) : (
          <ul className="divide-y">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <p className="font-medium">
                    {l.contactKey} · <Badge variant="secondary">{l.channel}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {l.refType ?? "—"}
                    {l.refId && <> · {l.refId.slice(0, 24)}</>}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(l.blockedAt).toLocaleString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ruleErrorMessage(err: unknown): string {
  if (err instanceof OmniconnectError) {
    if (err.status === 403) return "Você não tem permissão para essa ação.";
    if (err.status === 400) return `Dados inválidos: ${err.message}`;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Falha desconhecida";
}
