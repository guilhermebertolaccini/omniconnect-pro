import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PLATFORM_LABELS, type AdPlatform } from '@/services/platformConfigService';
import type { ChannelTotals } from '@/hooks/useMediaIndicators';

const fmtMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export function CplBreakdown({ data, totalCpl }: { data: ChannelTotals[]; totalCpl: number }) {
  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Custo por lead</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <p className="text-xs text-muted-foreground">CPL médio (todos os canais)</p>
          <p className="text-2xl font-bold">{fmtMoney(totalCpl)}</p>
        </div>
        <div className="space-y-2">
          {data.map((d) => (
            <div
              key={d.platform}
              className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 p-3"
            >
              <div>
                <p className="text-sm font-medium">{PLATFORM_LABELS[d.platform as AdPlatform]}</p>
                <p className="text-xs text-muted-foreground">{fmtNum(d.leads)} leads</p>
              </div>
              <p className="text-lg font-semibold">{d.cpl > 0 ? fmtMoney(d.cpl) : '—'}</p>
            </div>
          ))}
          {data.length === 0 && (
            <p className="text-sm text-muted-foreground">Sem dados de leads no período.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
