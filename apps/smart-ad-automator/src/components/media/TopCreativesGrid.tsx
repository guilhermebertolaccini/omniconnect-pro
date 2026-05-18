import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { intentScores } from '@/services/mediaScoring';
import { useIntentWeights } from '@/hooks/useScoringWeights';
import { PLATFORM_LABELS, type AdPlatform } from '@/services/platformConfigService';
import { useAdCreatives, type RankedCreative } from '@/hooks/useAdCreatives';
import { useCompany } from '@/contexts/CompanyContext';
import { exportCreativesCsv, exportCreativesPdf } from '@/services/creativesExport';
import { CompareCreativesModal } from '@/components/media/CompareCreativesModal';
import { Checkbox } from '@/components/ui/checkbox';
import { useCreativeInsights } from '@/hooks/useCreativeInsights';
import { useCreativeComparisonInsights } from '@/hooks/useCreativeComparisonInsights';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { NormalizedCampaign } from '@/hooks/useMediaIndicators';
import { Sparkles, TrendingUp, Image as ImageIcon, Video, Layers, MousePointer, DollarSign, Users, Eye, Download, FileText, FileSpreadsheet, GitCompare, X, Lightbulb, FlaskConical, AlertCircle, Loader2, Filter, ArrowUpDown, CalendarRange } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useCreativeRange, type CreativeRangeDays } from '@/hooks/useCreativeRange';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

type SortKey = 'intent' | 'ctr' | 'conv' | 'spend' | 'leads';
const SORT_LABELS: Record<SortKey, string> = {
  intent: 'Score de intenção',
  ctr: 'CTR',
  conv: 'Taxa de conversão',
  spend: 'Investimento',
  leads: 'Leads',
};
const SORT_ACCESSORS: Record<SortKey, (c: RankedCreative) => number> = {
  intent: (c) => c.intent,
  ctr: (c) => c.ctr,
  conv: (c) => c.conversionRate,
  spend: (c) => c.spend,
  leads: (c) => c.leads,
};

const FORMAT_ICON: Record<RankedCreative['format'], typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  carousel: Layers,
  unknown: ImageIcon,
};

