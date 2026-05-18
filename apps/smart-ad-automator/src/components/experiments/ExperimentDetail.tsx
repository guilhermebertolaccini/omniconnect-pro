import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  EXPERIMENT_STATUS_LABELS,
  WINNING_METRIC_LABELS,
  type ExperimentVariant,
  type WinningMetric,
} from '@/types/experiment';
import { useExperiment, useUpdateExperimentStatus } from '@/hooks/useExperiments';
import { pickWinner } from '@/services/experimentsService';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  Trophy,
  RefreshCw,
  Sparkles,
  Lightbulb,
  Play,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

const ALL_METRICS: WinningMetric[] = [
  'engagement_rate',
  'reach',
  'impressions',
  'likes',
  'comments',
  'shares',
  'saves',
  'total_interactions',
  'profile_visits',
  'website_clicks',
];

function fmt(n: number, isRate: boolean) {
  if (isRate) return `${n.toFixed(2)}%`;
  return n.toLocaleString('pt-BR');
}

interface Props {
  experimentId: string | null;
  onClose: () => void;
}

export function ExperimentDetail({ experimentId, onClose }: Props) {
  const { data: exp, isLoading, refetch } = useExperiment(experimentId);
  const updateStatus = useUpdateExperimentStatus();
  const qc = useQueryClient();
  const [evaluating, setEvaluating] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);

  const winnerInfo = useMemo(() => {
    if (!exp) return null;
    return pickWinner(exp.variants, exp.winning_metric, exp.min_sample_reach);
  }, [exp]);

  const winnerId = exp?.winner_variant_id ?? winnerInfo?.winnerId ?? null;
  const winnerLabel = exp?.variants.find((v) => v.id === winnerId)?.label;

  const handleEvaluate = async () => {
    if (!exp) return;
    setEvaluating(true);
    try {
      const { error } = await supabase.functions.invoke('experiment-evaluator', {
        body: { experimentId: exp.id },
      });
      if (error) throw error;
      await refetch();
      qc.invalidateQueries({ queryKey: ['experiments'] });
      toast({ title: 'Avaliação atualizada' });
    } catch (e) {
      toast({
        title: 'Erro ao avaliar',
        description: e instanceof Error ? e.message : 'unknown',
        variant: 'destructive',
      });
    } finally {
      setEvaluating(false);
    }
  };

  const handleAi = async () => {
    if (!exp) return;
    setGeneratingAi(true);
    try {
      const { error } = await supabase.functions.invoke('experiment-ai-insights', {
        body: { experimentId: exp.id },
      });
      if (error) throw error;
      await refetch();
      toast({ title: 'Insights de IA gerados' });
    } catch (e) {
      toast({
        title: 'Erro ao gerar insights',
        description: e instanceof Error ? e.message : 'unknown',
        variant: 'destructive',
      });
    } finally {
      setGeneratingAi(false);
    }
  };

  const open = !!experimentId;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{exp?.name ?? 'Carregando…'}</span>
            {exp && (
              <Badge variant="outline">{EXPERIMENT_STATUS_LABELS[exp.status]}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !exp ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <ScrollArea className="flex-1 pr-3">
            <div className="space-y-5">
              {/* Header info */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Métrica: {WINNING_METRIC_LABELS[exp.winning_metric]}</Badge>
                <Badge variant="secondary">Alcance mín.: {exp.min_sample_reach.toLocaleString('pt-BR')}</Badge>
                <Badge variant="secondary">Duração: {exp.duration_days}d</Badge>
                {exp.ends_at && <Badge variant="outline">Termina: {new Date(exp.ends_at).toLocaleDateString('pt-BR')}</Badge>}
              </div>

              {exp.hypothesis && (
                <Card>
                  <CardContent className="p-3 text-sm">
                    <div className="text-xs uppercase text-muted-foreground">Hipótese</div>
                    <p className="text-foreground mt-1">{exp.hypothesis}</p>
                  </CardContent>
                </Card>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {exp.status === 'draft' && (
                  <Button
                    size="sm"
                    onClick={() => updateStatus.mutate({ id: exp.id, status: 'running' })}
                  >
                    <Play className="h-4 w-4 mr-1" /> Iniciar
                  </Button>
                )}
                {exp.status === 'running' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus.mutate({ id: exp.id, status: 'completed' })}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Concluir
                  </Button>
                )}
                {exp.status !== 'cancelled' && exp.status !== 'completed' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => updateStatus.mutate({ id: exp.id, status: 'cancelled' })}
                  >
                    <XCircle className="h-4 w-4 mr-1" /> Cancelar
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={handleEvaluate} disabled={evaluating}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${evaluating ? 'animate-spin' : ''}`} /> Recalcular
                </Button>
                <Button size="sm" variant="outline" onClick={handleAi} disabled={generatingAi}>
                  <Sparkles className="h-4 w-4 mr-1" /> {generatingAi ? 'Gerando…' : 'Gerar insights IA'}
                </Button>
              </div>

              {/* Variant cards */}
              <div className="grid gap-3 sm:grid-cols-2">
                {exp.variants.map((v) => (
                  <VariantCard
                    key={v.id}
                    variant={v}
                    isWinner={v.id === winnerId}
                    metric={exp.winning_metric}
                  />
                ))}
              </div>

              {/* Winner banner */}
              {winnerLabel && (
                <Card className="border-emerald-500/40 bg-emerald-500/5">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Trophy className="h-6 w-6 text-emerald-500" />
                    <div>
                      <div className="text-sm font-semibold text-foreground">Vencedor: {winnerLabel}</div>
                      <p className="text-xs text-muted-foreground">
                        Diferença ≥ 10% sobre a 2ª colocada e alcance mínimo atingido.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Diverging chart for all metrics */}
              <DeltaChart variants={exp.variants} />

              {/* AI Insights */}
              {exp.ai_summary && (
                <div className="grid gap-3 md:grid-cols-2">
                  <InsightBox
                    icon={<Sparkles className="h-4 w-4 text-amber-500" />}
                    title="Por que venceu"
                    items={exp.ai_summary.whyWon}
                    tone="amber"
                  />
                  <InsightBox
                    icon={<Lightbulb className="h-4 w-4 text-violet-500" />}
                    title="Próximas hipóteses"
                    items={exp.ai_summary.nextHypotheses}
                    tone="violet"
                  />
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VariantCard({
  variant,
  isWinner,
  metric,
}: {
  variant: ExperimentVariant;
  isWinner: boolean;
  metric: WinningMetric;
}) {
  const snap = variant.metrics_snapshot ?? {};
  const isRate = metric === 'engagement_rate';
  const focus = (snap[metric] as number | undefined) ?? 0;

  return (
    <Card className={isWinner ? 'border-emerald-500/40' : ''}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">{variant.label}</span>
          {isWinner && (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40">
              <Trophy className="h-3 w-3 mr-1" /> Vencedor
            </Badge>
          )}
        </div>
        {variant.note && <p className="text-xs text-muted-foreground">{variant.note}</p>}
        {variant.caption && (
          <p className="text-xs text-foreground line-clamp-2 italic">"{variant.caption}"</p>
        )}
        <div className="rounded-md bg-muted/40 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">{WINNING_METRIC_LABELS[metric]}</div>
          <div className="text-lg font-bold text-foreground">{fmt(focus, isRate)}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Stat label="Alcance" value={snap.reach ?? 0} />
          <Stat label="Curtidas" value={snap.likes ?? 0} />
          <Stat label="Coment." value={snap.comments ?? 0} />
          <Stat label="Compart." value={snap.shares ?? 0} />
          <Stat label="Salvam." value={snap.saves ?? 0} />
          <Stat label="Impres." value={snap.impressions ?? 0} />
        </div>
        {!variant.post_id && (
          <p className="text-[11px] text-amber-500">Sem post associado — métricas vazias.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{value.toLocaleString('pt-BR')}</div>
    </div>
  );
}

function DeltaChart({ variants }: { variants: ExperimentVariant[] }) {
  if (variants.length < 2) return null;
  const baseline = variants[0];
  const others = variants.slice(1);

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="text-sm font-semibold text-foreground">
          Variação % vs. {baseline.label}
        </div>
        <div className="space-y-3">
          {others.map((v) => (
            <div key={v.id} className="space-y-1">
              <div className="text-xs font-medium text-foreground">{v.label}</div>
              <div className="space-y-1">
                {ALL_METRICS.map((m) => {
                  const a = (baseline.metrics_snapshot?.[m] as number | undefined) ?? 0;
                  const b = (v.metrics_snapshot?.[m] as number | undefined) ?? 0;
                  if (a === 0 && b === 0) return null;
                  const delta = a === 0 ? (b > 0 ? 100 : 0) : ((b - a) / a) * 100;
                  const tone = delta >= 0 ? 'bg-emerald-500/70' : 'bg-rose-500/70';
                  const width = Math.min(Math.abs(delta), 100) / 2;
                  const isRate = m === 'engagement_rate';
                  return (
                    <Tooltip key={m}>
                      <TooltipTrigger asChild>
                        <div className="grid grid-cols-[120px_1fr_70px] items-center gap-2 cursor-help">
                          <div className="text-[11px] text-muted-foreground truncate">
                            {WINNING_METRIC_LABELS[m]}
                          </div>
                          <div className="relative h-3 rounded bg-muted/30">
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
                            <div
                              className={`absolute top-0 bottom-0 ${tone} rounded`}
                              style={{
                                left: delta >= 0 ? '50%' : `${50 - width}%`,
                                width: `${width}%`,
                              }}
                            />
                          </div>
                          <div className={`text-[11px] text-right font-mono ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="shadow-2xl border-border">
                        <div className="text-xs space-y-1">
                          <div className="font-semibold">{WINNING_METRIC_LABELS[m]}</div>
                          <div className="text-popover-foreground/70">{baseline.label}: <span className="font-mono text-popover-foreground">{fmt(a, isRate)}</span></div>
                          <div className="text-popover-foreground/70">{v.label}: <span className="font-mono text-popover-foreground">{fmt(b, isRate)}</span></div>
                          <div className={delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            Δ {delta >= 0 ? '+' : ''}{delta.toFixed(2)}%
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function InsightBox({
  icon,
  title,
  items,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  tone: 'amber' | 'violet';
}) {
  const border = tone === 'amber' ? 'border-amber-500/30 bg-amber-500/5' : 'border-violet-500/30 bg-violet-500/5';
  return (
    <Card className={border}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
          {icon} {title}
        </div>
        <ul className="space-y-1 text-xs text-foreground list-disc list-inside">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
