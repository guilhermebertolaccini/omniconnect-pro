import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Sparkles, Image as ImageIcon, Video, Layers, ArrowRight, Minus } from 'lucide-react';
import { PLATFORM_LABELS, type AdPlatform } from '@/services/platformConfigService';
import type { RankedCreative } from '@/hooks/useAdCreatives';

const FORMAT_ICON: Record<RankedCreative['format'], typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  carousel: Layers,
  unknown: ImageIcon,
};

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtInt = (v: number) => v.toLocaleString('pt-BR');

type Direction = 'higher-better' | 'lower-better' | 'neutral';

const METRICS: { key: keyof RankedCreative; label: string; format: (n: number) => string; dir: Direction }[] = [
  { key: 'intent', label: 'Score de intenção', format: (n) => `${(n * 100).toFixed(0)}%`, dir: 'higher-better' },
  { key: 'ctr', label: 'CTR', format: (n) => `${n.toFixed(2)}%`, dir: 'higher-better' },
  { key: 'conversionRate', label: 'Taxa de conversão', format: (n) => `${n.toFixed(2)}%`, dir: 'higher-better' },
  { key: 'thruPlayRate', label: 'ThruPlay', format: (n) => `${n.toFixed(1)}%`, dir: 'higher-better' },
  { key: 'cpc', label: 'CPC', format: fmtBRL, dir: 'lower-better' },
  { key: 'spend', label: 'Investimento', format: fmtBRL, dir: 'neutral' },
  { key: 'leads', label: 'Leads', format: fmtInt, dir: 'higher-better' },
  { key: 'impressions', label: 'Impressões', format: fmtInt, dir: 'higher-better' },
  { key: 'clicks', label: 'Cliques', format: fmtInt, dir: 'higher-better' },
];

function CreativeHeader({ c }: { c: RankedCreative }) {
  const FormatIcon = FORMAT_ICON[c.format];
  const intentPercent = Math.round(c.intent * 100);
  return (
    <div className="space-y-3">
      <div className="aspect-video rounded-lg bg-muted/40 overflow-hidden relative">
        {c.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.thumbnailUrl} alt={c.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <FormatIcon className="h-10 w-10 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <Badge variant="outline" className="text-[10px] bg-background/80 backdrop-blur">
            {PLATFORM_LABELS[c.platform as AdPlatform]}
          </Badge>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold leading-snug line-clamp-2">{c.name}</p>
        {c.campaignName && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{c.campaignName}</p>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Intenção
          </span>
          <span className="font-semibold">{intentPercent}%</span>
        </div>
        <Progress value={intentPercent} className="h-1.5" />
      </div>
    </div>
  );
}

function winnerSide(a: number, b: number, dir: Direction): 'a' | 'b' | null {
  if (dir === 'neutral' || a === b) return null;
  if (dir === 'higher-better') return a > b ? 'a' : 'b';
  return a < b ? 'a' : 'b';
}

function diffLabel(a: number, b: number, dir: Direction): { text: string; tone: 'good' | 'bad' | 'neutral' } {
  if (a === b || (a === 0 && b === 0)) return { text: '—', tone: 'neutral' };
  const base = b !== 0 ? Math.abs(((a - b) / b) * 100) : 100;
  const w = winnerSide(a, b, dir);
  if (w === null) return { text: '—', tone: 'neutral' };
  return { text: `${base.toFixed(1)}%`, tone: 'good' };
}

export function CompareCreativesModal({
  a,
  b,
  open,
  onClose,
}: {
  a: RankedCreative | null;
  b: RankedCreative | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!a || !b) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-primary" />
            Comparação de criativos
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <CreativeHeader c={a} />
          <CreativeHeader c={b} />
        </div>

        <Separator />

        <div className="rounded-lg border border-border/50 overflow-hidden">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_0.7fr] text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/30 px-3 py-2">
            <div>Métrica</div>
            <div className="text-right">A</div>
            <div className="text-right">B</div>
            <div className="text-right">Δ</div>
          </div>

          {METRICS.map((m) => {
            const va = (a[m.key] as number) ?? 0;
            const vb = (b[m.key] as number) ?? 0;
            const w = winnerSide(va, vb, m.dir);
            const diff = diffLabel(va, vb, m.dir);
            return (
              <div
                key={m.key as string}
                className="grid grid-cols-[1.4fr_1fr_1fr_0.7fr] items-center px-3 py-2 text-sm border-t border-border/40"
              >
                <div className="text-muted-foreground">{m.label}</div>
                <div className={`text-right font-semibold ${w === 'a' ? 'text-primary' : ''}`}>
                  {m.format(va)}
                </div>
                <div className={`text-right font-semibold ${w === 'b' ? 'text-primary' : ''}`}>
                  {m.format(vb)}
                </div>
                <div className="text-right text-xs">
                  {diff.tone === 'neutral' ? (
                    <Minus className="h-3.5 w-3.5 inline text-muted-foreground" />
                  ) : (
                    <span className="text-primary font-medium">{diff.text}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Vencedor por métrica destacado em azul. Δ é a diferença percentual relativa a B (positivo
          significa que A vence pela métrica considerando a direção desejada).
        </p>
      </DialogContent>
    </Dialog>
  );
}
