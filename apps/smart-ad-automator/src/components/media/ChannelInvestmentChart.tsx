import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { PLATFORM_LABELS, type AdPlatform } from '@/services/platformConfigService';
import type { ChannelTotals } from '@/hooks/useMediaIndicators';

const PLATFORM_COLORS: Record<AdPlatform, string> = {
  meta: 'hsl(217, 91%, 60%)',
  google_ads: 'hsl(142, 71%, 45%)',
  tiktok_ads: 'hsl(330, 81%, 60%)',
};

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ChannelInvestmentChart({ data }: { data: ChannelTotals[] }) {
  const chartData = data.map((d) => ({
    name: PLATFORM_LABELS[d.platform],
    spend: d.spend,
    share: d.share,
    color: PLATFORM_COLORS[d.platform],
  }));

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Investimento por canal</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={100} stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip
                formatter={(v: number) => fmt(v)}
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="spend" radius={[0, 6, 6, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 space-y-2">
          {chartData.map((d) => (
            <div key={d.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                <span>{d.name}</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>{fmt(d.spend)}</span>
                <span className="font-medium text-foreground">{d.share.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
