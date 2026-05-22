import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Activity,
  AlertTriangle,
  Loader2,
  Phone,
  RefreshCw,
} from "lucide-react";
import {
  getLineHealthPolicy,
  listLineHealthLines,
  OmniconnectError,
  upsertLineHealthPolicy,
  type LineHealthAction,
  type LineHealthEntry,
  type LineHealthPolicy,
} from "@/lib/omniconnectClient";

export const Route = createFileRoute("/_app/settings/line-health")({
  head: () => ({ meta: [{ title: "Saúde da linha — Configurações" }] }),
  component: LineHealthSettingsPage,
});

function LineHealthSettingsPage() {
  const [policy, setPolicy] = useState<LineHealthPolicy | null>(null);
  const [lines, setLines] = useState<LineHealthEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getLineHealthPolicy(),
      listLineHealthLines().catch(() => [] as LineHealthEntry[]),
    ])
      .then(([p, l]) => {
        if (cancelled) return;
        setPolicy(p);
        setLines(l);
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
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Activity className="h-5 w-5 text-primary" /> Saúde da linha
          </h1>
          <p className="text-sm text-muted-foreground">
            Score por número WhatsApp (via <code>line-reputation</code>) + ações
            automáticas configuráveis. Default <i>HITL</i>: só alerta.
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
              <p className="font-medium">Falha ao carregar</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !policy ? (
        <Card>
          <CardContent className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
          </CardContent>
        </Card>
      ) : policy ? (
        <>
          <PolicyForm policy={policy} onSaved={(p) => setPolicy(p)} />
          <LinesCard lines={lines ?? []} />
        </>
      ) : null}
    </div>
  );
}

function PolicyForm({
  policy,
  onSaved,
}: {
  policy: LineHealthPolicy;
  onSaved: (next: LineHealthPolicy) => void;
}) {
  const [alertHoursMedium, setAlertHoursMedium] = useState(String(policy.alertHoursMedium));
  const [alertHoursLow, setAlertHoursLow] = useState(String(policy.alertHoursLow));
  const [autoActionOnCritical, setAutoActionOnCritical] = useState<LineHealthAction>(
    policy.autoActionOnCritical,
  );
  const [autoActionOnHigh, setAutoActionOnHigh] = useState<LineHealthAction>(
    policy.autoActionOnHigh,
  );
  const [suggestRotation, setSuggestRotation] = useState(policy.suggestRotation);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setAlertHoursMedium(String(policy.alertHoursMedium));
    setAlertHoursLow(String(policy.alertHoursLow));
    setAutoActionOnCritical(policy.autoActionOnCritical);
    setAutoActionOnHigh(policy.autoActionOnHigh);
    setSuggestRotation(policy.suggestRotation);
  }, [policy]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const saved = await upsertLineHealthPolicy({
        alertHoursMedium: Math.max(1, Math.min(168, Number(alertHoursMedium) || 6)),
        alertHoursLow: Math.max(1, Math.min(168, Number(alertHoursLow) || 2)),
        autoActionOnCritical,
        autoActionOnHigh,
        suggestRotation,
      });
      toast.success("Política atualizada.");
      onSaved(saved);
    } catch (err) {
      toast.error(policyErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Política do tenant</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lh-medium">Alerta MEDIUM (horas em status)</Label>
              <Input
                id="lh-medium"
                type="number"
                min={1}
                max={168}
                value={alertHoursMedium}
                onChange={(e) => setAlertHoursMedium(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lh-low">Alerta LOW (horas em status)</Label>
              <Input
                id="lh-low"
                type="number"
                min={1}
                max={168}
                value={alertHoursLow}
                onChange={(e) => setAlertHoursLow(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lh-critical">Ação em CRITICAL (linha banida)</Label>
              <Select
                value={autoActionOnCritical}
                onValueChange={(v) => setAutoActionOnCritical(v as LineHealthAction)}
              >
                <SelectTrigger id="lh-critical">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Só alerta (HITL)</SelectItem>
                  <SelectItem value="throttle">Throttle automático</SelectItem>
                  <SelectItem value="block">Block automático</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lh-high">Ação em HIGH (degradação)</Label>
              <Select
                value={autoActionOnHigh}
                onValueChange={(v) => setAutoActionOnHigh(v as LineHealthAction)}
              >
                <SelectTrigger id="lh-high">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Só alerta</SelectItem>
                  <SelectItem value="throttle">Throttle automático</SelectItem>
                  <SelectItem value="block">Block automático</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="lh-rotate"
              checked={suggestRotation}
              onCheckedChange={setSuggestRotation}
            />
            <Label htmlFor="lh-rotate" className="text-sm font-normal">
              Sugerir rotação automática de linha quando saúde cair
            </Label>
          </div>

          <p className="text-[11px] text-muted-foreground">
            <b>HITL (Human-in-the-loop):</b> default <i>none</i> em todos os
            níveis — alerta o operador mas não age automaticamente. Aderente
            ao <code>docs/05-ai-governance.md</code>. Mude para{" "}
            <code>throttle</code>/<code>block</code> apenas após validar a
            Régua em produção.
          </p>

          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…
              </>
            ) : (
              "Salvar política"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function LinesCard({ lines }: { lines: LineHealthEntry[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Linhas do tenant ({lines.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {lines.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Sem linhas cadastradas. Cadastre linhas WhatsApp Cloud nos módulos
            de operações — elas aparecerão aqui com score calculado.
          </p>
        ) : (
          <ul className="divide-y">
            {lines.map((line) => (
              <li key={line.lineId} className="flex items-center gap-3 p-3">
                <div className="grid h-9 w-9 place-items-center rounded-md bg-muted text-muted-foreground">
                  <Phone className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{line.phone}</span>
                    <Badge variant={line.status === "ban" ? "destructive" : "secondary"}>
                      {line.status}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        line.healthScore >= 70
                          ? "border-emerald-300 text-emerald-700"
                          : line.healthScore >= 40
                            ? "border-amber-300 text-amber-700"
                            : "border-rose-300 text-rose-700"
                      }
                    >
                      score {line.healthScore}/100
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    msgs/dia: {line.messagesPerDay.toFixed(1)} · response:{" "}
                    {(line.responseRate * 100).toFixed(1)}% · block:{" "}
                    {(line.blockRate * 100).toFixed(1)}%
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function policyErrorMessage(err: unknown): string {
  if (err instanceof OmniconnectError) {
    if (err.status === 403) return "Você não tem permissão para essa ação.";
    if (err.status === 400) return `Dados inválidos: ${err.message}`;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Falha desconhecida";
}