function MetricRow({ label, value, icon: Icon }: { label: string; value: string; icon: typeof ImageIcon }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function InsightSection({
  title,
  icon: Icon,
  items,
  tone,
}: {
  title: string;
  icon: typeof Lightbulb;
  items: string[];
  tone: 'amber' | 'violet';
}) {
  const toneClasses =
    tone === 'amber'
      ? 'border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400'
      : 'border-violet-500/30 bg-violet-500/5 text-violet-600 dark:text-violet-400';
  return (
    <div className={`rounded-md border ${toneClasses.split(' ').slice(0, 2).join(' ')} p-3`}>
      <div className={`flex items-center gap-1.5 text-xs font-semibold mb-2 ${toneClasses.split(' ').slice(2).join(' ')}`}>
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <ul className="space-y-1.5 text-xs text-foreground/90">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-muted-foreground">·</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreativeAiInsights({ creative, open }: { creative: RankedCreative; open: boolean }) {
  const { data, isLoading, error, refetch, isFetching } = useCreativeInsights(creative, open);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Recomendações de IA
        </h3>
        {!isLoading && (
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-[11px] text-muted-foreground hover:text-foreground transition disabled:opacity-50"
          >
            {isFetching ? 'Atualizando…' : 'Recalcular'}
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analisando criativo com IA…
        </div>
      ) : error ? (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-3.5 w-3.5" />
          <AlertDescription className="text-xs">
            {(error as Error).message || 'Não foi possível gerar as recomendações.'}
          </AlertDescription>
        </Alert>
      ) : data && (data.whyPerforms.length > 0 || data.whatToTest.length > 0) ? (
        <div className="space-y-2">
          {data.whyPerforms.length > 0 && (
            <InsightSection
              title="Por que esse criativo performa"
              icon={Lightbulb}
              items={data.whyPerforms}
              tone="amber"
            />
          )}
          {data.whatToTest.length > 0 && (
            <InsightSection
              title="O que testar a seguir"
              icon={FlaskConical}
              items={data.whatToTest}
              tone="violet"
            />
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sem recomendações disponíveis.</p>
      )}
    </div>
  );
}

const PERIOD_OPTIONS: CreativeRangeDays[] = [7, 14, 30];

function CreativeComparisonAiInsights({
  primary,
  compare,
  primaryDays,
  compareDays,
  open,
}: {
  primary: RankedCreative;
  compare: RankedCreative;
  primaryDays: number;
  compareDays: number;
  open: boolean;
}) {
  const { data, isLoading, error, refetch, isFetching } = useCreativeComparisonInsights(
    primary,
    compare,
    primaryDays,
    compareDays,
    open,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-primary" />
          Análise da variação ({primaryDays}d vs {compareDays}d)
        </h3>
        {!isLoading && (
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-[11px] text-muted-foreground hover:text-foreground transition disabled:opacity-50"
          >
            {isFetching ? 'Atualizando…' : 'Recalcular'}
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Comparando períodos com IA…
        </div>
      ) : error ? (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-3.5 w-3.5" />
          <AlertDescription className="text-xs">
            {(error as Error).message || 'Não foi possível gerar a análise.'}
          </AlertDescription>
        </Alert>
      ) : data && (data.whyChanged.length > 0 || data.hypotheses.length > 0) ? (
        <div className="space-y-2">
          {data.whyChanged.length > 0 && (
            <InsightSection
              title={`Por que as métricas mudaram (${primaryDays}d vs ${compareDays}d)`}
              icon={Lightbulb}
              items={data.whyChanged}
              tone="amber"
            />
          )}
          {data.hypotheses.length > 0 && (
            <InsightSection
              title="Hipóteses para testar"
              icon={FlaskConical}
              items={data.hypotheses}
              tone="violet"
            />
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sem análise disponível.</p>
      )}
    </div>
  );
}


type DeltaMode = 'percent' | 'pp' | 'absolute';

const DELTA_LABELS: Record<DeltaMode, string> = {
  percent: '%',
  pp: 'pp',
  absolute: 'R$',
};

type ComparisonMetric = {
  key: string;
  label: string;
  format: (n: number) => string;
  dir: 'higher-better' | 'lower-better' | 'neutral';
  get: (c: RankedCreative) => number;
  show: (c: RankedCreative) => boolean;
  kind: 'rate' | 'money' | 'score' | 'absolute';
};

const fmtPct = (n: number) => `${n.toFixed(2)}%`;
const fmtPct1 = (n: number) => `${n.toFixed(1)}%`;
const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtInt = (n: number) => n.toLocaleString('pt-BR');

const COMPARISON_METRICS: ComparisonMetric[] = [
  { key: 'intent', label: 'Score de intenção', format: (n) => `${Math.round(n * 100)}%`, dir: 'higher-better', get: (c) => c.intent, show: () => true, kind: 'score' },
  { key: 'ctr', label: 'CTR', format: fmtPct, dir: 'higher-better', get: (c) => c.ctr, show: () => true, kind: 'rate' },
  { key: 'conv', label: 'Taxa de conversão', format: fmtPct, dir: 'higher-better', get: (c) => c.conversionRate, show: () => true, kind: 'rate' },
  { key: 'thru', label: 'ThruPlay', format: fmtPct1, dir: 'higher-better', get: (c) => c.thruPlayRate, show: (c) => c.format === 'video', kind: 'rate' },
  { key: 'cpc', label: 'CPC', format: fmtBRL, dir: 'lower-better', get: (c) => c.cpc, show: (c) => c.format !== 'video', kind: 'money' },
  { key: 'spend', label: 'Investimento', format: fmtBRL, dir: 'higher-better', get: (c) => c.spend, show: () => true, kind: 'money' },
  { key: 'leads', label: 'Leads', format: fmtInt, dir: 'higher-better', get: (c) => c.leads, show: () => true, kind: 'absolute' },
  { key: 'impressions', label: 'Impressões', format: fmtInt, dir: 'higher-better', get: (c) => c.impressions, show: () => true, kind: 'absolute' },
  { key: 'clicks', label: 'Cliques', format: fmtInt, dir: 'higher-better', get: (c) => c.clicks, show: () => true, kind: 'absolute' },
];

function DeltaBadge({
  a,
  b,
  dir,
  mode,
  kind,
}: {
  a: number;
  b: number;
  dir: 'higher-better' | 'lower-better' | 'neutral';
  mode: DeltaMode;
  kind: 'rate' | 'money' | 'score' | 'absolute';
}) {
  if (b === 0 && a === 0) return <span className="text-muted-foreground text-xs">—</span>;
  if (b === 0) return <span className="text-muted-foreground text-xs">novo</span>;

  let diff: number;
  let text: string;

  if (mode === 'percent') {
    diff = ((a - b) / Math.abs(b)) * 100;
    text = `${Math.abs(diff).toFixed(1)}%`;
  } else if (mode === 'pp') {
    if (kind === 'money') {
      diff = a - b;
      text = `${diff >= 0 ? '+' : ''}${fmtBRL(Math.abs(diff)).replace('R$', '').trim()}`;
    } else if (kind === 'absolute') {
      diff = a - b;
      text = `${diff >= 0 ? '+' : ''}${fmtInt(Math.abs(diff))}`;
    } else {
      diff = a - b;
      text = `${diff >= 0 ? '+' : ''}${Math.abs(diff).toFixed(2)}pp`;
    }
  } else {
    // absolute
    if (kind === 'money') {
      diff = a - b;
      text = `${diff >= 0 ? '+' : ''}${fmtBRL(Math.abs(diff)).replace('R$', '').trim()}`;
    } else if (kind === 'absolute') {
      diff = a - b;
      text = `${diff >= 0 ? '+' : ''}${fmtInt(Math.abs(diff))}`;
    } else {
      diff = a - b;
      text = `${diff >= 0 ? '+' : ''}${Math.abs(diff).toFixed(2)}pp`;
    }
  }

  if (Math.abs(diff) < 0.005 && mode !== 'percent') return <span className="text-muted-foreground text-xs">0</span>;
  if (Math.abs(diff) < 0.05 && mode === 'percent') return <span className="text-muted-foreground text-xs">0%</span>;

  const isPositive = diff > 0;
  const isGood = dir === 'neutral' ? true : dir === 'higher-better' ? isPositive : !isPositive;
  const tone = dir === 'neutral' ? 'text-muted-foreground' : isGood ? 'text-emerald-500' : 'text-rose-500';
  const arrow = isPositive ? '▲' : '▼';
  return (
    <span className={`text-xs font-medium ${tone}`}>
      {arrow} {text}
    </span>
  );
}

function DeltaVizChart({
  primary,
  compare,
  primaryDays,
  compareDays,
}: {
  primary: RankedCreative;
  compare: RankedCreative;
  primaryDays: CreativeRangeDays;
  compareDays: CreativeRangeDays;
}) {
  const rows = COMPARISON_METRICS.filter((m) => m.show(primary)).map((m) => {
    const a = m.get(primary);
    const b = m.get(compare);
    const diffPct = b === 0 ? (a === 0 ? 0 : 100) : ((a - b) / Math.abs(b)) * 100;
    const isPositive = diffPct > 0;
    const isGood =
      m.dir === 'neutral' ? true : m.dir === 'higher-better' ? isPositive : !isPositive;
    return { key: m.key, label: m.label, diffPct, isGood, a, b, format: m.format, dir: m.dir };
  });
  const maxAbs = Math.max(10, ...rows.map((r) => Math.abs(r.diffPct)));

  return (
    <div className="rounded-lg border border-border/50 p-3 space-y-2 bg-muted/10">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>Variação {primaryDays}d vs {compareDays}d</span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500/70" /> melhorou</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-500/70" /> piorou</span>
        </span>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const widthPct = (Math.abs(r.diffPct) / maxAbs) * 50; // half the bar
          const tone = r.isGood ? 'bg-emerald-500/70' : 'bg-rose-500/70';
          const label = `${r.diffPct > 0 ? '+' : ''}${r.diffPct.toFixed(1)}%`;
          return (
            <Tooltip key={r.key}>
              <TooltipTrigger asChild>
                <div className="grid grid-cols-[110px_1fr_56px] items-center gap-2 text-xs cursor-default">
                  <div className="text-muted-foreground truncate">{r.label}</div>
                  <div className="relative h-3 rounded-sm bg-muted/40">
                    <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border" />
                    <div
                      className={`absolute top-0 bottom-0 ${tone} rounded-sm`}
                      style={
                        r.diffPct >= 0
                          ? { left: '50%', width: `${widthPct}%` }
                          : { right: '50%', width: `${widthPct}%` }
                      }
                    />
                  </div>
                  <div className={`text-right font-medium tabular-nums ${r.isGood ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {label}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="z-50 bg-popover text-popover-foreground border border-border shadow-2xl px-3 py-2 max-w-[220px]">
                <div className="space-y-1 text-xs">
                  <p className="font-semibold">{r.label}</p>
                  <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                    <span className="text-popover-foreground/70">{primaryDays}d</span>
                    <span className="text-right font-medium">{r.format(r.a)}</span>
                    <span className="text-popover-foreground/70">{compareDays}d</span>
                    <span className="text-right font-medium">{r.format(r.b)}</span>
                  </div>
                  <p className={`text-right font-semibold ${r.isGood ? 'text-emerald-400' : 'text-rose-400'}`}>
                    Δ {r.diffPct > 0 ? '+' : ''}{r.diffPct.toFixed(2)}%
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

function PeriodComparisonTable({
  primary,
  compare,
  primaryDays,
  compareDays,
  deltaMode,
}: {
  primary: RankedCreative;
  compare: RankedCreative;
  primaryDays: CreativeRangeDays;
  compareDays: CreativeRangeDays;
  deltaMode: DeltaMode;
}) {
  const rows = COMPARISON_METRICS.filter((m) => m.show(primary));
  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr] text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/30 px-3 py-2">
        <div>Métrica</div>
        <div className="text-right">{primaryDays}d</div>
        <div className="text-right">{compareDays}d</div>
        <div className="text-right">Δ</div>
      </div>
      {rows.map((m) => {
        const va = m.get(primary);
        const vb = m.get(compare);
        const diffPct = vb === 0 ? (va === 0 ? 0 : 100) : ((va - vb) / Math.abs(vb)) * 100;
        return (
          <Tooltip key={m.key}>
            <TooltipTrigger asChild>
              <div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr] items-center px-3 py-2 text-sm border-t border-border/40 cursor-default">
                <div className="text-muted-foreground text-xs">{m.label}</div>
                <div className="text-right font-semibold">{m.format(va)}</div>
                <div className="text-right text-muted-foreground">{m.format(vb)}</div>
                <div className="text-right">
                  <DeltaBadge a={va} b={vb} dir={m.dir} mode={deltaMode} kind={m.kind} />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="z-50 bg-popover text-popover-foreground border border-border shadow-2xl px-3 py-2 max-w-[220px]">
              <div className="space-y-1 text-xs">
                <p className="font-semibold">{m.label}</p>
                <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                  <span className="text-popover-foreground/70">{primaryDays}d</span>
                  <span className="text-right font-medium">{m.format(va)}</span>
                  <span className="text-popover-foreground/70">{compareDays}d</span>
                  <span className="text-right font-medium">{m.format(vb)}</span>
                </div>
                <p className={`text-right font-semibold ${diffPct > 0 === (m.dir === 'higher-better') ? 'text-emerald-400' : 'text-rose-400'}`}>
                  Δ {diffPct > 0 ? '+' : ''}{diffPct.toFixed(2)}%
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function CreativeDetailContent({ creative, open }: { creative: RankedCreative; open: boolean }) {
  const [days, setDays] = useState<CreativeRangeDays>(7);
  const [compareDays, setCompareDays] = useState<CreativeRangeDays | null>(null);
  const [deltaMode, setDeltaMode] = useState<DeltaMode>('percent');
  // Reset windows when switching to another creative
  useEffect(() => {
    setDays(7);
    setCompareDays(null);
    setDeltaMode('percent');
  }, [creative.platform, creative.adId]);

  const { data: override, isFetching, error } = useCreativeRange(creative, days, open && days !== 7);
  const displayed: RankedCreative = days === 7 ? creative : override ?? creative;

  const effectiveCompareDays =
    compareDays && compareDays !== days ? compareDays : null;
  const {
    data: compareOverride,
    isFetching: isCompareFetching,
    error: compareError,
  } = useCreativeRange(
    creative,
    effectiveCompareDays ?? 7,
    open && effectiveCompareDays !== null,
  );
  const compareDisplayed: RankedCreative | null = effectiveCompareDays
    ? effectiveCompareDays === 7
      ? creative
      : compareOverride ?? null
    : null;

  const FormatIcon = FORMAT_ICON[displayed.format];
  const intentPercent = Math.round(displayed.intent * 100);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-base leading-snug">{creative.name}</DialogTitle>
        {creative.campaignName && (
          <DialogDescription className="text-xs">{creative.campaignName}</DialogDescription>
        )}
      </DialogHeader>

      <div className="aspect-video rounded-lg bg-muted/40 overflow-hidden relative">
        {creative.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creative.thumbnailUrl} alt={creative.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <FormatIcon className="h-10 w-10 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <Badge variant="outline" className="text-[10px] bg-background/80 backdrop-blur">
            {PLATFORM_LABELS[creative.platform as AdPlatform]}
          </Badge>
        </div>
        <div className="absolute top-2 right-2">
          <Badge variant="outline" className="text-[10px] bg-background/80 backdrop-blur capitalize">
            {creative.format === 'unknown' ? '—' : creative.format}
          </Badge>
        </div>
      </div>

      {/* Period selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" />
            Período
            {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
          </span>
          <div className="inline-flex rounded-md border border-border/60 p-0.5 bg-background/40">
            {PERIOD_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 text-[11px] rounded-sm transition ${
                  days === d
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <GitCompare className="h-3.5 w-3.5" />
            Comparar com
            {isCompareFetching && <Loader2 className="h-3 w-3 animate-spin" />}
          </span>
          <div className="inline-flex rounded-md border border-border/60 p-0.5 bg-background/40">
            <button
              onClick={() => setCompareDays(null)}
              className={`px-2.5 py-1 text-[11px] rounded-sm transition ${
                compareDays === null
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Off
            </button>
            {PERIOD_OPTIONS.map((d) => {
              const disabled = d === days;
              return (
                <button
                  key={d}
                  onClick={() => setCompareDays(d)}
                  disabled={disabled}
                  className={`px-2.5 py-1 text-[11px] rounded-sm transition ${
                    compareDays === d && !disabled
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground disabled:opacity-30'
                  }`}
                >
                  {d}d
                </button>
              );
            })}
          </div>
        </div>
        {effectiveCompareDays && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Mostrar Δ como</span>
            <div className="inline-flex rounded-md border border-border/60 p-0.5 bg-background/40">
              {(['percent', 'pp', 'absolute'] as DeltaMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setDeltaMode(m)}
                  className={`px-2 py-1 text-[11px] rounded-sm transition ${
                    deltaMode === m
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {DELTA_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {error && days !== 7 && (
        <p className="text-[11px] text-destructive">
          Falha ao carregar métricas para {days} dias. Mostrando últimos 7 dias.
        </p>
      )}
      {compareError && effectiveCompareDays && effectiveCompareDays !== 7 && (
        <p className="text-[11px] text-destructive">
          Falha ao carregar período de comparação ({effectiveCompareDays} dias).
        </p>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            Score de intenção
          </span>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{intentPercent}%</span>
            {compareDisplayed && (
              <DeltaBadge
                a={displayed.intent}
                b={compareDisplayed.intent}
                dir="higher-better"
                mode={deltaMode}
                kind="score"
              />
            )}
          </div>
        </div>
        <Progress value={intentPercent} className="h-2" />
      </div>

      <Separator />

      {effectiveCompareDays && compareDisplayed ? (
        <div className="space-y-3">
          <DeltaVizChart
            primary={displayed}
            compare={compareDisplayed}
            primaryDays={days}
            compareDays={effectiveCompareDays}
          />
          <PeriodComparisonTable
            primary={displayed}
            compare={compareDisplayed}
            primaryDays={days}
            compareDays={effectiveCompareDays}
            deltaMode={deltaMode}
          />
        </div>
      ) : effectiveCompareDays && isCompareFetching ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando período de comparação…
        </div>
      ) : (
        <div className="space-y-1">
          <MetricRow label="CTR" value={`${displayed.ctr.toFixed(2)}%`} icon={MousePointer} />
          <MetricRow label="Taxa de conversão" value={`${displayed.conversionRate.toFixed(2)}%`} icon={Users} />
          <MetricRow
            label={displayed.format === 'video' ? 'ThruPlay' : 'CPC'}
            value={
              displayed.format === 'video'
                ? `${displayed.thruPlayRate.toFixed(1)}%`
                : displayed.cpc.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            }
            icon={Eye}
          />
          <MetricRow
            label="Investimento"
            value={displayed.spend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            icon={DollarSign}
          />
          <MetricRow label="Leads" value={`${displayed.leads}`} icon={Users} />
          <MetricRow label="Impressões" value={displayed.impressions.toLocaleString('pt-BR')} icon={Eye} />
          <MetricRow label="Cliques" value={displayed.clicks.toLocaleString('pt-BR')} icon={MousePointer} />
        </div>
      )}

      {effectiveCompareDays && compareDisplayed && (
        <>
          <Separator />
          <CreativeComparisonAiInsights
            primary={displayed}
            compare={compareDisplayed}
            primaryDays={days}
            compareDays={effectiveCompareDays}
            open={open}
          />
        </>
      )}

      <Separator />

      <CreativeAiInsights creative={displayed} open={open} />
    </>
  );
}

function CreativeDetailModal({
  creative,
  open,
  onClose,
}: {
  creative: RankedCreative | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {creative && <CreativeDetailContent creative={creative} open={open} />}
      </DialogContent>
    </Dialog>
  );
}

function CreativeCard({
  c,
  onClick,
  selected,
  onToggleSelect,
  selectionDisabled,
}: {
  c: RankedCreative;
  onClick: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  selectionDisabled: boolean;
}) {
  const FormatIcon = FORMAT_ICON[c.format];
  return (
    <div
      className={`relative rounded-lg border bg-background/40 overflow-hidden transition-colors ${
        selected ? 'border-primary ring-1 ring-primary/40' : 'border-border/50 hover:border-primary/50'
      }`}
    >
      {/* Selection checkbox — stops propagation so it doesn't open the detail modal */}
      <div
        className="absolute top-2 left-2 z-10 rounded-md bg-background/80 backdrop-blur p-1 flex items-center"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <Checkbox
          checked={selected}
          disabled={selectionDisabled && !selected}
          onCheckedChange={onToggleSelect}
          aria-label="Selecionar para comparar"
        />
      </div>

      <button
        onClick={onClick}
        className="text-left w-full cursor-pointer"
        aria-label={`Detalhes de ${c.name}`}
      >
        <div className="aspect-video bg-muted/40 relative overflow-hidden">
          {c.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.thumbnailUrl}
              alt={c.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <FormatIcon className="h-8 w-8 text-muted-foreground/40" />
            </div>
          )}
          <div className="absolute top-2 right-12">
            <Badge variant="outline" className="text-[10px] bg-background/80 backdrop-blur">
              {PLATFORM_LABELS[c.platform as AdPlatform]}
            </Badge>
          </div>
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-background/80 backdrop-blur px-2 py-0.5 text-xs">
            <TrendingUp className="h-3 w-3 text-primary" />
            <span className="font-semibold">{(c.intent * 100).toFixed(0)}</span>
          </div>
        </div>
        <div className="p-3">
          <p className="text-sm font-medium line-clamp-1">{c.name}</p>
          {c.campaignName && (
            <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
              {c.campaignName}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 text-xs mt-3">
            <div>
              <p className="text-muted-foreground">CTR</p>
              <p className="font-semibold">{c.ctr.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-muted-foreground">Conv.</p>
              <p className="font-semibold">{c.conversionRate.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-muted-foreground">
                {c.format === 'video' ? 'ThruPlay' : 'CPC'}
              </p>
              <p className="font-semibold">
                {c.format === 'video'
                  ? `${c.thruPlayRate.toFixed(1)}%`
                  : c.cpc.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

export function TopCreativesGrid({ campaigns }: { campaigns: NormalizedCampaign[] }) {
  const { selectedCompanyId } = useCompany();
  const { creatives, isLoading, isLive } = useAdCreatives(selectedCompanyId);
  const weights = useIntentWeights();
  const [selected, setSelected] = useState<RankedCreative | null>(null);
  const [comparePicks, setComparePicks] = useState<RankedCreative[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<'all' | AdPlatform>('all');
  const [formatFilter, setFormatFilter] = useState<'all' | RankedCreative['format']>('all');
  const [sortKey, setSortKey] = useState<SortKey>('intent');
  const [intentRange, setIntentRange] = useState<[number, number]>([0, 100]);

  // Use ad-level data when live; fall back to campaign-level proxies otherwise.
  let rankedFull: RankedCreative[];
  if (isLive && creatives.length > 0) {
    rankedFull = creatives;
  } else {
    const items = campaigns
      .filter((c) => c.impressions > 0)
      .map((c) => ({
        platform: c.platform,
        adId: c.campaignId,
        campaignId: c.campaignId,
        campaignName: c.name,
        name: c.name,
        format: 'unknown' as const,
        spend: c.spend,
        impressions: c.impressions,
        clicks: c.clicks,
        leads: c.leads,
        ctr: c.ctr,
        conversionRate: c.clicks > 0 ? (c.leads / c.clicks) * 100 : 0,
        thruPlayRate: 0,
        cpc: c.cpc,
      }));
    const scores = intentScores(items, weights);
    rankedFull = items
      .map((it, i) => ({ ...it, intent: scores[i] ?? 0 }))
      .sort((a, b) => b.intent - a.intent);
  }

  const availablePlatforms = useMemo(
    () => Array.from(new Set(rankedFull.map((c) => c.platform))) as AdPlatform[],
    [rankedFull],
  );
  const availableFormats = useMemo(
    () => Array.from(new Set(rankedFull.map((c) => c.format))),
    [rankedFull],
  );

  const filteredRanked = useMemo(() => {
    const [minI, maxI] = intentRange;
    const filtered = rankedFull.filter((c) => {
      if (platformFilter !== 'all' && c.platform !== platformFilter) return false;
      if (formatFilter !== 'all' && c.format !== formatFilter) return false;
      const score = c.intent * 100;
      if (score < minI || score > maxI) return false;
      return true;
    });
    const accessor = SORT_ACCESSORS[sortKey];
    return [...filtered].sort((a, b) => accessor(b) - accessor(a));
  }, [rankedFull, platformFilter, formatFilter, intentRange, sortKey]);

  const ranked = filteredRanked.slice(0, 9);
  const canExport = filteredRanked.length > 0;
  const filtersActive =
    platformFilter !== 'all' ||
    formatFilter !== 'all' ||
    sortKey !== 'intent' ||
    intentRange[0] !== 0 ||
    intentRange[1] !== 100;

  const resetFilters = () => {
    setPlatformFilter('all');
    setFormatFilter('all');
    setSortKey('intent');
    setIntentRange([0, 100]);
  };

  const idOf = (c: RankedCreative) => `${c.platform}-${c.adId}`;
  const isPicked = (c: RankedCreative) => comparePicks.some((p) => idOf(p) === idOf(c));
  const togglePick = (c: RankedCreative) => {
    setComparePicks((prev) => {
      if (prev.some((p) => idOf(p) === idOf(c))) {
        return prev.filter((p) => idOf(p) !== idOf(c));
      }
      if (prev.length >= 2) return prev;
      return [...prev, c];
    });
  };
  const selectionFull = comparePicks.length >= 2;

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Criativos com maior intenção
          <span className="text-[10px] font-normal text-muted-foreground ml-1">
            {isLive && creatives.length > 0 ? '· nível de anúncio' : '· nível de campanha'}
          </span>
        </CardTitle>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={!canExport} className="h-8 gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportCreativesCsv(filteredRanked)}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportCreativesPdf(filteredRanked)}>
              <FileText className="h-4 w-4 mr-2" />
              PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filters & sort */}
        <div className="flex flex-col gap-3 rounded-md border border-border/50 bg-background/30 p-3 lg:flex-row lg:items-end">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 flex-1">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Filter className="h-3 w-3" /> Plataforma
              </label>
              <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as 'all' | AdPlatform)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {availablePlatforms.map((p) => (
                    <SelectItem key={p} value={p}>{PLATFORM_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Filter className="h-3 w-3" /> Formato
              </label>
              <Select value={formatFilter} onValueChange={(v) => setFormatFilter(v as typeof formatFilter)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {availableFormats.map((f) => (
                    <SelectItem key={f} value={f} className="capitalize">
                      {f === 'unknown' ? '—' : f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ArrowUpDown className="h-3 w-3" /> Ordenar por
              </label>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                    <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex-1 space-y-1 lg:max-w-xs">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Score de intenção</span>
              <span className="font-medium text-foreground">{intentRange[0]}–{intentRange[1]}</span>
            </div>
            <Slider
              value={intentRange}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) => setIntentRange([v[0] ?? 0, v[1] ?? 100])}
              className="py-1.5"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {filteredRanked.length} de {rankedFull.length}
            </span>
            {filtersActive && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetFilters}>
                <X className="h-3.5 w-3.5 mr-1" /> Limpar
              </Button>
            )}
          </div>
        </div>


        {comparePicks.length > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <div className="text-xs">
              <span className="font-semibold">{comparePicks.length}/2</span> selecionado(s) para
              comparar
              <span className="text-muted-foreground ml-2 hidden sm:inline">
                {comparePicks.map((p) => p.name).join(' · ')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setComparePicks([])}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Limpar
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={comparePicks.length !== 2}
                onClick={() => setCompareOpen(true)}
              >
                <GitCompare className="h-3.5 w-3.5 mr-1" />
                Comparar
              </Button>
            </div>
          </div>
        )}

        {isLoading && ranked.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56" />
            ))}
          </div>
        ) : ranked.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {rankedFull.length === 0
              ? 'Sem dados de criativos no período.'
              : 'Nenhum criativo corresponde aos filtros aplicados.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ranked.map((c) => (
              <CreativeCard
                key={idOf(c)}
                c={c}
                onClick={() => setSelected(c)}
                selected={isPicked(c)}
                onToggleSelect={() => togglePick(c)}
                selectionDisabled={selectionFull}
              />
            ))}
          </div>
        )}
      </CardContent>

      <CreativeDetailModal
        creative={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
      <CompareCreativesModal
        a={comparePicks[0] ?? null}
        b={comparePicks[1] ?? null}
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
      />
    </Card>
  );
}
