import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, RotateCcw, MousePointer, Users, Eye, TrendingUp } from 'lucide-react';
import {
  DEFAULT_WEIGHTS,
  normalizeWeights,
  resetIntentWeights,
  setIntentWeights,
  useIntentWeights,
} from '@/hooks/useScoringWeights';
import { useAdCreatives } from '@/hooks/useAdCreatives';
import { useCompany } from '@/contexts/CompanyContext';
import { intentScores } from '@/services/mediaScoring';
import { PLATFORM_LABELS, type AdPlatform } from '@/services/platformConfigService';

function WeightSlider({
  label,
  icon: Icon,
  value,
  percent,
  onChange,
}: {
  label: string;
  icon: typeof MousePointer;
  value: number;
  percent: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span>{label}</span>
        </div>
        <Badge variant="secondary" className="font-mono text-xs">
          {(percent * 100).toFixed(0)}%
        </Badge>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={100}
        step={1}
        onValueChange={(v) => onChange(v[0] ?? 0)}
      />
    </div>
  );
}

export function IntentScoringPanel() {
  const weights = useIntentWeights();
  const normalized = normalizeWeights(weights);
  const { selectedCompanyId } = useCompany();
  const { creatives, isLoading } = useAdCreatives(selectedCompanyId);

  // Recompute the preview ranking against the normalized weights live.
  const preview = useMemo(() => {
    const items = creatives.map((c) => ({
      ctr: c.ctr,
      conversionRate: c.conversionRate,
      thruPlayRate: c.thruPlayRate,
    }));
    const scores = intentScores(items, normalized);
    return creatives
      .map((c, i) => ({ ...c, intent: scores[i] ?? 0 }))
      .sort((a, b) => b.intent - a.intent)
      .slice(0, 5);
  }, [creatives, normalized]);

  const update = (key: keyof typeof weights, raw: number) => {
    setIntentWeights({ ...weights, [key]: Math.max(0, raw) });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Pesos do score de intenção</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={resetIntentWeights}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Restaurar padrão
          </Button>
        </div>
        <CardDescription>
          Ajuste o peso relativo de cada métrica. Os valores são normalizados para somar 100% e o
          ranking é recalculado em tempo real. Padrão: CTR{' '}
          {(DEFAULT_WEIGHTS.ctr * 100).toFixed(0)}% · Conv.{' '}
          {(DEFAULT_WEIGHTS.conversionRate * 100).toFixed(0)}% · ThruPlay{' '}
          {(DEFAULT_WEIGHTS.thruPlayRate * 100).toFixed(0)}%.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-5">
          <WeightSlider
            label="CTR"
            icon={MousePointer}
            value={weights.ctr * 100}
            percent={normalized.ctr}
            onChange={(v) => update('ctr', v / 100)}
          />
          <WeightSlider
            label="Taxa de conversão"
            icon={Users}
            value={weights.conversionRate * 100}
            percent={normalized.conversionRate}
            onChange={(v) => update('conversionRate', v / 100)}
          />
          <WeightSlider
            label="ThruPlay (vídeos)"
            icon={Eye}
            value={weights.thruPlayRate * 100}
            percent={normalized.thruPlayRate}
            onChange={(v) => update('thruPlayRate', v / 100)}
          />
        </div>

        <Separator />

        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Pré-visualização do ranking</h3>
            <span className="text-xs text-muted-foreground">· top 5 criativos</span>
          </div>

          {isLoading && preview.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : preview.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem dados de criativos no período. Conecte uma plataforma para visualizar o ranking.
            </p>
          ) : (
            <ol className="space-y-2">
              {preview.map((c, i) => (
                <li
                  key={`${c.platform}-${c.adId}`}
                  className="flex items-center gap-3 rounded-md border border-border/50 bg-background/40 px-3 py-2"
                >
                  <span className="text-sm font-mono text-muted-foreground w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      CTR {c.ctr.toFixed(2)}% · Conv {c.conversionRate.toFixed(2)}% · ThruPlay{' '}
                      {c.thruPlayRate.toFixed(1)}%
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {PLATFORM_LABELS[c.platform as AdPlatform]}
                  </Badge>
                  <Badge className="font-mono">{(c.intent * 100).toFixed(0)}</Badge>
                </li>
              ))}
            </ol>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
