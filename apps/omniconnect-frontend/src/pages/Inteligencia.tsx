import { useCallback, useEffect, useState } from "react";
import {
  Brain,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import {
  insightAiService,
  type InsightAiAnalysesResponse,
  type InsightAiUsageResponse,
  type InsightExecutiveSummary,
} from "@/services/api";

const DEFAULT_DAYS = 30;

export default function Inteligencia() {
  const [days, setDays] = useState(String(DEFAULT_DAYS));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [segment, setSegment] = useState("");
  const [summary, setSummary] = useState<InsightExecutiveSummary | null>(null);
  const [usage, setUsage] = useState<InsightAiUsageResponse | null>(null);
  const [analyses, setAnalyses] = useState<InsightAiAnalysesResponse | null>(null);
  const [analysisOffset, setAnalysisOffset] = useState(0);
  const analysisLimit = 20;
  const [loading, setLoading] = useState(false);

  const useExplicitRange = Boolean(from && to);

  useEffect(() => {
    setAnalysisOffset(0);
  }, [days, from, to, segment]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const segmentNum =
        segment.trim() === "" ? undefined : Number.parseInt(segment, 10);
      if (segment.trim() !== "" && Number.isNaN(segmentNum)) {
        toast({ title: "Segmento inválido", description: "Use um número ou deixe vazio.", variant: "destructive" });
        setLoading(false);
        return;
      }

      const summaryParams = useExplicitRange
        ? {
            from: new Date(from).toISOString(),
            to: new Date(to).toISOString(),
            segment: segmentNum,
          }
        : { days: Number.parseInt(days, 10) || DEFAULT_DAYS, segment: segmentNum };

      const listParams = useExplicitRange
        ? {
            from: new Date(from).toISOString(),
            to: new Date(to).toISOString(),
            segment: segmentNum,
            limit: analysisLimit,
            offset: analysisOffset,
          }
        : { segment: segmentNum, limit: analysisLimit, offset: analysisOffset };

      const usageParams = useExplicitRange
        ? {
            from: new Date(from).toISOString(),
            to: new Date(to).toISOString(),
            status: "all" as const,
            limit: 50,
            offset: 0,
          }
        : {
            days: Number.parseInt(days, 10) || DEFAULT_DAYS,
            status: "all" as const,
            limit: 50,
            offset: 0,
          };

      const [s, u, a] = await Promise.all([
        insightAiService.getSummary(summaryParams),
        insightAiService.getUsage(usageParams),
        insightAiService.listAnalyses(listParams),
      ]);
      setSummary(s);
      setUsage(u);
      setAnalyses(a);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao carregar InsightAI";
      toast({ title: "Falha ao carregar", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [analysisOffset, days, from, segment, to, useExplicitRange]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <MainLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Brain className="h-9 w-9 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Inteligência (InsightAI)</h1>
              <p className="text-sm text-muted-foreground">
                Resumo agregado, uso por provedor e análises recentes — escopo do seu tenant.
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Atualizar</span>
          </Button>
        </div>

        <GlassCard className="p-4 md:p-6">
          <h2 className="mb-4 text-lg font-semibold">Filtros</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="days">Dias (janela móvel)</Label>
              <Input
                id="days"
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(ev) => setDays(ev.target.value)}
                disabled={useExplicitRange}
              />
              <p className="text-xs text-muted-foreground">Ignorado se from/to preenchidos.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="from">De (ISO / datetime-local)</Label>
              <Input id="from" type="datetime-local" value={from} onChange={(ev) => setFrom(ev.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">Até</Label>
              <Input id="to" type="datetime-local" value={to} onChange={(ev) => setTo(ev.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="segment">Segmento (opcional)</Label>
              <Input
                id="segment"
                inputMode="numeric"
                placeholder="ex: 1"
                value={segment}
                onChange={(ev) => setSegment(ev.target.value)}
              />
            </div>
          </div>
        </GlassCard>

        {summary && (
          <GlassCard className="p-4 md:p-6">
            <h2 className="mb-2 text-lg font-semibold">Resumo executivo</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Período: {new Date(summary.period.from).toLocaleString()} —{" "}
              {new Date(summary.period.to).toLocaleString()} · Amostra até {summary.sampleCap} análises
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Análises na amostra" value={summary.analyzedConversations} />
              <Metric label="Média qualidade vendedor" value={summary.averageSellerQualityScore} />
              <Metric label="Média qualidade resposta" value={summary.averageResponseQualityScore} />
              <Metric label="Oportunidades perdidas" value={summary.lostOpportunities} />
            </div>
          </GlassCard>
        )}

        {usage && (
          <GlassCard className="p-4 md:p-6">
            <h2 className="mb-4 text-lg font-semibold">Uso e custo (AIUsageLog)</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Filtro de status: {usage.statusFilter} · Total estimado USD:{" "}
              {usage.totals.estimatedCost.toFixed(4)} · Chamadas: {usage.totals.calls}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provedor</TableHead>
                  <TableHead className="text-right">Chamadas</TableHead>
                  <TableHead className="text-right">Prompt tok.</TableHead>
                  <TableHead className="text-right">Completion tok.</TableHead>
                  <TableHead className="text-right">Custo est.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.byProvider.map((p) => (
                  <TableRow key={p.modelProvider}>
                    <TableCell className="font-medium">{p.modelProvider}</TableCell>
                    <TableCell className="text-right">{p.calls}</TableCell>
                    <TableCell className="text-right">{p.promptTokens}</TableCell>
                    <TableCell className="text-right">{p.completionTokens}</TableCell>
                    <TableCell className="text-right">{p.estimatedCost.toFixed(6)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </GlassCard>
        )}

        {analyses && (
          <GlassCard className="p-4 md:p-6">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">Análises recentes</h2>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={analysisOffset === 0 || loading}
                  onClick={() => setAnalysisOffset((o) => Math.max(0, o - analysisLimit))}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    loading ||
                    analysisOffset + analyses.items.length >= analyses.meta.total
                  }
                  onClick={() => setAnalysisOffset((o) => o + analysisLimit)}
                >
                  Próxima
                </Button>
              </div>
            </div>
            <p className="mb-2 text-sm text-muted-foreground">
              Total: {analyses.meta.total} · Página {Math.floor(analysisOffset / analysisLimit) + 1}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Segmento</TableHead>
                  <TableHead>Intent</TableHead>
                  <TableHead>Criado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analyses.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.id}</TableCell>
                    <TableCell>{row.contactPhone}</TableCell>
                    <TableCell>{row.segment ?? "—"}</TableCell>
                    <TableCell>{row.leadIntent}</TableCell>
                    <TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </GlassCard>
        )}
      </div>
    </MainLayout>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
